import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { sendEmail } from "../src/lib/server/email/email-service";
import { db } from "../src/lib/server/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
} from "@prisma/client";

async function runEmailDispatchVerification() {
  console.log("================================================================================");
  console.log("TRUV LedgerOS — Email Dispatch Pipeline Empirical Verification Test");
  console.log("================================================================================");

  const testRecipient = "us7907us@gmail.com";
  const timestamp = new Date().toISOString();

  // -------------------------------------------------------------------------
  // TEST 1: Direct Gmail SMTP Dispatch
  // -------------------------------------------------------------------------
  console.log("\n[TEST 1] Testing Primary Gmail SMTP Dispatch Pipeline...");
  console.log(`- Recipient: ${testRecipient}`);
  console.log(`- SMTP Host: ${process.env.SMTP_HOST || "smtp.gmail.com"}`);
  console.log(`- SMTP User: ${process.env.SMTP_USER || "NOT_SET"}`);

  const smtpResult = await sendEmail({
    to: testRecipient,
    subject: `[TRUV CA Verification] SMTP Engine Verification — ${timestamp}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="color: #ea580c;">TRUV LedgerOS — SMTP Gateway Test</h2>
        <p>This email verifies that your <strong>Gmail SMTP pipeline</strong> is operational and delivering transactional messages.</p>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        <p><strong>Status:</strong> Dispatched and Verified</p>
      </div>
    `,
    text: `TRUV LedgerOS SMTP Verification at ${timestamp}. Status: Dispatched and Verified.`,
    category: "NOTIFICATION",
  });

  console.log("- Result:", JSON.stringify(smtpResult, null, 2));

  if (!smtpResult.success || !smtpResult.delivered || smtpResult.provider !== "smtp") {
    throw new Error(`SMTP Test Failed: Expected successful delivery via 'smtp', got: ${JSON.stringify(smtpResult)}`);
  }
  console.log("✓ TEST 1 PASSED: SMTP dispatch transmitted successfully with Message ID:", smtpResult.messageId);

  // -------------------------------------------------------------------------
  // TEST 2: Resend Fallback Pipeline (Simulating SMTP Bypass)
  // -------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing Resend API Gateway Fallback Pipeline...");
  const originalSmtpUser = process.env.SMTP_USER;
  try {
    // Temporarily disable SMTP to verify Resend path
    delete process.env.SMTP_USER;

    const resendResult = await sendEmail({
      to: testRecipient,
      subject: `[TRUV CA Verification] Resend Fallback Gateway Verification — ${timestamp}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #0284c7;">TRUV LedgerOS — Resend Fallback Test</h2>
          <p>This email verifies that the <strong>Resend API Gateway fallback</strong> is operational with domain-safe onboarding sender address.</p>
          <p><strong>Timestamp:</strong> ${timestamp}</p>
          <p><strong>Status:</strong> Dispatched and Verified via Resend</p>
        </div>
      `,
      text: `TRUV LedgerOS Resend Fallback Verification at ${timestamp}.`,
      category: "NOTIFICATION",
    });

    console.log("- Result:", JSON.stringify(resendResult, null, 2));

    if (!resendResult.success || !resendResult.delivered || resendResult.provider !== "resend") {
      throw new Error(`Resend Test Failed: Expected successful delivery via 'resend', got: ${JSON.stringify(resendResult)}`);
    }
    console.log("✓ TEST 2 PASSED: Resend fallback transmitted successfully with Message ID:", resendResult.messageId);
  } finally {
    // Restore SMTP environment
    process.env.SMTP_USER = originalSmtpUser;
  }

  // -------------------------------------------------------------------------
  // TEST 3: Database Communication Audit Persistence
  // -------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Communication Audit Trail Persistence in Database...");
  const activeTenant = await db.tenant.findFirst({
    where: { active: true },
    select: { id: true, name: true },
  });

  if (!activeTenant) {
    throw new Error("No active tenant found in database for audit verification.");
  }

  // Find or create a test client
  let testClient = await db.client.findFirst({
    where: { tenantId: activeTenant.id },
    select: { id: true, name: true, email: true },
  });

  const testExternalRef = `test_smtp_msg_${Date.now()}`;
  const auditRecord = await db.communication.create({
    data: {
      tenantId: activeTenant.id,
      clientId: testClient?.id || null,
      channel: CommunicationChannel.EMAIL,
      direction: CommunicationDirection.OUTBOUND,
      purpose: "VERIFICATION",
      category: "SYSTEM_TEST",
      status: CommunicationStatus.DELIVERED,
      recipient: testRecipient,
      subject: "Test Audit Verification Email",
      content: "Test audit content",
      externalRef: testExternalRef,
      metadata: {
        provider: "smtp",
        messageId: testExternalRef,
        verified: true,
      },
    },
  });

  console.log("- Created Audit Record ID:", auditRecord.id);

  // Retrieve and verify
  const retrievedRecord = await db.communication.findUnique({
    where: { id: auditRecord.id },
  });

  if (!retrievedRecord || retrievedRecord.status !== CommunicationStatus.DELIVERED || retrievedRecord.externalRef !== testExternalRef) {
    throw new Error("Audit verification failed: record not matched or missing in database.");
  }

  console.log("✓ TEST 3 PASSED: Communication audit record verified with status 'DELIVERED'.");

  // Clean up test audit record
  await db.communication.delete({
    where: { id: auditRecord.id },
  });
  console.log("- Cleaned up test audit record.");

  console.log("\n================================================================================");
  console.log("ALL EMAIL VERIFICATION TESTS PASSED SUCCESSFULLY (100%)");
  console.log("================================================================================");
}

runEmailDispatchVerification()
  .catch((err) => {
    console.error("\n❌ Email Verification Test FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
