let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

async function run() {
  const env = {
    nodeEnv: process.env.NODE_ENV,
    redisUrl: process.env.REDIS_URL,
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  const originalNow = Date.now;
  let now = Date.now();

  process.env.NODE_ENV = "test";
  delete process.env.REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  Date.now = () => now;

  try {
    const { upstashLoginLimiter, LOGIN_RATE_LIMIT_POLICY } = await import(
      "../src/lib/server/security/upstash-rate-limiter"
    );
    const ip = `policy-test-${Math.random()}`;
    const email = `account-${Math.random()}@example.invalid`;

    assert(
      LOGIN_RATE_LIMIT_POLICY.limit === 8 &&
        LOGIN_RATE_LIMIT_POLICY.windowSeconds === 300 &&
        LOGIN_RATE_LIMIT_POLICY.cooldownSeconds === 120,
      "login limiter is configured for 8 attempts, 5 minutes, and a 2-minute first cooldown"
    );

    await upstashLoginLimiter.reset(ip, email);
    let result;
    for (let attempt = 1; attempt <= 8; attempt++) {
      result = await upstashLoginLimiter.check(ip, email);
      assert(result.allowed, `failed login attempt ${attempt} remains allowed`);
    }

    result = await upstashLoginLimiter.check(ip, email);
    assert(!result.allowed && result.retryAfterSeconds === 120, "ninth failed attempt starts the 2-minute cooldown");

    now += 120_001;
    result = await upstashLoginLimiter.check(ip, email);
    assert(result.allowed, "cooldown expires after two minutes without a permanent lock");

    await upstashLoginLimiter.reset(ip, email);
    result = await upstashLoginLimiter.check(ip, email);
    assert(result.allowed && result.remaining === 7, "successful-login reset clears the account and IP counters");

    const ipSpray = `ip-spray-${Math.random()}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check(ipSpray, `different-${attempt}@example.invalid`);
    }
    result = await upstashLoginLimiter.check(ipSpray, "ninth@example.invalid");
    assert(!result.allowed, "IP bucket limits attempts across different accounts");

    const account = `shared-${Math.random()}@example.invalid`;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check(`rotating-ip-${attempt}`, account);
    }
    result = await upstashLoginLimiter.check("rotating-ip-final", account);
    assert(!result.allowed, "account bucket limits attempts across different IPs");

    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    }
    result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    assert(result.retryAfterSeconds === 120, "first repeated-account lockout uses the 2-minute cooldown");

    now += 120_001;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    }
    result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    assert(result.retryAfterSeconds === 240, "repeated lockouts progressively increase cooldown");

    now += 240_001;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    }
    result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    assert(result.retryAfterSeconds === 480, "progressive cooldown doubles to eight minutes");

    now += 480_001;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    }
    result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    assert(result.retryAfterSeconds === 900, "progressive cooldown is capped at fifteen minutes");

    now += 900_001;
    result = await upstashLoginLimiter.check("progressive-ip", "progressive@example.invalid");
    assert(result.allowed, "maximum cooldown expires and never becomes a permanent lock");
  } finally {
    Date.now = originalNow;
    if (env.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env.nodeEnv;
    if (env.redisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = env.redisUrl;
    if (env.restUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = env.restUrl;
    if (env.restToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = env.restToken;
    if (env.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = env.kvUrl;
    if (env.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = env.kvToken;
  }

  console.log(`Login rate-limit policy tests: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("Login rate-limit policy tests failed.");
  process.exit(1);
});
