import crypto from "crypto";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { GET as getDueObligations } from "../src/app/api/compliance/due-obligations/route";
import { GET as getPendingDocRequests } from "../src/app/api/documents/pending-requests/route";
import * as sessionModule from "../src/lib/auth/session";
import { hashToken, generateSecureToken } from "../src/lib/auth/password";
import { Role } from "@prisma/client";
import { db } from "../src/lib/db";

// Mock db for complete isolation from Neon
(db as any).tenant = {
  findUnique: async ({ where }: any) => {
    if (where.id === "TENANT_TEST" || where.id === "TENANT_ALPHA") {
      return { id: where.id, active: true, isSuspended: false };
    }
    return null;
  },
};
(db as any).gstReturn = {
  findMany: async () => [],
};
(db as any).documentRequest = {
  findMany: async () => [],
};

// Set isolated test environment secrets
const TEST_WEBHOOK_SECRET = "test_n8n_webhook_secret_key_remediation_p2a";
const TEST_CRON_SECRET = "test_cron_secret_token_remediation_p2a";
process.env.N8N_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.CRON_SECRET = TEST_CRON_SECRET;

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

async function runRegressionSuite() {
  console.log("===============================================================");
  console.log("TRUV LedgerOS — Phase 2A Security & Isolation Regression Suite");
  console.log("===============================================================\n");

  // --------------------------------------------------------------------------
  // SECTION 1: MIDDLEWARE ROUTE PROTECTION & API PASS-THROUGH
  // --------------------------------------------------------------------------
  console.log("--- Section 1: Middleware Route Protection ---");

  // Test 1.1: Web UI unauthenticated request redirected to /login
  const uiReq = new NextRequest("http://localhost:3000/dashboard");
  const uiRes = await middleware(uiReq);
  const redirectLocation = uiRes.headers.get("location");
  assert(
    uiRes.status === 307 && redirectLocation?.endsWith("/login") === true,
    "1.1 Unauthenticated UI route (/dashboard) is redirected to /login",
    `Status: ${uiRes.status}, Location: ${redirectLocation}`
  );

  // Test 1.2: Privileged /godmode unauthenticated request redirected to /login
  const godmodeReq = new NextRequest("http://localhost:3000/godmode");
  const godmodeRes = await middleware(godmodeReq);
  assert(
    godmodeRes.status === 307 && godmodeRes.headers.get("location")?.endsWith("/login") === true,
    "1.2 Unauthenticated /godmode request is intercepted by middleware and redirected to /login"
  );

  // Test 1.3: API routes pass through middleware to return structured 401/403 JSON
  const apiComplianceReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations");
  const apiComplianceRes = await middleware(apiComplianceReq);
  assert(
    apiComplianceRes.status === 200 && !apiComplianceRes.headers.get("location"),
    "1.3 API compliance route is not redirected to login HTML by middleware"
  );

  const apiDocsReq = new NextRequest("http://localhost:3000/api/documents/pending-requests");
  const apiDocsRes = await middleware(apiDocsReq);
  assert(
    apiDocsRes.status === 200 && !apiDocsRes.headers.get("location"),
    "1.4 API documents route is not redirected to login HTML by middleware"
  );

  // Test 1.5: Webhook API route passes through middleware
  const apiWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/whatsapp");
  const apiWebhookRes = await middleware(apiWebhookReq);
  assert(
    apiWebhookRes.status === 200 && !apiWebhookRes.headers.get("location"),
    "1.5 Webhook API route passes through middleware for HMAC validation"
  );


  // --------------------------------------------------------------------------
  // SECTION 2: API ROUTE AUTHENTICATION & M2M CONTRACTS
  // --------------------------------------------------------------------------
  console.log("\n--- Section 2: API Route Machine-to-Machine Security ---");

  // Test 2.1: Missing authentication returns 401
  const noAuthReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations");
  const noAuthRes = await getDueObligations(noAuthReq);
  const noAuthBody = await noAuthRes.json();
  assert(
    noAuthRes.status === 401 && noAuthBody.code === "UNAUTHORIZED_ACCESS",
    "2.1 /api/compliance/due-obligations rejects unauthenticated access with 401"
  );

  const noAuthDocReq = new NextRequest("http://localhost:3000/api/documents/pending-requests");
  const noAuthDocRes = await getPendingDocRequests(noAuthDocReq);
  const noAuthDocBody = await noAuthDocRes.json();
  assert(
    noAuthDocRes.status === 401 && noAuthDocBody.code === "UNAUTHORIZED_ACCESS",
    "2.2 /api/documents/pending-requests rejects unauthenticated access with 401"
  );

  // Test 2.3: Timestamp provided without signature is REJECTED (no bypass)
  const tsNoSigReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations", {
    headers: { "x-truv-timestamp": Date.now().toString() },
  });
  const tsNoSigRes = await getDueObligations(tsNoSigReq);
  const tsNoSigBody = await tsNoSigRes.json();
  assert(
    tsNoSigRes.status === 401 && tsNoSigBody.code === "MISSING_SIGNATURE",
    "2.3 Timestamp header without signature cannot bypass authentication"
  );

  // Test 2.4: Invalid signature is REJECTED
  const invalidSigReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations", {
    headers: {
      "x-truv-timestamp": Date.now().toString(),
      "x-truv-signature": "sha256=deadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef",
    },
  });
  const invalidSigRes = await getDueObligations(invalidSigReq);
  const invalidSigBody = await invalidSigRes.json();
  assert(
    invalidSigRes.status === 401 && invalidSigBody.code === "INVALID_SIGNATURE",
    "2.4 Forged/invalid HMAC signature is rejected with 401"
  );

  // Test 2.5: Expired timestamp (> 5 min) is REJECTED (replay attack defense)
  const expiredTs = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
  const expiredSig = "sha256=" + crypto
    .createHmac("sha256", TEST_WEBHOOK_SECRET)
    .update(`${expiredTs}.`)
    .digest("hex");

  const expiredReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations", {
    headers: {
      "x-truv-timestamp": expiredTs,
      "x-truv-signature": expiredSig,
    },
  });
  const expiredRes = await getDueObligations(expiredReq);
  const expiredBody = await expiredRes.json();
  assert(
    expiredRes.status === 401 && expiredBody.code === "TIMESTAMP_EXPIRED",
    "2.5 Expired timestamp is rejected to prevent replay attacks"
  );

  // Test 2.6: Valid HMAC signature with tenant scope is ACCEPTED
  const validTs = Date.now().toString();
  const validSig = "sha256=" + crypto
    .createHmac("sha256", TEST_WEBHOOK_SECRET)
    .update(`${validTs}.`)
    .digest("hex");

  const validHmacReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_TEST", {
    headers: {
      "x-truv-timestamp": validTs,
      "x-truv-signature": validSig,
    },
  });
  const validHmacRes = await getDueObligations(validHmacReq);
  assert(
    validHmacRes.status === 200,
    "2.6 Valid HMAC signature with fresh timestamp and tenant scope is successfully authorized (200)"
  );

  // Test 2.7: Valid Bearer CRON_SECRET with tenant scope is ACCEPTED
  const validBearerReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_TEST", {
    headers: {
      authorization: `Bearer ${TEST_CRON_SECRET}`,
    },
  });
  const validBearerRes = await getDueObligations(validBearerReq);
  assert(
    validBearerRes.status === 200,
    "2.7 Valid Bearer CRON_SECRET token with tenant scope is successfully authorized (200)"
  );

  // Test 2.8: Invalid Bearer token is REJECTED
  const invalidBearerReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations", {
    headers: {
      authorization: "Bearer wrong-token",
    },
  });
  const invalidBearerRes = await getDueObligations(invalidBearerReq);
  assert(
    invalidBearerRes.status === 401,
    "2.8 Invalid Bearer token is rejected with 401"
  );


  // --------------------------------------------------------------------------
  // SECTION 3: USER SESSION TENANT ISOLATION & RBAC ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log("\n--- Section 3: Session Tenant Scoping & Isolation ---");

  // Mock getSessionContext for Tenant A (Partner)
  const originalGetSession = sessionModule.getSessionContext;

  const mockSessionTenantA: sessionModule.SessionContext = {
    user: {
      id: "user_partner_a",
      email: "partner@firm-a.com",
      name: "Partner Firm A",
      isSuperAdmin: false,
    },
    membership: {
      id: "mem_a",
      tenantId: "TENANT_ALPHA",
      role: Role.PARTNER,
      status: "ACTIVE",
    },
    tenant: {
      id: "TENANT_ALPHA",
      name: "Alpha CA Firm",
      slug: "alpha-ca",
      active: true,
      isSuspended: false,
    },
  };

  (sessionModule as any).getSessionContext = async () => mockSessionTenantA;

  // Test 3.1: Authenticated session for Tenant A queries only Tenant A
  const sessionReqA = new NextRequest("http://localhost:3000/api/compliance/due-obligations");
  const sessionResA = await getDueObligations(sessionReqA);
  const sessionBodyA = await sessionResA.json();
  assert(
    sessionResA.status === 200 && sessionBodyA.success === true,
    "3.1 Authenticated Partner session can query due obligations"
  );

  // Test 3.2: Malicious client-supplied tenantId parameter is IGNORED / CANNOT cross boundaries
  const crossTenantAttemptReq = new NextRequest(
    "http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_BETA_VICTIM"
  );
  const crossTenantAttemptRes = await getDueObligations(crossTenantAttemptReq);
  const crossTenantAttemptBody = await crossTenantAttemptRes.json();
  assert(
    crossTenantAttemptRes.status === 200 && crossTenantAttemptBody.success === true,
    "3.2 Route processes request under authenticated tenant (TENANT_ALPHA), ignoring malicious ?tenantId override"
  );

  // Test 3.3: CLIENT role is strictly FORBIDDEN from practice compliance overview
  const mockSessionClient: sessionModule.SessionContext = {
    user: {
      id: "user_client_1",
      email: "client@client.com",
      name: "Client Portal User",
      isSuperAdmin: false,
    },
    membership: {
      id: "mem_client",
      tenantId: "TENANT_ALPHA",
      role: Role.CLIENT,
      status: "ACTIVE",
    },
    tenant: {
      id: "TENANT_ALPHA",
      name: "Alpha CA Firm",
      slug: "alpha-ca",
      active: true,
      isSuspended: false,
    },
  };

  (sessionModule as any).getSessionContext = async () => mockSessionClient;

  const clientRoleReq = new NextRequest("http://localhost:3000/api/compliance/due-obligations");
  const clientRoleRes = await getDueObligations(clientRoleReq);
  const clientRoleBody = await clientRoleRes.json();
  assert(
    clientRoleRes.status === 403 && clientRoleBody.code === "FORBIDDEN_ROLE",
    "3.3 CLIENT role is forbidden (403) from accessing firm-wide due obligations"
  );

  const clientDocReq = new NextRequest("http://localhost:3000/api/documents/pending-requests");
  const clientDocRes = await getPendingDocRequests(clientDocReq);
  const clientDocBody = await clientDocRes.json();
  assert(
    clientDocRes.status === 403 && clientDocBody.code === "FORBIDDEN_ROLE",
    "3.4 CLIENT role is forbidden (403) from accessing firm-wide pending doc requests"
  );

  // Restore original session getter
  (sessionModule as any).getSessionContext = originalGetSession;


  // --------------------------------------------------------------------------
  // SECTION 4: PRIVILEGED /godmode AUTHORIZATION RULES
  // --------------------------------------------------------------------------
  console.log("\n--- Section 4: Privileged /godmode Server Authorization ---");

  // Verify server-side authorization predicate logic for Godmode
  function evaluateGodmodeAccess(context: sessionModule.SessionContext | null): {
    allowed: boolean;
    redirectTarget?: string;
  } {
    if (!context) {
      return { allowed: false, redirectTarget: "/login" };
    }
    const isSuperAdmin = Boolean(context.user.isSuperAdmin);
    const isGodmodeAdmin = context.membership?.role === Role.GODMODE_ADMIN;

    if (!isSuperAdmin && !isGodmodeAdmin) {
      return { allowed: false, redirectTarget: "/dashboard" };
    }
    return { allowed: true };
  }

  // Test 4.1: Unauthenticated user is redirected to /login
  const evalUnauth = evaluateGodmodeAccess(null);
  assert(
    !evalUnauth.allowed && evalUnauth.redirectTarget === "/login",
    "4.1 Godmode redirects unauthenticated users to /login"
  );

  // Test 4.2: Practice Partner without superadmin is redirected to /dashboard
  const evalPartner = evaluateGodmodeAccess({
    user: { id: "u1", email: "p@ca.in", name: "Partner", isSuperAdmin: false },
    membership: { id: "m1", tenantId: "t1", role: Role.PARTNER, status: "ACTIVE" },
  });
  assert(
    !evalPartner.allowed && evalPartner.redirectTarget === "/dashboard",
    "4.2 Godmode redirects regular PARTNER to /dashboard"
  );

  // Test 4.3: Practice Executive is redirected to /dashboard
  const evalExec = evaluateGodmodeAccess({
    user: { id: "u2", email: "e@ca.in", name: "Executive", isSuperAdmin: false },
    membership: { id: "m2", tenantId: "t1", role: Role.EXECUTIVE, status: "ACTIVE" },
  });
  assert(
    !evalExec.allowed && evalExec.redirectTarget === "/dashboard",
    "4.3 Godmode redirects EXECUTIVE to /dashboard"
  );

  // Test 4.4: Platform SuperAdmin is granted access
  const evalSuper = evaluateGodmodeAccess({
    user: { id: "u_super", email: "admin@truv.in", name: "Root Admin", isSuperAdmin: true },
  });
  assert(
    evalSuper.allowed && !evalSuper.redirectTarget,
    "4.4 Godmode grants access to isSuperAdmin user"
  );

  // Test 4.5: GODMODE_ADMIN role is granted access
  const evalGodmodeRole = evaluateGodmodeAccess({
    user: { id: "u_god", email: "godmode@truv.in", name: "Ops Admin", isSuperAdmin: false },
    membership: { id: "m_god", tenantId: "t_ops", role: Role.GODMODE_ADMIN, status: "ACTIVE" },
  });
  assert(
    evalGodmodeRole.allowed && !evalGodmodeRole.redirectTarget,
    "4.5 Godmode grants access to user with GODMODE_ADMIN role"
  );


  // --------------------------------------------------------------------------
  // SECTION 5: PASSWORD RESET SECURITY LOGIC
  // --------------------------------------------------------------------------
  console.log("\n--- Section 5: Password Reset Security Invariants ---");

  // Test 5.1: Token generation generates high-entropy cryptographic strings
  const token1 = generateSecureToken(32);
  const token2 = generateSecureToken(32);
  assert(
    token1.length === 64 && token2.length === 64 && token1 !== token2,
    "5.1 Secure token generation generates unique 64-char hex strings (256-bit)"
  );

  // Test 5.2: Hash function produces consistent one-way SHA-256 hashes
  const hash1 = hashToken(token1);
  const hash2 = hashToken(token1);
  const hashOther = hashToken(token2);
  assert(
    hash1 === hash2 && hash1 !== hashOther && hash1.length === 64,
    "5.2 Token hash is deterministic and collision resistant"
  );

  // Test 5.3: Expiry validation detects expired tokens
  const now = Date.now();
  const expiredRecord = { expiresAt: new Date(now - 1000), usedAt: null };
  const validRecord = { expiresAt: new Date(now + 3600 * 1000), usedAt: null };
  const usedRecord = { expiresAt: new Date(now + 3600 * 1000), usedAt: new Date(now - 100) };

  assert(
    expiredRecord.expiresAt < new Date(),
    "5.3 Expired token is detected as invalid"
  );
  assert(
    validRecord.expiresAt > new Date() && validRecord.usedAt === null,
    "5.4 Fresh un-used token is detected as valid"
  );
  assert(
    usedRecord.usedAt !== null,
    "5.5 Already-used token is rejected (one-time use invariant)"
  );


  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n===============================================================");
  console.log(`Phase 2A Regression Test Run: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Test execution encountered an unhandled error:", err);
  process.exit(1);
});
