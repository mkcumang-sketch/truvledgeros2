import crypto from "crypto";
import { NextRequest } from "next/server";
import { GET as getDueObligations } from "../src/app/api/compliance/due-obligations/route";
import { GET as getPendingDocRequests } from "../src/app/api/documents/pending-requests/route";
import * as sessionModule from "../src/lib/auth/session";
import { Role } from "@prisma/client";
import { db } from "../src/lib/db";

// ============================================================================
// TEST ENVIRONMENT & MOCK SETUP (ZERO NEON / REMOTE DB CALLS)
// ============================================================================

const SYSTEM_HMAC_SECRET = "system_outbox_hmac_secret_32bytes_safe";
const SYSTEM_CRON_SECRET = "system_cron_token_32bytes_safe";

// Tenant Credentials (Explicitly bound to single tenants)
const TENANT_A_TOKEN = "truv_m2m_token_tenant_alpha_secure_key";
const TENANT_B_TOKEN = "truv_m2m_token_tenant_beta_secure_key";
const REVOKED_TOKEN = "truv_m2m_token_revoked_alpha_secure_key";

const TENANT_A_HMAC_SECRET = "hmac_secret_tenant_alpha_32bytes_key";
const TENANT_B_HMAC_SECRET = "hmac_secret_tenant_beta_32bytes_key";
const REVOKED_HMAC_SECRET = "hmac_secret_revoked_alpha_32bytes_key";

let findManyCalls = {
  gstReturn: 0,
  documentRequest: 0,
};
let lastFindManyWhere: {
  gstReturn: any;
  documentRequest: any;
} = {
  gstReturn: null,
  documentRequest: null,
};

function resetDbMocks() {
  findManyCalls = { gstReturn: 0, documentRequest: 0 };
  lastFindManyWhere = { gstReturn: null, documentRequest: null };

  // Mock Tenant Model
  (db as any).tenant = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id === "TENANT_ALPHA") {
        return { id: "TENANT_ALPHA", active: true, isSuspended: false };
      }
      if (where.id === "TENANT_BETA") {
        return { id: "TENANT_BETA", active: true, isSuspended: false };
      }
      if (where.id === "TENANT_DEFAULT") {
        return { id: "TENANT_DEFAULT", active: true, isSuspended: false };
      }
      if (where.id === "INACTIVE_TENANT") {
        return { id: "INACTIVE_TENANT", active: false, isSuspended: false };
      }
      if (where.id === "SUSPENDED_TENANT") {
        return { id: "SUSPENDED_TENANT", active: true, isSuspended: true };
      }
      return null;
    },
  };

  // Mock Integration Model (Per-Tenant M2M Credentials)
  (db as any).integration = {
    findFirst: async ({ where }: { where: any }) => {
      // 1. Bearer Token Lookup by credential value
      if (where.encryptedCredentials) {
        if (where.encryptedCredentials === TENANT_A_TOKEN) {
          return {
            id: "integ_token_a",
            tenantId: "TENANT_ALPHA",
            provider: "M2M_BEARER",
            encryptedCredentials: TENANT_A_TOKEN,
            status: "ACTIVE",
          };
        }
        if (where.encryptedCredentials === TENANT_B_TOKEN) {
          return {
            id: "integ_token_b",
            tenantId: "TENANT_BETA",
            provider: "M2M_BEARER",
            encryptedCredentials: TENANT_B_TOKEN,
            status: "ACTIVE",
          };
        }
        if (where.encryptedCredentials === REVOKED_TOKEN) {
          return {
            id: "integ_token_revoked",
            tenantId: "TENANT_ALPHA",
            provider: "M2M_BEARER",
            encryptedCredentials: REVOKED_TOKEN,
            status: "REVOKED",
          };
        }
        return null;
      }

      // 2. HMAC Secret Lookup by tenantId
      if (where.tenantId) {
        if (where.tenantId === "TENANT_ALPHA") {
          return {
            id: "integ_hmac_a",
            tenantId: "TENANT_ALPHA",
            provider: "N8N_M2M",
            encryptedCredentials: TENANT_A_HMAC_SECRET,
            status: "ACTIVE",
          };
        }
        if (where.tenantId === "TENANT_BETA") {
          return {
            id: "integ_hmac_b",
            tenantId: "TENANT_BETA",
            provider: "N8N_M2M",
            encryptedCredentials: TENANT_B_HMAC_SECRET,
            status: "ACTIVE",
          };
        }
        if (where.tenantId === "TENANT_REVOKED") {
          return {
            id: "integ_hmac_revoked",
            tenantId: "TENANT_ALPHA",
            provider: "N8N_M2M",
            encryptedCredentials: REVOKED_HMAC_SECRET,
            status: "REVOKED",
          };
        }
        return null;
      }

      return null;
    },
  };

  (db as any).gstReturn = {
    findMany: async ({ where }: any) => {
      findManyCalls.gstReturn++;
      lastFindManyWhere.gstReturn = where;
      return [
        {
          id: "ret_001",
          tenantId: where.tenantId,
          clientId: "cli_001",
          returnType: "GSTR_1",
          period: "092026",
          dueDate: new Date(),
          status: "DATA_PENDING",
        },
      ];
    },
  };

  (db as any).documentRequest = {
    findMany: async ({ where }: any) => {
      findManyCalls.documentRequest++;
      lastFindManyWhere.documentRequest = where;
      return [
        {
          id: "doc_req_001",
          tenantId: where.tenantId,
          clientId: "cli_001",
          title: "Bank Statement",
          description: "Upload Sept statement",
          reminderCount: 0,
          lastReminderAt: null,
          status: "PENDING",
          createdAt: new Date(),
        },
      ];
    },
  };
}

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

