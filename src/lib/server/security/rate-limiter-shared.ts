import { NextResponse } from "next/server";

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
  backend: "redis" | "in-memory" | "edge-redis";
  error?: string;
}

export const RATE_LIMIT_TIERS = {
  AUTH: { limit: 5, windowSeconds: 15 * 60, lockoutSeconds: 15 * 60, failClosed: true } as RateLimitConfig,
  EMAIL_SMS: { limit: 3, windowSeconds: 60 * 60, lockoutSeconds: 60 * 60, failClosed: true } as RateLimitConfig,
  SEARCH_LIST: { limit: 60, windowSeconds: 60, failClosed: false } as RateLimitConfig,
  GENERAL_API: { limit: 100, windowSeconds: 60, failClosed: false } as RateLimitConfig,
  AI_API: { limit: 20, windowSeconds: 60, lockoutSeconds: 5 * 60, failClosed: true } as RateLimitConfig,
};

export interface WindowEntry {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

/**
 * Universal in-memory sliding window bucket store with automated garbage collection.
 * Pure TypeScript / JavaScript — 100% compatible with both Edge runtime and Node.js runtime.
 */
export class InMemorySlidingWindowStore {
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
