import { upstashLoginLimiter } from "../src/lib/server/security/upstash-rate-limiter";

async function run() {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRedisUrl = process.env.REDIS_URL;
  const originalRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = "production";

    const result = await upstashLoginLimiter.check("203.0.113.10:test@example.com");
    if (result.allowed) {
      throw new Error("Production login limiter must fail closed when Redis is unavailable.");
    }
    if (!result.errorMessage.includes("temporarily unavailable")) {
      throw new Error("Production fail-closed response must not expose backend details.");
    }

    console.log("PASS: production login rate limiting fails closed without Redis.");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalRestUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalRestUrl;
    if (originalRestToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalRestToken;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
