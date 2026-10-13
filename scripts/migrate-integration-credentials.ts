import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  getDefaultKeyring,
  Keyring,
  KeyUnavailableException,
} from "../src/lib/server/security/keyring";
import {
  classifyCredentialFormat,
  encryptRecoverableSecret,
  computeBearerTokenDigest,
  CredentialFormat,
} from "../src/lib/server/security/credential-vault";

export type TargetContract = "RECOVERABLE" | "DIGEST" | "UNSPECIFIED";

export interface MigrationRecordLog {
  timestamp: string;
  integrationId: string;
  tenantId: string;
  provider: string;
  currentFormat: CredentialFormat;
  targetContract: TargetContract;
  newFormat: CredentialFormat | null;
  keyVersion: number | null;
  dryRun: boolean;
  status:
    | "MIGRATED"
    | "SKIPPED_ALREADY_MIGRATED"
    | "SKIPPED_EMPTY"
    | "QUARANTINED_MALFORMED"
    | "CONCURRENCY_CONFLICT"
    | "FAILED";
  error?: string;
}

export interface MigrationOptions {
  dryRun: boolean;
  execute: boolean;
  confirmLiveMigration: boolean;
  tenantId?: string;
  provider?: string;
  forcedContract?: TargetContract;
  batchSize?: number;
  logDir?: string;
  keyring?: Keyring;
}

export interface MigrationSummary {
  dryRun: boolean;
  totalInspected: number;
  migrated: number;
  skippedAlreadyMigrated: number;
  skippedEmpty: number;
  quarantinedMalformed: number;
  concurrencyConflicts: number;
  failed: number;
  logFilePath: string;
}

/**
 * Determines the target vault contract based on actual verified consumer usage:
 * - HMAC/Webhook callers and outgoing third-party connectors REQUIRE recoverable secrets (Contract A).
 * - Machine bearer tokens and API keys are verified via one-way digest comparison (Contract B).
 */
export function determineTargetContract(provider: string, override?: TargetContract): TargetContract {
  if (override && override !== "UNSPECIFIED") {
    return override;
  }

  const p = (provider || "").trim().toUpperCase();

  // Pure Machine Bearer Token consumers (Contract B: Blinded HMAC-SHA256 digest)
  if (["M2M_BEARER", "M2M_AUTH", "CRON", "API_KEY"].includes(p)) {
    return "DIGEST";
  }

  // HMAC, Webhook, and External API Connectors (Contract A: AES-256-GCM recoverable)
  if (
    [
      "N8N_M2M",
      "M2M_HMAC",
      "WEBHOOK",
      "ZOHO_BOOKS",
      "TALLY",
      "QUICKBOOKS",
      "WHATSAPP",
      "SARVAM_VOICE",
      "SMTP",
      "OPENAI",
    ].includes(p)
  ) {
    return "RECOVERABLE";
  }

  // Conservative default for unknown providers: Recoverable secret (fails safe, never destroys access)
  return "RECOVERABLE";
}

/**
 * Runs safe credential migration with enforced dry-run by default,
 * optimistic concurrency control, and secret-free audit logging.
 */
