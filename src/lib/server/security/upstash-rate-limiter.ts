import { Ratelimit } from "@upstash/ratelimit";
import { Redis as UpstashRedis } from "@upstash/redis";
import type Redis from "ioredis";
import { NextResponse } from "next/server";
import { getClientIp } from "./rate-limiter-shared";

export interface LoginRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfterSeconds: number;
  retryAfterMinutes: number;
  errorMessage: string;
  failedCount?: number;
}

/**
 * Creates an Upstash-compatible Redis client interface using ioredis.
 * Automatically sanitizes lua shebangs to remain compatible with standard/managed Redis.
 */
function createIoredisAdapter(ioredisClient: Redis) {
  return {
    async eval(script: string, keys: string[], args: (string | number)[]): Promise<any> {
      // Clean script shebang if Redis engine rejects 'flags=allow-key-locking'
      const cleanedScript = script.replace(/^#!lua\s+flags=allow-key-locking\s*/, "");
      return ioredisClient.eval(cleanedScript, keys.length, ...keys, ...args);
    },
    async evalsha(hash: string, keys: string[], args: (string | number)[]): Promise<any> {
      // Trigger NOSCRIPT so @upstash/ratelimit falls back to eval with cleanedScript
      throw new Error("NOSCRIPT");
    },
  };
}

class UpstashLoginLimiter {
  private ratelimiter: Ratelimit | null = null;
  private ioredisInstance: Redis | null = null;
  private initPromise: Promise<void> | null = null;
  private memoryStore: Map<string, { attempts: number; resetAt: number; lockedUntil?: number }> = new Map();

  constructor() {
    this.initLimiter().catch((err) => {
      console.warn("[UPSTASH_RATELIMIT_INIT_WARN] Using in-memory fallback:", err?.message);
    });
  }

  private async initLimiter(): Promise<void> {
    if (this.ratelimiter) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const redisUrl = process.env.REDIS_URL?.trim();
      const restUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
      const restToken = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

      // 1. If HTTP REST Upstash is provided
      if (restUrl && restToken) {
        const upstashRedis = new UpstashRedis({ url: restUrl, token: restToken });
        this.ratelimiter = new Ratelimit({
          redis: upstashRedis,
          limiter: Ratelimit.slidingWindow(5, "15 m"),
          prefix: "truv:login:rl",
        });
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

          await client.connect().catch((err: any) => {
            console.warn("[UPSTASH_REDIS_CONNECT_FAIL] Falling back to in-memory:", err?.message);
          });

          this.ioredisInstance = client;
          const adapter = createIoredisAdapter(client);

          this.ratelimiter = new Ratelimit({
            redis: adapter as any,
            limiter: Ratelimit.slidingWindow(5, "15 m"),
            prefix: "truv:login:rl",
          });
          return;
        } catch (e: any) {
          console.warn("[UPSTASH_IOREDIS_INIT_FAIL] Using in-memory fallback:", e?.message);
        }
      }
    })();

    return this.initPromise;
  }

  /**
   * Checks whether the current request is allowed under the 5 attempts / 15-minute sliding window.
   */
  public async check(ip: string): Promise<LoginRateLimitResult> {
    await this.initLimiter().catch(() => null);

    const safeIp = ip.trim() || "127.0.0.1";
    const key = `ip:${safeIp}`;

    if (this.ratelimiter) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Rate limit check timeout")), 2000)
        );

        const result = await Promise.race([this.ratelimiter.limit(key), timeoutPromise]);

        const now = Date.now();
        const retryAfterSeconds = result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - now) / 1000));
        const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
        const errorMessage = `Too many attempts. Please try again in ${retryAfterMinutes} minute${
          retryAfterMinutes > 1 ? "s" : ""
        }.`;

        return {
          allowed: result.success,
          limit: result.limit,
          remaining: result.remaining,
          resetTime: Math.ceil(result.reset / 1000),
          retryAfterSeconds,
          retryAfterMinutes,
          errorMessage,
        };
      } catch (err: any) {
        console.error("[UPSTASH_CHECK_ERROR] Falling back to in-memory store:", err?.message);
      }
    }

    // In-memory sliding window fallback (guarantees local dev and outage resilience)
    return this.checkMemory(key, 5, 15 * 60);
  }

  private checkMemory(key: string, limit: number, windowSeconds: number): LoginRateLimitResult {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let entry = this.memoryStore.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { attempts: 1, resetAt: now + windowMs };
      this.memoryStore.set(key, entry);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTime: Math.ceil((now + windowMs) / 1000),
        retryAfterSeconds: 0,
        retryAfterMinutes: 0,
        errorMessage: "",
      };
    }

    if (entry.lockedUntil && now < entry.lockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds,
        retryAfterMinutes,
        errorMessage: `Too many attempts. Please try again in ${retryAfterMinutes} minute${
          retryAfterMinutes > 1 ? "s" : ""
        }.`,
      };
    }

    entry.attempts += 1;

    if (entry.attempts > limit) {
      entry.lockedUntil = now + windowMs;
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds,
        retryAfterMinutes,
        errorMessage: `Too many attempts. Please try again in ${retryAfterMinutes} minute${
          retryAfterMinutes > 1 ? "s" : ""
        }.`,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - entry.attempts),
      resetTime: Math.ceil(entry.resetAt / 1000),
      retryAfterSeconds: 0,
      retryAfterMinutes: 0,
      errorMessage: "",
    };
  }

  /**
   * Resets rate limit counter for a specific IP (e.g. on successful login).
   */
  public async reset(ip: string): Promise<void> {
    const key = `ip:${ip.trim() || "127.0.0.1"}`;
    this.memoryStore.delete(key);

    if (this.ioredisInstance) {
      await this.ioredisInstance
        .del(`truv:login:rl:${key}`, `truv:login:rl:${key}:*`)
        .catch(() => null);
    }
  }

  /**
   * Injects mock redis instance for deterministic unit testing.
   */
  public setMockRedis(mockClient: any): void {
    const adapter = createIoredisAdapter(mockClient);
    this.ratelimiter = new Ratelimit({
      redis: adapter as any,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "truv:login:rl",
    });
  }
}

export const upstashLoginLimiter = new UpstashLoginLimiter();

/**
 * Creates clean HTTP 429 response with exact retry-after seconds and JSON error payload.
 */
export function create429RateLimitResponse(result: LoginRateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: result.errorMessage,
      retryAfter: result.retryAfterSeconds,
      retryAfterMinutes: result.retryAfterMinutes,
    },
    {
      status: 429,
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
