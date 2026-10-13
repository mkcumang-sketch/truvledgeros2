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

const TEST_SECRET = "test_verified_n8n_secret_32bytes_safe";
const TEST_CRON_SECRET = "test_verified_cron_token_32bytes_safe";

// Database Mock Call Counters & Capture Structures
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

  (db as any).tenant = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id === "TENANT_ALPHA") {
        return { id: "TENANT_ALPHA", active: true, isSuspended: false };
      }
      if (where.id === "TENANT_BETA") {
        return { id: "TENANT_BETA", active: true, isSuspended: false };
      }
      if (where.id === "INACTIVE_TENANT") {
        return { id: "INACTIVE_TENANT", active: false, isSuspended: false };
      }
      if (where.id === "SUSPENDED_TENANT") {
        return { id: "SUSPENDED_TENANT", active: true, isSuspended: true };
      }
      return null; // Not found
    },
  };

  (db as any).gstReturn = {
    findMany: async ({ where, select }: any) => {
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
    findMany: async ({ where, select }: any) => {
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
// REGRESSION TEST SUITE FOR P0 FINDINGS
// ============================================================================

async function runP0RegressionSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Phase 2K.1 P0 Security Remediation Regression Suite");
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
    console.log(`\n>>> Testing Route: ${route.name} <<<`);

    // ------------------------------------------------------------------------
    // REQUIREMENT 1: Missing M2M secret -> denied (fail-closed)
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 1] Missing M2M secret fails closed`);
    resetDbMocks();

    // 1.1 Unconfigured N8N_WEBHOOK_SECRET fails closed when HMAC headers present
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.CRON_SECRET;

    const hmacHeaders = createSignedHeaders("any_secret");
    const req1_1 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: hmacHeaders,
    });
    const res1_1 = await route.handler(req1_1);
    const body1_1 = await res1_1.json();
    assert(
      res1_1.status === 401 && body1_1.code === "UNCONFIGURED_SECRET",
      `1.1 Missing N8N_WEBHOOK_SECRET fails closed (401 UNCONFIGURED_SECRET)`
    );

    // 1.2 Unconfigured CRON_SECRET fails closed when Bearer token present
    const req1_2 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: { authorization: "Bearer some_bearer_token" },
    });
    const res1_2 = await route.handler(req1_2);
    const body1_2 = await res1_2.json();
    assert(
      res1_2.status === 401 && body1_2.code === "UNCONFIGURED_SECRET",
      `1.2 Missing CRON_SECRET / N8N_WEBHOOK_SECRET fails closed for Bearer auth (401 UNCONFIGURED_SECRET)`
    );

    // 1.3 Default secret fallback removed: cannot authenticate with 'default_dev_truv_n8n_secret_32bytes'
    const defaultFallbackHeaders = createSignedHeaders("default_dev_truv_n8n_secret_32bytes");
    const req1_3 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: defaultFallbackHeaders,
    });
    const res1_3 = await route.handler(req1_3);
    assert(
      res1_3.status === 401,
      `1.3 Default dev fallback secret is rejected when secret unconfigured (no fallback to default string)`
    );

    // 1.4 Unauthenticated request (no headers, no cookies) returns 401
    const req1_4 = new NextRequest("http://localhost:3000/api/test");
    const res1_4 = await route.handler(req1_4);
    const body1_4 = await res1_4.json();
    assert(
      res1_4.status === 401 && body1_4.code === "UNAUTHORIZED_ACCESS",
      `1.4 Unauthenticated request rejected (401 UNAUTHORIZED_ACCESS)`
    );

    // Now configure valid secrets for subsequent tests
    process.env.N8N_WEBHOOK_SECRET = TEST_SECRET;
    process.env.CRON_SECRET = TEST_CRON_SECRET;

    // ------------------------------------------------------------------------
    // REQUIREMENT 2: Incorrect secret -> denied
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 2] Incorrect secret denied`);
    resetDbMocks();

    // 2.1 Forged / mismatched HMAC signature
    const badSigHeaders = createSignedHeaders("wrong_attacker_secret");
    const req2_1 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: badSigHeaders,
    });
    const res2_1 = await route.handler(req2_1);
    const body2_1 = await res2_1.json();
    assert(
      res2_1.status === 401 && body2_1.code === "INVALID_SIGNATURE",
      `2.1 Incorrect HMAC signature rejected (401 INVALID_SIGNATURE)`
    );

    // 2.2 Expired timestamp (> 5 minutes ago)
    const expiredTimestamp = Date.now() - 6 * 60 * 1000;
    const expiredHeaders = createSignedHeaders(TEST_SECRET, expiredTimestamp);
    const req2_2 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: expiredHeaders,
    });
    const res2_2 = await route.handler(req2_2);
    const body2_2 = await res2_2.json();
    assert(
      res2_2.status === 401 && body2_2.code === "TIMESTAMP_EXPIRED",
      `2.2 Expired timestamp rejected (401 TIMESTAMP_EXPIRED replay protection)`
    );

    // 2.3 Invalid Bearer token
    const req2_3 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: { authorization: "Bearer invalid_secret_token" },
    });
    const res2_3 = await route.handler(req2_3);
    const body2_3 = await res2_3.json();
    assert(
      res2_3.status === 401 && body2_3.code === "INVALID_CREDENTIALS",
      `2.3 Incorrect Bearer token rejected (401 INVALID_CREDENTIALS)`
    );

    // ------------------------------------------------------------------------
    // REQUIREMENT 3: Correct secret but missing or malformed tenant scope -> denied
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 3] Missing or malformed tenant scope denied`);
    resetDbMocks();

    // 3.1 Correct HMAC signature, but missing tenantId parameter entirely
    const validHmacNoTenant = createSignedHeaders(TEST_SECRET);
    const req3_1 = new NextRequest("http://localhost:3000/api/test", {
      headers: validHmacNoTenant,
    });
    const res3_1 = await route.handler(req3_1);
    const body3_1 = await res3_1.json();
    assert(
      res3_1.status === 400 && body3_1.code === "MISSING_TENANT_SCOPE",
      `3.1 Correct HMAC with missing tenantId rejected (400 MISSING_TENANT_SCOPE)`
    );

    // 3.2 Correct HMAC signature, but empty/whitespace tenantId (?tenantId=   )
    const req3_2 = new NextRequest("http://localhost:3000/api/test?tenantId=%20%20%20", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res3_2 = await route.handler(req3_2);
    const body3_2 = await res3_2.json();
    assert(
      res3_2.status === 400 && body3_2.code === "MISSING_TENANT_SCOPE",
      `3.2 Correct HMAC with whitespace tenantId rejected (400 MISSING_TENANT_SCOPE)`
    );

    // 3.3 Correct Bearer token, but missing tenantId parameter entirely
    const req3_3 = new NextRequest("http://localhost:3000/api/test", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    const res3_3 = await route.handler(req3_3);
    const body3_3 = await res3_3.json();
    assert(
      res3_3.status === 400 && body3_3.code === "MISSING_TENANT_SCOPE",
      `3.3 Correct Bearer token with missing tenantId rejected (400 MISSING_TENANT_SCOPE)`
    );

    // 3.4 Malformed tenantId (> 128 characters)
    const longTenantId = "a".repeat(150);
    const req3_4 = new NextRequest(`http://localhost:3000/api/test?tenantId=${longTenantId}`, {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res3_4 = await route.handler(req3_4);
    const body3_4 = await res3_4.json();
    assert(
      res3_4.status === 400 && body3_4.code === "INVALID_TENANT_SCOPE",
      `3.4 Malformed tenantId (>128 chars) rejected (400 INVALID_TENANT_SCOPE)`
    );

    // ------------------------------------------------------------------------
    // REQUIREMENT 4: Correct secret and unauthorized tenant -> denied
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 4] Unauthorized or invalid tenant denied`);
    resetDbMocks();

    // 4.1 Non-existent tenantId
    const req4_1 = new NextRequest("http://localhost:3000/api/test?tenantId=DOES_NOT_EXIST", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res4_1 = await route.handler(req4_1);
    const body4_1 = await res4_1.json();
    assert(
      res4_1.status === 404 && body4_1.code === "TENANT_NOT_FOUND",
      `4.1 Non-existent tenantId rejected (404 TENANT_NOT_FOUND)`
    );

    // 4.2 Inactive tenant (active: false)
    const req4_2 = new NextRequest("http://localhost:3000/api/test?tenantId=INACTIVE_TENANT", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res4_2 = await route.handler(req4_2);
    const body4_2 = await res4_2.json();
    assert(
      res4_2.status === 403 && body4_2.code === "TENANT_UNAUTHORIZED",
      `4.2 Inactive tenant rejected (403 TENANT_UNAUTHORIZED)`
    );

    // 4.3 Suspended tenant (isSuspended: true)
    const req4_3 = new NextRequest("http://localhost:3000/api/test?tenantId=SUSPENDED_TENANT", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res4_3 = await route.handler(req4_3);
    const body4_3 = await res4_3.json();
    assert(
      res4_3.status === 403 && body4_3.code === "TENANT_UNAUTHORIZED",
      `4.3 Suspended tenant rejected (403 TENANT_UNAUTHORIZED)`
    );

    // ------------------------------------------------------------------------
    // REQUIREMENT 5: Valid authorized tenant -> returns only that tenant's records
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 5] Valid authorized tenant returns scoped records`);
    resetDbMocks();

    // 5.1 Valid HMAC with active TENANT_ALPHA
    const req5_1 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_ALPHA", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    const res5_1 = await route.handler(req5_1);
    const body5_1 = await res5_1.json();
    assert(
      res5_1.status === 200 &&
        body5_1.success === true &&
        Array.isArray(body5_1[route.dataField]) &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `5.1 Valid HMAC returns records scoped strictly to TENANT_ALPHA`
    );

    // 5.2 Valid Bearer with active TENANT_BETA
    resetDbMocks();
    const req5_2 = new NextRequest("http://localhost:3000/api/test?tenantId=TENANT_BETA", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    const res5_2 = await route.handler(req5_2);
    const body5_2 = await res5_2.json();
    assert(
      res5_2.status === 200 &&
        body5_2.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_BETA",
      `5.2 Valid Bearer token returns records scoped strictly to TENANT_BETA`
    );

    // ------------------------------------------------------------------------
    // REQUIREMENT 6: User session with forged tenantId parameter -> restricted to session tenant
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 6] User session forged tenantId ignored`);
    resetDbMocks();

    const originalGetSession = sessionModule.getSessionContext;

    (sessionModule as any).getSessionContext = async () => ({
      user: { id: "u_partner", email: "partner@firm-a.com", name: "Partner A", isSuperAdmin: false },
      membership: { id: "m_a", tenantId: "TENANT_ALPHA", role: Role.PARTNER, status: "ACTIVE" },
      tenant: { id: "TENANT_ALPHA", name: "Firm A", slug: "firm-a", active: true, isSuspended: false },
    });

    const req6_1 = new NextRequest("http://localhost:3000/api/test?tenantId=FORGED_VICTIM_TENANT");
    const res6_1 = await route.handler(req6_1);
    const body6_1 = await res6_1.json();
    assert(
      res6_1.status === 200 &&
        body6_1.success === true &&
        lastFindManyWhere[route.tableKey]?.tenantId === "TENANT_ALPHA",
      `6.1 Forged ?tenantId=FORGED_VICTIM_TENANT ignored; scoped strictly to session tenant (TENANT_ALPHA)`
    );

    // ------------------------------------------------------------------------
    // REQUIREMENT 7: Client role remains denied where required
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 7] Client role denied`);
    resetDbMocks();

    (sessionModule as any).getSessionContext = async () => ({
      user: { id: "u_client", email: "client@client.com", name: "Client Portal User", isSuperAdmin: false },
      membership: { id: "m_c", tenantId: "TENANT_ALPHA", role: Role.CLIENT, status: "ACTIVE" },
      tenant: { id: "TENANT_ALPHA", name: "Firm A", slug: "firm-a", active: true, isSuspended: false },
    });

    const req7_1 = new NextRequest("http://localhost:3000/api/test");
    const res7_1 = await route.handler(req7_1);
    const body7_1 = await res7_1.json();
    assert(
      res7_1.status === 403 && body7_1.code === "FORBIDDEN_ROLE",
      `7.1 CLIENT role strictly forbidden (403 FORBIDDEN_ROLE)`
    );
    assert(
      findManyCalls[route.tableKey] === 0,
      `7.2 Forbidden CLIENT role never executes database findMany (call count: 0)`
    );

    // Restore original getSessionContext
    (sessionModule as any).getSessionContext = originalGetSession;

    // ------------------------------------------------------------------------
    // REQUIREMENT 8: Missing tenant scope never executes an unscoped database query
    // ------------------------------------------------------------------------
    console.log(`\n  [Scenario 8] Unscoped query prevention verified`);
    resetDbMocks();

    // Verify: when tenant scope is missing, database findMany is NEVER called
    const req8_1 = new NextRequest("http://localhost:3000/api/test", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    await route.handler(req8_1);
    assert(
      findManyCalls[route.tableKey] === 0,
      `8.1 Missing tenant scope request never executes database query (findMany count: 0)`
    );

    // Verify: non-existent tenant never calls findMany
    const req8_2 = new NextRequest("http://localhost:3000/api/test?tenantId=NON_EXISTENT", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    await route.handler(req8_2);
    assert(
      findManyCalls[route.tableKey] === 0,
      `8.2 Non-existent tenant request never executes database query (findMany count: 0)`
    );

    // Verify: inactive tenant never calls findMany
    const req8_3 = new NextRequest("http://localhost:3000/api/test?tenantId=INACTIVE_TENANT", {
      headers: createSignedHeaders(TEST_SECRET),
    });
    await route.handler(req8_3);
    assert(
      findManyCalls[route.tableKey] === 0,
      `8.3 Inactive tenant request never executes database query (findMany count: 0)`
    );
  }

  // ==========================================================================
  // FINAL SUITE VERDICT
  // ==========================================================================
  console.log("\n=================================================================");
  console.log(`Phase 2K.1 P0 Regression Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runP0RegressionSuite().catch((err) => {
  console.error("Fatal test execution error:", err);
  process.exit(1);
});
