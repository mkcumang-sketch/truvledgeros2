import { spawnSync } from "child_process";
import { evaluateDatabaseIsolation, sanitizeErrorMessage } from "./db-readiness";
import dotenv from "dotenv";

dotenv.config();

/**
 * TRUVCA LedgerOS — Safe Migration Runner
 * 
 * Guarantees that Prisma migrations are coupled directly to the isolation gate.
 * The migration command cannot accidentally target an unverified or protected database.
 * 
 * Execution flow:
 * 1. Read active process.env (DATABASE_URL and DIRECT_URL).
 * 2. Evaluate isolation against protected database blacklist, staging identity rules, and operator flag.
 * 3. Verify exact endpoint parity between DATABASE_URL and DIRECT_URL.
 * 4. Fail closed (Exit Code 1) if any check fails, without printing credentials.
 * 5. Only if verified, invoke `prisma migrate deploy` in the exact same process context.
 */
export function runSafeMigration() {
  console.log("=================================================================");
  console.log("TRUVCA LedgerOS — Safe Staging Migration Gate");
  console.log("=================================================================\n");

  const evalResult = evaluateDatabaseIsolation({
    isEnforced: true,
  });

  console.log(`Target Database Host: \x1b[36m${evalResult.safeDb.host}\x1b[0m`);
  console.log(`Target Database Name: \x1b[36m${evalResult.safeDb.dbName}\x1b[0m`);
  console.log(`Target Endpoint ID  : \x1b[36m${evalResult.safeDb.baseEndpoint}\x1b[0m`);
  if (evalResult.safeDirect) {
    console.log(`Direct Migration Host: \x1b[36m${evalResult.safeDirect.host}\x1b[0m`);
    console.log(`Direct Migration Name: \x1b[36m${evalResult.safeDirect.dbName}\x1b[0m`);
    console.log(`Direct Endpoint ID  : \x1b[36m${evalResult.safeDirect.baseEndpoint}\x1b[0m`);
  }

  if (!evalResult.isAllowed) {
    console.error("\n\x1b[31m✖ MIGRATION ABORTED BY SAFETY GATE:\x1b[0m");
    for (const reason of evalResult.reasons) {
      console.error(`  - ${sanitizeErrorMessage(reason)}`);
    }
    console.error("\nSafety rule: Migrations can ONLY run against a verified disposable staging database.");
    console.error("Neither the protected business host nor unconfirmed databases can be migrated.");
    console.log("=================================================================");
    process.exit(1);
  }

  console.log("\n\x1b[32m✔ ISOLATION VERIFIED:\x1b[0m Multi-factor preflight passed.");
  console.log(`Verified Staging Endpoint: ${evalResult.safeDb.baseEndpoint}`);
  console.log("Executing 'npx prisma migrate deploy' on verified target...\n");

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
      },
      stdio: "inherit",
    }
  );

  if (result.error) {
    console.error("\x1b[31m✖ Migration execution failed:\x1b[0m", sanitizeErrorMessage(result.error.message));
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\x1b[31m✖ Prisma migrate deploy exited with code ${result.status}\x1b[0m`);
    process.exit(result.status || 1);
  }

  console.log("\n\x1b[32m✔ Staging migrations applied successfully.\x1b[0m");
  console.log("=================================================================");
  process.exit(0);
}

if (require.main === module) {
  runSafeMigration();
}
