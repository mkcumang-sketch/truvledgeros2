import { evaluateStandbySafety } from "../src/lib/server/email/standby-guard";
import { EmailDeliveryResult } from "../src/lib/server/email/email-service";

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

async function runTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Invitation Standby Safety & Token Suppression Suite");
  console.log("=================================================================\n");

  // TEST 1: Unconfigured email (STANDBY_MODE) with --suppress-token
  const standbyResult: EmailDeliveryResult = {
    success: true,
    delivered: false,
    status: "STANDBY_MODE",
    deliveryOutcome: "SIMULATED_STANDBY",
    messageId: "standby_1729000000000",
  };

  const decision1 = evaluateStandbySafety({
    shouldSendEmail: true,
    suppressToken: true,
    emailResult: standbyResult,
  });

  assert(
    decision1.deliveryConfirmed === false,
    "TEST 1.1: STANDBY_MODE is NOT flagged as confirmed delivery"
  );
  assert(
    decision1.allowTokenSuppression === false,
    "TEST 1.2: Token suppression is strictly DISARMED when provider in STANDBY_MODE"
  );
  assert(
    decision1.mustDisplaySetupUrl === true,
    "TEST 1.3: Setup URL MUST be displayed to prevent silent token discard"
  );
  assert(
    Boolean(decision1.errorMessage?.includes("STANDBY_MODE")),
    "TEST 1.4: Error message clearly identifies STANDBY_MODE / unconfigured provider"
  );

  // TEST 2: Provider transmission failure (FAILED) with --suppress-token
  const failedResult: EmailDeliveryResult = {
    success: false,
    delivered: false,
    status: "FAILED",
    deliveryOutcome: "DELIVERY_FAILED",
    error: "SMTP connection timeout",
  };

  const decision2 = evaluateStandbySafety({
    shouldSendEmail: true,
    suppressToken: true,
    emailResult: failedResult,
  });

  assert(
    decision2.deliveryConfirmed === false,
    "TEST 2.1: FAILED transmission is not flagged as confirmed delivery"
  );
  assert(
    decision2.allowTokenSuppression === false,
    "TEST 2.2: Token suppression is DISARMED on failed transmission"
  );
  assert(
    decision2.mustDisplaySetupUrl === true,
    "TEST 2.3: Setup URL is preserved for manual fallback when provider fails"
  );

  // TEST 3: Genuine delivery confirmed (SENT) with --suppress-token
  const sentResult: EmailDeliveryResult = {
    success: true,
    delivered: true,
    status: "SENT",
    deliveryOutcome: "DELIVERED_TO_RECIPIENT",
    messageId: "msg_resend_live_98765",
  };

  const decision3 = evaluateStandbySafety({
    shouldSendEmail: true,
    suppressToken: true,
    emailResult: sentResult,
  });

  assert(
    decision3.deliveryConfirmed === true,
    "TEST 3.1: Provider SENT status is verified as confirmed delivery"
  );
  assert(
    decision3.allowTokenSuppression === true,
    "TEST 3.2: Token suppression is permitted ONLY when delivery is confirmed SENT"
  );
  assert(
    decision3.mustDisplaySetupUrl === false,
    "TEST 3.3: Raw token can be safely suppressed because recipient received email"
  );

  // TEST 4: Delivery confirmed (SENT) without --suppress-token
  const decision4 = evaluateStandbySafety({
    shouldSendEmail: true,
    suppressToken: false,
    emailResult: sentResult,
  });

  assert(
    decision4.deliveryConfirmed === true,
    "TEST 4.1: Delivery confirmed when sent without suppression flag"
  );
  assert(
    decision4.allowTokenSuppression === false,
    "TEST 4.2: Token is not suppressed when --suppress-token flag was not passed"
  );
  assert(
    decision4.mustDisplaySetupUrl === true,
    "TEST 4.3: Setup link is output to operator console as requested"
  );

  // TEST 5: Manual terminal mode (shouldSendEmail: false)
  const decision5 = evaluateStandbySafety({
    shouldSendEmail: false,
    suppressToken: false,
    emailResult: null,
  });

  assert(
    decision5.deliveryConfirmed === false,
    "TEST 5.1: Manual terminal mode indicates no email attempted"
  );
  assert(
    decision5.allowTokenSuppression === false,
    "TEST 5.2: Manual mode never suppresses setup token"
  );
  assert(
    decision5.mustDisplaySetupUrl === true,
    "TEST 5.3: Manual mode guarantees setup URL is printed to terminal"
  );

  console.log("\n-----------------------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("-----------------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
