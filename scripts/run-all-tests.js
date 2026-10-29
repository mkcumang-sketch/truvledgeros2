const { execSync } = require("child_process");
const path = require("path");

const testFiles = [
  "tests/security.test.ts",
  "tests/phase2a-security-remediation.test.ts",
  "tests/password-reset-concurrency.test.ts",
  "tests/phase3-financial.test.ts",
  "tests/client-360.test.ts",
  "tests/bulk-import.test.ts",
  "tests/accounting-workflows.test.ts",
  "tests/automation-engine.test.ts",
  "tests/workflow-schema-validation.test.ts",
  "tests/phase4-e2e-automation.test.ts",
  "tests/login-security-hotfix.test.ts",
  "tests/team-rbac-invitation.test.ts",
  "tests/role-hierarchy-tenant-isolation.test.ts",
  "tests/e2e-ca-practice-scenarios.test.ts",
  "tests/invitation-standby-safety.test.ts",
  "tests/env-validation.test.ts",
  "tests/db-readiness-guard.test.ts",
  "tests/calling-operations.test.ts",
];

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
  process.stdout.write(`\n--- Running ${testFile} ---\n`);
  try {
    const cmd = `npx ts-node -O "{\\"module\\":\\"commonjs\\"}" -r tsconfig-paths/register "${testFile}"`;
    execSync(cmd, { stdio: "inherit", cwd: path.join(__dirname, "..") });
    totalPassed++;
  } catch (error) {
    console.error(`FAILED: ${testFile}`);
    totalFailed++;
  }
}

console.log(`\n========================================`);
console.log(`Summary: ${totalPassed} test suites passed, ${totalFailed} failed.`);
console.log(`========================================\n`);

if (totalFailed > 0) {
  process.exit(1);
}
