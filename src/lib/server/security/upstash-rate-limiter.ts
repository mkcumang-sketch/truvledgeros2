import { Redis as UpstashRedis } from "@upstash/redis";
import type Redis from "ioredis";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getClientIp } from "./rate-limiter-shared";

export const LOGIN_RATE_LIMIT_POLICY = {
  limit: 8,
  windowSeconds: 5 * 60,
  cooldownSeconds: 2 * 60,
  maxCooldownSeconds: 15 * 60,
  escalationWindowSeconds: 24 * 60 * 60,
} as const;

export interface LoginRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfterSeconds: number;
  retryAfterMinutes: number;
  errorMessage: string;
  failedCount?: number;
  serviceUnavailable?: boolean;
}

interface RedisEvalClient {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

interface MemoryRateLimitEntry {
  attempts: number;
  resetAt: number;
  lockedUntil?: number;
  lockouts: number;
  lockoutsResetAt: number;
}

const CHECK_ATTEMPT_SCRIPT = `
local cooldownTtl = redis.call('TTL', KEYS[2])
if cooldownTtl > 0 then
  return {0, 0, cooldownTtl, 0}
end
if cooldownTtl == -1 then
  redis.call('EXPIRE', KEYS[2], ARGV[4])
  return {0, 0, ARGV[4], 0}
end

local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local windowTtl = redis.call('TTL', KEYS[1])

if attempts > tonumber(ARGV[2]) then
  local lockouts = redis.call('INCR', KEYS[3])
  if lockouts == 1 then
    redis.call('EXPIRE', KEYS[3], ARGV[5])
  end
  local multiplier = math.min(lockouts - 1, 3)
  local cooldown = math.min(tonumber(ARGV[3]) * (2 ^ multiplier), tonumber(ARGV[4]))
  redis.call('SET', KEYS[2], '1', 'EX', cooldown)
  redis.call('DEL', KEYS[1])
  return {0, 0, cooldown, attempts}
end

return {1, math.max(0, tonumber(ARGV[2]) - attempts), windowTtl, attempts}
`;

const RESET_ATTEMPT_SCRIPT = `
return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
`;

function createIoredisAdapter(ioredisClient: Redis): RedisEvalClient {
  return {
    async eval(script, keys, args) {
      return ioredisClient.eval(script, keys.length, ...keys, ...args);
    },
  };
}

class UpstashLoginLimiter {
  private redisClient: RedisEvalClient | null = null;
  private initPromise: Promise<void> | null = null;
  private memoryStore = new Map<string, MemoryRateLimitEntry>();

  constructor() {
    this.initLimiter().catch(() => {
      console.warn("[UPSTASH_RATELIMIT_INIT_WARN] Login rate limiter initialization failed.");
    });
  }

  private async initLimiter(): Promise<void> {
    if (this.redisClient) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const redisUrl = process.env.REDIS_URL?.trim();
      const restUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
      const restToken = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

      // 1. If HTTP REST Upstash is provided
      if (restUrl && restToken) {
        this.redisClient = new UpstashRedis({ url: restUrl, token: restToken });
        return;
      }

      // 2. If REDIS_URL is provided (TCP connection via ioredis)
      if (redisUrl) {
        try {
          const ioredisModule = require("ioredis");
          const RedisClass = ioredisModule.default || ioredisModule;
          const client = new RedisClass(redisUrl, {
            connectTimeout: 2500,
            commandTimeout: 2000,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            enableOfflineQueue: false,
          });

          await client.connect().catch(() => {
            console.warn("[UPSTASH_REDIS_CONNECT_FAIL] Login rate limiter could not connect.");
          });

          this.redisClient = createIoredisAdapter(client);
          return;
        } catch {
          console.warn("[UPSTASH_IOREDIS_INIT_FAIL] Login rate limiter initialization failed.");
        }
      }
    })();

