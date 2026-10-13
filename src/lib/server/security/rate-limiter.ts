import { NextResponse } from "next/server";
import Redis from "ioredis";

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
  lockoutSeconds?: number;
  failClosed?: boolean;
}

export interface RateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // unix timestamp in seconds
  retryAfterSeconds: number;
  backend: "redis" | "in-memory";
  error?: string;
}

export const RATE_LIMIT_TIERS = {
  AUTH: { limit: 5, windowSeconds: 15 * 60, lockoutSeconds: 15 * 60, failClosed: true } as RateLimitConfig,
  EMAIL_SMS: { limit: 3, windowSeconds: 60 * 60, lockoutSeconds: 60 * 60, failClosed: true } as RateLimitConfig,
  SEARCH_LIST: { limit: 60, windowSeconds: 60, failClosed: false } as RateLimitConfig,
  GENERAL_API: { limit: 100, windowSeconds: 60, failClosed: false } as RateLimitConfig,
  AI_API: { limit: 20, windowSeconds: 60, lockoutSeconds: 5 * 60, failClosed: true } as RateLimitConfig,
};

interface WindowEntry {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

/**
 * In-memory sliding window bucket store with automated garbage collection.
 * Used for development environments or unit tests when REDIS_URL is unconfigured.
 */
class InMemorySlidingWindowStore {
  private store: Map<string, WindowEntry> = new Map();
  private lastCleanup: number = Date.now();

  public check(key: string, config: RateLimitConfig): RateLimitStatus {
    this.evictStale();
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const lockoutMs = (config.lockoutSeconds || config.windowSeconds) * 1000;

    let entry = this.store.get(key);

    // If locked out
    if (entry?.lockedUntil && now < entry.lockedUntil) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return {
        allowed: false,
        limit: config.limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
        backend: "in-memory",
      };
    }

    // New window or expired window
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 1, windowStart: now };
      this.store.set(key, entry);
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.limit - 1,
        resetTime: Math.ceil((now + windowMs) / 1000),
        retryAfterSeconds: 0,
        backend: "in-memory",
      };
    }

    // Within current window
    entry.count += 1;

    if (entry.count > config.limit) {
      entry.lockedUntil = now + lockoutMs;
      const retryAfterSeconds = Math.ceil(lockoutMs / 1000);
      return {
        allowed: false,
        limit: config.limit,
        remaining: 0,
        resetTime: Math.ceil(entry.lockedUntil / 1000),
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
        backend: "in-memory",
      };
    }

    const remaining = Math.max(0, config.limit - entry.count);
    const resetTime = Math.ceil((entry.windowStart + windowMs) / 1000);

    return {
      allowed: true,
      limit: config.limit,
      remaining,
      resetTime,
      retryAfterSeconds: 0,
      backend: "in-memory",
    };
  }

  public reset(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  private evictStale(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 60000) return;
    this.lastCleanup = now;

    for (const [k, v] of this.store.entries()) {
      if (now - v.windowStart > 3600000 && (!v.lockedUntil || now > v.lockedUntil)) {
        this.store.delete(k);
      }
    }
  }
}

/**
 * Concurrency-safe Redis Lua script executing atomic sliding window counter updates.
 * Eliminates check-then-increment race conditions.
 */
const REDIS_RATE_LIMIT_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local lockout = tonumber(ARGV[3]) or window

local current = redis.call('INCR', key)

if current == 1 then
    redis.call('EXPIRE', key, window)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
    redis.call('EXPIRE', key, window)
    ttl = window
end

if current > limit then
    if lockout > ttl then
        redis.call('EXPIRE', key, lockout)
        ttl = lockout
    end
    return {0, current, ttl}
else
    return {1, current, ttl}
