import crypto from "crypto";
import { NextRequest } from "next/server";
import { GET as getDueObligations } from "../src/app/api/compliance/due-obligations/route";
import { GET as getPendingDocRequests } from "../src/app/api/documents/pending-requests/route";
import { POST as n8nWebhookPost } from "../src/app/api/webhooks/n8n/route";
import { db } from "../src/lib/db";
import { getDefaultKeyring } from "../src/lib/server/security/keyring";
import {
  encryptRecoverableSecret,
  computeBearerTokenDigest,
  generateBearerToken,
} from "../src/lib/server/security/credential-vault";

// ============================================================================
// ISOLATED IN-MEMORY TEST ENVIRONMENT (ZERO DB / NETWORK CALLS)
// ============================================================================

const TEST_ENC_KEY_HEX = "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f801";
const TEST_PEPPER_HEX = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

// Configure default keyring for test suite
const keyring = getDefaultKeyring();
try {
  keyring.registerEncryptionKey(1, TEST_ENC_KEY_HEX);
  keyring.setPrimaryEncryptionKeyVersion(1);
} catch {
  // Already registered
}
try {
  keyring.registerPepper(1, TEST_PEPPER_HEX);
  keyring.setPrimaryPepperVersion(1);
} catch {
  // Already registered
}

// Test credentials
const RAW_HMAC_SECRET_A = "hmac_secret_alpha_raw_32bytes_k1";
const RAW_BEARER_TOKEN_A = "truv_m2m_alpha_token_raw_secure_k1";
const RAW_BEARER_TOKEN_B = "truv_m2m_beta_token_raw_secure_k1";

// 1. Contract A Encrypted HMAC record for Tenant Alpha
const encHmacResultAlpha = encryptRecoverableSecret({
  plaintext: RAW_HMAC_SECRET_A,
  tenantId: "TENANT_ALPHA",
  provider: "N8N_M2M",
  integrationId: "integ_enc_hmac_alpha",
  keyVersion: 1,
  keyring,
});

// 2. Contract B Blinded Digest Bearer tokens
const digestTokenAlpha = computeBearerTokenDigest({
  token: RAW_BEARER_TOKEN_A,
  pepperVersion: 1,
  keyring,
});

const digestTokenBeta = computeBearerTokenDigest({
  token: RAW_BEARER_TOKEN_B,
  pepperVersion: 1,
  keyring,
});

let findManyCalls = { gstReturn: 0, documentRequest: 0, auditLog: 0, notification: 0 };
let lastFindManyWhere: any = {};

