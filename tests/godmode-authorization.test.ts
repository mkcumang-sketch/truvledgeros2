import { Role } from "@prisma/client";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";
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

async function runTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — /godmode Server Authorization Regression Suite");
  console.log("=================================================================\n");

  // TEST 1: Unauthenticated context fails closed (UNAUTHENTICATED)
  const unauthResult = verifyGodmodeAuthorization(null);
  assert(
    !unauthResult.authorized && unauthResult.status === "UNAUTHENTICATED",
    "TEST 1: Unauthenticated request is strictly denied with UNAUTHENTICATED status"
  );

  // Helper to generate mock session context
  function mockContext(overrides: {
    role?: Role;
    isSuperAdmin?: boolean;
    membershipStatus?: "ACTIVE" | "SUSPENDED" | "INVITED" | "REVOKED";
    tenantActive?: boolean;
    tenantSuspended?: boolean;
  }): SessionContext {
    return {
      user: {
        id: "usr_test_123",
        email: "test@example.com",
        name: "Test User",
        isSuperAdmin: overrides.isSuperAdmin ?? false,
      },
      membership: overrides.role
        ? {
            id: "mem_test_123",
            tenantId: "tnt_test_123",
            role: overrides.role,
            status: overrides.membershipStatus ?? "ACTIVE",
          }
        : undefined,
      tenant: overrides.role
        ? {
            id: "tnt_test_123",
            name: "Test Firm",
            slug: "test-firm",
            active: overrides.tenantActive ?? true,
            isSuspended: overrides.tenantSuspended ?? false,
          }
        : undefined,
    };
  }

  // TEST 2: Ordinary roles denied access
  const ordinaryRoles: Role[] = [
    Role.CLIENT,
    Role.EXECUTIVE,
    Role.MANAGER,
    Role.PARTNER,
    Role.FIRM_ADMIN,
    Role.FIRM_OWNER,
  ];

  for (const role of ordinaryRoles) {
    const res = verifyGodmodeAuthorization(mockContext({ role }));
    assert(
      !res.authorized && res.status === "FORBIDDEN",
      `TEST 2: Ordinary role '${role}' is denied access to /godmode (FORBIDDEN)`
    );
  }

  // TEST 3: User without any membership (e.g. unattached account) denied
  const noMembershipContext: SessionContext = {
    user: {
      id: "usr_no_mem",
      email: "orphan@example.com",
      name: "Orphan User",
      isSuperAdmin: false,
    },
  };
  const orphanRes = verifyGodmodeAuthorization(noMembershipContext);
  assert(
    !orphanRes.authorized && orphanRes.status === "FORBIDDEN",
    "TEST 3: User without tenant membership is denied access to /godmode"
  );

  // TEST 4: GODMODE_ADMIN in suspended tenant is denied
  const suspendedTenantRes = verifyGodmodeAuthorization(
    mockContext({
      role: Role.GODMODE_ADMIN,
      tenantActive: true,
      tenantSuspended: true,
    })
  );
  assert(
    !suspendedTenantRes.authorized && suspendedTenantRes.status === "FORBIDDEN",
    "TEST 4: GODMODE_ADMIN in suspended tenant practice is denied access"
  );

  // TEST 5: GODMODE_ADMIN in inactive tenant is denied
  const inactiveTenantRes = verifyGodmodeAuthorization(
    mockContext({
      role: Role.GODMODE_ADMIN,
      tenantActive: false,
      tenantSuspended: false,
    })
  );
  assert(
    !inactiveTenantRes.authorized && inactiveTenantRes.status === "FORBIDDEN",
    "TEST 5: GODMODE_ADMIN in inactive tenant practice is denied access"
  );

  // TEST 6: GODMODE_ADMIN with suspended membership is denied
  const suspendedMemberRes = verifyGodmodeAuthorization(
    mockContext({
      role: Role.GODMODE_ADMIN,
      membershipStatus: "SUSPENDED",
    })
  );
  assert(
    !suspendedMemberRes.authorized && suspendedMemberRes.status === "FORBIDDEN",
    "TEST 6: GODMODE_ADMIN with suspended membership status is denied access"
  );

  // TEST 7: Active GODMODE_ADMIN in active tenant is permitted
  const validGodmodeRes = verifyGodmodeAuthorization(
    mockContext({
      role: Role.GODMODE_ADMIN,
      membershipStatus: "ACTIVE",
      tenantActive: true,
      tenantSuspended: false,
    })
  );
  assert(
    validGodmodeRes.authorized && validGodmodeRes.status === "AUTHORIZED",
    "TEST 7: Verified active GODMODE_ADMIN in active practice is permitted"
  );

  // TEST 8: Platform superadmin (isSuperAdmin = true) is permitted
  const superAdminRes = verifyGodmodeAuthorization(
    mockContext({
      role: Role.FIRM_OWNER,
      isSuperAdmin: true,
    })
  );
  assert(
    superAdminRes.authorized && superAdminRes.status === "AUTHORIZED",
    "TEST 8: Platform superadmin (isSuperAdmin: true) is permitted global godmode access"
  );

  // TEST 9: Platform superadmin without practice membership is permitted
  const globalSuperAdminRes = verifyGodmodeAuthorization({
    user: {
      id: "usr_superadmin",
      email: "root@truv.io",
      name: "Root Platform Admin",
      isSuperAdmin: true,
    },
  });
  assert(
    globalSuperAdminRes.authorized && globalSuperAdminRes.status === "AUTHORIZED",
    "TEST 9: Platform superadmin without practice tenant attachment is permitted"
  );

  console.log("\n-----------------------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("-----------------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
