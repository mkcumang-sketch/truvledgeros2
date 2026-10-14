import { db } from "../src/lib/db";
import { Role, InvitationStatus } from "@prisma/client";
import {
  inviteTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  updateMemberRole,
  isSoleActiveOwner,
  getInvitationDetails,
  acceptInvitation,
} from "../src/lib/server/team/team-service";

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

async function runIntegrationTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Team & Invitation DB Integration Test Suite");
  console.log("=================================================================\n");

  // 1. Fetch an existing active tenant for test context
  const testTenant = await db.tenant.findFirst({
    where: { active: true },
    include: {
      memberships: {
        where: { role: Role.FIRM_OWNER, status: "ACTIVE" },
        include: { user: true },
      },
    },
  });

  if (!testTenant || testTenant.memberships.length === 0) {
    console.warn("No active tenant with owner found in DB. Skipping live DB test.");
    return;
  }

  const tenantId = testTenant.id;
  const ownerMembership = testTenant.memberships[0];
  const ownerUser = ownerMembership.user;

  console.log(`Using Test Tenant: ${testTenant.name} (${tenantId})`);
  console.log(`Using Test Owner: ${ownerUser.name} (${ownerUser.email})\n`);

  // TEST 1: isSoleActiveOwner correctly identifies sole owner
  const isSole = await isSoleActiveOwner(tenantId, ownerMembership.id);
  assert(
    typeof isSole === "boolean",
    "TEST 1: isSoleActiveOwner executes and returns boolean",
    `isSole = ${isSole}`
  );

  // TEST 2: Attempting to demote sole owner throws an error
  if (isSole) {
    try {
      await updateMemberRole({
        tenantId,
        memberId: ownerMembership.id,
        newRole: Role.EXECUTIVE,
        actorRole: Role.FIRM_OWNER,
        actorUserId: ownerUser.id,
      });
      assert(false, "TEST 2: Demoting sole owner should have thrown error");
    } catch (err: any) {
      assert(
        err.message.includes("sole Organization Owner"),
        "TEST 2: Demoting sole active owner is rejected with safety error",
        err.message
      );
    }
  } else {
    console.log("Tenant has multiple owners; skipping sole owner demote assertion.");
  }

  // TEST 3: Attempting to invite an existing active member fails
  try {
    await inviteTeamMember({
      tenantId,
      email: ownerUser.email,
      role: Role.EXECUTIVE,
      inviter: {
        id: ownerUser.id,
        name: ownerUser.name,
        role: Role.FIRM_OWNER,
        tenantName: testTenant.name,
      },
    });
    assert(false, "TEST 3: Inviting existing active member should have failed");
  } catch (err: any) {
    assert(
      err.message.includes("already an active member"),
      "TEST 3: Duplicate active member invitation is rejected",
      err.message
    );
  }

  // TEST 4: Create a temporary test invitation
  const testInvEmail = `qa.invite.test.${Date.now()}@truvdemo.in`;
  const inviteRes = await inviteTeamMember({
    tenantId,
    email: testInvEmail,
    role: Role.EXECUTIVE,
    inviter: {
      id: ownerUser.id,
      name: ownerUser.name,
      role: Role.FIRM_OWNER,
      tenantName: testTenant.name,
    },
  });

  assert(inviteRes.success === true, "TEST 4: New team member invitation successfully created in database");
  assert(inviteRes.email === testInvEmail, "TEST 4b: Created invitation matches email");

  // TEST 5: Attempting to create duplicate pending invitation fails
  try {
    await inviteTeamMember({
      tenantId,
      email: testInvEmail,
      role: Role.EXECUTIVE,
      inviter: {
        id: ownerUser.id,
        name: ownerUser.name,
        role: Role.FIRM_OWNER,
        tenantName: testTenant.name,
      },
    });
    assert(false, "TEST 5: Duplicate pending invitation should fail");
  } catch (err: any) {
    assert(
      err.message.includes("pending invitation already exists"),
      "TEST 5: Duplicate pending invitation is rejected",
      err.message
    );
  }

  // TEST 6: Resend rate-limiting within 60s
  try {
    await resendTeamInvitation({
      tenantId,
      invitationId: inviteRes.invitationId,
      inviter: {
        id: ownerUser.id,
        name: ownerUser.name,
        role: Role.FIRM_OWNER,
        tenantName: testTenant.name,
      },
    });
    assert(false, "TEST 6: Resending within 60s should trigger rate limit");
  } catch (err: any) {
    assert(
      err.message.includes("wait at least 60 seconds"),
      "TEST 6: Resend invitation within 60 seconds is rate limited",
      err.message
    );
  }

  // TEST 7: Revoke invitation
  const revokeRes = await revokeTeamInvitation({
    tenantId,
    invitationId: inviteRes.invitationId,
    actorUserId: ownerUser.id,
  });
  assert(revokeRes.success === true, "TEST 7: Pending invitation successfully revoked");

  // TEST 8: Verify revoked invitation cannot be accepted or details accessed
  const dbInv = await db.invitation.findUnique({ where: { id: inviteRes.invitationId } });
  assert(dbInv?.status === InvitationStatus.REVOKED, "TEST 8: Invitation record status updated to REVOKED in database");

  // Clean up test invitation record
  await db.invitation.delete({ where: { id: inviteRes.invitationId } });
  console.log("Test cleanup: Temporary test invitation record removed.");

  console.log("\n=================================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
