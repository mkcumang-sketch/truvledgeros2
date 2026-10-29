const { execSync } = require("child_process");
const path = require("path");

const testFile = "tests/calling-operations.test.ts";
process.stdout.write(`\n--- Running ${testFile} ---\n`);

try {
  const cmd = `npx ts-node -O "{\\"module\\":\\"commonjs\\"}" -r tsconfig-paths/register "${testFile}"`;
  execSync(cmd, { stdio: "inherit", cwd: path.join(__dirname, "..") });
  console.log("\n✔ Calling operations test suite passed cleanly!");
} catch (error) {
  console.error(`\n✖ FAILED: ${testFile}`);
  process.exit(1);
}