export async function runCredentialMigration(options: MigrationOptions): Promise<MigrationSummary> {
  const isDryRun = options.dryRun || !options.execute || !options.confirmLiveMigration;

  // Strict Safeguard: To write to DB, operator MUST explicitly pass BOTH flags
  if (options.execute && !options.confirmLiveMigration) {
    throw new Error(
      "PRODUCTION WRITE BLOCKED: Execution requires explicit '--confirm-live-migration' confirmation flag."
    );
  }

  const activeKeyring = options.keyring ?? getDefaultKeyring();
  const logDir = options.logDir ?? path.resolve(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFilePath = path.join(logDir, `migration_ledger_${timestamp}.jsonl`);
  fs.writeFileSync(logFilePath, "", { flag: "a" });
  const writeLog = (entry: MigrationRecordLog) => {
    fs.appendFileSync(logFilePath, JSON.stringify(entry) + "\n", "utf8");
  };

  const summary: MigrationSummary = {
    dryRun: isDryRun,
    totalInspected: 0,
    migrated: 0,
    skippedAlreadyMigrated: 0,
    skippedEmpty: 0,
    quarantinedMalformed: 0,
    concurrencyConflicts: 0,
    failed: 0,
    logFilePath,
  };

  const whereClause: any = {};
  if (options.tenantId) {
    whereClause.tenantId = options.tenantId.trim();
  }
  if (options.provider) {
    whereClause.provider = options.provider.trim();
  }

  // Query records in batches
  const batchSize = options.batchSize || 25;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const records = await db.integration.findMany({
      where: whereClause,
      select: {
        id: true,
        tenantId: true,
        provider: true,
        encryptedCredentials: true,
        iv: true,
        authTag: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      skip,
    });

    if (records.length === 0) {
      break;
    }

    summary.totalInspected += records.length;
    skip += records.length;

    for (const record of records) {
      const currentFormat = classifyCredentialFormat(record);
      const targetContract = determineTargetContract(record.provider, options.forcedContract);

      const logEntry: MigrationRecordLog = {
        timestamp: new Date().toISOString(),
        integrationId: record.id,
        tenantId: record.tenantId,
        provider: record.provider,
        currentFormat,
        targetContract,
        newFormat: null,
        keyVersion: null,
        dryRun: isDryRun,
        status: "FAILED",
      };

      // 1. Skip already migrated records
      if (
        (targetContract === "RECOVERABLE" && currentFormat === "V1_ENCRYPTED") ||
        (targetContract === "DIGEST" && currentFormat === "V1_DIGEST")
      ) {
        summary.skippedAlreadyMigrated++;
        logEntry.status = "SKIPPED_ALREADY_MIGRATED";
        writeLog(logEntry);
        continue;
      }

      // 2. Quarantine malformed records (fail closed, zero mutation)
      if (currentFormat === "MALFORMED") {
        summary.quarantinedMalformed++;
        logEntry.status = "QUARANTINED_MALFORMED";
        logEntry.error = "Unrecognized or corrupted credential envelope format.";
        writeLog(logEntry);
        continue;
      }

      // 3. Skip empty records
      if (currentFormat === "EMPTY") {
        summary.skippedEmpty++;
        logEntry.status = "SKIPPED_EMPTY";
        writeLog(logEntry);
        continue;
      }

      // 4. Migrate LEGACY_PLAINTEXT
      try {
        const rawSecret = record.encryptedCredentials.trim();
        let newEncryptedCredentials = "";
        let newIv = "";
        let newAuthTag = "";
        let keyVer: number | null = null;
        let newFormat: CredentialFormat = "LEGACY_PLAINTEXT";

        if (targetContract === "RECOVERABLE") {
          const encResult = encryptRecoverableSecret({
            plaintext: rawSecret,
            tenantId: record.tenantId,
            provider: record.provider,
            integrationId: record.id,
            keyring: activeKeyring,
          });
          newEncryptedCredentials = encResult.encryptedCredentials;
          newIv = encResult.iv;
          newAuthTag = encResult.authTag;
          keyVer = encResult.keyVersion;
          newFormat = "V1_ENCRYPTED";
        } else if (targetContract === "DIGEST") {
          const digestResult = computeBearerTokenDigest({
            token: rawSecret,
            keyring: activeKeyring,
          });
          newEncryptedCredentials = digestResult.digestEnvelope;
          newIv = "";
          newAuthTag = "";
          keyVer = digestResult.pepperVersion;
          newFormat = "V1_DIGEST";
        }

        logEntry.newFormat = newFormat;
        logEntry.keyVersion = keyVer;

        if (isDryRun) {
          summary.migrated++;
          logEntry.status = "MIGRATED";
          writeLog(logEntry);
        } else {
          // Optimistic Concurrency Control: verify updatedAt hasn't changed
          const updateResult = await db.integration.updateMany({
            where: {
              id: record.id,
              updatedAt: record.updatedAt,
            },
            data: {
              encryptedCredentials: newEncryptedCredentials,
              iv: newIv,
              authTag: newAuthTag,
            },
          });

          if (updateResult.count === 1) {
            summary.migrated++;
            logEntry.status = "MIGRATED";
            writeLog(logEntry);
          } else {
            summary.concurrencyConflicts++;
            logEntry.status = "CONCURRENCY_CONFLICT";
            logEntry.error = "Record was modified concurrently by another transaction.";
            writeLog(logEntry);
          }
        }
      } catch (err: any) {
        summary.failed++;
        logEntry.status = "FAILED";
        logEntry.error = err.message || "Unknown cryptographic migration error.";
        writeLog(logEntry);
      }
    }

    if (records.length < batchSize) {
      hasMore = false;
    }
  }

  return summary;
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const dryRunFlag = args.includes("--dry-run");
  const executeFlag = args.includes("--execute");
  const confirmFlag = args.includes("--confirm-live-migration");

  const tenantIdArg = args.find((a) => a.startsWith("--tenant-id="))?.split("=")[1];
  const providerArg = args.find((a) => a.startsWith("--provider="))?.split("=")[1];
  const contractArg = args.find((a) => a.startsWith("--target-contract="))?.split("=")[1] as TargetContract;

  console.log("=================================================================");
  console.log("TRUV LedgerOS — Credential Vault Migration Tool");
  console.log("=================================================================");

  const options: MigrationOptions = {
    dryRun: dryRunFlag || !executeFlag || !confirmFlag,
    execute: executeFlag,
    confirmLiveMigration: confirmFlag,
    tenantId: tenantIdArg,
    provider: providerArg,
    forcedContract: contractArg,
  };

  if (options.dryRun) {
    console.log("MODE: [DRY-RUN ENFORCED] — Zero database writes will occur.\n");
  } else {
    console.log("MODE: [LIVE EXECUTION] — Modifying records with optimistic locking.\n");
  }

  try {
    const summary = await runCredentialMigration(options);

    console.log("-----------------------------------------------------------------");
    console.log("Migration Execution Summary:");
    console.log(`- Enforced Mode:           ${summary.dryRun ? "DRY-RUN (Safe Read-Only)" : "LIVE WRITE"}`);
    console.log(`- Total Inspected:         ${summary.totalInspected}`);
    console.log(`- Migrated:                ${summary.migrated}`);
    console.log(`- Already Migrated:        ${summary.skippedAlreadyMigrated}`);
    console.log(`- Skipped Empty:           ${summary.skippedEmpty}`);
    console.log(`- Quarantined Malformed:   ${summary.quarantinedMalformed}`);
    console.log(`- Concurrency Conflicts:   ${summary.concurrencyConflicts}`);
    console.log(`- Failed:                  ${summary.failed}`);
    console.log(`- Secret-Free Ledger:      ${summary.logFilePath}`);
    console.log("=================================================================");

    if (summary.failed > 0 || summary.concurrencyConflicts > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n[ABORT] Migration failed safety preflight: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
