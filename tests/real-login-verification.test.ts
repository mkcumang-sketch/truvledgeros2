import { PrismaClient, Role } from "@prisma/client";
import { verifyPassword, hashPassword } from "../src/lib/auth/password";
import { createSession, getSessionContext, deleteSession } from "../src/lib/auth/session";
import { POST as loginRoutePost } from "../src/app/api/auth/login/route";
import { loginAction } from "../src/lib/auth/actions";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";
import { upstashLoginLimiter } from "../src/lib/server/security/upstash-rate-limiter";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✘ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

async function runRealLoginVerification() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Real Login, Session Persistence & Security Audit");
  console.log("==================================================================\n");

  const prisma = new PrismaClient();
  const testAdminEmail = "us7081569@gmail.com";
  const knownTestPass = "SuperSecureAuditPass2026!#Verified";

  try {
    // -------------------------------------------------------------------------
    // Set a known test password hash for this automated test cycle
    // -------------------------------------------------------------------------
    const testHash = await hashPassword(knownTestPass);
    await prisma.user.update({
      where: { email: testAdminEmail },
      data: { passwordHash: testHash, active: true },
    });

    const user = await prisma.user.findUnique({
      where: { email: testAdminEmail },
      include: { memberships: { include: { tenant: true } } },
    });
    const tenantId = user!.memberships[0]?.tenantId;

    // -------------------------------------------------------------------------
    // TEST 1: Server Action loginAction with Valid Credentials
    // -------------------------------------------------------------------------
    console.log(">>> [Test 1] Server Action (loginAction) with Valid Credentials <<<");
    const validForm = new FormData();
    validForm.set("email", testAdminEmail);
    validForm.set("password", knownTestPass);
    validForm.set("turnstileToken", "XXXX.DUMMY.TOKEN.VALID");

    const actionRes = await loginAction(validForm);
    assert(actionRes.success === true, "1.1 loginAction returns success: true");
    assert(typeof actionRes.redirectUrl === "string", `1.2 loginAction returns structured redirectUrl (${actionRes.redirectUrl})`);
    assert(actionRes.redirectUrl === "/dashboard", "1.3 Member with active firm tenant redirects to /dashboard");
    assert(!actionRes.error, "1.4 No error property present on successful login");

    // -------------------------------------------------------------------------
    // TEST 2: Session Persistence Across Simulated Page Refreshes
    // -------------------------------------------------------------------------
    console.log("\n>>> [Test 2] Session Persistence & Context Reconstitution <<<");
    const sessionToken = await createSession(user!.id, tenantId!, {
      userAgent: "Headless-Chrome-Audit/120.0",
      ipAddress: "127.0.0.1",
    });
    assert(Boolean(sessionToken), "2.1 createSession generates valid cryptographic session token");

    // First request context
    const initialContext = await getSessionContext(sessionToken);
    assert(Boolean(initialContext?.user), "2.2 Initial request reconstructs authenticated session");
    assert(initialContext?.user.email === testAdminEmail, "2.3 Reconstructed user matches Super Admin email");

    // Simulated page refresh (second lookup using same session token)
    const refreshContext = await getSessionContext(sessionToken);
    assert(Boolean(refreshContext?.user), "2.4 Page refresh lookup successfully preserves session context");
    assert(refreshContext?.user.id === user!.id, "2.5 Preserved user ID matches database entity");
    assert(refreshContext?.user.isSuperAdmin === true, "2.6 Super Admin platform sovereignty preserved across requests");

    // -------------------------------------------------------------------------
    // TEST 3: Invalid Credentials Defense
    // -------------------------------------------------------------------------
    console.log("\n>>> [Test 3] Invalid Credentials Defense <<<");
    const invalidForm = new FormData();
    invalidForm.set("email", testAdminEmail);
    invalidForm.set("password", "CompletelyWrongPassword999!");
    invalidForm.set("turnstileToken", "XXXX.DUMMY.TOKEN.VALID");

    const invalidActionRes = await loginAction(invalidForm);
    assert(!invalidActionRes.success, "3.1 loginAction rejects invalid credentials");
    assert(invalidActionRes.error === "Invalid credentials", `3.2 Generic failure message returned: '${invalidActionRes.error}'`);
    assert(!invalidActionRes.redirectUrl, "3.3 No redirectUrl issued for invalid credentials");

    // -------------------------------------------------------------------------
    // TEST 4: Session Revocation & Expired Session Defense
    // -------------------------------------------------------------------------
    console.log("\n>>> [Test 4] Session Revocation Defense <<<");
    await prisma.session.deleteMany({ where: { sessionToken } });

    const revokedContext = await getSessionContext(sessionToken);
    assert(revokedContext === null, "4.1 getSessionContext returns null for revoked session");

    const revokedGodmode = verifyGodmodeAuthorization(revokedContext);
    assert(revokedGodmode.authorized === false, "4.2 Revoked session is denied Godmode access");
    assert(revokedGodmode.status === "UNAUTHENTICATED", "4.3 Revoked session status is UNAUTHENTICATED");

    // -------------------------------------------------------------------------
    // TEST 5: Login API Route POST Verification
    // -------------------------------------------------------------------------
    console.log("\n>>> [Test 5] Login API Route (POST /api/auth/login) <<<");
    const apiValidReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify({
        email: testAdminEmail,
        password: knownTestPass,
        turnstileToken: "XXXX.DUMMY.TOKEN.VALID",
      }),
    });

    const apiRes = await loginRoutePost(apiValidReq);
    const apiData = await apiRes.json();
    assert(apiRes.status === 200, "5.1 API route returns HTTP 200 for valid credentials");
    assert(apiData.success === true, "5.2 API response contains success: true");
    assert(apiData.redirectUrl === "/dashboard", "5.3 API response contains expected redirectUrl");
    assert(apiData.user?.email === testAdminEmail, "5.4 API response contains sanitized user data");
    assert(!apiData.user?.passwordHash, "5.5 Password hash is never leaked in API response");

    // API Route with wrong password
    const apiInvalidReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify({
        email: testAdminEmail,
        password: "WrongPassword999!",
        turnstileToken: "XXXX.DUMMY.TOKEN.VALID",
      }),
    });
    const apiInvalidRes = await loginRoutePost(apiInvalidReq);
    const apiInvalidData = await apiInvalidRes.json();
    assert(apiInvalidRes.status === 401, "5.6 API route returns HTTP 401 for invalid credentials");
    assert(apiInvalidData.error === "Invalid credentials", "5.7 API route returns 'Invalid credentials'");

    console.log("\n==================================================================");
    console.log(`Real Login Verification Results: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runRealLoginVerification().catch((err) => {
  console.error("Real login verification failed:", err);
  process.exit(1);
});
