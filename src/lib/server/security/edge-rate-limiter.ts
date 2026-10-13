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
};
export type {
  RateLimitConfig,
  RateLimitStatus,
};

/**
 * Edge-compatible Distributed Rate Limiter
 * - 100% compliant with Vercel Edge Runtime (zero Node.js socket or diagnostics_channel imports).
 * - If UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL & KV_REST_API_TOKEN) are set,
 *   executes atomic rate limits over standard HTTPS fetch()!
 * - If REST Redis is not configured, runs the Edge in-memory sliding window store.
 * - Enforces fail-closed protection on sensitive endpoints if Edge REST Redis fails.
 */
export class EdgeRateLimiter {
  private inMemoryStore: InMemorySlidingWindowStore = new InMemorySlidingWindowStore();

  public async check(key: string, config: RateLimitConfig): Promise<RateLimitStatus> {
    const restUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
    const restToken = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

    if (restUrl && restToken) {
      try {
        const fullKey = `ratelimit:${key}`;
        const windowSec = config.windowSeconds;
        const limit = config.limit;
        const lockoutSec = config.lockoutSeconds || windowSec;

        // Atomic multi-command pipeline via Upstash REST API: INCR + TTL
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
          signal: AbortSignal.timeout(1000),
        });

        if (!response.ok) {
          throw new Error(`Edge Redis REST responded with status ${response.status}`);
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
      } catch (err: any) {
        console.error(`[EDGE_RATE_LIMITER_ERROR] Key: ${key}, Error: ${err.message}`);
        if (config.failClosed || process.env.NODE_ENV === "production") {
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

    // Default Edge fallback to in-memory store
    return this.inMemoryStore.check(key, config);
  }

  public checkSync(key: string, config: RateLimitConfig): RateLimitStatus {
    return this.inMemoryStore.check(key, config);
  }

  public reset(key: string): void {
    this.inMemoryStore.reset(key);
  }

  public clear(): void {
    this.inMemoryStore.clear();
  }
}

export const edgeRateLimiter = new EdgeRateLimiter();
export const rateLimiter = edgeRateLimiter;
