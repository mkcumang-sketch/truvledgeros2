import fs from "fs";
import path from "path";
import os from "os";
import { db } from "../src/lib/db";
import { Keyring } from "../src/lib/server/security/keyring";
import {
  runCredentialMigration,
  determineTargetContract,
} from "../scripts/migrate-integration-credentials";

// ============================================================================
// ISOLATED MIGRATION TOOL TEST HARNESS (ZERO REMOTE / LIVE DB ACCESS)
// ============================================================================

const TEST_ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_PEPPER = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

const testKeyring = new Keyring({
  primaryEncryptionKeyVersion: 1,
  encryptionKeys: { 1: TEST_ENC_KEY },
  primaryPepperVersion: 1,
  tokenPeppers: { 1: TEST_PEPPER },
});

let updateManyCalls: Array<{ where: any; data: any }> = [];
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

async function runMigrationTestSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Credential Migration Tool Verification Suite");
  console.log("=================================================================\n");

  const tempLogDir = path.join(os.tmpdir(), `truv_mig_test_${Date.now()}`);
  fs.mkdirSync(tempLogDir, { recursive: true });

  // --------------------------------------------------------------------------
  // TEST 1: Contract Determination Mapping
  // --------------------------------------------------------------------------
  console.log(">>> [Test 1] Target Contract Determination Mapping <<<");
  assert(determineTargetContract("N8N_M2M") === "RECOVERABLE", "1.1 N8N_M2M mapped to RECOVERABLE");
  assert(determineTargetContract("M2M_HMAC") === "RECOVERABLE", "1.2 M2M_HMAC mapped to RECOVERABLE");
  assert(determineTargetContract("WEBHOOK") === "RECOVERABLE", "1.3 WEBHOOK mapped to RECOVERABLE");
  assert(determineTargetContract("ZOHO_BOOKS") === "RECOVERABLE", "1.4 ZOHO_BOOKS mapped to RECOVERABLE");
  assert(determineTargetContract("WHATSAPP") === "RECOVERABLE", "1.5 WHATSAPP mapped to RECOVERABLE");
  assert(determineTargetContract("M2M_BEARER") === "DIGEST", "1.6 M2M_BEARER mapped to DIGEST");
  assert(determineTargetContract("M2M_AUTH") === "DIGEST", "1.7 M2M_AUTH mapped to DIGEST");
  assert(determineTargetContract("API_KEY") === "DIGEST", "1.8 API_KEY mapped to DIGEST");
  assert(determineTargetContract("CRON") === "DIGEST", "1.9 CRON mapped to DIGEST");
  assert(
    determineTargetContract("M2M_BEARER", "RECOVERABLE") === "RECOVERABLE",
    "1.10 Operator override respected"
  );

  // --------------------------------------------------------------------------
  // TEST 2: Enforced Dry-Run Mode (Zero Database Writes)
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 2] Enforced Dry-Run Mode Verification <<<");
  updateManyCalls = [];

  const mockRecords = [
    {
      id: "integ_1",
      tenantId: "TENANT_ALPHA",
      provider: "N8N_M2M",
      encryptedCredentials: "raw_secret_alpha_123",
      iv: "none",
      authTag: "none",
      status: "ACTIVE",
      updatedAt: new Date(),
    },
    {
      id: "integ_2",
      tenantId: "TENANT_ALPHA",
      provider: "M2M_BEARER",
      encryptedCredentials: "truv_m2m_token_bearer_123",
      iv: "none",
      authTag: "none",
      status: "ACTIVE",
      updatedAt: new Date(),
    },
  ];

  (db as any).integration = {
    findMany: async () => mockRecords,
    updateMany: async (args: any) => {
      updateManyCalls.push(args);
      return { count: 1 };
    },
  };

  const dryRunSummary = await runCredentialMigration({
    dryRun: true,
    execute: false,
    confirmLiveMigration: false,
    logDir: tempLogDir,
    keyring: testKeyring,
  });

  assert(dryRunSummary.dryRun === true, "2.1 Dry-run mode reported as true");
  assert(dryRunSummary.migrated === 2, "2.2 Dry-run simulates 2 migrations");
  assert(updateManyCalls.length === 0, "2.3 ZERO database updateMany calls executed during dry-run");

  // --------------------------------------------------------------------------
  // TEST 3: Execution Safeguard: Rejection without --confirm-live-migration
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 3] Execution Safeguard Without Confirmation <<<");
  let blockedErrorThrown = false;
  try {
    await runCredentialMigration({
      dryRun: false,
      execute: true,
      confirmLiveMigration: false, // Omitted
      logDir: tempLogDir,
      keyring: testKeyring,
    });
  } catch (err: any) {
    if (err.message.includes("PRODUCTION WRITE BLOCKED")) {
      blockedErrorThrown = true;
    }
  }
  assert(blockedErrorThrown, "3.1 Execution without confirmation flag throws PRODUCTION WRITE BLOCKED");

  // --------------------------------------------------------------------------
  // TEST 4: Live Execution with Optimistic Concurrency Control
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 4] Live Execution with Optimistic Concurrency Control <<<");
  updateManyCalls = [];

  const liveSummary = await runCredentialMigration({
    dryRun: false,
    execute: true,
    confirmLiveMigration: true,
    logDir: tempLogDir,
    keyring: testKeyring,
  });

  assert(liveSummary.dryRun === false, "4.1 Live write mode reported as false");
  assert(liveSummary.migrated === 2, "4.2 Live write successfully migrated 2 records");
  assert(updateManyCalls.length === 2, "4.3 Exactly 2 database updateMany calls executed");
  assert(
    updateManyCalls[0].where.id === "integ_1" && updateManyCalls[0].where.updatedAt !== undefined,
    "4.4 Optimistic locking includes record id and updatedAt predicate"
  );
  assert(
    updateManyCalls[0].data.encryptedCredentials.startsWith("v1:enc:k1:"),
    "4.5 Record 1 written as Contract A AES-256-GCM envelope"
  );
  assert(
    updateManyCalls[1].data.encryptedCredentials.startsWith("v1:digest:p1:"),
    "4.6 Record 2 written as Contract B Blinded Digest envelope"
  );

  // --------------------------------------------------------------------------
  // TEST 5: Concurrency Conflict Handling
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 5] Concurrency Conflict Detection <<<");
  updateManyCalls = [];
  (db as any).integration.updateMany = async () => ({ count: 0 }); // Simulate concurrent modification

  const conflictSummary = await runCredentialMigration({
    dryRun: false,
    execute: true,
    confirmLiveMigration: true,
    logDir: tempLogDir,
    keyring: testKeyring,
  });

  assert(conflictSummary.concurrencyConflicts === 2, "5.1 Zero rows updated detected as concurrency conflicts");
  assert(conflictSummary.migrated === 0, "5.2 Conflicted records not counted as migrated");

  // --------------------------------------------------------------------------
  // TEST 6: Already Migrated & Malformed Handling
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 6] Already Migrated and Malformed Records <<<");
  updateManyCalls = [];

  const mixedRecords = [
    {
      id: "integ_migrated",
      tenantId: "TENANT_ALPHA",
      provider: "N8N_M2M",
      encryptedCredentials: "v1:enc:k1:abcdef123456",
      iv: "0102030405060708090a0b0c",
      authTag: "0102030405060708090a0b0c0d0e0f10",
      status: "ACTIVE",
      updatedAt: new Date(),
    },
    {
      id: "integ_malformed",
      tenantId: "TENANT_ALPHA",
      provider: "N8N_M2M",
      encryptedCredentials: "v1:corrupt_junk",
      iv: "bad_iv",
      authTag: "bad_tag",
      status: "ACTIVE",
      updatedAt: new Date(),
    },
    {
      id: "integ_empty",
      tenantId: "TENANT_ALPHA",
      provider: "N8N_M2M",
      encryptedCredentials: "",
      iv: "",
      authTag: "",
      status: "ACTIVE",
      updatedAt: new Date(),
    },
  ];

  (db as any).integration.findMany = async () => mixedRecords;

  const mixedSummary = await runCredentialMigration({
    dryRun: true,
    execute: false,
    confirmLiveMigration: false,
    logDir: tempLogDir,
    keyring: testKeyring,
  });

  assert(mixedSummary.skippedAlreadyMigrated === 1, "6.1 Already migrated record skipped safely");
  assert(mixedSummary.quarantinedMalformed === 1, "6.2 Malformed record quarantined safely");
  assert(mixedSummary.skippedEmpty === 1, "6.3 Empty record skipped safely");

  // --------------------------------------------------------------------------
  // TEST 7: Secret-Free Audit Log Verification
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 7] Secret-Free Audit Log Verification <<<");
  const logContent = fs.readFileSync(liveSummary.logFilePath, "utf8");
  const logLines = logContent.trim().split("\n").map((line) => JSON.parse(line));

  assert(logLines.length === 2, "7.1 Two structured log entries written to ledger");
  assert(
    !logContent.includes("raw_secret_alpha_123"),
    "7.2 Plaintext HMAC secret NEVER appears in migration ledger"
  );
  assert(
    !logContent.includes("truv_m2m_token_bearer_123"),
    "7.3 Plaintext Bearer token NEVER appears in migration ledger"
  );
  assert(!logContent.includes(TEST_ENC_KEY), "7.4 Master encryption key NEVER appears in migration ledger");
  assert(!logContent.includes(TEST_PEPPER), "7.5 Token pepper NEVER appears in migration ledger");

  // Cleanup temp log dir
  try {
    fs.rmSync(tempLogDir, { recursive: true, force: true });
  } catch {}

  console.log("\n=================================================================");
  console.log(`Migration Tool Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runMigrationTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
