import { Role } from "@prisma/client";
import {
  hasPermission,
  canManageMemberRole,
  getEffectivePermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from "../src/lib/server/rbac/permissions";
import {
  verifyGodmodeAuthorization,
  type GodmodeAuthResult,
} from "../src/lib/server/rbac/godmode-guard";
import { registerAction } from "../src/lib/server/actions/register-actions";
import type { SessionContext } from "../src/lib/auth/session";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`✔ PASS: ${name}`);
    passed++;
  } else {
    console.error(`✘ FAIL: ${name}`);
    failed++;
  }
}

// =========================================================================
// 1. PUBLIC REGISTRATION SHUTDOWN TESTS
// =========================================================================
async function testPublicRegistrationShutdown(): Promise<void> {
  console.log("\n--- Suite 1: Permanent Public Registration Shutdown ---");

  // Call registerAction with valid-looking payload
  const result = await registerAction({
    fullName: "Hostile Registerer",
    email: "infiltrator@suspicious.com",
    password: "Password123!",
    phone: "9876543210",
    firmName: "Rogue CA Firm",
    city: "Mumbai",
    termsConsent: true,
  });

  assert(
    result.success === false,
    "registerAction permanently rejects self-service registration"
  );
  assert(
    result.message.includes("permanently disabled") ||
      result.message.includes("administrator invitation"),
    "registerAction informs caller that access is strictly by administrator invitation"
  );
  assert(
    !result.redirectUrl,
    "registerAction never issues a workspace redirect URL"
  );
}

// =========================================================================
// 2. GODMODE & SUPER ADMIN AUTHORIZATION TESTS
// =========================================================================
function testGodmodeAuthorization(): void {
  console.log("\n--- Suite 2: Godmode & Super Admin Root Authority ---");

  // 1. Unauthenticated caller
  const unauthResult = verifyGodmodeAuthorization(null);
  assert(
    !unauthResult.authorized && unauthResult.status === "UNAUTHENTICATED",
    "Godmode rejects null session context as UNAUTHENTICATED"
  );

  // 2. Standard user without isSuperAdmin
  const regularUserContext: SessionContext = {
    user: {
      id: "usr-regular",
      email: "staff@firm.com",
      name: "Staff Member",
      active: true,
      isSuperAdmin: false,
    },
    membership: {
      id: "mem-1",
      role: Role.MANAGER,
      status: "ACTIVE",
      tenantId: "ten-1",
      userId: "usr-regular",
      permissions: null,
      createdAt: new Date(),
    },
    tenant: {
      id: "ten-1",
      name: "Standard Practice",
      slug: "standard-practice",
      active: true,
      isSuspended: false,
    },
    session: {
      id: "sess-1",
      userId: "usr-regular",
      tenantId: "ten-1",
      expiresAt: new Date(Date.now() + 3600000),
    },
  };

  const regularResult = verifyGodmodeAuthorization(regularUserContext);
  assert(
    !regularResult.authorized && regularResult.status === "FORBIDDEN",
    "Godmode denies regular tenant staff (MANAGER) with FORBIDDEN"
  );

  // 3. Firm Owner (tenant level) without isSuperAdmin
  const ownerContext: SessionContext = {
    ...regularUserContext,
    membership: {
      ...regularUserContext.membership!,
      role: Role.FIRM_OWNER,
    },
  };
  const ownerResult = verifyGodmodeAuthorization(ownerContext);
  assert(
    !ownerResult.authorized && ownerResult.status === "FORBIDDEN",
    "Godmode denies tenant FIRM_OWNER without global platform isSuperAdmin"
  );

  // 4. Platform Super Admin (isSuperAdmin: true)
  const superAdminContext: SessionContext = {
    user: {
      id: "usr-root",
      email: "us7081569@gmail.com",
      name: "Root Superadmin",
      active: true,
      isSuperAdmin: true,
    },
    membership: null,
    tenant: null,
    session: {
      id: "sess-root",
      userId: "usr-root",
      tenantId: null,
      expiresAt: new Date(Date.now() + 3600000),
    },
  };
  const superAdminResult = verifyGodmodeAuthorization(superAdminContext);
  assert(
    superAdminResult.authorized && superAdminResult.status === "AUTHORIZED",
    "Godmode authorizes verified isSuperAdmin user unconditionally"
  );

  // 5. Tenant GODMODE_ADMIN role with active tenant
  const tenantGodmodeContext: SessionContext = {
    user: {
      id: "usr-godmode-op",
      email: "operator@truvtech.com",
      name: "Platform Operator",
      active: true,
      isSuperAdmin: false,
    },
    membership: {
      id: "mem-gm",
      role: Role.GODMODE_ADMIN,
      status: "ACTIVE",
      tenantId: "ten-platform",
      userId: "usr-godmode-op",
      permissions: null,
      createdAt: new Date(),
    },
    tenant: {
      id: "ten-platform",
      name: "TRUV Operations",
      slug: "truv-ops",
      active: true,
      isSuspended: false,
    },
    session: {
      id: "sess-gm",
      userId: "usr-godmode-op",
      tenantId: "ten-platform",
      expiresAt: new Date(Date.now() + 3600000),
    },
  };
  const tenantGodmodeResult = verifyGodmodeAuthorization(tenantGodmodeContext);
  assert(
    tenantGodmodeResult.authorized && tenantGodmodeResult.status === "AUTHORIZED",
    "Godmode authorizes active GODMODE_ADMIN membership in active tenant"
  );

  // 6. Suspended tenant blocks GODMODE_ADMIN
  const suspendedTenantContext: SessionContext = {
    ...tenantGodmodeContext,
    tenant: {
      ...tenantGodmodeContext.tenant!,
      isSuspended: true,
      active: false,
    },
  };
  const suspendedResult = verifyGodmodeAuthorization(suspendedTenantContext);
  assert(
    !suspendedResult.authorized && suspendedResult.status === "FORBIDDEN",
    "Godmode rejects GODMODE_ADMIN when host practice tenant is suspended"
  );
}

