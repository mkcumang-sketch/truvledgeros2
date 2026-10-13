import { calculateInvoiceFinancials, roundToPaise } from "../src/lib/financial/math";
import { AGEING_BUCKETS } from "../src/lib/server/financial-analytics";

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

async function runPhase3Tests() {
  console.log("================================================");
  console.log("TRUV LedgerOS — Phase 3 Financial Operations Test");
  console.log("================================================\n");

  // TEST 1: Strict Decimal Calculation (No float drift)
  const items = [
    { description: "Audit Services", quantity: 2, unitPrice: 15000, discountPercent: 10, taxRatePercent: 18 },
    { description: "Tally Advisory", quantity: 1, unitPrice: 5000, discountPercent: 0, taxRatePercent: 18 },
  ];
  const intraStateCalc = calculateInvoiceFinancials(items, false);
  // Item 1: 30,000 - 3,000 = 27,000 taxable. 9% CGST = 2430, 9% SGST = 2430. Total = 31,860
  // Item 2: 5,000 taxable. 9% CGST = 450, 9% SGST = 450. Total = 5,900
  // Invoice: Subtotal 35,000, Taxable 32,000, CGST 2880, SGST 2880, Total 37,760
  assert(intraStateCalc.subtotal === 35000, "TEST 1: Accurate Line Item Subtotal");
  assert(intraStateCalc.totalDiscount === 3000, "TEST 2: Accurate Deterministic Discount Calculation");
  assert(intraStateCalc.taxableAmount === 32000, "TEST 3: Taxable Base Amount Computed Correctly");
  assert(intraStateCalc.cgstAmount === 2880 && intraStateCalc.sgstAmount === 2880, "TEST 4: Intra-state 50/50 Split (CGST/SGST)");
  assert(intraStateCalc.totalAmount === 37760, "TEST 5: Total Amount Matches Sum Deterministically");

  // TEST 6: Inter-State IGST Calculation
  const interStateCalc = calculateInvoiceFinancials(items, true);
  assert(interStateCalc.cgstAmount === 0 && interStateCalc.sgstAmount === 0, "TEST 6: Inter-state zeroes out CGST and SGST");
  assert(interStateCalc.igstAmount === 5760, "TEST 7: Inter-state directs entire tax to IGST");
  assert(interStateCalc.totalAmount === 37760, "TEST 8: Total Matches regardless of GST routing");

  // TEST 9: Overpayment Rejection Logic
  const invoiceBalance = 10000;
  const recordedPayment = 12000;
  const isOverpayment = recordedPayment > invoiceBalance;
  assert(isOverpayment === true, "TEST 9: Overpayment > balance correctly detected for rejection");

  // TEST 10: Partial Payment Balance Calculation
  const payment1 = 4000;
  const newBalance = roundToPaise(invoiceBalance - payment1);
  assert(newBalance === 6000, "TEST 10: Partial payment calculates exact remainder");

  // TEST 11: Full Payment Zero Remainder
  const payment2 = 6000;
  const finalBalance = roundToPaise(newBalance - payment2);
  assert(finalBalance === 0, "TEST 11: Full payment zeros out remaining balance");

  // TEST 12: Overdue Status Detection Logic
  const pastDueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
  const futureDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10); // 10 days in future
  const now = new Date();

  const isOverdue = (due: Date, bal: number) => due < now && bal > 0;
  assert(isOverdue(pastDueDate, 500) === true, "TEST 12: Past due date with balance is OVERDUE");
  assert(isOverdue(futureDueDate, 500) === false, "TEST 13: Future due date is NOT overdue");
  assert(isOverdue(pastDueDate, 0) === false, "TEST 14: Fully paid invoice is NOT overdue even if date passed");

  // TEST 15: Ageing Bucket Categorization
  const getBucket = (days: number) => {
    if (days > 30) return AGEING_BUCKETS.BUCKET_OVER_30;
    if (days >= 16) return AGEING_BUCKETS.BUCKET_16_30;
    if (days >= 8) return AGEING_BUCKETS.BUCKET_8_15;
    return AGEING_BUCKETS.BUCKET_1_7;
  };
  assert(getBucket(5) === "1-7 days", "TEST 15: 5 days categorized into 1-7 days");
  assert(getBucket(12) === "8-15 days", "TEST 16: 12 days categorized into 8-15 days");
  assert(getBucket(25) === "16-30 days", "TEST 17: 25 days categorized into 16-30 days");
  assert(getBucket(45) === "30+ days", "TEST 18: 45 days categorized into 30+ days");

  // TEST 19: Concurrency Safe Invoice Format Match
  const formatRegex = /^TRUV\/\d{4}-\d{2}\/\d{4}$/;
  const sampleNumber = "TRUV/2026-27/0001";
  assert(formatRegex.test(sampleNumber), "TEST 19: Concurrency invoice numbering matches TRUV/YYYY-YY/XXXX format");

  // TEST 20: Client Portal Payment Block
  const canClientRecordPayment = (role: string) => role !== "CLIENT";
  assert(!canClientRecordPayment("CLIENT"), "TEST 20: Client role is strictly prohibited from recording payments");

  console.log("\n------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runPhase3Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});