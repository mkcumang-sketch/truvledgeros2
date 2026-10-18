import { validateEnvironment, getSanitizedConfigSummary } from "../src/lib/server/env";
import dotenv from "dotenv";

dotenv.config();

function runEnvDiagnostic() {
  console.log("=================================================================");
  console.log("TRUVCA LedgerOS — Preflight Environment & Provider Diagnostic");
  console.log("=================================================================\n");

  const report = validateEnvironment();

  console.log(`Runtime Environment: \x1b[36m${report.environment.toUpperCase()}\x1b[0m`);
  console.log(`Overall Invariant Status: ${report.valid ? "\x1b[32mVALID\x1b[0m" : "\x1b[31mINVALID (Missing Required Configuration)\x1b[0m"}\n`);

  console.log("--- CORE INFRASTRUCTURE CONFIGURATION (Masked) ---");
  const summary = getSanitizedConfigSummary();
  for (const [key, value] of Object.entries(summary)) {
    const isConfigured = value.includes("[CONFIGURED]");
    const color = isConfigured ? "\x1b[32m" : "\x1b[33m";
    console.log(`  ${key.padEnd(20)}: ${color}${value}\x1b[0m`);
  }

  console.log("\n--- THIRD-PARTY PROVIDER INTEGRATION MATRIX ---");
  for (const provider of report.providers) {
    let modeTag = "\x1b[32m[ACTIVE]\x1b[0m";
    if (provider.mode === "STANDBY") modeTag = "\x1b[33m[STANDBY]\x1b[0m";
    if (provider.mode === "DISABLED") modeTag = "\x1b[90m[DISABLED]\x1b[0m";

    console.log(`  ${provider.name.padEnd(35)} ${modeTag} - ${provider.detail}`);
  }

  if (report.missingRequired.length > 0) {
    console.log("\n\x1b[31m✖ MISSING REQUIRED VARIABLES:\x1b[0m");
    for (const item of report.missingRequired) {
      console.log(`  - ${item}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("\n\x1b[33m⚠ CONFIGURATION ADVISORIES:\x1b[0m");
    for (const item of report.warnings) {
      console.log(`  - ${item}`);
    }
  }

  console.log("\n=================================================================");
  if (!report.valid) {
    console.error("Diagnostic Result: FAILED — Fix missing required variables before deployment.");
    process.exit(1);
  } else {
    console.log("Diagnostic Result: PASSED — Core configuration verified. Safe for startup.");
    process.exit(0);
  }
}

runEnvDiagnostic();