// =========================================================================
// 3. GRANULAR RBAC & PERMISSION BOUNDARIES
// =========================================================================
function testGranularRbacPermissions(): void {
  console.log("\n--- Suite 3: Granular RBAC & Permission Boundaries ---");

  // Root & Firm Owner wildcard access
  assert(
    hasPermission(Role.GODMODE_ADMIN, "invoices", "delete"),
    "GODMODE_ADMIN has wildcard permission (*)"
  );
  assert(
    hasPermission(Role.FIRM_OWNER, "security", "manage_settings"),
    "FIRM_OWNER has wildcard permission (*)"
  );

  // FIRM_ADMIN boundaries
  assert(
    hasPermission(Role.FIRM_ADMIN, "calling", "create"),
    "FIRM_ADMIN has calling capabilities"
  );
  assert(
    hasPermission(Role.FIRM_ADMIN, "security", "view"),
    "FIRM_ADMIN can view security logs"
  );
  assert(
    hasPermission(Role.FIRM_ADMIN, "team", "invite"),
    "FIRM_ADMIN can invite team members"
  );

  // PARTNER boundaries
  assert(
    hasPermission(Role.PARTNER, "invoices", "approve"),
    "PARTNER can approve invoices"
  );
  assert(
    hasPermission(Role.PARTNER, "clients", "export"),
    "PARTNER can export client data"
  );
  assert(
    !hasPermission(Role.PARTNER, "team", "invite"),
    "PARTNER cannot invite team members without custom permission"
  );
  assert(
    !hasPermission(Role.PARTNER, "settings", "manage_settings"),
    "PARTNER cannot alter practice firm settings"
  );

  // MANAGER boundaries
  assert(
    hasPermission(Role.MANAGER, "tasks", "approve"),
    "MANAGER can approve workflow tasks"
  );
  assert(
    hasPermission(Role.MANAGER, "calling", "create"),
    "MANAGER can initiate customer calls"
  );
  assert(
    !hasPermission(Role.MANAGER, "invoices", "approve"),
    "MANAGER cannot approve institutional invoices"
  );
  assert(
    !hasPermission(Role.MANAGER, "invoices", "delete"),
    "MANAGER cannot delete invoices"
  );
  assert(
    !hasPermission(Role.MANAGER, "security", "view"),
    "MANAGER cannot access security center logs"
  );

  // EXECUTIVE boundaries
  assert(
    hasPermission(Role.EXECUTIVE, "tasks", "view"),
    "EXECUTIVE can view assigned tasks"
  );
  assert(
    hasPermission(Role.EXECUTIVE, "documents", "create"),
    "EXECUTIVE can upload working papers"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "tasks", "approve"),
    "EXECUTIVE cannot approve tasks"
  );
  assert(
    !hasPermission(Role.EXECUTIVE, "calling", "create"),
    "EXECUTIVE cannot launch outbound calling campaigns"
  );

  // CLIENT portal boundaries
  assert(
    hasPermission(Role.CLIENT, "invoices", "view"),
    "CLIENT can view client portal invoices"
  );
  assert(
    hasPermission(Role.CLIENT, "documents", "view"),
    "CLIENT can view client portal documents"
  );
  assert(
    !hasPermission(Role.CLIENT, "dashboard", "view"),
    "CLIENT cannot access CA Practice internal dashboard"
  );
  assert(
    !hasPermission(Role.CLIENT, "clients", "view"),
    "CLIENT cannot browse other practice clients"
  );
  assert(
    !hasPermission(Role.CLIENT, "calling", "view"),
    "CLIENT cannot view practice calling center"
  );

  // Custom permission override checks
  assert(
    hasPermission(Role.PARTNER, "team", "invite", {
      customPermissions: { "team:invite": true },
    }),
    "Custom permission override enables 'team:invite' for PARTNER"
  );
  assert(
    !hasPermission(Role.FIRM_ADMIN, "invoices", "delete", {
      customPermissions: { "invoices:delete": false },
    }),
    "Explicit false in customPermissions revokes 'invoices:delete' from FIRM_ADMIN"
  );
}