function createSignedHeaders(secret: string, timestamp: number = Date.now(), payload: string = "") {
  const tsStr = timestamp.toString();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${tsStr}.${payload}`);
  const signature = `sha256=${hmac.digest("hex")}`;
  return {
    "x-truv-timestamp": tsStr,
    "x-truv-signature": signature,
  };
}

// ============================================================================
// PHASE 2K.3 TENANT-BOUND M2M REGRESSION SUITE
// ============================================================================

async function runPhase2K3Suite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Phase 2K.3 Tenant-Bound M2M Authorization Suite");
  console.log("=================================================================\n");

  const routes = [
    {
      name: "Compliance (/api/compliance/due-obligations)",
      handler: getDueObligations,
      tableKey: "gstReturn" as const,
      dataField: "obligations",
    },
    {
      name: "Documents (/api/documents/pending-requests)",
      handler: getPendingDocRequests,
      tableKey: "documentRequest" as const,
      dataField: "requests",
    },
  ];

  for (const route of routes) {
    console.log(`\n>>> Route Under Audit: ${route.name} <<<`);
    process.env.N8N_WEBHOOK_SECRET = SYSTEM_HMAC_SECRET;
    process.env.CRON_SECRET = SYSTEM_CRON_SECRET;

    // ------------------------------------------------------------------------
    // SCENARIO 1: Tenant A credential + Tenant A request -> PERMITTED
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 1] Tenant A credential + Tenant A request permitted");
    resetDbMocks();

    // 1A. Bearer Token: Tenant A token requesting Tenant A
    const req1A = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: { authorization: `Bearer ${TENANT_A_TOKEN}` },
    });
    const res1A = await route.handler(req1A);
    const body1A = await res1A.json();
    assert(
      res1A.status === 200 &&
        body1A.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `1A. Tenant A Bearer token requesting Tenant A is permitted (200)`
    );

    // 1B. HMAC Signature: Tenant A secret requesting Tenant A
    const hmacHeadersA = createSignedHeaders(TENANT_A_HMAC_SECRET);
    const req1B = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: hmacHeadersA,
    });
    const res1B = await route.handler(req1B);
    const body1B = await res1B.json();
    assert(
      res1B.status === 200 &&
        body1B.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `1B. Tenant A HMAC secret requesting Tenant A is permitted (200)`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 2: Tenant A credential + Tenant B request -> DENIED (Cross-Tenant Blocked)
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 2] Tenant A credential + Tenant B request denied (Cross-Tenant Prevention)");
    resetDbMocks();

    // 2A. Bearer Token: Tenant A token attempting to access Tenant B
    const req2A = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_BETA", {
      headers: { authorization: `Bearer ${TENANT_A_TOKEN}` },
    });
    const res2A = await route.handler(req2A);
    const body2A = await res2A.json();
    assert(
      res2A.status === 403 && body2A.code === "CROSS_TENANT_FORBIDDEN",
      `2A. Tenant A Bearer token requesting Tenant B rejected with 403 CROSS_TENANT_FORBIDDEN`
    );
    assert(
      findManyCalls[route.tableKey] === 0,
      `2A. Cross-tenant attempt never executes database findMany (call count: 0)`
    );

    // 2B. HMAC Signature: Tenant A secret attempting to access Tenant B
    const req2B = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_BETA", {
      headers: createSignedHeaders(TENANT_A_HMAC_SECRET),
    });
    const res2B = await route.handler(req2B);
    const body2B = await res2B.json();
    assert(
      res2B.status === 401 && body2B.code === "INVALID_SIGNATURE",
      `2B. Tenant A HMAC secret requesting Tenant B rejected (401 INVALID_SIGNATURE against Tenant B key)`
    );
    assert(
      findManyCalls[route.tableKey] === 0,
      `2B. Cross-tenant HMAC attempt never executes database findMany (call count: 0)`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 3: Missing tenant scope -> DENIED
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 3] Missing tenant scope denied");
    resetDbMocks();

    const req3 = new NextRequest("http://localhost:3000/api/test", {
      headers: { authorization: `Bearer ${TENANT_A_TOKEN}` },
    });
    const res3 = await route.handler(req3);
    const body3 = await res3.json();
    assert(
      res3.status === 400 && body3.code === "MISSING_TENANT_SCOPE",
      `3. Missing tenant scope rejected with 400 MISSING_TENANT_SCOPE`
    );
    assert(findManyCalls[route.tableKey] === 0, `3. Database query not executed on missing tenant scope`);

    // ------------------------------------------------------------------------
    // SCENARIO 4: Missing, invalid, expired, or revoked credential -> DENIED
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 4] Missing, invalid, expired, or revoked credential denied");
    resetDbMocks();

    // 4A. Revoked Bearer Token
    const req4A = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: { authorization: `Bearer ${REVOKED_TOKEN}` },
    });
    const res4A = await route.handler(req4A);
    const body4A = await res4A.json();
    assert(
      res4A.status === 403 && body4A.code === "CREDENTIAL_REVOKED",
      `4A. Revoked Bearer token rejected with 403 CREDENTIAL_REVOKED`
    );

    // 4B. Invalid Bearer Token
    const req4B = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: { authorization: `Bearer completely_unknown_token` },
    });
    const res4B = await route.handler(req4B);
    const body4B = await res4B.json();
    assert(
      res4B.status === 401 && body4B.code === "INVALID_CREDENTIALS",
      `4B. Unknown/invalid Bearer token rejected with 401 INVALID_CREDENTIALS`
    );

    // 4C. Expired HMAC Timestamp
    const expiredTs = Date.now() - 6 * 60 * 1000;
    const req4C = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: createSignedHeaders(TENANT_A_HMAC_SECRET, expiredTs),
    });
    const res4C = await route.handler(req4C);
    const body4C = await res4C.json();
    assert(
      res4C.status === 401 && body4C.code === "TIMESTAMP_EXPIRED",
      `4C. Expired HMAC timestamp (>5m) rejected with 401 TIMESTAMP_EXPIRED`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 5: Inactive or suspended tenant -> DENIED
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 5] Inactive or suspended tenant denied");
    resetDbMocks();

    // 5A. Inactive Tenant
    const req5A = new NextRequest("http://localhost:3000/api/test?tenantId=INACTIVE_TENANT", {
      headers: { authorization: `Bearer ${SYSTEM_CRON_SECRET}` },
    });
    const res5A = await route.handler(req5A);
    const body5A = await res5A.json();
    assert(
      res5A.status === 403 && body5A.code === "TENANT_UNAUTHORIZED",
      `5A. Inactive tenant rejected with 403 TENANT_UNAUTHORIZED`
    );

    // 5B. Suspended Tenant
    const req5B = new NextRequest("http://localhost:3000/api/test?tenantId=SUSPENDED_TENANT", {
      headers: { authorization: `Bearer ${SYSTEM_CRON_SECRET}` },
    });
    const res5B = await route.handler(req5B);
    const body5B = await res5B.json();
    assert(
      res5B.status === 403 && body5B.code === "TENANT_UNAUTHORIZED",
      `5B. Suspended tenant rejected with 403 TENANT_UNAUTHORIZED`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 6: Changing only query param/header cannot grant additional access
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 6] Parameter manipulation cannot cross boundaries");
    resetDbMocks();

    // Attacker possesses Tenant A's token, but tampers with ?tenantId=TENANT_BETA
    const req6 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_BETA", {
      headers: { authorization: `Bearer ${TENANT_A_TOKEN}` },
    });
    const res6 = await route.handler(req6);
    const body6 = await res6.json();
    assert(
      res6.status === 403 && body6.code === "CROSS_TENANT_FORBIDDEN",
      `6. Tampered query parameter cannot bypass credential scope; blocked with 403 CROSS_TENANT_FORBIDDEN`
    );
    assert(findManyCalls[route.tableKey] === 0, `6. Database findMany call count remains 0`);

    // ------------------------------------------------------------------------
    // SCENARIO 7: User-session requests cannot override trusted membership
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 7] User session cannot override membership");
    resetDbMocks();

    const originalGetSession = sessionModule.getSessionContext;
    (sessionModule as any).getSessionContext = async () => ({
      user: { id: "u_partner", email: "partner@firm-a.com", name: "Partner A", isSuperAdmin: false },
      membership: { id: "m_a", tenantId: "TENANT_ALPHA", role: Role.PARTNER, status: "ACTIVE" },
      tenant: { id: "TENANT_ALPHA", name: "Firm A", slug: "firm-a", active: true, isSuspended: false },
    });

    const req7 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_BETA");
    const res7 = await route.handler(req7);
    const body7 = await res7.json();
    assert(
      res7.status === 200 &&
        body7.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `7. Caller-supplied ?tenantId=TENANT_BETA is ignored; strictly queries session tenant (TENANT_ALPHA)`
    );

    (sessionModule as any).getSessionContext = originalGetSession;

    // ------------------------------------------------------------------------
    // SCENARIO 8: Existing valid outbox HMAC requests still work
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 8] Existing outbox HMAC backward compatibility verified");
    resetDbMocks();

    // Outbox dispatcher sends system HMAC + x-truv-tenant-id header for a tenant without dedicated key
    const outboxHeaders = {
      ...createSignedHeaders(SYSTEM_HMAC_SECRET),
      "x-truv-tenant-id": "TENANT_ALPHA",
    };
    const req8 = new NextRequest("http://localhost:3000/api/test", {
      headers: outboxHeaders,
    });
    const res8 = await route.handler(req8);
    const body8 = await res8.json();
    assert(
      res8.status === 200 &&
        body8.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `8. Outbox HMAC request with system secret succeeds under authorized system scope (200)`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 9: Denied requests do not execute protected database queries
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 9] Query suppression on denied requests");
    resetDbMocks();

    // Bad signature request
    const req9 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: {
        "x-truv-timestamp": Date.now().toString(),
        "x-truv-signature": "sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb",
      },
    });
    await route.handler(req9);
    assert(
      findManyCalls[route.tableKey] === 0,
      `9. Denied request strictly suppressed database query execution (findMany count: 0)`
    );

    // ------------------------------------------------------------------------
    // SCENARIO 10: No default secret or fail-open path reintroduced
    // ------------------------------------------------------------------------
    console.log("\n  [Scenario 10] Fail-closed authentication invariant");
    resetDbMocks();

    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.CRON_SECRET;

    // 10A. Missing server secret fails closed (401 UNCONFIGURED_SECRET)
    const req10A = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_DEFAULT", {
      headers: createSignedHeaders("any_secret"),
    });
    const res10A = await route.handler(req10A);
    const body10A = await res10A.json();
    assert(
      res10A.status === 401 && body10A.code === "UNCONFIGURED_SECRET",
      `10A. Missing server secret fails closed (401 UNCONFIGURED_SECRET)`
    );

    // 10B. Default dev string 'default_dev_truv_n8n_secret_32bytes' is rejected
    const req10B = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: createSignedHeaders("default_dev_truv_n8n_secret_32bytes"),
    });
    const res10B = await route.handler(req10B);
    const body10B = await res10B.json();
    assert(
      res10B.status === 401 && body10B.code === "INVALID_SIGNATURE",
      `10B. Default dev secret 'default_dev_truv_n8n_secret_32bytes' rejected (401 INVALID_SIGNATURE)`
    );
  }

  // ==========================================================================
  // FINAL RESULTS
  // ==========================================================================
  console.log("\n=================================================================");
  console.log(`Phase 2K.3 Tenant-Bound M2M Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2K3Suite().catch((err) => {
  console.error("Fatal test suite error:", err);
  process.exit(1);
});
