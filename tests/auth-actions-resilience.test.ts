import nodemailer from "nodemailer";
import { loginAction, requestPasswordResetAction } from "@/lib/auth/actions";
import { POST as loginRoutePost } from "@/app/api/auth/login/route";
import { db } from "@/lib/db";
import { rateLimiter } from "@/lib/server/security/rate-limiter";
import { upstashLoginLimiter } from "@/lib/server/security/upstash-rate-limiter";

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

function messageOf(response: { message?: string; error?: string }): string {
  return response.message || "";
}

function loginForm(email: string, password = "ValidPassword123!", token?: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  if (token) form.set("turnstileToken", token);
  return form;
}

function loginRequest(email: string, password: string, turnstileToken?: string): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.12" },
    body: JSON.stringify({ email, password, ...(turnstileToken ? { turnstileToken } : {}) }),
  });
}

async function run() {
  const originalEnv = {
    nodeEnv: process.env.NODE_ENV,
    turnstileSecret: process.env.TURNSTILE_SECRET_KEY,
    cloudflareSecret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
    enforceTurnstile: process.env.ENFORCE_TURNSTILE,
    publicRequireTurnstile: process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE,
    publicTurnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    publicCloudflareSiteKey: process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    resendApiKey: process.env.RESEND_API_KEY,
  };
  const originalUser = db.user;
  const originalAuditLog = db.auditLog;
  const originalTransaction = db.$transaction;
  const originalLoginCheck = upstashLoginLimiter.check;
  const originalLoginReset = upstashLoginLimiter.reset;
  const originalRateCheck = rateLimiter.check;
  const originalFetch = globalThis.fetch;
  const originalCreateTransport = nodemailer.createTransport;

  let loginFindUnique: (args: any) => Promise<any> = async () => null;
  let lookupEmail = "";
  let limiterCheck: (key: string) => Promise<any> = async () => ({
    allowed: true,
    errorMessage: "",
    retryAfterSeconds: 0,
    retryAfterMinutes: 0,
  });
  let captchaMode: "invalid" | "unavailable" = "invalid";
  let transactionFailure = false;
  let resetEmailCalls = 0;
  let loginLimiterCalls = 0;
  let loginLimiterResetCalls = 0;
  const resetRateLimitKeys: string[] = [];
  const auditActions: string[] = [];

  process.env.NODE_ENV = "test";
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  delete process.env.ENFORCE_TURNSTILE;
  delete process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.RESEND_API_KEY;

  (db as any).user = {
    findUnique: async (args: any) => {
      lookupEmail = args.where.email;
      return loginFindUnique(args);
    },
  };
  (db as any).auditLog = {
    create: async ({ data }: any) => {
      auditActions.push(data.action);
      return {};
    },
  };
  (db as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => {
    if (transactionFailure) throw new Error("database failure");
    return callback({
      user: {
        update: async () => ({}),
      },
    });
  };
  (upstashLoginLimiter as any).check = async (key: string) => {
    loginLimiterCalls++;
    return limiterCheck(key);
  };
  (upstashLoginLimiter as any).reset = async () => {
    loginLimiterResetCalls++;
  };
  (rateLimiter as any).check = async (key: string) => {
    resetRateLimitKeys.push(key);
    return { allowed: true, retryAfterSeconds: 0 };
  };
  globalThis.fetch = async () => {
    if (captchaMode === "unavailable") throw new Error("provider unavailable");
    return new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
      status: 200,
    });
  };

  try {
    const invalidLogin = await loginAction(loginForm("not-an-email", "short"));
    assert(invalidLogin.error === "Invalid credentials" && loginLimiterCalls === 0, "login validates email and password before authentication");

    let captchaFetchCalls = 0;
    globalThis.fetch = async () => {
      captchaFetchCalls++;
      if (captchaMode === "unavailable") throw new Error("provider unavailable");
      return new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
        status: 200,
      });
    };
    process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
    process.env.ENFORCE_TURNSTILE = "true";
    const missingCaptcha = await loginAction(loginForm("user@example.com"));
    assert(missingCaptcha.error?.includes("Captcha"), "configured CAPTCHA rejects an omitted token");
    assert(captchaFetchCalls === 0, "missing CAPTCHA tokens are rejected without a provider request");

    const routeMissingCaptcha = await loginRoutePost(
      loginRequest("user@example.com", "ValidPassword123!")
    );
    assert(routeMissingCaptcha.status === 400, "login API route rejects an omitted configured CAPTCHA token");

    const invalidCaptcha = await loginAction(loginForm("user@example.com", "ValidPassword123!", "invalid-token"));
    assert(invalidCaptcha.error === "Captcha verification failed. Please try again.", "invalid CAPTCHA token is rejected");
    const routeInvalidCaptcha = await loginRoutePost(
      loginRequest("user@example.com", "ValidPassword123!", "invalid-token")
    );
    assert(routeInvalidCaptcha.status === 400, "login API route rejects an invalid CAPTCHA token");

    captchaMode = "unavailable";
    const captchaOutage = await loginAction(loginForm("user@example.com", "ValidPassword123!", "submitted"));
    assert(
      captchaOutage.error === "Captcha service temporarily unreachable. Please retry.",
      "CAPTCHA outage fails closed safely"
    );
    const routeCaptchaOutage = await loginRoutePost(
      loginRequest("user@example.com", "ValidPassword123!", "submitted")
    );
    assert(routeCaptchaOutage.status === 503, "login API route fails closed when CAPTCHA provider is unavailable");

    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "configured-site-key";
    delete process.env.TURNSTILE_SECRET_KEY;
    const missingServerSecret = await loginAction(loginForm("user@example.com"));
    assert(missingServerSecret.error === "Captcha service temporarily unavailable. Please retry.", "production CAPTCHA configuration without a server secret fails closed");
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    delete process.env.ENFORCE_TURNSTILE;
    delete process.env.TURNSTILE_SECRET_KEY;
    limiterCheck = async () => {
      throw new Error("Redis unavailable");
    };
    const limiterOutage = await loginAction(loginForm("user@example.com"));
    assert(limiterOutage.error === "Authentication is temporarily unavailable. Please try again shortly.", "login limiter exceptions return a controlled service error");
    limiterCheck = async () => ({
      allowed: false,
      serviceUnavailable: true,
      errorMessage: "Authentication is temporarily unavailable. Please try again shortly.",
      retryAfterSeconds: 60,
      retryAfterMinutes: 1,
    });
    const limiterDegraded = await loginAction(loginForm("user@example.com"));
    assert(
      limiterDegraded.error?.includes("temporarily unavailable") && !("retryAfter" in limiterDegraded),
      "limiter infrastructure failures do not appear as password lockouts in the login form"
    );

    limiterCheck = async () => ({
      allowed: false,
      errorMessage: "Too many attempts. Please try again in 2 minutes.",
      retryAfterSeconds: 120,
      retryAfterMinutes: 2,
    });
    const blockedLogin = await loginAction(loginForm("user@example.com"));
    assert(blockedLogin.retryAfter === 120, "login returns the configured 2-minute cooldown response");

    limiterCheck = async () => ({
      allowed: true,
      errorMessage: "",
      retryAfterSeconds: 0,
      retryAfterMinutes: 0,
    });
    loginFindUnique = async () => null;
    const missingLogin = await loginAction(loginForm("  USER@example.com  "));
    assert(missingLogin.error === "Invalid credentials", "missing login user gets generic credentials response");
    assert(lookupEmail === "user@example.com", "login normalizes email before database lookup");

    const { hashPassword } = await import("@/lib/auth/password");
    const existingUserHash = await hashPassword("ActualPassword123!");
    loginFindUnique = async () => ({
      id: "inactive-or-wrong-password",
      email: "user@example.com",
      passwordHash: existingUserHash,
      active: true,
      memberships: [],
    });
    const wrongPassword = await loginAction(loginForm("user@example.com", "WrongPassword123!"));
    const wrongPasswordStartedAt = Date.now();
    const timedWrongPassword = await loginAction(loginForm("user@example.com", "WrongPassword123!"));
    const wrongPasswordDuration = Date.now() - wrongPasswordStartedAt;
    assert(
      wrongPassword.error === missingLogin.error &&
        timedWrongPassword.error === "Invalid credentials" &&
        wrongPasswordDuration < 5000,
      "wrong password returns immediately with the same generic response as a missing user"
    );
    assert(auditActions.filter((action) => action === "LOGIN_FAILED").length === 3, "missing-user and wrong-password attempts are audited");

    loginFindUnique = async () => {
      throw new Error("database unavailable");
    };
    const loginDbFailure = await loginAction(loginForm("user@example.com"));
    assert(loginDbFailure.error === "Authentication is temporarily unavailable. Please try again shortly.", "login database failures return a controlled service error");

    loginFindUnique = () => new Promise<any>(() => undefined);
    const loginTimeout = await loginAction(loginForm("user@example.com"));
    assert(loginTimeout.error === "Authentication is temporarily unavailable. Please try again shortly.", "login timeout returns a controlled temporary error");

    loginFindUnique = async () => ({
      id: "route-user",
      email: "route@example.com",
      passwordHash: existingUserHash,
      active: true,
      isSuperAdmin: false,
      memberships: [],
    });
    const routeWrongPasswordStartedAt = Date.now();
    const routeWrongPasswordResponse = await loginRoutePost(
      loginRequest("route@example.com", "WrongPassword123!")
    );
    const routeWrongPasswordData = await routeWrongPasswordResponse.json();
    assert(
      routeWrongPasswordResponse.status === 401 &&
        routeWrongPasswordData.error === "Invalid credentials" &&
        Date.now() - routeWrongPasswordStartedAt < 5000,
      "login API route returns immediate generic credentials failure for a wrong password"
    );

    loginFindUnique = async () => {
      throw new Error("database unavailable");
    };
    const routeDatabaseFailure = await loginRoutePost(loginRequest("route@example.com", "ValidPassword123!"));
    assert(routeDatabaseFailure.status === 503, "login API route converts database failure to temporary-unavailability status");

    loginFindUnique = () => new Promise<any>(() => undefined);
    const routeTimeoutResponse = await loginRoutePost(
      loginRequest("route@example.com", "ValidPassword123!")
    );
    assert(routeTimeoutResponse.status === 503, "login API route returns temporary-unavailability status on authentication timeout");

    const genericMessage = "If an account matches that email address, password reset instructions will be sent shortly.";
    loginFindUnique = async () => null;
    const forgotAsString = await requestPasswordResetAction("  UNKNOWN@example.com ");
    const forgotAsObject = await requestPasswordResetAction({ email: "UNKNOWN@example.com" });
    const forgotForm = new FormData();
    forgotForm.set("email", "UNKNOWN@example.com");
    const forgotAsForm = await requestPasswordResetAction(forgotForm);
    assert(
      forgotAsString.success && forgotAsObject.success && forgotAsForm.success &&
        messageOf(forgotAsString) === genericMessage && messageOf(forgotAsObject) === genericMessage &&
        messageOf(forgotAsForm) === genericMessage && lookupEmail === "unknown@example.com",
      "forgot-password accepts string, object, and FormData inputs with normalized email"
    );
    assert(
      resetRateLimitKeys.every((key) => !key.includes("unknown@example.com")),
      "forgot-password rate-limit keys do not contain raw email addresses"
    );

    (rateLimiter as any).check = async () => {
      throw new Error("Redis unavailable");
    };
    const forgotRateOutage = await requestPasswordResetAction({ email: "user@example.com" });
    assert(forgotRateOutage.success && messageOf(forgotRateOutage) === genericMessage, "forgot-password limiter exceptions preserve generic response");

    (rateLimiter as any).check = async () => ({ allowed: true, retryAfterSeconds: 0 });
    loginFindUnique = async () => {
      throw new Error("database unavailable");
    };
    const forgotDbOutage = await requestPasswordResetAction("user@example.com");
    assert(forgotDbOutage.success && messageOf(forgotDbOutage) === genericMessage, "forgot-password database failures preserve generic response");

    loginFindUnique = async () => ({
      id: "reset-user",
      email: "user@example.com",
      name: "Test User",
      active: true,
      memberships: [],
    });
    transactionFailure = true;
    const forgotTransactionOutage = await requestPasswordResetAction("user@example.com");
    assert(forgotTransactionOutage.success && messageOf(forgotTransactionOutage) === genericMessage, "reset token transaction failures preserve generic response");
    assert(resetEmailCalls === 0, "reset email is not sent when token persistence fails");

    transactionFailure = false;
    process.env.SMTP_USER = "test@example.test";
    process.env.SMTP_PASS = "test-password";
    nodemailer.createTransport = (() =>
      ({
        sendMail: async () => {
          resetEmailCalls++;
          throw new Error("simulated SMTP outage");
        },
      }) as any) as typeof nodemailer.createTransport;
    const forgotEmailOutage = await requestPasswordResetAction("user@example.com");
    assert(forgotEmailOutage.success && messageOf(forgotEmailOutage) === genericMessage, "email provider failures preserve generic response");
    assert(resetEmailCalls === 1, "password-reset email failure is simulated without contacting SMTP");
    assert(!("resetUrl" in forgotEmailOutage) && !("token" in forgotEmailOutage), "reset response never exposes a token or URL");
  } finally {
    (db as any).user = originalUser;
    (db as any).auditLog = originalAuditLog;
    (db as any).$transaction = originalTransaction;
    (upstashLoginLimiter as any).check = originalLoginCheck;
    (upstashLoginLimiter as any).reset = originalLoginReset;
    (rateLimiter as any).check = originalRateCheck;
    globalThis.fetch = originalFetch;
    nodemailer.createTransport = originalCreateTransport;
    if (originalEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.nodeEnv;
    if (originalEnv.turnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalEnv.turnstileSecret;
    if (originalEnv.cloudflareSecret === undefined) delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    else process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalEnv.cloudflareSecret;
    if (originalEnv.enforceTurnstile === undefined) delete process.env.ENFORCE_TURNSTILE;
    else process.env.ENFORCE_TURNSTILE = originalEnv.enforceTurnstile;
    if (originalEnv.publicRequireTurnstile === undefined) delete process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE;
    else process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE = originalEnv.publicRequireTurnstile;
    if (originalEnv.publicTurnstileSiteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalEnv.publicTurnstileSiteKey;
    if (originalEnv.publicCloudflareSiteKey === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY = originalEnv.publicCloudflareSiteKey;
    if (originalEnv.smtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = originalEnv.smtpUser;
    if (originalEnv.smtpPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = originalEnv.smtpPass;
    if (originalEnv.resendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalEnv.resendApiKey;
  }

  console.log(`Auth action resilience tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((error) => {
  console.error("Auth action resilience tests failed:", error);
  process.exit(1);
});
