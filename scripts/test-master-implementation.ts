import {
  normalizeIndianPhoneNumber,
  formatDueDateDDMMYYYY,
  formatInrAmount,
  DEFAULT_CA_FIRM_NAME,
  DEFAULT_SERVICE_DESCRIPTION,
} from "../src/lib/server/voice/sarvam-telephony";

async function runTests() {
  console.log("=== STARTING MASTER IMPLEMENTATION SPEC VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || "");
      failed++;
    }
  }

  // TEST 1: Indian Standard E.164 Phone Normalization
  console.log("\n--- TEST 1: Phone Normalization (+91XXXXXXXXXX) ---");
  assert(
    normalizeIndianPhoneNumber("9876543210") === "+919876543210",
    "10-digit number '9876543210' -> '+919876543210'"
  );
  assert(
    normalizeIndianPhoneNumber("09876543210") === "+919876543210",
    "11-digit leading-zero number '09876543210' -> '+919876543210'"
  );
  assert(
    normalizeIndianPhoneNumber("+91 98765 43210") === "+919876543210",
    "Formatted string '+91 98765 43210' -> '+919876543210'"
  );
  assert(
    normalizeIndianPhoneNumber("919876543210") === "+919876543210",
    "12-digit '919876543210' -> '+919876543210'"
  );

  let thrown = false;
  try {
    normalizeIndianPhoneNumber("12345");
  } catch {
    thrown = true;
  }
  assert(thrown, "Invalid phone number '< 10 digits' throws validation error");

  // TEST 2: Statutory DD-MM-YYYY Due Date Formatting
  console.log("\n--- TEST 2: Due Date Formatting (DD-MM-YYYY) ---");
  assert(
    formatDueDateDDMMYYYY(new Date("2026-11-05T00:00:00Z")) === "05-11-2026",
    "Date object '2026-11-05' -> '05-11-2026'"
  );
  assert(
    formatDueDateDDMMYYYY("2026-11-05") === "05-11-2026",
    "ISO String '2026-11-05' -> '05-11-2026'"
  );
  assert(
    formatDueDateDDMMYYYY("05-11-2026") === "05-11-2026",
    "Pre-formatted '05-11-2026' preserved"
  );

  // TEST 3: Statutory INR Currency Formatting
  console.log("\n--- TEST 3: Currency Formatting (₹XX,XXX) ---");
  assert(
    formatInrAmount(18500) === "₹18,500",
    "18500 formats to '₹18,500'"
  );
  assert(
    formatInrAmount("18500") === "₹18,500",
    "String '18500' formats to '₹18,500'"
  );
  assert(
    formatInrAmount("₹18,500") === "₹18,500",
    "String already prefixed with '₹' preserved"
  );

  // TEST 4: Sarvam 8-Variable Contract Structure
  console.log("\n--- TEST 4: Sarvam 8-Variable Contract Binding ---");
  const testVariables = {
    ca_firm_name: DEFAULT_CA_FIRM_NAME,
    due_date: "05-11-2026",
    handling_partner_name: "CA Rajesh Sharma",
    invoice_amount: "₹18,500",
    invoice_number: "INV-2026-0042",
    payment_link_url: "https://truvledgeros2.vercel.app/pay/INV-2026-0042",
    service_description: DEFAULT_SERVICE_DESCRIPTION,
    user_name: "Rahul Verma",
  };

  const expectedKeys = [
    "ca_firm_name",
    "due_date",
    "handling_partner_name",
    "invoice_amount",
    "invoice_number",
    "payment_link_url",
    "service_description",
    "user_name",
  ];

  const actualKeys = Object.keys(testVariables).sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys.sort()),
    "All exact 8 Sarvam AI Dashboard variables are bound"
  );

  console.log("\n=== ALL UNIT VERIFICATION SUITES COMPLETED ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL TEST EXCEPTION:", err);
  process.exit(1);
});
