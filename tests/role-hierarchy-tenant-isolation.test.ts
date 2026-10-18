import { Role, TaskStatus, TaskType } from "@prisma/client";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";
import {
  hasPermission,
  canManageMemberRole,
  DEFAULT_ROLE_PERMISSIONS,
} from "../src/lib/server/rbac/permissions";
import { SessionContext } from "../src/lib/auth/session";

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

function mockContext(overrides: {
  userId?: string;
  email?: string;
  role?: Role;
  isSuperAdmin?: boolean;
  tenantId?: string;
  tenantActive?: boolean;
  tenantSuspended?: boolean;
  membershipStatus?: "ACTIVE" | "SUSPENDED" | "INVITED" | "REVOKED";
}): SessionContext {
  const tenantId = overrides.tenantId || "tenant-alpha-001";
  return {
    user: {
      id: overrides.userId || "usr-test-001",
      email: overrides.email || "partner@alphaca.com",
      name: "Test User",
      isSuperAdmin: overrides.isSuperAdmin ?? false,
    },
    membership: overrides.role
      ? {
          id: "mem-test-001",
          tenantId,
          role: overrides.role,
          status: overrides.membershipStatus ?? "ACTIVE",
        }
      : undefined,
    tenant: overrides.role
      ? {
          id: tenantId,
          name: "Alpha Chartered Accountants",
          slug: "alpha-ca",
          active: overrides.tenantActive ?? true,
          isSuspended: overrides.tenantSuspended ?? false,
        }
      : undefined,
  };
}

async function runRoleHierarchyAndTenantIsolationTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Role Hierarchy & Tenant Isolation QA Test Suite");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // LEVEL 1: GOD MODE & SERVICE (TRUVTECH PLATFORM OWNER)
  // -------------------------------------------------------------
  console.log("--- PART 1: GOD MODE & SERVICE ACCESS CONTROL ---");

  // Test 1: Unauthenticated context fails closed
  const unauth = verifyGodmodeAuthorization(null);
  assert(
    !unauth.authorized && unauth.status === "UNAUTHENTICATED",
    "1.1 Unauthenticated request is strictly rejected with UNAUTHENTICATED"
  );

  // Test 2: Platform superadmin has godmode authorization
  const superAdminCtx = mockContext({ isSuperAdmin: true });
  const superAdminAuth = verifyGodmodeAuthorization(superAdminCtx);
  assert(
    superAdminAuth.authorized && superAdminAuth.status === "AUTHORIZED",
    "1.2 Platform SuperAdmin is granted authorized access to God Mode"
  );

  // Test 3: GODMODE_ADMIN role is authorized when tenant is active
  const godmodeRoleCtx = mockContext({ role: Role.GODMODE_ADMIN });
  const godmodeAuth = verifyGodmodeAuthorization(godmodeRoleCtx);
  assert(
    godmodeAuth.authorized && godmodeAuth.status === "AUTHORIZED",
    "1.3 Active GODMODE_ADMIN role is authorized"
  );

  // Test 4: Suspended tenant GODMODE_ADMIN is denied
  const suspendedGodmodeCtx = mockContext({
    role: Role.GODMODE_ADMIN,
    tenantSuspended: true,
    tenantActive: false,
  });
  const suspendedAuth = verifyGodmodeAuthorization(suspendedGodmodeCtx);
  assert(
    !suspendedAuth.authorized && suspendedAuth.status === "FORBIDDEN",
    "1.4 GODMODE_ADMIN from suspended tenant is strictly rejected"
  );

  // Test 5: Customer CA firm roles (FIRM_OWNER, FIRM_ADMIN, PARTNER, etc.) strictly denied God Mode
  const customerRoles = [
    Role.FIRM_OWNER,
    Role.FIRM_ADMIN,
    Role.PARTNER,
    Role.MANAGER,
    Role.EXECUTIVE,
    Role.CLIENT,
  ];

  for (const role of customerRoles) {
    const res = verifyGodmodeAuthorization(mockContext({ role }));
    assert(
      !res.authorized && res.status === "FORBIDDEN",
      `1.5 Customer role '${role}' is strictly denied access to /godmode and /service`
    );
  }

  // -------------------------------------------------------------
  // LEVEL 2: ADMIN_CLIENT (CUSTOMER CA FIRM ADMINISTRATOR / OWNER)
  // -------------------------------------------------------------
  console.log("\n--- PART 2: CA FIRM ADMINISTRATOR RBAC ---");

  // Test 6: FIRM_OWNER has full practice permissions
  assert(
    hasPermission(Role.FIRM_OWNER, "clients", "create") &&
      hasPermission(Role.FIRM_OWNER, "invoices", "approve") &&
      hasPermission(Role.FIRM_OWNER, "team", "manage_roles") &&
      hasPermission(Role.FIRM_OWNER, "settings", "manage_settings"),
    "2.1 FIRM_OWNER has complete administrative control over their practice"
  );

  // Test 7: FIRM_ADMIN can manage team and clients, but CANNOT demote or alter FIRM_OWNER
  const adminOwnerManage = canManageMemberRole(Role.FIRM_ADMIN, Role.FIRM_OWNER, Role.PARTNER);
  assert(
    !adminOwnerManage.allowed && Boolean(adminOwnerManage.reason?.includes("Organization Owner")),
    "2.2 FIRM_ADMIN cannot alter or demote a FIRM_OWNER"
  );

  // Test 8: FIRM_ADMIN cannot elevate other users to FIRM_OWNER
  const adminElevateOwner = canManageMemberRole(Role.FIRM_ADMIN, Role.MANAGER, Role.FIRM_OWNER);
  assert(
    !adminElevateOwner.allowed && Boolean(adminElevateOwner.reason?.includes("Only an Organization Owner")),
    "2.3 FIRM_ADMIN cannot elevate members to FIRM_OWNER"
  );

  // Test 9: FIRM_OWNER CAN modify any role within their practice
  const ownerModifies = canManageMemberRole(Role.FIRM_OWNER, Role.MANAGER, Role.PARTNER);
  assert(
    ownerModifies.allowed,
    "2.4 FIRM_OWNER can modify team roles within their practice"
  );

  // -------------------------------------------------------------
  // LEVEL 3: ADMIN_TEAM (CUSTOMER CA FIRM EMPLOYEES: PARTNER, MANAGER, EXECUTIVE)
  // -------------------------------------------------------------
  console.log("\n--- PART 3: CA FIRM EMPLOYEE ROLES & MAKER-CHECKER PERMISSIONS ---");

  // Test 10: PARTNER can approve invoices and sign off on reviews
  assert(
    hasPermission(Role.PARTNER, "invoices", "approve") &&
      hasPermission(Role.PARTNER, "tasks", "approve"),
    "3.1 Signing PARTNER has approval authority for invoices and task reviews"
  );

  // Test 11: MANAGER can review tasks and create invoices, but CANNOT approve invoices above threshold
  assert(
    hasPermission(Role.MANAGER, "tasks", "approve") &&
      !hasPermission(Role.MANAGER, "invoices", "approve"),
    "3.2 MANAGER can approve task workflows but cannot approve financial invoices"
  );

  // Test 12: EXECUTIVE (preparer / article assistant) CANNOT approve tasks or invoices
  assert(
    !hasPermission(Role.EXECUTIVE, "tasks", "approve") &&
      !hasPermission(Role.EXECUTIVE, "invoices", "approve") &&
      !hasPermission(Role.EXECUTIVE, "team", "invite"),
    "3.3 EXECUTIVE (preparer) has zero approval or invitation authority"
  );

  // Test 13: CLIENT role can only view own invoices and upload documents
  assert(
    hasPermission(Role.CLIENT, "invoices", "view") &&
      hasPermission(Role.CLIENT, "documents", "create") &&
      !hasPermission(Role.CLIENT, "clients", "view") &&
      !hasPermission(Role.CLIENT, "tasks", "view") &&
      !hasPermission(Role.CLIENT, "team", "view"),
    "3.4 CLIENT portal user is strictly confined to own invoices and document uploads"
  );

  // -------------------------------------------------------------
  // LEVEL 4: DATA ACCESS LAYER TENANT ISOLATION
  // -------------------------------------------------------------
  console.log("\n--- PART 4: DATA LAYER TENANT ISOLATION INVARIANTS ---");

  // Test 14: Default role permissions fail closed on unlisted resources
  assert(
    !hasPermission(Role.EXECUTIVE, "godmode", "view") &&
      !hasPermission(Role.MANAGER, "system_cluster", "manage") &&
      !hasPermission(Role.FIRM_ADMIN, "cross_tenant", "export"),
    "4.1 Deny-by-default strictly enforced on unmapped platform resources"
  );

  console.log("\n=================================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleHierarchyAndTenantIsolationTests().catch((err) => {
  console.error("Test runner exception:", err);
  process.exit(1);
});
