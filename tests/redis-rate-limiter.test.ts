import {
  DistributedRateLimiter,
  RATE_LIMIT_TIERS,
  getClientIp,
  createRateLimitResponse,
} from "../src/lib/server/security/rate-limiter";
import { NextRequest } from "next/server";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

/**
 * In-memory Mock Redis Client simulating Redis Lua script execution and key expiry.
 * Used for deterministic unit testing of distributed concurrency and shared counters.
 */
class MockRedisClient {
  public store: Map<string, { value: number; expireAt: number }> = new Map();
  public shouldFail: boolean = false;
  public failError: Error = new Error("Connection refused (ECONNREFUSED 127.0.0.1:6379)");

  public async eval(script: string, numKeys: number, key: string, ...args: string[]): Promise<[number, number, number]> {
    if (this.shouldFail) {
      throw this.failError;
    }

    const windowSec = parseInt(args[0], 10);
    const limit = parseInt(args[1], 10);
    const lockoutSec = parseInt(args[2], 10) || windowSec;

    const now = Date.now();
    let record = this.store.get(key);

    if (!record || now >= record.expireAt) {
      record = { value: 1, expireAt: now + windowSec * 1000 };
      this.store.set(key, record);
      const ttl = Math.ceil((record.expireAt - now) / 1000);
      return [1, 1, ttl];
    }

    record.value += 1;
    const ttl = Math.ceil((record.expireAt - now) / 1000);

    if (record.value > limit) {
      if (lockoutSec > ttl) {
        record.expireAt = now + lockoutSec * 1000;
      }
      const newTtl = Math.ceil((record.expireAt - now) / 1000);
      return [0, record.value, newTtl];
    }

    return [1, record.value, ttl];
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  public async keys(pattern: string): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

async function runRedisRateLimiterSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Task 2: Redis Distributed Rate Limiter Verification");
  console.log("=================================================================\n");

  const mockRedis = new MockRedisClient();

  // Instance A and Instance B simulating 2 horizontally scaled app pods
  const podA = new DistributedRateLimiter();
  podA.setRedisClient(mockRedis as any);

  const podB = new DistributedRateLimiter();
  podB.setRedisClient(mockRedis as any);

  // --------------------------------------------------------------------------
  // TEST 1: Shared Counters Across Multiple Pod Instances
  // --------------------------------------------------------------------------
  console.log(">>> [Test 1] Shared Counters Across Distributed Pods <<<");
  const sharedKey = "user:shared_test_account";
  const tier = { limit: 4, windowSeconds: 60, lockoutSeconds: 60 };

  const res1A = await podA.check(sharedKey, tier);
  assert(res1A.allowed && res1A.remaining === 3, "1.1 Pod A registers attempt 1 (remaining: 3)");

  const res1B = await podB.check(sharedKey, tier);
  assert(res1B.allowed && res1B.remaining === 2, "1.2 Pod B sees attempt 2 on shared counter (remaining: 2)");

  const res2A = await podA.check(sharedKey, tier);
  assert(res2A.allowed && res2A.remaining === 1, "1.3 Pod A registers attempt 3 (remaining: 1)");

  const res2B = await podB.check(sharedKey, tier);
  assert(res2B.allowed && res2B.remaining === 0, "1.4 Pod B registers attempt 4 (remaining: 0)");

  const res3A = await podA.check(sharedKey, tier);
  assert(!res3A.allowed && res3A.remaining === 0, "1.5 Pod A blocked on 5th attempt via distributed state");

  const res3B = await podB.check(sharedKey, tier);
  assert(!res3B.allowed && res3B.remaining === 0, "1.6 Pod B also blocked on 6th attempt via distributed state");

  // --------------------------------------------------------------------------
  // TEST 2: Concurrent Race Condition Elimination (Atomic Lua Execution)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 2] Atomic Concurrency Safety (20 Parallel Requests) <<<");
  const concurrentKey = "user:concurrency_test";
  const concurrentTier = { limit: 5, windowSeconds: 60, lockoutSeconds: 60 };

  // Dispatch 20 simultaneous requests
  const promises = Array.from({ length: 20 }, (_, idx) =>
    (idx % 2 === 0 ? podA : podB).check(concurrentKey, concurrentTier)
  );

  const results = await Promise.all(promises);
  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.filter((r) => !r.allowed).length;

  assert(allowedCount === 5, `2.1 Exactly 5 concurrent requests permitted (allowed: ${allowedCount})`);
  assert(blockedCount === 15, `2.2 Exactly 15 concurrent requests blocked with 429 (blocked: ${blockedCount})`);

  // --------------------------------------------------------------------------
  // TEST 3: Expiry & TTL Reset
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 3] Expiry and Window Reset <<<");
  const expiryKey = "user:expiry_test";
  await podA.check(expiryKey, { limit: 1, windowSeconds: 1 });
  const blockedExpiry = await podA.check(expiryKey, { limit: 1, windowSeconds: 1 });
  assert(!blockedExpiry.allowed, "3.1 Limit hit before expiry");

  // Simulate time passage past expireAt
  const record = mockRedis.store.get(`ratelimit:${expiryKey}`);
  if (record) {
    record.expireAt = Date.now() - 1000; // expired
  }

  const postExpiry = await podA.check(expiryKey, { limit: 1, windowSeconds: 1 });
  assert(postExpiry.allowed, "3.2 Counter resets automatically after window expiry");

  // --------------------------------------------------------------------------
  // TEST 4: Fail-Closed Behavior on Sensitive Operations During Redis Outage
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 4] Redis Outage & Fail-Closed Security Policy <<<");
  mockRedis.shouldFail = true;

  // Sensitive auth endpoint (failClosed: true)
  const authStatus = await podA.check("ip:auth:1.2.3.4", RATE_LIMIT_TIERS.AUTH);
  assert(!authStatus.allowed, "4.1 Sensitive auth operation fails closed during Redis outage");
  assert(authStatus.error === "REDIS_UNAVAILABLE", "4.2 Explicit REDIS_UNAVAILABLE error reported");

  const failClosedRes = createRateLimitResponse(authStatus);
  assert(failClosedRes.status === 503, "4.3 HTTP 503 Service Unavailable returned for degraded auth route");

  // Reset Redis health
  mockRedis.shouldFail = false;

  // --------------------------------------------------------------------------
  // TEST 5: Trustworthy Client IP Resolution (Proxy Header Hardening)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 5] Trustworthy Client IP Extraction <<<");

  // 5.1 Cloudflare header prioritized
  const cfReq = new NextRequest("http://localhost:3000/login", {
    headers: {
      "cf-connecting-ip": "203.0.113.195",
      "x-forwarded-for": "10.0.0.1, 192.168.1.1",
    },
  });
  assert(getClientIp(cfReq) === "203.0.113.195", "5.1 Cloudflare CF-Connecting-IP prioritized over spoofable XFF");

  // 5.2 X-Real-IP used when present
  const realIpReq = new NextRequest("http://localhost:3000/login", {
    headers: {
      "x-real-ip": "198.51.100.25",
    },
  });
  assert(getClientIp(realIpReq) === "198.51.100.25", "5.2 X-Real-IP extracted from trusted reverse proxy");

  // 5.3 Port numbers stripped safely
  const portReq = new NextRequest("http://localhost:3000/login", {
    headers: {
      "x-real-ip": "198.51.100.25:44321",
    },
  });
  assert(getClientIp(portReq) === "198.51.100.25", "5.3 Port numbers stripped safely from IP address");

  console.log("\n=================================================================");
  console.log(`Task 2 Redis Rate Limiter Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) process.exit(1);
}

runRedisRateLimiterSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
