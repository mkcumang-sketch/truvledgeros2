/**
 * TRUV LedgerOS — Autonomous Daily Practice Cron Daemon E2E Verification
 * Simulates a full daily practice sweep end-to-end:
 * 1. Pass 1: Autonomous Overdue Invoicing & Voice Calling (Gentle, Firm, Final Notice)
 * 2. Pass 2: Autonomous GST Filing Review & Sign-Off Dispatches (Data pending alerts + one-click links)
 * 3. Pass 3: Autonomous Nightly Document & Section 43B(h) MSME Sweep (Auto-anomaly audit & task escalation)
 * 4. Partner Autonomous Morning Briefing Email Dispatch
 * 5. Strict Idempotency Lock Testing (Re-running sweep does not duplicate calls or messages)
 * 6. Clean transactional teardown
 */

import { db } from "../src/lib/db";
import { executeAutonomousDailySweepForTenant } from "../src/app/api/cron/autonomous-daily/route";
import { timingSafeEqualCompare } from "../src/lib/server/m2m-auth";
import {
  InvoiceStatus,
  PaymentRecoveryStage,
  GstReturnStatus,
  GstReturnType,
  CommunicationChannel,
  TaskType,
  TaskStatus,
  EventStatus,
} from "@prisma/client";

async function runAutonomousCronTestSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Autonomous Daily Cron Daemon End-to-End Suite");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  const runId = Date.now();
  let testClientId: string | null = null;
  const createdInvoiceIds: string[] = [];
  let testGstReturnId: string | null = null;
  let testDocumentId: string | null = null;

  try {
    // 0. Verify Machine-to-Machine CRON_SECRET Timing-Safe Compare
    console.log("--- 0. Verifying CRON_SECRET Security & Authorization ---");
    const testSecret = "truv_production_cron_secret_key_2026";
    const matchingToken = "truv_production_cron_secret_key_2026";
    const invalidToken = "wrong_cron_token_attempt";

    assert(timingSafeEqualCompare(matchingToken, testSecret) === true, "Constant-time auth validates matching token");
    assert(timingSafeEqualCompare(invalidToken, testSecret) === false, "Constant-time auth rejects invalid token");
    assert(timingSafeEqualCompare("", testSecret) === false, "Constant-time auth rejects empty token");

    // 1. Fetch Target Practice Tenant
    const tenant = await db.tenant.findFirst({
      where: { active: true, isSuspended: false },
      orderBy: { createdAt: "asc" },
    });

    if (!tenant) throw new Error("No active practice tenant found in database.");
    console.log(`\nTarget Practice Tenant: ${tenant.name} (${tenant.id})`);

    // 2. Create Isolated Test Client with Contact Info
    const testClient = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: `Acme Industrial Systems [AUTONOMOUS-TEST-${runId}]`,
        businessName: "Acme Industrial Pvt Ltd",
        email: `client.${runId}@test-acme.in`,
        phone: "+919876543210",
        pan: "AAACA1234F",
        gstin: "27AAACA1234F1Z5",
        contacts: {
          create: {
            tenantId: tenant.id,
            name: "Rajesh Sharma",
            email: `rajesh.${runId}@test-acme.in`,
            phone: "+919876543210",
            designation: "Finance Director",
            isPrimary: true,
          },
        },
      },
      include: { contacts: true },
    });
    testClientId = testClient.id;
    assert(Boolean(testClient.id), `Test Client created: ${testClient.name}`);

    // 3. Create Pass 1 Fixtures: 3 Overdue Invoices
    console.log("\n--- Setting Up Pass 1 Test Fixtures (Overdue Invoices) ---");
    const now = new Date();

    // Invoice A: 4 days overdue (GENTLE stage: 1-7 days)
    const dueDateGentle = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const invoiceGentle = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-GENTLE-${runId}`,
        serviceDescription: "Quarterly Statutory Audit & ROC Compliance",
        subtotal: 45000.0,
        gstRate: 18.0,
        cgstAmount: 4050.0,
        sgstAmount: 4050.0,
        totalAmount: 53100.0,
        status: InvoiceStatus.SENT,
        issuedDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        dueDate: dueDateGentle,
      },
    });
    createdInvoiceIds.push(invoiceGentle.id);

    // Invoice B: 11 days overdue (FIRM stage: 8-15 days)
    const dueDateFirm = new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000);
    const invoiceFirm = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-FIRM-${runId}`,
        serviceDescription: "Income Tax Scrutiny Reassessment Representation",
        subtotal: 75000.0,
        gstRate: 18.0,
        cgstAmount: 6750.0,
        sgstAmount: 6750.0,
        totalAmount: 88500.0,
        status: InvoiceStatus.SENT,
        issuedDate: new Date(now.getTime() - 26 * 24 * 60 * 60 * 1000),
        dueDate: dueDateFirm,
      },
    });
    createdInvoiceIds.push(invoiceFirm.id);

    // Invoice C: 22 days overdue (FINAL_NOTICE stage: >15 days)
    const dueDateFinal = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000);
    const invoiceFinal = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-FINAL-${runId}`,
        serviceDescription: "Annual Transfer Pricing Study & Form 3CEB Certification",
        subtotal: 120000.0,
        gstRate: 18.0,
        cgstAmount: 10800.0,
        sgstAmount: 10800.0,
        totalAmount: 141600.0,
        status: InvoiceStatus.SENT,
        issuedDate: new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000),
        dueDate: dueDateFinal,
      },
    });
    createdInvoiceIds.push(invoiceFinal.id);

    assert(createdInvoiceIds.length === 3, "Created 3 overdue invoices (Gentle, Firm, Final Notice)");

    // 4. Create Pass 2 Fixture: GST Return in DATA_PENDING status
    console.log("\n--- Setting Up Pass 2 Test Fixture (Pending GST Return) ---");
    const gstReturn = await db.gstReturn.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        returnType: GstReturnType.GSTR_3B,
        period: `Aug 2026-${runId}`,
        financialYear: "2026-2027",
        dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        outputTax: 185000.0,
        inputTaxCredit: 122000.0,
        netPayable: 63000.0,
        status: GstReturnStatus.DATA_PENDING,
      },
    });
    testGstReturnId = gstReturn.id;
    assert(Boolean(testGstReturnId), `GST Return fixture created with net payable INR 63,000`);

    // 5. Create Pass 3 Fixture: Nightly Vault Document lacking AI scan
    console.log("\n--- Setting Up Pass 3 Test Fixture (Unaudited Vault Document) ---");
    const testDoc = await db.document.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        name: `HDFC_Current_Account_Sept2026_${runId}.pdf`,
        fileUrl: "https://truv-vault.s3.amazonaws.com/test-docs/statement.pdf",
        fileSize: 450 * 1024,
        category: "Bank Statement",
        status: "PENDING",
      },
    });
    testDocumentId = testDoc.id;
    assert(Boolean(testDocumentId), `Unaudited Document fixture created: ${testDoc.name}`);

    // 6. Execute Autonomous Daily Sweep (FIRST RUN)
    console.log("\n==================================================================");
    console.log(">>> EXECUTING AUTONOMOUS DAILY PRACTICE SWEEP (RUN 1)...");
    console.log("==================================================================");

    const sweepResult = await executeAutonomousDailySweepForTenant(tenant.id);

    console.log("\nSweep Execution Summary:");
    console.log(JSON.stringify(sweepResult, null, 2));

    // Verify Pass 1 assertions
    assert(sweepResult.invoicesOverdueProcessed >= 3, `Pass 1: Processed ${sweepResult.invoicesOverdueProcessed} overdue invoices (expected >= 3)`);
    assert(sweepResult.whatsappSent >= 1, `Pass 1: Dispatched WhatsApp reminders (count: ${sweepResult.whatsappSent})`);
    assert(sweepResult.voiceCallsDispatched >= 2, `Pass 1: Dispatched autonomous voice calls (count: ${sweepResult.voiceCallsDispatched}, expected >= 2 for Firm + Final)`);

    // Verify Invoice updates in PostgreSQL
    const updatedGentle = await db.invoice.findUnique({ where: { id: invoiceGentle.id } });
    assert(updatedGentle?.lastRecoveryStage === PaymentRecoveryStage.GENTLE, "Invoice A transitioned to GENTLE stage");

    const updatedFirm = await db.invoice.findUnique({ where: { id: invoiceFirm.id } });
    assert(updatedFirm?.lastRecoveryStage === PaymentRecoveryStage.FIRM, "Invoice B transitioned to FIRM stage");

    const updatedFinal = await db.invoice.findUnique({ where: { id: invoiceFinal.id } });
    assert(updatedFinal?.lastRecoveryStage === PaymentRecoveryStage.FINAL_NOTICE, "Invoice C transitioned to FINAL_NOTICE stage");

    // Verify Legal Notice Partner Task
    const legalTask = await db.task.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceId: invoiceFinal.id,
        type: TaskType.PAYMENT_ESCALATION,
      },
    });
    assert(Boolean(legalTask), `Pass 1: High-priority Partner Task created for legal notice review: ${legalTask?.title}`);
    assert(legalTask?.priority === "URGENT", "Legal notice escalation task marked URGENT priority");

    // Verify Pass 2 assertions
    assert(sweepResult.gstRemindersSent >= 1, `Pass 2: Dispatched GST filing sign-off dispatches (count: ${sweepResult.gstRemindersSent})`);
    const updatedGst = await db.gstReturn.findUnique({ where: { id: gstReturn.id } });
    assert(Boolean(updatedGst?.summarySentAt), `Pass 2: GstReturn.summarySentAt timestamp populated`);

    const gstComm = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: testClient.id,
        category: "STATUTORY_REMINDER",
      },
    });
    assert(Boolean(gstComm), `Pass 2: Logged STATUTORY_REMINDER communication: ${gstComm?.subject}`);

    // Verify Pass 3 assertions
    assert(sweepResult.documentsScanned >= 1, `Pass 3: Scanned nightly vault documents (count: ${sweepResult.documentsScanned})`);
    assert(sweepResult.msmeRisksFlagged >= 1, `Pass 3: Flagged Section 43B(h) MSME or cash violation risks (count: ${sweepResult.msmeRisksFlagged})`);

    const auditComm = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: testClient.id,
        purpose: "AI_AUDIT",
      },
    });
    assert(Boolean(auditComm), `Pass 3: AI Audit report logged in Communication table`);

    // Verify Executive CA Morning Briefing
    assert(sweepResult.morningBriefingSent === true, "Morning Briefing synthesized and dispatched to partner email");
    const briefingComm = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        purpose: "MORNING_BRIEFING",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(briefingComm), `Morning Briefing recorded in PostgreSQL: ${briefingComm?.subject}`);

    // =========================================================================
    // 7. Test Idempotency & Safeguards (SECOND RUN on same day)
    // =========================================================================
    console.log("\n==================================================================");
    console.log(">>> TESTING IDEMPOTENCY LOCKS (RUN 2 — SAME 24-HOUR CYCLE)...");
    console.log("==================================================================");

    const secondSweepResult = await executeAutonomousDailySweepForTenant(tenant.id);

    console.log("\nSecond Sweep Summary (Expected 0 new duplicate actions):");
    console.log(JSON.stringify(secondSweepResult, null, 2));

    assert(
      secondSweepResult.whatsappSent === 0,
      "Idempotency Guard: Zero duplicate WhatsApp messages sent on re-run"
    );
    assert(
      secondSweepResult.voiceCallsDispatched === 0,
      "Idempotency Guard: Zero duplicate Voice calls dispatched on re-run"
    );
    assert(
      secondSweepResult.gstRemindersSent === 0,
      "Idempotency Guard: Zero duplicate GST reminders sent on re-run"
    );
    assert(
      secondSweepResult.documentsScanned === 0,
      "Idempotency Guard: Zero duplicate Document scans executed on re-run"
    );

    console.log("\nIdempotency locks verified via AutomationEvent unique constraint.");

  } catch (err: any) {
    console.error("\n[CRON SUITE ERROR]:", err);
    failed++;
  } finally {
    // 8. Transactional Teardown of Test Fixtures to restore clean blank slate
    console.log("\n--- Cleaning Up Test Fixtures ---");
    if (testClientId) {
      try {
        await db.$transaction([
          db.communication.deleteMany({ where: { clientId: testClientId } }),
          db.task.deleteMany({ where: { clientId: testClientId } }),
          db.automationEvent.deleteMany({
            where: {
              OR: [
                { entityId: { in: createdInvoiceIds } },
                { entityId: testGstReturnId || undefined },
                { entityId: testDocumentId || undefined },
              ],
            },
          }),
          db.document.deleteMany({ where: { clientId: testClientId } }),
          db.gstReturn.deleteMany({ where: { clientId: testClientId } }),
          db.invoice.deleteMany({ where: { clientId: testClientId } }),
          db.contact.deleteMany({ where: { clientId: testClientId } }),
          db.client.deleteMany({ where: { id: testClientId } }),
        ]);
        console.log(`[CLEANUP] Successfully purged all test client records for ${testClientId}`);
      } catch (cleanErr: any) {
        console.warn("[CLEANUP WARNING]", cleanErr.message);
      }
    }

    console.log("\n==================================================================");
    console.log(`AUTONOMOUS CRON TEST SUITE FINISHED`);
    console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runAutonomousCronTestSuite();