// =========================================================================
// 4. ROLE MANAGEMENT & PRIVILEGE ELEVATION DEFENSE
// =========================================================================
function testPrivilegeElevationDefense(): void {
  console.log("\n--- Suite 4: Privilege Escalation & Management Defense ---");

  // 1. Non-superadmin cannot assign GODMODE_ADMIN
  const firmAdminElevateToGodmode = canManageMemberRole(
    Role.FIRM_ADMIN,
    Role.EXECUTIVE,
    Role.GODMODE_ADMIN
  );
  assert(
    !firmAdminElevateToGodmode.allowed,
    "FIRM_ADMIN cannot assign GODMODE_ADMIN to any account"
  );

  const firmOwnerElevateToGodmode = canManageMemberRole(
    Role.FIRM_OWNER,
    Role.EXECUTIVE,
    Role.GODMODE_ADMIN
  );
  assert(
    !firmOwnerElevateToGodmode.allowed,
    "FIRM_OWNER cannot assign GODMODE_ADMIN"
  );

  // 2. Non-superadmin cannot modify GODMODE_ADMIN account
  const firmAdminDemoteGodmode = canManageMemberRole(
    Role.FIRM_ADMIN,
    Role.GODMODE_ADMIN,
    Role.EXECUTIVE
  );
  assert(
    !firmAdminDemoteGodmode.allowed,
    "FIRM_ADMIN cannot demote or modify a GODMODE_ADMIN"
  );

  // 3. FIRM_ADMIN cannot demote or alter FIRM_OWNER
  const firmAdminAlterOwner = canManageMemberRole(
    Role.FIRM_ADMIN,
    Role.FIRM_OWNER,
    Role.MANAGER
  );
  assert(
    !firmAdminAlterOwner.allowed,
    "FIRM_ADMIN cannot alter or demote Organization FIRM_OWNER"
  );

  // 4. FIRM_ADMIN cannot create a new FIRM_OWNER
  const firmAdminCreateOwner = canManageMemberRole(
    Role.FIRM_ADMIN,
    Role.PARTNER,
    Role.FIRM_OWNER
  );
  assert(
    !firmAdminCreateOwner.allowed,
    "FIRM_ADMIN cannot create or grant FIRM_OWNER privileges"
  );

  // 5. FIRM_ADMIN can manage operational team members (PARTNER, MANAGER, EXECUTIVE)
  const firmAdminManageManager = canManageMemberRole(
    Role.FIRM_ADMIN,
    Role.EXECUTIVE,
    Role.MANAGER
  );
  assert(
    firmAdminManageManager.allowed,
    "FIRM_ADMIN can promote EXECUTIVE to MANAGER"
  );

  // 6. FIRM_OWNER can manage all tenant roles
  const ownerPromoteToAdmin = canManageMemberRole(
    Role.FIRM_OWNER,
    Role.PARTNER,
    Role.FIRM_ADMIN
  );
  assert(
    ownerPromoteToAdmin.allowed,
    "FIRM_OWNER can promote members to FIRM_ADMIN"
  );

  // 7. Non-admin roles (MANAGER, EXECUTIVE, CLIENT) cannot manage any roles
  const managerManageExec = canManageMemberRole(
    Role.MANAGER,
    Role.EXECUTIVE,
    Role.EXECUTIVE
  );
  assert(
    !managerManageExec.allowed,
    "MANAGER cannot manage team roles"
  );

  const execManageExec = canManageMemberRole(
    Role.EXECUTIVE,
    Role.EXECUTIVE,
    Role.MANAGER
  );
  assert(
    !execManageExec.allowed,
    "EXECUTIVE cannot manage team roles"
  );

  const clientManage = canManageMemberRole(
    Role.CLIENT,
    Role.CLIENT,
    Role.EXECUTIVE
  );
  assert(
    !clientManage.allowed,
    "CLIENT cannot manage any roles"
  );
}

// =========================================================================
// RUN ALL SUITES
// =========================================================================
async function main(): Promise<void> {
  console.log("==================================================================");
  console.log("TRUV LEDGEROS — ACCESS CONTROL & SECURITY ENFORCEMENT TEST SUITE");
  console.log("==================================================================");

  await testPublicRegistrationShutdown();
  testGodmodeAuthorization();
  testGranularRbacPermissions();
  testPrivilegeElevationDefense();

  console.log("\n==================================================================");
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
