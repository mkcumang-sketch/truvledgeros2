import nodemailer from "nodemailer";
import { sendEmail, sendTransactionalEmail } from "../src/lib/server/email/email-service";

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
  console.log("TRUV LedgerOS — Direct Nodemailer Gmail SMTP & Fallback Suite");
  console.log("=================================================================\n");

  const originalEnv = { ...process.env };

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Nodemailer Direct SMTP Delivery Path
    // ---------------------------------------------------------------------------
    console.log(">>> [Test 1] Direct SMTP Gateway Path <<<");
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "test.ca@firm.in";
    process.env.SMTP_PASS = "abcd efgh ijkl mnop"; // with spaces to test stripping
    process.env.EMAIL_FROM = "TRUV LedgerOS <test.ca@firm.in>";

    // Mock nodemailer createTransport
    let sendMailCalled: any = false;
    let transportConfig: any = null;
    let mailOptionsPassed: any = null;

    const originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = ((config: any) => {
      transportConfig = config;
      return {
        sendMail: async (mailOptions: any) => {
          sendMailCalled = true;
          mailOptionsPassed = mailOptions;
          return { messageId: "smtp_msg_123456" };
        },
      } as any;
    }) as any;

    const smtpRes = await sendEmail({
      to: "client@example.com",
      subject: "Test Practice Invoice Notice",
      html: "<p>Invoice generated</p>",
      text: "Invoice generated",
    });

    assert(smtpRes.success === true, "1.1: SMTP delivery returns success: true");
    assert(smtpRes.provider === "smtp", "1.2: Provider explicitly set to 'smtp'");
    assert(smtpRes.status === "SENT", "1.3: Delivery status is 'SENT'");
    assert(smtpRes.delivered === true, "1.4: Delivery marked as confirmed delivered: true");
    assert(sendMailCalled === true, "1.5: transporter.sendMail was called");
    assert(transportConfig?.auth?.pass === "abcdefghijklmnop", "1.6: App password spaces stripped automatically");
    assert(transportConfig?.auth?.user === "test.ca@firm.in", "1.7: Transporter user matches SMTP_USER");
    assert(transportConfig?.port === 465, "1.8: Transporter port matches 465");
    assert(transportConfig?.secure === true, "1.9: Port 465 triggers secure: true");
    assert(mailOptionsPassed?.to === "client@example.com", "1.10: Recipient correctly passed to sendMail");

    // Restore createTransport
    nodemailer.createTransport = originalCreateTransport;

    // ---------------------------------------------------------------------------
    // TEST 2: sendTransactionalEmail alias compatibility
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 2] sendTransactionalEmail Alias Compatibility <<<");
    nodemailer.createTransport = ((config: any) => {
      return {
        sendMail: async () => ({ messageId: "smtp_alias_789" }),
      } as any;
    }) as any;

    const aliasRes = await sendTransactionalEmail({
      to: "partner@firm.in",
      subject: "Tax Audit Assigned",
      html: "<p>Notice</p>",
      text: "Notice",
    });

    assert(aliasRes.success === true, "2.1: sendTransactionalEmail alias returns success: true");
    assert(aliasRes.provider === "smtp", "2.2: Alias resolves to SMTP provider");

    nodemailer.createTransport = originalCreateTransport;

    // ---------------------------------------------------------------------------
    // TEST 3: SMTP Failure falls back gracefully to Resend or Standby
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 3] SMTP Error Fallback to Standby <<<");
    delete process.env.RESEND_API_KEY;
    nodemailer.createTransport = (() => {
      return {
        sendMail: async () => {
          throw new Error("SMTP connection rejected: Bad credentials");
        },
      } as any;
    }) as any;

    const fallbackRes = await sendEmail({
      to: "recipient@firm.in",
      subject: "Standby Notice",
      html: "<p>Notice</p>",
      text: "Notice",
    });

    assert(fallbackRes.success === true, "3.1: SMTP failure does not throw uncaught error");
    assert(fallbackRes.status === "STANDBY_MODE", "3.2: Falls back to STANDBY_MODE when Resend unconfigured");
    assert(fallbackRes.provider === "standby", "3.3: Provider set to standby");

    nodemailer.createTransport = originalCreateTransport;

    // ---------------------------------------------------------------------------
    // TEST 4: Clean Standby Mode when SMTP Credentials Missing
    // ---------------------------------------------------------------------------
    console.log("\n>>> [Test 4] Standby Mode with No Providers <<<");
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.RESEND_API_KEY;

    const unconfiguredRes = await sendEmail({
      to: "anyone@firm.in",
      subject: "Unconfigured test",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    assert(unconfiguredRes.success === true, "4.1: Clean standby execution with success: true");
    assert(unconfiguredRes.status === "STANDBY_MODE", "4.2: Status is STANDBY_MODE");
    assert(unconfiguredRes.delivered === false, "4.3: Delivered is false in standby mode");

    console.log("\n=================================================================");
    console.log(`Nodemailer SMTP Suite Results: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    process.env = originalEnv;
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
