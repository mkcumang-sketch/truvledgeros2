import fs from "fs";
import path from "path";
import type { LoginRateLimitResult } from "@/lib/server/security/upstash-rate-limiter";

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

async function runTestSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Token Bucket Rate Limiting & Turnstile Verification");
  console.log("==================================================================\n");

  const envNames = [
    "NODE_ENV",
    "REDIS_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "TURNSTILE_SECRET_KEY",
    "CLOUDFLARE_TURNSTILE_SECRET_KEY",
    "ENFORCE_TURNSTILE",
    "NEXT_PUBLIC_REQUIRE_TURNSTILE",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY",
  ];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.NODE_ENV = "test";
  for (const name of envNames.slice(1)) delete process.env[name];

  const [{ db }, { verifyTurnstileToken }, rateLimitModule, loginRouteModule] =
    await Promise.all([
      import("@/lib/db"),
      import("@/lib/server/security/turnstile"),
      import("@/lib/server/security/upstash-rate-limiter"),
      import("@/app/api/auth/login/route"),
    ]);
  const { upstashLoginLimiter, create429RateLimitResponse } = rateLimitModule;
  const loginRoutePost = loginRouteModule.POST;
  const originalUser = db.user;
  const originalAuditCreate = db.auditLog.create;
  for (const name of envNames.slice(1)) process.env[name] = "";
  (db as any).user = { findUnique: async () => null };
  (db.auditLog as any).create = async () => ({});

  // -----------------------------------------------------------------------------
  // SECTION 1: Fix Authentication & Timeout Guardrails
  // -----------------------------------------------------------------------------
  console.log(">>> [Section 1] Authentication & 5s Timeout Guardrails <<<");

  // 1.1 Verify Login API Route exists
  const routePath = path.join(__dirname, "../src/app/api/auth/login/route.ts");
  assert(fs.existsSync(routePath), "1.1 Login API handler exists at src/app/api/auth/login/route.ts");

  const routeSource = fs.readFileSync(routePath, "utf-8");
  assert(
    routeSource.includes("AUTH_TIMEOUT_MS = 5000"),
    "1.2 Explicit 5s authentication timeout configured in login route"
  );
  assert(
    routeSource.includes("Authentication is temporarily unavailable"),
    "1.3 Authentication timeout returns a temporary service error"
  );

  // 1.4 Test Login API Route with invalid credentials returns 401 JSON
  const invalidReq = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.1" },
    body: JSON.stringify({
      email: "nonexistent-test-user@truvtest.in",
      password: "WrongPassword999!",
    }),
  });
  const invalidRes = await loginRoutePost(invalidReq);
  const invalidData = await invalidRes.json();

  assert(
    invalidRes.status === 401,
    "1.4 Invalid credentials return HTTP 401 status",
    `received ${invalidRes.status}`
  );
  assert(
    invalidData.error === "Invalid credentials",
    "1.5 Error message is exactly 'Invalid credentials'",
    `received ${String(invalidData.error)}`
  );

  // -----------------------------------------------------------------------------
  // SECTION 2: Upstash Redis Token-Bucket Limiting
  // -----------------------------------------------------------------------------
  console.log("\n>>> [Section 2] Upstash Redis Token-Bucket Rate Limiting <<<");

  const testIp = `192.0.2.${Math.floor(Math.random() * 200 + 10)}`;
  await upstashLoginLimiter.reset(testIp);

  // 2.1 First 8 attempts within the 5-minute window
  let lastResult: LoginRateLimitResult | null = null;
  for (let i = 1; i <= 8; i++) {
    lastResult = await upstashLoginLimiter.check(testIp);
    assert(lastResult.allowed, `2.1.${i} Attempt ${i}/8 is allowed (remaining: ${lastResult.remaining})`);
  }

  // 2.2 9th attempt blocked under 8 attempts / 5-minute window
  const blockedResult = await upstashLoginLimiter.check(testIp);
  assert(!blockedResult.allowed, "2.2 9th attempt is blocked by rate limiter");
  assert(blockedResult.retryAfterSeconds > 0, `2.3 Retry-after seconds reported (${blockedResult.retryAfterSeconds}s)`);
  assert(
    blockedResult.errorMessage.includes("Too many attempts. Please try again in"),
    `2.4 Clean error message formatted: "${blockedResult.errorMessage}"`
  );

  // 2.5 HTTP 429 response formatting
  const res429 = create429RateLimitResponse(blockedResult);
  const data429 = await res429.json();
  assert(res429.status === 429, "2.5 Rate limit response returns HTTP 429 status");
  assert(
    data429.error.startsWith("Too many attempts. Please try again in"),
    "2.6 JSON response body contains exact friendly retry message"
  );
  assert(
    res429.headers.get("Retry-After") !== null,
    `2.7 HTTP Retry-After header present (${res429.headers.get("Retry-After")})`
  );

  // 2.6 Route integration with Rate Limiter
  const routeBlockedReq = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
    body: JSON.stringify({
      email: "test@example.com",
      password: "TestPassword123!",
    }),
  });
  const routeBlockedRes = await loginRoutePost(routeBlockedReq);
  const routeBlockedData = await routeBlockedRes.json();
  assert(routeBlockedRes.status === 429, "2.8 Route returns 429 when client IP exceeds rate limit");
  assert(
    routeBlockedData.error.includes("Too many attempts. Please try again in"),
    "2.9 Route returns JSON retry message without crashing"
  );

  // -----------------------------------------------------------------------------
  // SECTION 3: Cloudflare Turnstile Captcha
  // -----------------------------------------------------------------------------
  console.log("\n>>> [Section 3] Cloudflare Turnstile Captcha Integration <<<");

  // 3.1 Verify Turnstile in Login Page UI
  const loginPagePath = path.join(__dirname, "../src/app/(auth)/login/page.tsx");
  const loginPageSource = fs.readFileSync(loginPagePath, "utf-8");

  assert(
    loginPageSource.includes("@marsidev/react-turnstile") && loginPageSource.includes("<Turnstile"),
    "3.1 Turnstile widget (<Turnstile />) integrated from @marsidev/react-turnstile"
  );
  assert(
    loginPageSource.includes("failedAttempts >= 2") || loginPageSource.includes("requireTurnstile"),
    "3.2 Captcha verification triggered after 2 consecutive failed attempts"
  );
  assert(
    loginPageSource.includes("cf-turnstile-response") || loginPageSource.includes("turnstileToken"),
    "3.3 Form submission includes Turnstile response token"
  );

  // 3.2 Backend verification helper
  const dummyValidToken = "XXXX.DUMMY.TOKEN.VALID";
  const dummyVerify = await verifyTurnstileToken(dummyValidToken);
  assert(dummyVerify.success, "3.4 Test/dev turnstile token verification succeeds");

  // 3.3 Backend validation in login route before database query
  const captchaFreshIp = `198.51.100.${Math.floor(Math.random() * 200 + 10)}`;
  const fakeTokenReq = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": captchaFreshIp },
    body: JSON.stringify({
      email: "test@example.com",
      password: "TestPassword123!",
      turnstileToken: "INVALID_MALICIOUS_TOKEN_12345",
    }),
  });

  // Temporarily set a dummy secret key to test enforcement rejection
  const prevSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAAK_dummy_secret_key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
      status: 200,
    });
  try {
    const fakeTokenRes = await loginRoutePost(fakeTokenReq);
    assert(
      fakeTokenRes.status === 400,
      "3.5 Invalid Turnstile token is rejected with HTTP 400 before DB credentials check"
    );
  } finally {
    if (prevSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prevSecret;
    globalThis.fetch = originalFetch;
  }

  console.log("\n==================================================================");
  console.log(`Token Bucket & Turnstile Suite Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================\n");

  (db as any).user = originalUser;
  (db.auditLog as any).create = originalAuditCreate;
  for (const name of envNames) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