function resetTestMocks() {
  findManyCalls = { gstReturn: 0, documentRequest: 0, auditLog: 0, notification: 0 };
  lastFindManyWhere = {};

  (db as any).tenant = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id === "TENANT_ALPHA") {
        return { id: "TENANT_ALPHA", active: true, isSuspended: false, docReminderLimit: 3 };
      }
      if (where.id === "TENANT_BETA") {
        return { id: "TENANT_BETA", active: true, isSuspended: false, docReminderLimit: 3 };
      }
      return null;
    },
  };

  (db as any).integration = {
    findFirst: async ({ where }: { where: any }) => {
      // 1. Lookup by encryptedCredentials (digest or plaintext)
      if (where.encryptedCredentials) {
        if (where.encryptedCredentials === digestTokenAlpha.digestEnvelope) {
          return {
            id: "integ_digest_token_alpha",
            tenantId: "TENANT_ALPHA",
            provider: "M2M_BEARER",
            encryptedCredentials: digestTokenAlpha.digestEnvelope,
            iv: "",
            authTag: "",
            status: "ACTIVE",
          };
        }
        if (where.encryptedCredentials === digestTokenBeta.digestEnvelope) {
          return {
            id: "integ_digest_token_beta",
            tenantId: "TENANT_BETA",
            provider: "M2M_BEARER",
            encryptedCredentials: digestTokenBeta.digestEnvelope,
            iv: "",
            authTag: "",
            status: "ACTIVE",
          };
        }
        return null;
      }

      // 2. Lookup by tenantId (HMAC integration)
      if (where.tenantId === "TENANT_ALPHA") {
        return {
          id: "integ_enc_hmac_alpha",
          tenantId: "TENANT_ALPHA",
          provider: "N8N_M2M",
          encryptedCredentials: encHmacResultAlpha.encryptedCredentials,
          iv: encHmacResultAlpha.iv,
          authTag: encHmacResultAlpha.authTag,
          status: "ACTIVE",
        };
      }

      return null;
    },
    findMany: async () => [],
  };

  (db as any).gstReturn = {
    findMany: async ({ where }: any) => {
      findManyCalls.gstReturn++;
      lastFindManyWhere.gstReturn = where;
      return [{ id: "ret_001", tenantId: where.tenantId, returnType: "GSTR_1", period: "092026", dueDate: new Date(), status: "DATA_PENDING" }];
    },
  };

  (db as any).documentRequest = {
    findMany: async ({ where }: any) => {
      findManyCalls.documentRequest++;
      lastFindManyWhere.documentRequest = where;
      return [{ id: "doc_001", tenantId: where.tenantId, title: "Ledger", status: "PENDING" }];
    },
  };

  (db as any).auditLog = {
    findFirst: async () => null,
    create: async () => { findManyCalls.auditLog++; return { id: "audit_1" }; },
  };

  (db as any).notification = {
    create: async () => { findManyCalls.notification++; return { id: "notif_1" }; },
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

async function runVaultIntegrationSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Credential Vault Integration Verification Suite");
  console.log("=================================================================\n");

  resetTestMocks();

  // --------------------------------------------------------------------------
  // TEST 1: Contract A AES-256-GCM Encrypted HMAC secret verification
  // --------------------------------------------------------------------------
  console.log(">>> [Test 1] Encrypted HMAC Secret Decryption & Verification <<<");
  const hmacHeadersA = createSignedHeaders(RAW_HMAC_SECRET_A);
  const req1 = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_ALPHA", {
    headers: hmacHeadersA,
  });
  const res1 = await getDueObligations(req1);
  const body1 = await res1.json();
  assert(res1.status === 200 && body1.success === true, "1.1 Valid HMAC with AES-GCM encrypted secret authorized (200)");
  assert(lastFindManyWhere.gstReturn?.tenantId === "TENANT_ALPHA", "1.2 Query scoped strictly to TENANT_ALPHA");

  // --------------------------------------------------------------------------
  // TEST 2: Tampered AES-256-GCM HMAC secret fails closed
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 2] Tampered Encrypted Secret Fails Closed <<<");
  (db as any).integration.findFirst = async () => ({
    id: "integ_enc_hmac_alpha",
    tenantId: "TENANT_ALPHA",
    provider: "N8N_M2M",
    encryptedCredentials: encHmacResultAlpha.encryptedCredentials,
    iv: encHmacResultAlpha.iv,
    authTag: "00".repeat(16), // Corrupted auth tag
    status: "ACTIVE",
  });
  const req2 = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_ALPHA", {
    headers: hmacHeadersA,
  });
  const res2 = await getDueObligations(req2);
  const body2 = await res2.json();
  assert(res2.status === 401 && body2.code === "INVALID_CREDENTIALS", "2.1 Tampered auth tag fails closed (401 INVALID_CREDENTIALS)");

  // --------------------------------------------------------------------------
  // TEST 3: Contract B Blinded Digest Bearer Token Verification
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 3] Blinded Digest Bearer Token Verification <<<");
  resetTestMocks();
  const req3 = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_ALPHA", {
    headers: { authorization: `Bearer ${RAW_BEARER_TOKEN_A}` },
  });
  const res3 = await getDueObligations(req3);
  const body3 = await res3.json();
  assert(res3.status === 200 && body3.success === true, "3.1 Valid raw bearer token matching stored digest authorized (200)");
  assert(lastFindManyWhere.gstReturn?.tenantId === "TENANT_ALPHA", "3.2 Query scoped strictly to TENANT_ALPHA");

  // --------------------------------------------------------------------------
  // TEST 4: Invalid raw bearer token rejected
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 4] Invalid Raw Bearer Token Rejected <<<");
  resetTestMocks();
  const req4 = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_ALPHA", {
    headers: { authorization: "Bearer invalid_bearer_token_wrong" },
  });
  const res4 = await getDueObligations(req4);
  const body4 = await res4.json();
  assert(res4.status === 401 && body4.code === "INVALID_CREDENTIALS", "4.1 Invalid bearer token rejected (401 INVALID_CREDENTIALS)");

  // --------------------------------------------------------------------------
  // TEST 5: Cross-Tenant Prevention with Blinded Digest Bearer Token
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 5] Cross-Tenant Prevention with Digest Bearer Token <<<");
  resetTestMocks();
  // Caller presents Tenant Alpha's bearer token, but requests Tenant Beta!
  const req5 = new NextRequest("http://localhost:3000/api/compliance/due-obligations?tenantId=TENANT_BETA", {
    headers: { authorization: `Bearer ${RAW_BEARER_TOKEN_A}` },
  });
  const res5 = await getDueObligations(req5);
  const body5 = await res5.json();
  assert(res5.status === 403 && body5.code === "CROSS_TENANT_FORBIDDEN", "5.1 Cross-tenant bearer request rejected (403 CROSS_TENANT_FORBIDDEN)");
  assert(findManyCalls.gstReturn === 0, "5.2 Zero database findMany executions on cross-tenant attempt");

  // --------------------------------------------------------------------------
  // TEST 6: Webhook Route AES-GCM Decryption
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 6] Webhook Route Inbound AES-GCM Decryption <<<");
  resetTestMocks();
  const webhookBody = JSON.stringify({
    action: "RECORD_FAILURE_ALERT",
    tenantId: "TENANT_ALPHA",
    idempotencyKey: "test_idemp_key_12345",
    payload: { workflowName: "InvoiceSync", errorSummary: "Sync failed" },
  });
  const webhookHeaders = createSignedHeaders(RAW_HMAC_SECRET_A, Date.now(), webhookBody);
  const req6 = new NextRequest("http://localhost:3000/api/webhooks/n8n", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-truv-tenant-id": "TENANT_ALPHA",
      ...webhookHeaders,
    },
    body: webhookBody,
  });
  const res6 = await n8nWebhookPost(req6);
  const body6 = await res6.json();
  assert(res6.status === 200 && body6.success === true, "6.1 Webhook POST decrypted tenant secret and authorized signature (200)");

  console.log("\n=================================================================");
  console.log(`Vault Integration Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVaultIntegrationSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
