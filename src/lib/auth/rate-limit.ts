interface RateLimitRecord {
  attempts: number;
  resetAt: number;
  lockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

interface RateLimitConfig {
  maxAttempts?: number;
  windowMs?: number;
  lockoutMs?: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = {}
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const { maxAttempts = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000 } = config;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    rateLimitStore.set(key, { attempts: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  // Check lockout
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: record.lockedUntil - now,
    };
  }

  // Window reset
  if (now > record.resetAt) {
    rateLimitStore.set(key, { attempts: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  // Increment attempts
  record.attempts += 1;
  if (record.attempts > maxAttempts) {
    record.lockedUntil = now + lockoutMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: lockoutMs,
    };
  }

  return {
    allowed: true,
    remaining: maxAttempts - record.attempts,
  };
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}