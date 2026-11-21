import { PrismaClient, Role } from "@prisma/client";
import { verifyPassword, hashPassword } from "../src/lib/auth/password";
import { createSession, getSessionContext, deleteSession } from "../src/lib/auth/session";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";
import { verifyTurnstileToken } from "../src/lib/server/security/turnstile";

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

async function runSuperAdminVerification() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Super Admin Login, Godmode & Security Verification");
  console.log("==================================================================\n");

  const prisma = new PrismaClient();
  const testEmail = "us7081569@gmail.com";

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Database Account Verification
    // ---------------------------------------------------------------------------
    console.log(">>> [Test 1] Database Account & Sovereignty Status <<<");
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    assert(Boolean(user), "1.1 Super Admin account exists in database");
    assert(user?.active === true, "1.2 Account is active and not disabled/suspended");
    assert(user?.isSuperAdmin === true, "1.3 Platform isSuperAdmin sovereignty flag is true");
    assert(Boolean(user?.passwordHash), "1.4 Bcrypt password hash is populated");
    assert(user?.passwordHash?.startsWith("$2") === true, "1.5 Password hash format is standard bcrypt");
    assert(user?.memberships.length! > 0, "1.6 User is associated with at least one practice tenant");
    assert(
      user?.memberships.some((m) => m.role === Role.FIRM_OWNER) === true,
      "1.7 User holds FIRM_OWNER role in primary tenant"
    );

    // ---------------------------------------------------------------------------
    // TEST 2: Password Verification Logic
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 2] Password Verification Logic <<<");
    const dummyKnownPass = "TemporaryVerificationCheck!2026#Secure";
    const dummyHash = await hashPassword(dummyKnownPass);

    const validPassCheck = await verifyPassword(dummyKnownPass, dummyHash);
    assert(validPassCheck === true, "2.1 verifyPassword accurately validates correct credentials");

    const invalidPassCheck = await verifyPassword("WrongPassword123!", dummyHash);
    assert(invalidPassCheck === false, "2.2 verifyPassword rejects invalid credentials");

    // ---------------------------------------------------------------------------
    // TEST 3: Turnstile Captcha Verification Behavior
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 3] Turnstile Captcha Behavior <<<");
    const emptyTokenRes = await verifyTurnstileToken("");
    assert(!emptyTokenRes.success, "3.1 Omitted Turnstile token is rejected");

    const dummyInvalidTokenRes = await verifyTurnstileToken("invalid_turnstile_response_token_123");
    assert(!dummyInvalidTokenRes.success, "3.2 Invalid token rejected without throwing");

    // ---------------------------------------------------------------------------
    // TEST 4: Session Lifecycle & Context Reconstruction
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 4] Session Creation, Verification & Context Lifecycle <<<");
    const tenantId = user?.memberships[0]?.tenantId || user?.memberships[0]?.tenant?.id;
    assert(Boolean(tenantId), "4.1 Valid tenant ID resolved for session creation");

    // Create session in database
    const sessionToken = await createSession(user!.id, tenantId!, {
      userAgent: "Automated-Security-Verification-Agent/1.0",
      ipAddress: "127.0.0.1",
    });

    assert(Boolean(sessionToken), "4.2 createSession creates session and issues token");

    // Reconstruct SessionContext
    const context = await getSessionContext(sessionToken);
    assert(Boolean(context?.user), "4.4 getSessionContext successfully retrieves authenticated user");
    assert(context?.user?.isSuperAdmin === true, "4.5 SessionContext preserves isSuperAdmin flag");
    assert(context?.user?.email === testEmail, "4.6 SessionContext email matches Super Admin");
    assert(Boolean(context?.membership), "4.7 SessionContext links tenant membership");
    assert(context?.membership?.role === Role.FIRM_OWNER, "4.8 SessionContext role matches FIRM_OWNER");

    // ---------------------------------------------------------------------------
    // TEST 5: Godmode Administrative Access Authorization
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 5] Godmode Administrative Authorization Guard <<<");
    const godmodeAuth = verifyGodmodeAuthorization(context);
    assert(godmodeAuth.authorized === true, "5.1 verifyGodmodeAuthorization authorizes Super Admin");
    assert(godmodeAuth.status === "AUTHORIZED", "5.2 Auth status is strictly 'AUTHORIZED'");

    // ---------------------------------------------------------------------------
    // TEST 6: Unauthorized Access Defense (Negative Testing)
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 6] Unauthorized Access Defense (Negative Tests) <<<");
    const unauthResult = verifyGodmodeAuthorization(null);
    assert(!unauthResult.authorized && unauthResult.status === "UNAUTHENTICATED", "6.1 Null session is UNAUTHENTICATED");

    const regularStaffContext = {
      ...context!,
      user: {
        ...context!.user,
        isSuperAdmin: false,
      },
      membership: {
        ...context!.membership!,
        role: Role.MANAGER,
      },
    };
    const staffAuth = verifyGodmodeAuthorization(regularStaffContext);
    assert(!staffAuth.authorized && staffAuth.status === "FORBIDDEN", "6.2 Standard practice staff denied Godmode with FORBIDDEN");

    const clientContext = {
      ...context!,
      user: {
        ...context!.user,
        isSuperAdmin: false,
      },
      membership: {
        ...context!.membership!,
        role: Role.CLIENT,
      },
    };
    const clientAuth = verifyGodmodeAuthorization(clientContext);
    assert(!clientAuth.authorized && clientAuth.status === "FORBIDDEN", "6.3 External client portal user denied Godmode with FORBIDDEN");

    // ---------------------------------------------------------------------------
    // TEST 7: Logout & Immediate Session Invalidation
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 7] Logout & Session Invalidation <<<");
    await prisma.session.deleteMany({ where: { sessionToken } });

    const revokedContext = await getSessionContext(sessionToken);
    assert(revokedContext === null, "7.1 getSessionContext returns null after session deletion");

    const revokedGodmode = verifyGodmodeAuthorization(revokedContext);
    assert(!revokedGodmode.authorized, "7.2 Revoked session immediately loses Godmode access");

    console.log("\n==================================================================");
    console.log(`Super Admin Verification Results: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runSuperAdminVerification().catch((err) => {
  console.error("Super Admin Verification Suite Error:", err);
  process.exit(1);
});
