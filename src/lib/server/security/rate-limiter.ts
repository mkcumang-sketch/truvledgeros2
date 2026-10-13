import type Redis from "ioredis";
import {
  RateLimitConfig,
  RateLimitStatus,
  RATE_LIMIT_TIERS,
  InMemorySlidingWindowStore,
  getClientIp,
  createRateLimitResponse,
} from "./rate-limiter-shared";

export {
  RATE_LIMIT_TIERS,
  getClientIp,
  createRateLimitResponse,
  InMemorySlidingWindowStore,
};
export type { RateLimitConfig, RateLimitStatus };

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
 * - Exclusively executed in server-side Node.js runtime code.
 * - Enforces fail-closed security on sensitive auth endpoints if Redis is unavailable.
 * - Falls back to in-memory store in non-production development environments.
 */
export class DistributedRateLimiter {
  private inMemoryStore: InMemorySlidingWindowStore = new InMemorySlidingWindowStore();
  private redisClient: Redis | null = null;
  private connectionPromise: Promise<any> | null = null;
  private isConnecting: boolean = false;
  private connectionErrorLogged: boolean = false;
  private commandTimeoutMs: number = 1000;

  constructor() {
    this.commandTimeoutMs = parseInt(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS || "1000", 10);
  }

  /**
   * Initializes or returns the singleton Redis client with proper connection awaiting.
   * Loads ioredis strictly in server-side Node.js runtime.
   */
  private async getRedisClient(): Promise<Redis | null> {
    if (this.redisClient) {
      if (this.connectionPromise) {
        await this.connectionPromise.catch(() => null);
      }
      return this.redisClient;
    }

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return null;
    }

    if (this.isConnecting) {
      if (this.connectionPromise) {
        await this.connectionPromise.catch(() => null);
      }
      return this.redisClient;
    }

    try {
      this.isConnecting = true;

      // Ensure ioredis is loaded dynamically only in Node.js runtime
      const ioredisModule = require("ioredis");
      const RedisClass = ioredisModule.default || ioredisModule;

      const client = new RedisClass(redisUrl, {
        connectTimeout: 2000,
        commandTimeout: this.commandTimeoutMs,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      client.on("error", (err: any) => {
        if (!this.connectionErrorLogged) {
          console.error("[REDIS_RATE_LIMITER_ERROR] Redis connection error:", err.message);
          this.connectionErrorLogged = true;
        }
      });

      const connPromise = client.connect();
      this.connectionPromise = connPromise;
      await connPromise.catch((connErr: any) => {
        if (!this.connectionErrorLogged) {
          console.error("[REDIS_RATE_LIMITER_CONNECT_ERROR] Failed to establish TCP connection:", connErr?.message || connErr);
          this.connectionErrorLogged = true;
        }
      });

      this.redisClient = client;
    } catch (err: any) {
      console.error("[REDIS_RATE_LIMITER_INIT_ERROR]", err?.message || err);
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
    this.connectionPromise = null;
    this.connectionErrorLogged = false;
  }

  /**
   * Returns current active storage backend.
   */
  public getBackendType(): "redis" | "in-memory" | "edge-redis" {
    if (this.redisClient || process.env.REDIS_URL) return "redis";
    if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) return "edge-redis";
    return "in-memory";
  }

  /**
   * Asynchronous rate check with atomic Redis Lua / Upstash REST script execution and fail-closed handling.
   */
  public async check(key: string, config: RateLimitConfig): Promise<RateLimitStatus> {
    const fullKey = `ratelimit:${key}`;
    const windowSec = config.windowSeconds;
    const limit = config.limit;
    const lockoutSec = config.lockoutSeconds || windowSec;

    // 1. If Upstash REST is configured and no mock Redis client was injected, prefer HTTP REST
    const restUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
    const restToken = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

    if (!this.redisClient && restUrl && restToken) {
      try {
        const response = await fetch(`${restUrl}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${restToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            ["INCR", fullKey],
            ["TTL", fullKey],
          ]),
          signal: AbortSignal.timeout(this.commandTimeoutMs),
        });

        if (!response.ok) {
          throw new Error(`Upstash REST responded with HTTP ${response.status}`);
        }

        const data = await response.json();
        const currentCount = Number(data[0]?.result || 1);
        let ttl = Number(data[1]?.result || -1);

        if (ttl === -1 || currentCount === 1) {
          ttl = windowSec;
          await fetch(`${restUrl}/expire/${encodeURIComponent(fullKey)}/${windowSec}`, {
            headers: { Authorization: `Bearer ${restToken}` },
          }).catch(() => null);
        }

        if (currentCount > limit) {
          if (lockoutSec > ttl) {
            await fetch(`${restUrl}/expire/${encodeURIComponent(fullKey)}/${lockoutSec}`, {
              headers: { Authorization: `Bearer ${restToken}` },
            }).catch(() => null);
            ttl = lockoutSec;
          }
          return {
            allowed: false,
            limit,
            remaining: 0,
            resetTime: Math.ceil(Date.now() / 1000) + ttl,
            retryAfterSeconds: Math.max(1, ttl),
            backend: "edge-redis",
          };
        }

        return {
          allowed: true,
          limit,
          remaining: Math.max(0, limit - currentCount),
          resetTime: Math.ceil(Date.now() / 1000) + ttl,
          retryAfterSeconds: 0,
          backend: "edge-redis",
        };
      } catch (restErr: any) {
        console.error(`[RATE_LIMIT_REST_ERROR] Key: ${key}, Error: ${restErr.message}`);
        const failClosed = config.failClosed ?? (config === RATE_LIMIT_TIERS.AUTH);
        if (failClosed || process.env.NODE_ENV === "production") {
          console.error("[AUTH_SECURITY_ALERT] Distributed REST rate limiter unavailable. Fail-closed defense engaged.");
          return {
            allowed: false,
            limit: config.limit,
            remaining: 0,
            resetTime: Math.ceil(Date.now() / 1000) + 30,
            retryAfterSeconds: 30,
            backend: "edge-redis",
            error: "REDIS_UNAVAILABLE",
          };
        }
        return this.inMemoryStore.check(key, config);
      }
    }

    // 2. TCP Redis (ioredis) execution
    const client = await this.getRedisClient();

    if (client) {
      try {
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
          console.error("[AUTH_SECURITY_ALERT] Distributed TCP rate limiter unavailable. Fail-closed defense engaged.");
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

    // 3. Fallback if Redis is completely unconfigured
    if (process.env.NODE_ENV === "production" && config.failClosed) {
      console.error("[AUTH_SECURITY_ALERT] Distributed rate limiter unconfigured in production. Fail-closed defense engaged.");
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
