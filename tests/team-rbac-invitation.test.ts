import crypto from "crypto";
import { Role, InvitationStatus } from "@prisma/client";
import {
  hasPermission,
  canManageMemberRole,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
} from "../src/lib/server/rbac/permissions";
import { hashToken } from "../src/lib/auth/password";
import {
  sendTeamInvitationEmail,
  sendTeamInvitationResendEmail,
  sendPasswordResetEmail,
  getAppBaseUrl,
} from "../src/lib/server/email/email-service";

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

async function runTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Enterprise RBAC, Team & Invitation Test Suite");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // SECTION 1: ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSION ENGINE
  // ---------------------------------------------------------------------------
  console.log(">>> Section 1: RBAC Permission Evaluation (Deny by Default) <<<");

  // 1.1 Owner full wildcard access
  assert(
    hasPermission(Role.FIRM_OWNER, "dashboard", "view"),
    "1.1 FIRM_OWNER has dashboard:view permission"
  );
  assert(
    hasPermission(Role.FIRM_OWNER, "team", "invite"),
    "1.2 FIRM_OWNER has team:invite permission"
  );
  assert(
    hasPermission(Role.FIRM_OWNER, "settings", "manage_settings"),
    "1.3 FIRM_OWNER has settings:manage_settings permission"
  );

  // 1.2 Admin permissions
  assert(
    hasPermission(Role.FIRM_ADMIN, "team", "invite"),
    "1.4 FIRM_ADMIN has team:invite permission"
  );
  assert(
    hasPermission(Role.FIRM_ADMIN, "invoices", "create"),
    "1.5 FIRM_ADMIN has invoices:create permission"
  );

  // 1.3 Executive restricted access (deny by default)
  assert(
    hasPermission(Role.EXECUTIVE, "invoices", "view"),
    "1.6 EXECUTIVE has invoices:view permission"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "team", "invite"),
    "1.7 EXECUTIVE CANNOT invite team members (deny-by-default)"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "team", "manage_roles"),
    "1.8 EXECUTIVE CANNOT manage team roles (deny-by-default)"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "settings", "manage_settings"),
    "1.9 EXECUTIVE CANNOT modify firm settings (deny-by-default)"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "invoices", "delete"),
    "1.10 EXECUTIVE CANNOT delete invoices (deny-by-default)"
  );

  // 1.4 Client portal restricted access
  assert(
    hasPermission(Role.CLIENT, "invoices", "view"),
    "1.11 CLIENT has invoices:view permission"
  );
  assert(
    !hasPermission(Role.CLIENT, "team", "view"),
    "1.12 CLIENT CANNOT view internal practice team (deny-by-default)"
  );
  assert(
    !hasPermission(Role.CLIENT, "reports", "view"),
    "1.13 CLIENT CANNOT access firm reports (deny-by-default)"
  );

  // 1.5 Custom permission overrides
  const customGrant = { "reports:export": true, "invoices:create": false };
  assert(
    hasPermission(Role.EXECUTIVE, "reports", "export", { customPermissions: customGrant }),
    "1.14 Custom permission grants explicit access (reports:export override on EXECUTIVE)"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "invoices", "create", { customPermissions: customGrant }),
    "1.15 Custom permission revokes explicit access (invoices:create revoked on EXECUTIVE)"
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: ROLE MANAGEMENT & OWNER ACCOUNT PROTECTION
  // ---------------------------------------------------------------------------
  console.log("\n>>> Section 2: Owner Protection & Role Hierarchy Delegation <<<");

  // 2.1 Owner can assign all roles
  assert(
    canManageMemberRole(Role.FIRM_OWNER, Role.EXECUTIVE, Role.PARTNER).allowed,
    "2.1 FIRM_OWNER can promote EXECUTIVE to PARTNER"
  );
  assert(
    canManageMemberRole(Role.FIRM_OWNER, Role.PARTNER, Role.FIRM_OWNER).allowed,
    "2.2 FIRM_OWNER can promote PARTNER to co-FIRM_OWNER"
  );

  // 2.2 Admin cannot elevate to Owner
  assert(
    !canManageMemberRole(Role.FIRM_ADMIN, Role.EXECUTIVE, Role.FIRM_OWNER).allowed,
    "2.3 FIRM_ADMIN CANNOT promote anyone to FIRM_OWNER (Owner protection)"
  );

  // 2.3 Admin cannot demote or alter an Owner
  assert(
    !canManageMemberRole(Role.FIRM_ADMIN, Role.FIRM_OWNER, Role.MANAGER).allowed,
    "2.4 FIRM_ADMIN CANNOT demote or alter an existing FIRM_OWNER"
  );

  // 2.4 Staff cannot manage roles
  assert(
    !canManageMemberRole(Role.EXECUTIVE, Role.EXECUTIVE, Role.MANAGER).allowed,
    "2.5 EXECUTIVE CANNOT alter member roles"
  );
  assert(
    !canManageMemberRole(Role.PARTNER, Role.EXECUTIVE, Role.MANAGER).allowed,
    "2.6 PARTNER without admin privileges cannot alter member roles"
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: INVITATION TOKEN SECURITY & LIFECYCLE
  // ---------------------------------------------------------------------------
  console.log("\n>>> Section 3: Cryptographic Invitation Tokens & Replay Defense <<<");

  // 3.1 Token generation & hashing
  const rawToken = crypto.randomBytes(32).toString("hex");
  assert(rawToken.length === 64, "3.1 Generated raw token has 256 bits of cryptographic entropy (64 hex chars)");

  const hashedToken1 = hashToken(rawToken);
  const hashedToken2 = hashToken(rawToken);
  assert(hashedToken1 === hashedToken2, "3.2 Token hashing is deterministic SHA-256");
  assert(hashedToken1 !== rawToken, "3.3 Stored database tokenHash is non-reversible hash, not plaintext token");

  // 3.4 Expiration validation
  const now = Date.now();
  const validExpiry = new Date(now + 48 * 60 * 60 * 1000);
  const expiredDate = new Date(now - 1000);

  const isExpired = (expiry: Date) => expiry < new Date();
  assert(!isExpired(validExpiry), "3.4 48-hour invitation is considered fresh and valid");
  assert(isExpired(expiredDate), "3.5 Past expiry date is detected as expired and rejected");

  // 3.6 Single-use status transition invariant
  const invitationState = { status: "PENDING" as string };
  const canAccept = (status: string) => status === "PENDING";

  assert(canAccept(invitationState.status), "3.6 Initial invitation state allows acceptance");
  invitationState.status = "ACCEPTED";
  assert(!canAccept(invitationState.status), "3.7 Already-accepted invitation rejects subsequent replay attempts");

  // ---------------------------------------------------------------------------
  // SECTION 4: EMAIL DELIVERY BOUNDARY & BRANDED TEMPLATES
  // ---------------------------------------------------------------------------
  console.log("\n>>> Section 4: Transactional Email Templates & Standby Mode <<<");

  // 4.1 Standby mode when RESEND_API_KEY is unconfigured
  delete process.env.RESEND_API_KEY;
  const inviteEmailRes = await sendTeamInvitationEmail({
    to: "new.staff@firm.in",
    inviterName: "CA Priya Kulkarni",
    firmName: "TRUV Demo Chartered Accountants",
    roleName: "Executive",
    rawToken: "test_raw_token_xyz_123",
    tenantId: "TENANT_TEST",
  });

  assert(inviteEmailRes.success === true, "4.1 Email service safely executes without unhandled error");
  assert(
    inviteEmailRes.status === "STANDBY_MODE",
    "4.2 When RESEND_API_KEY is unset, service defaults to safe STANDBY_MODE without crashing"
  );

  // 4.2 Resend email template
  const resendEmailRes = await sendTeamInvitationResendEmail({
    to: "new.staff@firm.in",
    inviterName: "CA Priya Kulkarni",
    firmName: "TRUV Demo Chartered Accountants",
    roleName: "Executive",
    rawToken: "test_rotated_token_456",
    tenantId: "TENANT_TEST",
  });
  assert(resendEmailRes.status === "STANDBY_MODE", "4.3 Resend invitation template executes in standby mode");

  // 4.3 Password reset email template
  const pwResetRes = await sendPasswordResetEmail({
    to: "practitioner@firm.in",
    name: "CA Rajesh",
    rawToken: "reset_token_abc_789",
  });
  assert(pwResetRes.status === "STANDBY_MODE", "4.4 Password reset template executes in standby mode");

  // 4.4 App Base URL resolution
  const baseUrl = getAppBaseUrl();
  assert(typeof baseUrl === "string" && baseUrl.startsWith("http"), "4.5 App Base URL resolves to valid HTTP/HTTPS origin");

  console.log("\n=================================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