    return this.initPromise;
  }

  /**
   * Enforces independent IP and account buckets without storing raw identifiers.
   */
  public async check(ip: string, accountEmail?: string): Promise<LoginRateLimitResult> {
    await this.initLimiter().catch(() => null);

    const identifiers = [`ip:${ip.trim() || "unknown"}`];
    if (accountEmail?.trim()) {
      identifiers.push(`account:${accountEmail.trim().toLowerCase()}`);
    }

    if (this.redisClient) {
      try {
        const checks = await Promise.all(identifiers.map((identifier) => this.checkDistributed(identifier)));
        const blocked = checks.find((result) => !result.allowed);
        return blocked || checks.reduce((result, current) => ({
          ...result,
          remaining: Math.min(result.remaining, current.remaining),
          resetTime: Math.max(result.resetTime, current.resetTime),
          failedCount: Math.max(result.failedCount || 0, current.failedCount || 0),
        }));
      } catch {
        console.error("[UPSTASH_CHECK_ERROR] Distributed login rate-limit check failed.");
      }
    }

    // Never downgrade authentication throttling to per-instance memory in production:
    // serverless instances do not share this state and an outage would bypass the limit.
    if (process.env.NODE_ENV === "production") {
      const retryAfterSeconds = 60;
      return {
        allowed: false,
        limit: LOGIN_RATE_LIMIT_POLICY.limit,
        remaining: 0,
        resetTime: Math.ceil((Date.now() + retryAfterSeconds * 1000) / 1000),
        retryAfterSeconds,
        retryAfterMinutes: 1,
        errorMessage: "Authentication is temporarily unavailable. Please try again shortly.",
        serviceUnavailable: true,
      };
    }

    const checks = identifiers.map((identifier) => this.checkMemory(identifier));
    return checks.find((result) => !result.allowed) || checks.reduce((result, current) => ({
      ...result,
      remaining: Math.min(result.remaining, current.remaining),
      resetTime: Math.max(result.resetTime, current.resetTime),
      failedCount: Math.max(result.failedCount || 0, current.failedCount || 0),
    }));
  }

  private async checkDistributed(identifier: string): Promise<LoginRateLimitResult> {
    const keys = this.getRedisKeys(identifier);
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("Rate limit check timeout")), 2000);
    });

    let rawResult: unknown;
    try {
      rawResult = await Promise.race([
        this.redisClient!.eval(CHECK_ATTEMPT_SCRIPT, keys, [
          LOGIN_RATE_LIMIT_POLICY.windowSeconds,
          LOGIN_RATE_LIMIT_POLICY.limit,
          LOGIN_RATE_LIMIT_POLICY.cooldownSeconds,
          LOGIN_RATE_LIMIT_POLICY.maxCooldownSeconds,
          LOGIN_RATE_LIMIT_POLICY.escalationWindowSeconds,
        ]),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutHandle!);
    }

    if (!Array.isArray(rawResult) || rawResult.length < 4) {
      throw new Error("Unexpected login rate-limit response");
    }

    const [allowedValue, remainingValue, ttlValue, failedCountValue] = rawResult.map(Number);
    const allowed = allowedValue === 1;
    const retryAfterSeconds = allowed ? 0 : Math.max(1, ttlValue);
    const retryAfterMinutes = allowed ? 0 : Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const errorMessage = allowed
      ? ""
      : `Too many attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? "s" : ""}.`;

    return {
      allowed,
      limit: LOGIN_RATE_LIMIT_POLICY.limit,
      remaining: allowed ? Math.max(0, remainingValue) : 0,
      resetTime: Math.ceil((Date.now() + (allowed ? Math.max(0, ttlValue) : retryAfterSeconds) * 1000) / 1000),
      retryAfterSeconds,
      retryAfterMinutes,
      errorMessage,
      failedCount: failedCountValue,
    };
  }

  private checkMemory(identifier: string): LoginRateLimitResult {
    const now = Date.now();
    const windowMs = LOGIN_RATE_LIMIT_POLICY.windowSeconds * 1000;
    let entry = this.memoryStore.get(identifier);

    if (entry?.lockedUntil && now < entry.lockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        allowed: false,
        limit: LOGIN_RATE_LIMIT_POLICY.limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds,
        retryAfterMinutes,
        errorMessage: `Too many attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? "s" : ""}.`,
        failedCount: LOGIN_RATE_LIMIT_POLICY.limit,
      };
    }

    if (!entry || now >= entry.resetAt || (entry.lockedUntil && now >= entry.lockedUntil)) {
      const activeLockouts = entry && now < entry.lockoutsResetAt ? entry.lockouts : 0;
      const lockoutsResetAt =
        activeLockouts > 0 && entry
          ? entry.lockoutsResetAt
          : now + LOGIN_RATE_LIMIT_POLICY.escalationWindowSeconds * 1000;
      entry = {
        attempts: 0,
        resetAt: now + windowMs,
        lockouts: activeLockouts,
        lockoutsResetAt,
      };
      this.memoryStore.set(identifier, entry);
    }

    entry.attempts += 1;

    if (entry.attempts > LOGIN_RATE_LIMIT_POLICY.limit) {
      if (now >= entry.lockoutsResetAt) {
        entry.lockouts = 1;
        entry.lockoutsResetAt = now + LOGIN_RATE_LIMIT_POLICY.escalationWindowSeconds * 1000;
      } else {
        entry.lockouts += 1;
      }
      const cooldownSeconds = Math.min(
        LOGIN_RATE_LIMIT_POLICY.cooldownSeconds * 2 ** Math.min(entry.lockouts - 1, 3),
        LOGIN_RATE_LIMIT_POLICY.maxCooldownSeconds
      );
      entry.attempts = 0;
      entry.resetAt = now + windowMs;
      entry.lockedUntil = now + cooldownSeconds * 1000;
      const retryAfterSeconds = cooldownSeconds;
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        allowed: false,
        limit: LOGIN_RATE_LIMIT_POLICY.limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds,
        retryAfterMinutes,
        errorMessage: `Too many attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? "s" : ""}.`,
        failedCount: LOGIN_RATE_LIMIT_POLICY.limit + 1,
      };
    }

    return {
      allowed: true,
      limit: LOGIN_RATE_LIMIT_POLICY.limit,
      remaining: Math.max(0, LOGIN_RATE_LIMIT_POLICY.limit - entry.attempts),
      resetTime: Math.ceil(entry.resetAt / 1000),
      retryAfterSeconds: 0,
      retryAfterMinutes: 0,
      errorMessage: "",
      failedCount: entry.attempts,
    };
  }

  /**
   * Clears IP and account counters after successful authentication.
   */
  public async reset(ip: string, accountEmail?: string): Promise<void> {
    const identifiers = [`ip:${ip.trim() || "unknown"}`];
    if (accountEmail?.trim()) {
      identifiers.push(`account:${accountEmail.trim().toLowerCase()}`);
    }
    for (const identifier of identifiers) {
      this.memoryStore.delete(identifier);
    }
    if (this.redisClient) {
      await Promise.all(
        identifiers.map((identifier) =>
          this.redisClient!.eval(RESET_ATTEMPT_SCRIPT, this.getRedisKeys(identifier), [])
        )
      );
    }
  }

  private getRedisKeys(identifier: string): string[] {
    const digest = crypto.createHash("sha256").update(identifier).digest("hex");
    const baseKey = `truv:login:rl:${digest}`;
    return [`${baseKey}:attempts`, `${baseKey}:cooldown`, `${baseKey}:lockouts`];
  }

  /**
   * Injects mock redis instance for deterministic unit testing.
   */
  public setMockRedis(mockClient: Redis | null): void {
    this.redisClient = mockClient ? createIoredisAdapter(mockClient) : null;
  }
}

export const upstashLoginLimiter = new UpstashLoginLimiter();

/**
 * Creates clean HTTP 429 response with exact retry-after seconds and JSON error payload.
 */
export function create429RateLimitResponse(result: LoginRateLimitResult): NextResponse {
  const status = result.serviceUnavailable ? 503 : 429;
  return NextResponse.json(
    {
      error: result.errorMessage,
      retryAfter: result.retryAfterSeconds,
      retryAfterMinutes: result.retryAfterMinutes,
    },
    {
      status,
      headers: {
        "Retry-After": result.retryAfterSeconds.toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetTime.toString(),
        "Content-Type": "application/json",
      },
    }
  );
}

export { getClientIp };
