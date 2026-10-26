/**
 * TRUV LedgerOS — End-to-End Verification Test for Native In-Process Automation Engine
 * Tests against Railway PostgreSQL without any external n8n or orchestrator dependencies.
 */
import { db } from "../src/lib/db";
import {
  dispatchNativeEvent,
  processPendingAutomations,
} from "../src/lib/server/automation/native-engine";
import { TaskType, TaskStatus, EventStatus, InvoiceStatus } from "@prisma/client";

async function runNativeEngineSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Native Automation Engine E2E Verification");
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

  try {
    // 1. Locate primary active tenant
    const tenant = await db.tenant.findFirst({
      where: { active: true, isSuspended: false },
      orderBy: { createdAt: "asc" },
    });

    if (!tenant) {
      throw new Error("No active tenant found in database for testing.");
    }
    console.log(`Target Tenant: ${tenant.name} (${tenant.id})\n`);

    // 2. Test Client Onboarding Automation
    console.log("--- 1. Testing client.created Event & 3-Step CA Onboarding Tasks ---");
    const testClient = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: `Automated Test Client ${Date.now()}`,
        email: `test_client_${Date.now()}@example.com`,
        phone: "+919876543210",
        pan: "ABCDE1234F",
      },
    });

    const clientEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "client.created",
      entityType: "CLIENT",
      entityId: testClient.id,
      payload: { clientId: testClient.id, clientName: testClient.name },
    });

    assert(clientEvent.status === EventStatus.PENDING, "Event dispatched with status PENDING");

    // Test Idempotency: duplicate dispatch returns same event
    const duplicateEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "client.created",
      entityType: "CLIENT",
      entityId: testClient.id,
      payload: { clientId: testClient.id },
      idempotencyKey: clientEvent.idempotencyKey,
    });
    assert(duplicateEvent.id === clientEvent.id, "Deterministic idempotencyKey prevents duplicates");

    // Process queue
    const run1 = await processPendingAutomations({ tenantId: tenant.id });
    assert(run1.succeeded >= 1, `Worker drained queue: ${run1.succeeded} succeeded`);

    // Verify 3 onboarding tasks were created
    const onboardingTasks = await db.task.findMany({
      where: {
        tenantId: tenant.id,
        clientId: testClient.id,
      },
    });
    assert(onboardingTasks.length === 3, `Created exactly 3 CA onboarding tasks (found: ${onboardingTasks.length})`);
    assert(
      onboardingTasks.some((t) => t.title.includes("KYC Verification")),
      "Task 1: KYC Verification created"
    );
    assert(
      onboardingTasks.some((t) => t.title.includes("GST Portal Credential")),
      "Task 2: GST Portal Credential Audit created"
    );
    assert(
      onboardingTasks.some((t) => t.title.includes("Prior Period Filing")),
      "Task 3: Prior Period Filing Reconciliation created"
    );

    // Verify AutomationEvent was updated to PROCESSED
    const updatedClientEvent = await db.automationEvent.findUnique({
      where: { id: clientEvent.id },
    });
    assert(updatedClientEvent?.status === EventStatus.PROCESSED, "client.created event marked PROCESSED");

    // 3. Test Invoice Notification Automation
    console.log("\n--- 2. Testing invoice.issued Event & Transactional Communication ---");
    const testInvoice = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-AUTO-${Date.now().toString().slice(-6)}`,
        serviceDescription: "Statutory Audit & Tax Compliance Q3",
        subtotal: 10000,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        totalAmount: 11800,
        status: InvoiceStatus.SENT,
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    });

    const invoiceEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "invoice.issued",
      entityType: "INVOICE",
      entityId: testInvoice.id,
      payload: { invoiceId: testInvoice.id, invoiceNumber: testInvoice.invoiceNumber },
    });

    const run2 = await processPendingAutomations({ tenantId: tenant.id });
    assert(run2.succeeded >= 1, `Invoice event processed successfully`);

    // Verify Communication record was logged
    const commRecord = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        invoiceId: testInvoice.id,
        purpose: "INVOICE",
      },
    });
    assert(!!commRecord, "Outbound invoice communication logged in database");
    assert(commRecord?.recipient === testClient.email, `Communication recipient matches client email (${commRecord?.recipient})`);

    // 4. Test Aging & Overdue Recovery Escalation
    console.log("\n--- 3. Testing invoice.overdue & Partner Escalation Task ---");
    // Make the test invoice 35 days overdue
    const pastDueDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await db.invoice.update({
      where: { id: testInvoice.id },
      data: {
        dueDate: pastDueDate,
        status: InvoiceStatus.OVERDUE,
      },
    });

    await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "invoice.overdue",
      entityType: "INVOICE",
      entityId: testInvoice.id,
      payload: { invoiceId: testInvoice.id },
    });

    const run3 = await processPendingAutomations({ tenantId: tenant.id });
    assert(run3.succeeded >= 1, "Aging/overdue recovery check processed");

    const escalatedInvoice = await db.invoice.findUnique({
      where: { id: testInvoice.id },
    });
    assert(
      escalatedInvoice?.lastRecoveryStage === "FINAL_NOTICE",
      `Invoice transitioned to FINAL_NOTICE stage (actual: ${escalatedInvoice?.lastRecoveryStage})`
    );

    const escalationTask = await db.task.findFirst({
      where: {
        tenantId: tenant.id,
        invoiceId: testInvoice.id,
        type: TaskType.PAYMENT_ESCALATION,
      },
    });
    assert(!!escalationTask, "Partner payment escalation task created for 35d overdue invoice");
    assert(escalationTask?.priority === "URGENT", "Payment escalation priority is URGENT");

    // 5. Verify AutomationRun History
    console.log("\n--- 4. Testing AutomationRun & Execution Ledger Persistence ---");
    const runs = await db.automationRun.findMany({
      take: 5,
      orderBy: { triggeredAt: "desc" },
      include: { automation: true },
    });
    assert(runs.length > 0, `AutomationRun logs persisted: ${runs.length} runs recorded`);
    assert(runs[0].status === "SUCCESS", "Latest AutomationRun status is SUCCESS");

    // Clean up test records
    await db.task.deleteMany({ where: { clientId: testClient.id } });
    await db.communication.deleteMany({ where: { clientId: testClient.id } });
    await db.invoice.deleteMany({ where: { id: testInvoice.id } });
    await db.client.deleteMany({ where: { id: testClient.id } });
    await db.automationEvent.deleteMany({
      where: {
        id: { in: [clientEvent.id, invoiceEvent.id] },
      },
    });

    console.log("\n==================================================================");
    console.log(`Native Automation Engine Suite Complete: ${passed} PASSED | ${failed} FAILED`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    // Graceful disconnect
    await db.$disconnect();
  }
}

runNativeEngineSuite();
