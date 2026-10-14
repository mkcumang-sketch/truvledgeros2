import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("TRUV LedgerOS — Production Login Security Hotfix Verification");
  console.log("==========================================================\n");

  const loginPagePath = path.join(__dirname, "../src/app/(auth)/login/page.tsx");
  assert(fs.existsSync(loginPagePath), "Login page file exists at src/app/(auth)/login/page.tsx");

  const loginPageSource = fs.readFileSync(loginPagePath, "utf-8");

  // 1. Verify Quick Practice Login controls are removed
  assert(
    !loginPageSource.toLowerCase().includes("quick practice login"),
    "TEST 1: 'Quick Practice Login' text is completely removed from login UI"
  );

  // 2. Verify hardcoded default passwords are not present
  assert(
    !loginPageSource.includes("Password123!"),
    "TEST 2: Hardcoded 'Password123!' default password is not present"
  );
  assert(
    !loginPageSource.toLowerCase().includes("default credentials"),
    "TEST 3: 'Default credentials' hint label is completely removed"
  );

  // 3. Verify demo-account helper functions and identifiers are removed
  assert(
    !loginPageSource.includes("fillDemoAccount"),
    "TEST 4: 'fillDemoAccount' helper function is removed"
  );
  assert(
    !loginPageSource.includes("priya.kulkarni@truvdemo.in"),
    "TEST 5: Demo owner account 'priya.kulkarni@truvdemo.in' is removed"
  );
  assert(
    !loginPageSource.includes("us7081569@gmail.com"),
    "TEST 6: Demo superadmin account 'us7081569@gmail.com' is removed"
  );
  assert(
    !loginPageSource.includes("ShieldCheck"),
    "TEST 7: Development badge icon 'ShieldCheck' is removed from imports and JSX"
  );

  // 4. Verify authentic login and accessibility features are preserved
  assert(
    loginPageSource.includes('autoComplete="email"') && loginPageSource.includes('autoComplete="current-password"'),
    "TEST 8: Form accessibility attributes (autoComplete email and current-password) are preserved"
  );
  assert(
    loginPageSource.includes('loginAction'),
    "TEST 9: Server action 'loginAction' invocation is preserved"
  );
  assert(
    loginPageSource.includes('href="/forgot-password"'),
    "TEST 10: Navigation link to '/forgot-password' is preserved"
  );
  assert(
    loginPageSource.includes('lockoutSeconds'),
    "TEST 11: Authentication rate-limiting lockout countdown mechanism is preserved"
  );

  // 5. Verify entire (auth) route group does not leak default passwords
  const authDir = path.join(__dirname, "../src/app/(auth)");
  const authFiles = fs.readdirSync(authDir, { recursive: true }) as string[];
  let leakedPasswordInAuth = false;
  for (const relFile of authFiles) {
    if (typeof relFile === "string" && (relFile.endsWith(".tsx") || relFile.endsWith(".ts"))) {
      const fullPath = path.join(authDir, relFile);
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("Password123!")) {
        leakedPasswordInAuth = true;
        console.error(`Leaked password found in ${relFile}`);
      }
    }
  }
  assert(!leakedPasswordInAuth, "TEST 12: Zero occurrences of hardcoded 'Password123!' in entire (auth) directory");

  console.log("\n----------------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("----------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
