import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { verifyPassword } from "../src/lib/auth/password";
import { createSession, getSessionContext } from "../src/lib/auth/session";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";

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

async function runRotationVerification() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Super Admin Credential Rotation & Revocation Suite");
  console.log("==================================================================\n");

  const prisma = new PrismaClient();
  const superAdminEmail = "audit-fixture-rotation@truvledgeros.test";
  const oldExposedPassword = "Truv-OldTestPass-2026-D4xYFspK0j2b!";

  try {
    // Ensure isolated test fixture exists
    let fixtureTenant = await prisma.tenant.findFirst({ where: { slug: "audit-test-tenant" } });
    if (!fixtureTenant) {
      fixtureTenant = await prisma.tenant.create({
        data: { name: "Audit Test Firm", slug: "audit-test-tenant", active: true },
      });
    }

    let initialUser = await prisma.user.findUnique({
      where: { email: superAdminEmail },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!initialUser) {
      const oldHash = await bcrypt.hash(oldExposedPassword, 12);
      initialUser = await prisma.user.create({
        data: {
          email: superAdminEmail,
          name: "Audit Test Super Admin",
          passwordHash: oldHash,
          active: true,
          isSuperAdmin: true,
          memberships: {
            create: {
              tenantId: fixtureTenant.id,
              role: Role.FIRM_OWNER,
              status: "ACTIVE",
            },
          },
        },
        include: { memberships: { include: { tenant: true } } },
      });
    }

    assert(Boolean(initialUser), "1.1 Super Admin account exists in database");
    assert(initialUser?.isSuperAdmin === true, "1.2 Platform isSuperAdmin flag is true");
    assert(initialUser?.active === true, "1.3 Account status is active");

    // Create an active session to test session revocation during rotation
    const tenantId = initialUser!.memberships[0]?.tenantId;
    const preRotationSessionToken = await createSession(initialUser!.id, tenantId!);
    assert(Boolean(preRotationSessionToken), "1.4 Pre-rotation session successfully created");

    const preSessionContext = await getSessionContext(preRotationSessionToken);
    assert(Boolean(preSessionContext?.user), "1.5 Pre-rotation session context is valid and active");

    // -------------------------------------------------------------------------
    // STEP 2: Generate High-Entropy Replacement Password In Memory (Never Printed)
    // -------------------------------------------------------------------------
    console.log("\n>>> [Step 2] In-Memory High-Entropy Password Generation & Rotation <<<");
    const secretEntropy = crypto.randomBytes(18).toString("base64url");
    const newSecurePassword = `Truv-Root!${secretEntropy}#2026`;
    assert(newSecurePassword.length >= 24, "2.1 Generated password exceeds minimum 12-character security policy");
    assert(newSecurePassword !== oldExposedPassword, "2.2 New password is distinct from previously exposed credential");

    // Hash securely with bcrypt 12 rounds
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newSecurePassword, saltRounds);
    assert(newPasswordHash.startsWith("$2"), "2.3 Bcrypt 12-round hash generated successfully");

    // -------------------------------------------------------------------------
    // STEP 3: Atomic Database Rotation, Session Revocation & Audit Logging
    // -------------------------------------------------------------------------
    console.log("\n>>> [Step 3] Atomic Credential Update & Session Revocation <<<");
    let revokedSessionCount = 0;
    await prisma.$transaction(async (tx) => {
      // 3.1 Update password hash and clear any reset tokens
      await tx.user.update({
        where: { id: initialUser!.id },
        data: {
          passwordHash: newPasswordHash,
          active: true,
          resetToken: null,
          resetTokenExpires: null,
        },
      });

      // 3.2 Invalidate all outstanding sessions across all devices
      const delSessions = await tx.session.deleteMany({
        where: { userId: initialUser!.id },
      });
      revokedSessionCount = delSessions.count;

      // 3.3 Clear password reset tokens
      await tx.passwordResetToken.deleteMany({
        where: { userId: initialUser!.id },
      });

      // 3.4 Record audit log event
      await tx.auditLog.create({
        data: {
          userId: initialUser!.id,
          action: "SUPERADMIN_PASSWORD_ROTATED_SECURE",
          entityType: "USER",
          entityId: initialUser!.id,
        },
      });
    });

    assert(revokedSessionCount > 0, `3.1 Successfully revoked existing sessions (${revokedSessionCount} sessions terminated)`);

    // -------------------------------------------------------------------------
    // STEP 4: Verify Old Password Rejection & New Password Validation
    // -------------------------------------------------------------------------
    console.log("\n>>> [Step 4] Password Verification & Invalidation Proof <<<");
    const updatedUser = await prisma.user.findUnique({
      where: { email: superAdminEmail },
    });

    // 4.1 Confirm the old exposed password NO LONGER authenticates
    const oldPasswordMatches = await verifyPassword(oldExposedPassword, updatedUser?.passwordHash || "");
    assert(oldPasswordMatches === false, "4.1 Old exposed password is confirmed REJECTED (no longer authenticates)");

    // 4.2 Confirm the new rotated password authenticates successfully
    const newPasswordMatches = await verifyPassword(newSecurePassword, updatedUser?.passwordHash || "");
    assert(newPasswordMatches === true, "4.2 Rotated high-entropy password is confirmed ACCEPTED");

    // 4.3 Confirm previous active session is completely dead
    const postSessionContext = await getSessionContext(preRotationSessionToken);
    assert(postSessionContext === null, "4.3 Pre-rotation session is completely revoked and rejected by session guard");

    // -------------------------------------------------------------------------
    // STEP 5: Verify Fresh Session Creation & Godmode Access
    // -------------------------------------------------------------------------
    console.log("\n>>> [Step 5] Fresh Post-Rotation Session & Godmode Access <<<");
    const freshSessionToken = await createSession(updatedUser!.id, tenantId!);
    assert(Boolean(freshSessionToken), "5.1 Fresh post-rotation session created successfully");

    const freshContext = await getSessionContext(freshSessionToken);
    assert(freshContext?.user?.isSuperAdmin === true, "5.2 Fresh session retains Super Admin sovereignty");
    assert(freshContext?.membership?.role === Role.FIRM_OWNER, "5.3 Fresh session retains FIRM_OWNER role");

    const godmodeCheck = verifyGodmodeAuthorization(freshContext);
    assert(godmodeCheck.authorized === true, "5.4 Godmode authorization succeeds for rotated Super Admin");
    assert(godmodeCheck.status === "AUTHORIZED", "5.5 Godmode status is strictly 'AUTHORIZED'");

    // Cleanup the fresh verification session
    await prisma.session.deleteMany({ where: { sessionToken: freshSessionToken } });

    console.log("\n==================================================================");
    console.log(`Rotation Verification Suite: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runRotationVerification().catch((err) => {
  console.error("Rotation verification failed:", err);
  process.exit(1);
});