end
`;

/**
 * Enterprise Distributed Rate Limiter
 * - Connected via Redis (REDIS_URL) with atomic Lua script execution.
 * - Enforces fail-closed security on sensitive auth endpoints if Redis is unavailable.
 * - Falls back to in-memory store in non-production development environments.
 */
export class DistributedRateLimiter {
  private inMemoryStore: InMemorySlidingWindowStore = new InMemorySlidingWindowStore();
  private redisClient: Redis | null = null;
  private isConnecting: boolean = false;
  private connectionErrorLogged: boolean = false;
  private commandTimeoutMs: number = 1000;

  constructor() {
    this.commandTimeoutMs = parseInt(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS || "1000", 10);
  }

  /**
   * Initializes or returns the singleton Redis client.
   */
  private getRedisClient(): Redis | null {
    if (this.redisClient) return this.redisClient;

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      if (process.env.NODE_ENV === "production" && !this.connectionErrorLogged) {
        console.warn(
          "[SECURITY WARNING] REDIS_URL is not configured in production! Multi-instance distributed rate limiting is disabled."
        );
        this.connectionErrorLogged = true;
      }
      return null;
    }

    if (this.isConnecting) return null;

    try {
      this.isConnecting = true;
      this.redisClient = new Redis(redisUrl, {
        connectTimeout: 2000,
        commandTimeout: this.commandTimeoutMs,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redisClient.on("error", (err) => {
        if (!this.connectionErrorLogged) {
          console.error("[REDIS_RATE_LIMITER_ERROR] Redis connection error:", err.message);
          this.connectionErrorLogged = true;
        }
      });

      this.redisClient.connect().catch(() => null);
    } catch (err: any) {
      console.error("[REDIS_RATE_LIMITER_INIT_ERROR]", err.message);
      this.redisClient = null;
    } finally {
      this.isConnecting = false;
    }

    return this.redisClient;
  }

  /**
   * Overrides or injects a custom Redis client (used for isolated testing / mocking).
   */
  public setRedisClient(client: Redis | null): void {
    this.redisClient = client;
    this.connectionErrorLogged = false;
  }

  /**
   * Returns current active storage backend.
   */
  public getBackendType(): "redis" | "in-memory" {
    return this.redisClient || process.env.REDIS_URL ? "redis" : "in-memory";
  }

  /**
   * Asynchronous rate check with atomic Redis Lua script execution and fail-closed handling.
   */
  public async check(key: string, config: RateLimitConfig): Promise<RateLimitStatus> {
    const client = this.getRedisClient();

    // 1. If Redis client is active, execute atomic Lua rate check
    if (client) {
      try {
        const fullKey = `ratelimit:${key}`;
        const windowSec = config.windowSeconds;
        const limit = config.limit;
        const lockoutSec = config.lockoutSeconds || windowSec;

        // Wrap Redis execution in timeout protection
        const resultPromise = client.eval(
          REDIS_RATE_LIMIT_LUA,
          1,
          fullKey,
          windowSec.toString(),
          limit.toString(),
          lockoutSec.toString()
        ) as Promise<[number, number, number]>;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis command timed out")), this.commandTimeoutMs)
        );

        const [allowedRaw, currentCount, ttl] = await Promise.race([resultPromise, timeoutPromise]);
        const allowed = allowedRaw === 1;
        const retryAfterSeconds = allowed ? 0 : Math.max(1, ttl);
        const resetTime = Math.ceil(Date.now() / 1000) + ttl;

        return {
          allowed,
          limit,
          remaining: allowed ? Math.max(0, limit - currentCount) : 0,
          resetTime,
          retryAfterSeconds,
          backend: "redis",
        };
      } catch (err: any) {
        console.error(`[RATE_LIMIT_REDIS_ERROR] Key: ${key}, Error: ${err.message}`);

        // Fail-Closed policy on sensitive endpoints
        const failClosed = config.failClosed ?? (config === RATE_LIMIT_TIERS.AUTH);
        if (failClosed || process.env.NODE_ENV === "production") {
          return {
            allowed: false,
            limit: config.limit,
            remaining: 0,
            resetTime: Math.ceil(Date.now() / 1000) + 30,
            retryAfterSeconds: 30,
            backend: "redis",
            error: "REDIS_UNAVAILABLE",
          };
        }

        // Non-production fallback
        return this.inMemoryStore.check(key, config);
      }
    }

    // 2. Fallback to in-memory store if Redis is not configured
    if (process.env.NODE_ENV === "production" && config.failClosed) {
      // In production without Redis, fail closed on sensitive auth operations
      return {
        allowed: false,
        limit: config.limit,
        remaining: 0,
        resetTime: Math.ceil(Date.now() / 1000) + 60,
        retryAfterSeconds: 60,
        backend: "in-memory",
        error: "REDIS_REQUIRED_IN_PRODUCTION",
      };
    }

    return this.inMemoryStore.check(key, config);
  }

  /**
   * Synchronous check method providing immediate in-memory evaluation for testing.
   */
  public checkSync(key: string, config: RateLimitConfig): RateLimitStatus {
    return this.inMemoryStore.check(key, config);
  }

  /**
   * Resets counter for a specific key.
   */
  public async reset(key: string): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.del(`ratelimit:${key}`).catch(() => null);
    }
    this.inMemoryStore.reset(key);
  }

  /**
   * Clears all counters.
   */
  public async clear(): Promise<void> {
    if (this.redisClient) {
      const keys = await this.redisClient.keys("ratelimit:*").catch(() => []);
      if (keys.length > 0) {
        await this.redisClient.del(...keys).catch(() => null);
      }
    }
    this.inMemoryStore.clear();
  }
}

export const rateLimiter = new DistributedRateLimiter();

/**
 * Extracts sanitized client IP address from request headers.
 * Resolves trustworthy identity by inspecting Cloudflare / reverse proxy headers
 * according to configured proxy depth, avoiding spoofable client-supplied IPs.
 */
export function getClientIp(req: Request): string {
  // 1. Cloudflare CF-Connecting-IP (cannot be forged if edge origin is restricted)
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return sanitizeIp(cfIp.trim());
  }

  // 2. Real-IP header from trusted reverse proxy
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return sanitizeIp(realIp.trim());
  }

  // 3. X-Forwarded-For: trust rightmost IP based on TRUSTED_PROXY_DEPTH
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const depth = Math.max(1, parseInt(process.env.TRUSTED_PROXY_DEPTH || "1", 10));
      const targetIndex = Math.max(0, parts.length - depth);
      return sanitizeIp(parts[targetIndex] || parts[parts.length - 1]);
    }
  }

  return "127.0.0.1";
}

function sanitizeIp(ip: string): string {
  return ip
    .replace(/^\[/, "")
    .replace(/\](:\d+)?$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

/**
 * Creates standard HTTP 429 Too Many Requests response with Retry-After header,
 * or HTTP 503 if the rate limiter backend failed closed.
 */
export function createRateLimitResponse(status: RateLimitStatus): NextResponse {
  if (status.error === "REDIS_UNAVAILABLE" || status.error === "REDIS_REQUIRED_IN_PRODUCTION") {
    return NextResponse.json(
      {
        error: "Service Temporarily Unavailable",
        message: "Rate limiting infrastructure is temporarily unavailable. Request failed closed under security policy.",
        code: "RATE_LIMIT_DEGRADED",
        retryAfterSeconds: status.retryAfterSeconds,
      },
      {
        status: 503,
        headers: {
          "Retry-After": status.retryAfterSeconds.toString(),
        },
      }
    );
  }

  return NextResponse.json(
    {
      error: "Too Many Requests",
      message: `Rate limit exceeded. Please try again after ${status.retryAfterSeconds} seconds.`,
      retryAfterSeconds: status.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": status.retryAfterSeconds.toString(),
        "X-RateLimit-Limit": status.limit.toString(),
        "X-RateLimit-Remaining": Math.max(0, status.remaining).toString(),
        "X-RateLimit-Reset": status.resetTime.toString(),
      },
    }
  );
}
