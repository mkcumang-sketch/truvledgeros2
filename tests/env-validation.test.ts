import { validateEnvironment, getSanitizedConfigSummary } from "../src/lib/server/env";

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

async function runEnvValidationTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Environment Validation Module Test Suite");
  console.log("=================================================================\n");

  // TEST 1: Missing DATABASE_URL fails validation
  const test1 = validateEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "",
  });
  assert(!test1.valid, "1.1 Missing DATABASE_URL marks environment as invalid");
  assert(test1.missingRequired.includes("DATABASE_URL"), "1.2 missingRequired includes DATABASE_URL");

  // TEST 2: Production without ENCRYPTION_KEY fails closed
  const test2 = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/truv_prod",
    ENCRYPTION_KEY: "",
  });
  assert(!test2.valid, "2.1 Production environment without ENCRYPTION_KEY fails closed");
  assert(
    test2.missingRequired.some((m) => m.includes("ENCRYPTION_KEY")),
    "2.2 missingRequired enforces ENCRYPTION_KEY in production"
  );

  // TEST 3: Development without ENCRYPTION_KEY logs warning but allows startup
  const test3 = validateEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/truv_dev",
    ENCRYPTION_KEY: "",
  });
  assert(test3.valid, "3.1 Development allows missing ENCRYPTION_KEY with advisory warning");
  assert(
    test3.warnings.some((w) => w.includes("ENCRYPTION_KEY")),
    "3.2 Development emits explicit warning for unset encryption key"
  );

  // TEST 4: Optional providers gracefully degrade to STANDBY or DISABLED
  const test4 = validateEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/truv_dev",
    RESEND_API_KEY: "",
    RAZORPAY_KEY_ID: "",
    WHATSAPP_ACCESS_TOKEN: "",
    GSTN_CLIENT_ID: "",
  });
  assert(test4.valid, "4.1 Environment is valid even when optional third-party providers are unconfigured");
  
  const emailProvider = test4.providers.find((p) => p.name.includes("Email"));
  assert(emailProvider?.mode === "STANDBY", "4.2 Unconfigured Email degrades safely to STANDBY mode");

  const razorpayProvider = test4.providers.find((p) => p.name.includes("Razorpay"));
  assert(razorpayProvider?.mode === "DISABLED", "4.3 Unconfigured Razorpay degrades safely to DISABLED mode");

  const waProvider = test4.providers.find((p) => p.name.includes("WhatsApp"));
  assert(waProvider?.mode === "DISABLED", "4.4 Unconfigured WhatsApp degrades safely to DISABLED mode");

  // TEST 5: Configured providers reflect ACTIVE status
  const test5 = validateEnvironment({
    NODE_ENV: "staging",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/truv_staging",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    RESEND_API_KEY: "re_mock_test_key_123",
    AWS_ACCESS_KEY_ID: "AKIA_MOCK_KEY_ID_123",
    AWS_SECRET_ACCESS_KEY: "mock_secret_key_abc_456",
  });
  assert(test5.valid, "5.1 Fully configured staging environment is marked valid");
  const emailActive = test5.providers.find((p) => p.name.includes("Email"));
  assert(emailActive?.mode === "ACTIVE", "5.2 Configured Email is marked ACTIVE");
  const s3Active = test5.providers.find((p) => p.name.includes("Object Storage"));
  assert(s3Active?.mode === "ACTIVE", "5.3 Configured S3 is marked ACTIVE");

  // TEST 6: Zero secret leakage in sanitized summary
  const summary = getSanitizedConfigSummary();
  for (const [key, value] of Object.entries(summary)) {
    assert(
      !value.includes("postgres:postgres") && !value.includes("Password123") && !value.includes("0123456789abcdef"),
      `6.1 Sanitized summary for '${key}' completely redacts raw plaintext secret`
    );
  }

  console.log("\n=================================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runEnvValidationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
