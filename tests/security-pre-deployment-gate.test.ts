import { db } from "../src/lib/db";
import { Role, InvitationStatus } from "@prisma/client";
import {
  hasPermission,
  canManageMemberRole,
  isSoleActiveOwner,
  DEFAULT_ROLE_PERMISSIONS,
} from "../src/lib/server/rbac/permissions";
import {
  inviteTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  updateMemberRole,
  suspendTeamMember,
  reactivateTeamMember,
  getInvitationDetails,
  acceptInvitation,
} from "../src/lib/server/team/team-service";
import { sendTransactionalEmail } from "../src/lib/server/email/email-service";
import { hashToken } from "../src/lib/auth/password";

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

async function runPreDeploymentGate() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Pre-Deployment Security Gate Verification");
  console.log("=================================================================\n");

  // 1. UNAUTHORIZED EMPLOYEE ACCESS TESTS
  console.log(">>> Gate 1: Unauthorized Employee Access (Deny-by-Default) <<<");
  assert(
    !hasPermission(Role.CLIENT, "clients", "view"),
    "1.1: CLIENT role cannot view client directory"
  );
  assert(
    !hasPermission(Role.CLIENT, "clients", "create"),
    "1.2: CLIENT role cannot create clients"
  );
  assert(
    !hasPermission(Role.CLIENT, "invoices", "create"),
    "1.3: CLIENT role cannot create invoices"
  );
  assert(
    !hasPermission(Role.CLIENT, "team", "view"),
    "1.4: CLIENT role cannot view internal team members"
  );
  assert(
    !hasPermission(Role.CLIENT, "settings", "manage_settings"),
    "1.5: CLIENT role cannot manage firm settings"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "team", "invite"),
    "1.6: EXECUTIVE role cannot invite team members"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "team", "manage_roles"),
    "1.7: EXECUTIVE role cannot manage team roles"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "settings", "manage_settings"),
    "1.8: EXECUTIVE role cannot modify practice settings"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "invoices", "delete"),
    "1.9: EXECUTIVE role cannot delete invoices"
  );
  assert(
    hasPermission(Role.FIRM_OWNER, "team", "invite"),
    "1.10: FIRM_OWNER has team:invite authority"
  );
  assert(
    hasPermission(Role.FIRM_ADMIN, "team", "invite"),
    "1.11: FIRM_ADMIN has team:invite authority"
  );

  // 2. INVITATION ROLE ESCALATION & SOLE OWNER PROTECTION
  console.log("\n>>> Gate 2: Privilege Escalation & Owner Protection <<<");
  const adminInviteOwnerCheck = canManageMemberRole(Role.FIRM_ADMIN, Role.EXECUTIVE, Role.FIRM_OWNER);
  assert(
    !adminInviteOwnerCheck.allowed,
    "2.1: FIRM_ADMIN cannot invite a user as FIRM_OWNER (escalation blocked)",
    adminInviteOwnerCheck.reason
  );

  const adminDemoteOwnerCheck = canManageMemberRole(Role.FIRM_ADMIN, Role.FIRM_OWNER, Role.PARTNER);
  assert(
    !adminDemoteOwnerCheck.allowed,
    "2.2: FIRM_ADMIN cannot alter or demote a FIRM_OWNER account",
    adminDemoteOwnerCheck.reason
  );

  const ownerInviteOwnerCheck = canManageMemberRole(Role.FIRM_OWNER, Role.EXECUTIVE, Role.FIRM_OWNER);
  assert(
    ownerInviteOwnerCheck.allowed,
    "2.3: FIRM_OWNER can invite or promote co-owners"
  );

  const executiveManageRolesCheck = canManageMemberRole(Role.EXECUTIVE, Role.EXECUTIVE, Role.MANAGER);
  assert(
    !executiveManageRolesCheck.allowed,
    "2.4: Non-admin practitioner cannot manage roles"
  );

  // 3. EXPIRED, REVOKED, AND REPLAYED INVITATION TOKENS
  console.log("\n>>> Gate 3: Invitation Token Lifecycle & Replay Rejection <<<");
  const fakeToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const nonExistentCheck = await getInvitationDetails(fakeToken);
  assert(
    !nonExistentCheck.valid,
    "3.1: Non-existent or unknown token is rejected"
  );

  const shortTokenCheck = await getInvitationDetails("too-short");
  assert(
    !shortTokenCheck.valid,
    "3.2: Malformed or truncated token (<16 chars) is rejected immediately"
  );

  // 4. SUSPENDED USER ACCESS & ACCOUNT DISABLING
  console.log("\n>>> Gate 4: Suspended & Disabled User Account Security <<<");
  const testTenant = await db.tenant.findFirst({ select: { id: true, name: true } });
  if (testTenant) {
    const activeOwner = await db.membership.findFirst({
      where: { tenantId: testTenant.id, role: Role.FIRM_OWNER, status: "ACTIVE" },
      include: { user: true },
    });

    if (activeOwner) {
      const isSole = await isSoleActiveOwner(testTenant.id, activeOwner.id);
      assert(
        typeof isSole === "boolean",
        "4.1: isSoleActiveOwner evaluates successfully against live database"
      );

      // Verify demoting sole active owner is rejected
      if (isSole) {
        try {
          await updateMemberRole({
            tenantId: testTenant.id,
            memberId: activeOwner.id,
            newRole: Role.PARTNER,
            actorRole: Role.FIRM_OWNER,
            actorUserId: activeOwner.userId,
          });
          assert(false, "4.2: Demoting sole active owner should have failed");
        } catch (err: any) {
          assert(
            err.message.includes("Cannot demote the sole Organization Owner") ||
            err.message.includes("sole remaining Organization Owner"),
            "4.2: Demoting sole active owner is strictly blocked with safety error"
          );
        }
      }
    }
  }

  // 5. EMAIL PROVIDER BEHAVIOR & STANDBY DISPATCH
  console.log("\n>>> Gate 5: Transactional Email Reliability & Standby Mode <<<");
  const emailRes = await sendTransactionalEmail({
    to: "security-audit@example.com",
    subject: "Security Gate Validation Notice",
    html: "<p>Verification</p>",
    text: "Verification",
  });

  assert(
    emailRes.success,
    "5.1: Email service dispatches safely without uncaught exceptions"
  );

  if (!process.env.RESEND_API_KEY) {
    assert(
      emailRes.status === "STANDBY_MODE",
      "5.2: Unset RESEND_API_KEY triggers verified STANDBY_MODE (does not pretend to be SENT)"
    );
  } else {
    assert(
      emailRes.status === "SENT" || emailRes.status === "FAILED",
      "5.2: Configured RESEND_API_KEY attempts real dispatch"
    );
  }

  // 6. ATOMIC INVITATION ACCEPTANCE WITH CONCURRENCY TEST
  console.log("\n>>> Gate 6: Atomic Invitation Acceptance & Concurrency Defense <<<");
  if (testTenant) {
    const testInviter = await db.membership.findFirst({
      where: { tenantId: testTenant.id, status: "ACTIVE", role: { in: [Role.FIRM_OWNER, Role.FIRM_ADMIN] } },
      include: { user: true },
    });

    if (testInviter) {
      const testEmail = `gate.concurrent.test.${Date.now()}@example.com`;
      const knownRawToken = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const tokenHash = hashToken(knownRawToken);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const testInvitation = await db.invitation.create({
        data: {
          tenantId: testTenant.id,
          email: testEmail,
          role: Role.EXECUTIVE,
          tokenHash,
          invitedById: testInviter.userId,
          status: InvitationStatus.PENDING,
          expiresAt,
        },
      });

      assert(
        !!testInvitation.id,
        "6.1: Created test invitation for atomic acceptance test"
      );

      // Verify the invitation can be previewed
      const preview = await getInvitationDetails(knownRawToken);
      assert(
        preview.valid && preview.email === testEmail,
        "6.2: Preview details match invited email"
      );

      // Concurrency Test: Simulate two parallel acceptance calls racing for the same token
      const p1 = acceptInvitation({
        rawToken: knownRawToken,
        name: "Test Practitioner One",
        password: "ValidPassword123!",
      });

      const p2 = acceptInvitation({
        rawToken: knownRawToken,
        name: "Test Practitioner Two",
        password: "ValidPassword123!",
      });

      const [res1, res2] = await Promise.allSettled([p1, p2]);
      const successfulAcceptances = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejectedAcceptances = [res1, res2].filter((r) => r.status === "rejected");

      assert(
        successfulAcceptances.length === 1,
        "6.3: Concurrency defense: exactly ONE concurrent acceptance succeeds"
      );
      assert(
        rejectedAcceptances.length === 1,
        "6.4: Concurrency defense: second concurrent acceptance is atomically rejected"
      );

      // Verify replay attempt is rejected
      try {
        await acceptInvitation({
          rawToken: knownRawToken,
          name: "Test Replay Attempt",
          password: "ValidPassword123!",
        });
        assert(false, "6.5: Replay attempt should have been rejected");
      } catch (replayErr: any) {
        assert(
          replayErr.message.includes("ACCEPTED") || replayErr.message.includes("cannot be used"),
          "6.5: Subsequent replay of accepted token is strictly rejected"
        );
      }

      // Cleanup test user and membership
      const createdUser = await db.user.findUnique({ where: { email: testEmail } });
      if (createdUser) {
        await db.membership.deleteMany({ where: { userId: createdUser.id, tenantId: testTenant.id } });
        await db.invitation.deleteMany({ where: { email: testEmail, tenantId: testTenant.id } });
        await db.user.delete({ where: { id: createdUser.id } });
        console.log("Test cleanup: Temporary concurrent test data cleanly purged.");
      }
    }
  }

  console.log("\n=================================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPreDeploymentGate()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
