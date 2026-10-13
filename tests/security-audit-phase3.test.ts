import { NextRequest } from "next/server";
import { GET as getAuthMe } from "../src/app/api/auth/me/route";
import { POST as postAiChats } from "../src/app/api/ai-chats/route";
import { GET as getClients, POST as postClients } from "../src/app/api/clients/route";
import { GET as getCronOutbox } from "../src/app/api/cron/outbox-dispatch/route";
import { GET as getDueObligations } from "../src/app/api/compliance/due-obligations/route";
import { getDownloadPresignedUrl } from "../src/lib/server/s3";
import { CreateClientSchema } from "../src/lib/server/client-service";
import { getClientDirectory } from "../src/lib/server/client-service";
import {
  checkPayloadSize,
  sanitizeStringInput,
  SecuritySchemas,
} from "../src/lib/server/security/request-validator";
import {
  rateLimiter,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "../src/lib/server/security/rate-limiter";
import {
  validateUrlForSsrf,
  validateCsrfOrigin,
} from "../src/lib/server/security/ssrf-guard";
import { sanitizeCsvCell } from "../src/lib/server/import/client-import-service";
import { db } from "../src/lib/db";

// ============================================================================
// PHASE 3 SECURITY EVIDENCE SUITE (IN-MEMORY ISOLATION)
// ============================================================================

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

async function runPhase3EvidenceSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Phase 3 Security Evidence Verification Suite");
  console.log("=================================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: Unauthenticated access to private routes (401)
  // --------------------------------------------------------------------------
  console.log(">>> [Category 1] Unauthenticated Access to Private Routes (401) <<<");

  // 1.1 /api/auth/me
  const res1A = await getAuthMe();
  assert(res1A.status === 401, "1.1 GET /api/auth/me without session returns 401 Unauthorized");

  // 1.2 /api/ai-chats
  const req1B = new NextRequest("http://localhost:3000/api/ai-chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "What is Section 43B(h)?" }),
  });
  const res1B = await postAiChats(req1B);
  assert(res1B.status === 401, "1.2 POST /api/ai-chats without session returns 401 Unauthorized");

  // 1.3 /api/clients
  const req1C = new NextRequest("http://localhost:3000/api/clients");
  const res1C = await getClients(req1C);
  assert(res1C.status === 401, "1.3 GET /api/clients without session returns 401 Unauthorized");

  // 1.4 /api/cron/outbox-dispatch
  delete process.env.CRON_SECRET;
  delete process.env.N8N_WEBHOOK_SECRET;
  const req1D = new NextRequest("http://localhost:3000/api/cron/outbox-dispatch");
  const res1D = await getCronOutbox(req1D);
  assert(res1D.status === 401, "1.4 GET /api/cron/outbox-dispatch without configured secret returns 401 UNCONFIGURED_SECRET");

  // --------------------------------------------------------------------------
  // TEST 2: Cross-user / cross-tenant access (403/404)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 2] Cross-User & Cross-Tenant Access Rejection (403/404) <<<");

  // Setup DB mocks for M2M tenant isolation
  (db as any).tenant = {
    findUnique: async ({ where }: any) => {
      if (where.id === "TENANT_ALPHA" || where.id === "TENANT_BETA") {
        return { id: where.id, active: true, isSuspended: false };
      }
      return null;
    },
  };
  (db as any).integration = {
    findFirst: async ({ where }: any) => {
      if (where.encryptedCredentials === "token_tenant_alpha") {
        return {
          id: "integ_a",
          tenantId: "TENANT_ALPHA",
          provider: "M2M_BEARER",
          encryptedCredentials: "token_tenant_alpha",
          status: "ACTIVE",
        };
      }
      return null;
    },
    findMany: async () => [],
  };

  // 2.1 Cross-tenant bearer token access
  const req2A = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_BETA", {
    headers: { authorization: "Bearer token_tenant_alpha" },
  });
  const res2A = await getDueObligations(req2A);
  const body2A = await res2A.json();
  assert(
    res2A.status === 403 && body2A.code === "CROSS_TENANT_FORBIDDEN",
    "2.1 Tenant Alpha token attempting to access Tenant Beta rejected with 403 CROSS_TENANT_FORBIDDEN"
  );

  // 2.2 Cross-tenant S3 presigned download URL
  let s3CrossTenantBlocked = false;
  try {
    await getDownloadPresignedUrl({
      key: "TENANT_BETA/users/usr_123/doc.pdf",
      tenantId: "TENANT_ALPHA",
    });
  } catch (err: any) {
    if (err.message.includes("Cross-tenant access forbidden")) {
      s3CrossTenantBlocked = true;
    }
  }
  assert(s3CrossTenantBlocked, "2.2 S3 download URL generation rejected when accessing key outside tenant boundary");

  // --------------------------------------------------------------------------
  // TEST 3: Mass Assignment Protection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 3] Mass Assignment Protection <<<");

  const attackerPayload = {
    name: "Legitimate Company Pvt Ltd",
    email: "legit@company.com",
    phone: "9876543210",
    // Injected privileged attributes:
    role: "GODMODE_ADMIN",
    isAdmin: true,
    tenantId: "compromised_victim_tenant",
    isSuperAdmin: true,
    balance: 99999999,
  };

  const parsedClient = CreateClientSchema.parse(attackerPayload);
  assert(
    (parsedClient as any).role === undefined &&
      (parsedClient as any).isAdmin === undefined &&
      (parsedClient as any).tenantId === undefined &&
      (parsedClient as any).isSuperAdmin === undefined,
    "3.1 Client creation schema strictly strips injected role, tenantId, and admin flags"
  );

  // --------------------------------------------------------------------------
  // TEST 4: Oversized Payload Rejection (413)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 4] Oversized Payload Rejection (413) <<<");

  const req4 = new NextRequest("http://localhost:3000/api/clients", {
    method: "POST",
    headers: { "content-length": "2097152" }, // 2 MB (> 1MB standard limit)
  });
  const sizeCheckResult = checkPayloadSize(req4, 1024 * 1024);
  assert(sizeCheckResult.valid === false, "4.1 2MB payload marked as exceeding standard 1MB body cap");
  assert(sizeCheckResult.response?.status === 413, "4.2 checkPayloadSize returns HTTP 413 Payload Too Large");

  // --------------------------------------------------------------------------
  // TEST 5: Rate Limiting & Retry-After (429)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 5] Rate Limiting & Retry-After (429) <<<");

  await rateLimiter.clear();
  const testKey = "test:user:brute_force_account";
  const tier = { limit: 5, windowSeconds: 60, lockoutSeconds: 60 };

  for (let i = 0; i < 5; i++) {
    const status = await rateLimiter.check(testKey, tier);
    assert(status.allowed === true, `5.${i + 1} Attempt ${i + 1} allowed (remaining: ${status.remaining})`);
  }

  // 6th attempt must trigger rate limit
  const blockedStatus = await rateLimiter.check(testKey, tier);
  assert(blockedStatus.allowed === false, "5.6 6th attempt blocked by sliding window rate limiter");
  assert(blockedStatus.retryAfterSeconds > 0, "5.7 Positive retryAfterSeconds returned");

  const res429 = createRateLimitResponse(blockedStatus);
  assert(res429.status === 429, "5.8 createRateLimitResponse returns HTTP 429 status code");
  assert(res429.headers.get("Retry-After") !== null, "5.9 Retry-After header present on 429 response");

  // --------------------------------------------------------------------------
  // TEST 6: Malformed Input Rejection (400)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 6] Malformed Input Rejection (400) <<<");

  // Password under 10 chars
  const shortPass = SecuritySchemas.password.safeParse("abc123");
  assert(shortPass.success === false, "6.1 Password under 10 chars rejected");

  // Password over 128 chars
  const longPass = SecuritySchemas.password.safeParse("a".repeat(129));
  assert(longPass.success === false, "6.2 Password over 128 chars rejected");

  // Malformed email
  const badEmail = SecuritySchemas.email.safeParse("invalid@@email..com");
  assert(badEmail.success === false, "6.3 Malformed email address rejected");

  // --------------------------------------------------------------------------
  // TEST 7: XSS & Formula Injection Sanitization
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 7] XSS & Formula Injection Sanitization <<<");

  // CSV Formula Injection
  const csvPayload = "=cmd|' /C calc'!A0";
  const sanitizedCsv = sanitizeCsvCell(csvPayload);
  assert(sanitizedCsv.startsWith("'="), "7.1 CSV formula injection (=cmd) prefixed with apostrophe");

  // Null Byte Injection
  const nullByteStr = "sensitive\0data\x07payload";
  const sanitizedNull = sanitizeStringInput(nullByteStr);
  assert(!sanitizedNull.includes("\0") && !sanitizedNull.includes("\x07"), "7.2 Null bytes and control characters stripped from input");
  assert(sanitizedNull === "sensitivedatapayload", "7.3 Clean string composition preserved");

  // --------------------------------------------------------------------------
  // TEST 8: SQL Injection Parameterization Safety
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 8] SQL Injection Parameterization Safety <<<");

  let executedWhere: any = null;
  (db as any).client = {
    findMany: async ({ where }: any) => {
      executedWhere = where;
      return [];
    },
    count: async () => 0,
  };

  const sqliTerm = "' OR '1'='1' --";
  // Mock tenant session for test
  const sessionModule = await import("../src/lib/auth/session");
  (sessionModule as any).requireTenant = async () => ({
    user: { id: "usr_1" },
    membership: { tenantId: "TENANT_SAFE_ISOLATED" },
    tenant: { id: "TENANT_SAFE_ISOLATED", active: true },
  });

  await getClientDirectory({ search: sqliTerm });
  assert(executedWhere.tenantId === "TENANT_SAFE_ISOLATED", "8.1 SQLi injection string contained as literal search term");
  assert(
    executedWhere.OR?.some((cond: any) => cond.name?.contains === sqliTerm),
    "8.2 SQLi characters parameterized safely in Prisma AST without escaping tenant predicate"
  );

  // --------------------------------------------------------------------------
  // TEST 9: SSRF Defense (169.254.169.254, Loopback, Private IPs)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 9] SSRF Defense (169.254.169.254, Loopback, Private IPs) <<<");

  const testUrls = [
    { url: "http://169.254.169.254/latest/meta-data/", expected: false, desc: "AWS IMDS Metadata IP (169.254.169.254)" },
    { url: "http://127.0.0.1:8080/admin", expected: false, desc: "Loopback IPv4 (127.0.0.1)" },
    { url: "http://localhost:3000/api", expected: false, desc: "Localhost hostname" },
    { url: "http://10.0.0.5/internal", expected: false, desc: "RFC 1918 10.0.0.0/8" },
    { url: "http://192.168.1.1/router", expected: false, desc: "RFC 1918 192.168.0.0/16" },
    { url: "http://172.20.0.1/docker", expected: false, desc: "RFC 1918 172.16.0.0/12" },
    { url: "gopher://127.0.0.1:6379/_flushall", expected: false, desc: "Dangerous Gopher protocol" },
    { url: "https://api.github.com/repos", expected: true, desc: "Legitimate public HTTPS endpoint" },
  ];

  for (const item of testUrls) {
    const result = validateUrlForSsrf(item.url);
    assert(result.safe === item.expected, `9.x SSRF check for ${item.desc}: ${result.safe ? "ALLOWED" : "BLOCKED"}`);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Missing CSRF / Cross-Origin Rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 10] CSRF Origin & Referer Verification <<<");

  // GET is safe
  const getReq = new Request("http://localhost:3000/api/data", { method: "GET" });
  assert(validateCsrfOrigin(getReq) === true, "10.1 Safe GET requests pass origin check");

  // POST with hostile Origin
  const hostilePostReq = new Request("http://localhost:3000/api/clients", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://evil-attacker.com",
    },
  });
  assert(validateCsrfOrigin(hostilePostReq) === false, "10.2 POST with hostile origin (http://evil-attacker.com) rejected");

  // POST with matching Origin
  const validPostReq = new Request("http://localhost:3000/api/clients", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  });
  assert(validateCsrfOrigin(validPostReq) === true, "10.3 POST with matching origin permitted");

  // --------------------------------------------------------------------------
  // TEST 11: List Limit Clamp (Clamped to 100)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Category 11] List Limit Max Clamp (Clamped to 100) <<<");

  let queryTakeValue: number | null = null;
  (db as any).client.findMany = async ({ take }: any) => {
    queryTakeValue = take;
    return [];
  };

  // Attacker asks for 1,000,000 rows
  await getClientDirectory({ pageSize: 1000000 });
  assert(queryTakeValue === 100, "11.1 Requested pageSize of 1,000,000 clamped to hard maximum 100");

  // Negative or 0 pageSize defaults to 1
  await getClientDirectory({ pageSize: -50 });
  assert(queryTakeValue === 1, "11.2 Negative pageSize clamped to minimum 1");

  console.log("\n=================================================================");
  console.log(`Phase 3 Security Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3EvidenceSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
