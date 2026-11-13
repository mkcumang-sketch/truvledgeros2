const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const testsDirectory = path.join(__dirname, "..", "tests");
const testFiles = fs
  .readdirSync(testsDirectory)
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => path.join("tests", file));

if (testFiles.length === 0) {
  console.error("No test suites were found in tests/.");
  process.exit(1);
}

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
  process.stdout.write(`\n--- Running ${testFile} ---\n`);
  try {
    const cmd = `npx ts-node -O "{\\\"module\\\":\\\"commonjs\\\"}" -r tsconfig-paths/register "${testFile}"`;
    execSync(cmd, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "test" },
    });
    totalPassed++;
  } catch (error) {
    console.error(`FAILED: ${testFile}`);
    totalFailed++;
  }
}

console.log("\n========================================");
console.log(`Summary: ${totalPassed} test suites passed, ${totalFailed} failed (of ${testFiles.length}).`);
console.log("========================================\n");

if (totalFailed > 0) {
  process.exit(1);
}
