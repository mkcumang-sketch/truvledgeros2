/**
 * TRUV LedgerOS — Production AI Modules & Autonomous Voice Agent E2E Verification
 * Tests Workflows G, H, I, J against live Gemini API and Railway PostgreSQL.
 */
import { db } from "../src/lib/db";
import {
  dispatchNativeEvent,
  processPendingAutomations,
} from "../src/lib/server/automation/native-engine";
import {
  generateAiPaymentRecoveryDraft,
  generateAiAnomalyAuditScan,
  generateAiTaxNoticeDraft,
} from "../src/lib/server/ai/gemini-client";
import {
  initiateOutboundVoiceCall,
  processVoiceCallWebhook,
} from "../src/lib/server/voice/calling-agent";
import { TaskType, TaskStatus, CommunicationChannel } from "@prisma/client";

async function runAiAndVoiceSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — AI & Autonomous Voice Engine E2E Verification");
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
    const tenant = await db.tenant.findFirst({
      where: { active: true, isSuspended: false },
      orderBy: { createdAt: "asc" },
    });

    if (!tenant) throw new Error("No active tenant found in database.");
    console.log(`Target Tenant: ${tenant.name} (${tenant.id})\n`);

    // Create temporary test client
    const testClient = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: `M/s Apex Infotech Solutions ${Date.now().toString().slice(-4)}`,
        email: `apex_info_${Date.now()}@example.com`,
        phone: "+919876543210",
        pan: "AAACA1234F",
      },
    });

    // Create temporary test invoice
    const testInvoice = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-AI-${Date.now().toString().slice(-5)}`,
        serviceDescription: "Statutory Tax Audit & GSTR-9 Annual Filing",
        subtotal: 50000,
        cgstAmount: 4500,
        sgstAmount: 4500,
        igstAmount: 0,
        totalAmount: 59000,
        status: "OVERDUE",
        dueDate: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000), // 22 days overdue
      },
    });

    // ------------------------------------------------------------------------
    // WORKFLOW G: AI Dynamic Payment Recovery Drafter
    // ------------------------------------------------------------------------
    console.log("--- 1. Testing Workflow G: AI Dynamic Payment Recovery Drafter ---");
    const aiDraftDirect = await generateAiPaymentRecoveryDraft({
      clientName: testClient.name,
      firmName: tenant.name,
      invoiceNumber: testInvoice.invoiceNumber,
      amount: 59000,
      dueDate: "03 Oct 2026",
      daysOverdue: 22,
      stage: "FIRM",
    });

    assert(!!aiDraftDirect.whatsappHinglish, "Generated Hinglish WhatsApp recovery script");
    assert(!!aiDraftDirect.whatsappEnglish, "Generated English WhatsApp recovery script");
    assert(!!aiDraftDirect.emailSubject, "Generated professional email subject");
    assert(aiDraftDirect.tone === "FIRM", "Tone appropriately calibrated to FIRM");

    console.log(`   [Hinglish Preview]: ${aiDraftDirect.whatsappHinglish.slice(0, 100)}...`);

    // Dispatch native event
    const draftEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "invoice.ai_recovery_draft",
      entityType: "INVOICE",
      entityId: testInvoice.id,
      payload: { invoiceId: testInvoice.id },
    });

    const runG = await processPendingAutomations({ tenantId: tenant.id });
    assert(runG.succeeded >= 1, "Native engine executed invoice.ai_recovery_draft event");

    const commDraft = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        invoiceId: testInvoice.id,
        category: "AI_PAYMENT_DRAFT",
      },
    });
    assert(!!commDraft, "AI recovery draft persisted in Communication table");
    assert(commDraft?.status === "PENDING_APPROVAL", "Draft marked PENDING_APPROVAL for partner sign-off");

    const approvalTask = await db.task.findFirst({
      where: {
        tenantId: tenant.id,
        invoiceId: testInvoice.id,
        type: TaskType.INVOICE_APPROVAL,
      },
    });
    assert(!!approvalTask, "Partner approval task created for AI draft");

    // ------------------------------------------------------------------------
    // WORKFLOW H: AI Bank & Document Anomaly Scanner
    // ------------------------------------------------------------------------
    console.log("\n--- 2. Testing Workflow H: AI Bank & Document Anomaly Scanner ---");
    const testDoc = await db.document.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        name: "HDFC Bank Statement & Vendor Ledger FY26",
        category: "Bank Statement",
        status: "PENDING",
      },
    });

    const anomalyEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "document.ai_anomaly_scan",
      entityType: "DOCUMENT",
      entityId: testDoc.id,
      payload: {
        documentName: testDoc.name,
        category: testDoc.category,
        clientName: testClient.name,
        summary: "14 payments to Micro & Small vendors pending over 45 days (Rs 6,80,000); 3 cash withdrawals of Rs 3,00,000; Contract payments of Rs 15,00,000 with 0% TDS.",
      },
    });

    const runH = await processPendingAutomations({ tenantId: tenant.id });
    assert(runH.succeeded >= 1, "Native engine executed document.ai_anomaly_scan event");

    const auditComm = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        category: "AI_AUDIT_REPORT",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!auditComm, "AI Audit Report logged in Communication table");
    assert(Boolean(auditComm?.content.includes("HEALTH SCORE")), "Health score and risk level recorded in audit report");

    const anomalyTask = await db.task.findFirst({
      where: {
        tenantId: tenant.id,
        title: { contains: "Statutory Anomaly Review" },
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!anomalyTask, "Statutory anomaly review task created for CA audit team");

    // ------------------------------------------------------------------------
    // WORKFLOW I: AI Smart Tax Notice & Demand Drafter
    // ------------------------------------------------------------------------
    console.log("\n--- 3. Testing Workflow I: AI Smart Tax Notice & Demand Drafter ---");
    const noticeEvent = await dispatchNativeEvent({
      tenantId: tenant.id,
      eventType: "notice.ai_draft_response",
      entityType: "DOCUMENT",
      entityId: testClient.id,
      payload: {
        clientId: testClient.id,
        clientName: testClient.name,
        noticeType: "GST DRC-01",
        issuingAuthority: "Deputy Commissioner of State Tax, Audit Circle 3",
        statutorySection: "Section 73(1) of CGST Act, 2017",
        demandAmount: 345000,
        noticeSummary: "Alleged excess Input Tax Credit claimed in GSTR-3B compared to auto-drafted GSTR-2B for FY 2024-25.",
      },
    });

    const runI = await processPendingAutomations({ tenantId: tenant.id });
    assert(runI.succeeded >= 1, "Native engine executed notice.ai_draft_response event");

    const noticeComm = await db.communication.findFirst({
      where: {
        tenantId: tenant.id,
        category: "AI_TAX_REBUTTAL",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!noticeComm, "Structured tax notice legal rebuttal logged in Communication table");
    assert(Boolean(noticeComm?.content.includes("KEY ARGUMENTS")), "Rebuttal contains structured legal arguments");

    const gstReviewTask = await db.task.findFirst({
      where: {
        tenantId: tenant.id,
        type: TaskType.GST_REVIEW,
        title: { contains: "Review Tax Notice Rebuttal" },
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!gstReviewTask, "Partner tax representation review task created");

    // ------------------------------------------------------------------------
    // WORKFLOW J: Autonomous AI Voice Calling Agent
    // ------------------------------------------------------------------------
    console.log("\n--- 4. Testing Workflow J: Autonomous AI Voice Calling Agent ---");
    const voiceResult = await initiateOutboundVoiceCall({
      tenantId: tenant.id,
      clientId: testClient.id,
      recipientPhone: testClient.phone,
      clientName: testClient.name,
      reason: "PAYMENT_RECOVERY",
      invoiceId: testInvoice.id,
      invoiceNumber: testInvoice.invoiceNumber,
      amount: 59000,
      dueDate: "03 Oct 2026",
      forceSimulated: true,
    });

    assert(voiceResult.success === true, "Outbound voice call initiated successfully");
    assert(!!voiceResult.callSid, `Call SID assigned: ${voiceResult.callSid}`);
    assert(!!voiceResult.transcript, "Bilingual dynamic telephony script generated");
    assert(!!voiceResult.communicationId, "Voice interaction logged in Communication table");

    console.log(`   [Voice Script Preview]: ${voiceResult.transcript.slice(0, 120)}...`);

    // Test Voice Inbound Webhook Callback
    const webhookResult = await processVoiceCallWebhook({
      callSid: voiceResult.callSid,
      status: "completed",
      duration: 52,
      transcript: voiceResult.transcript,
      sentiment: "PROMISED_TO_PAY",
    });
    assert(webhookResult.updated === true, "Voice webhook updated communication record with final status and sentiment");

    // Test Voice Escalation on Unanswered Call
    const unansweredSid = `call_unanswered_${Date.now()}`;
    const dummyComm = await db.communication.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        channel: CommunicationChannel.VOICE,
        direction: "OUTBOUND",
        purpose: "RECOVERY",
        category: "AUTONOMOUS_VOICE_CALL",
        recipient: testClient.phone,
        subject: "Unanswered Voice Call Test",
        content: "Call dispatched",
        status: "SENT",
        externalRef: unansweredSid,
      },
    });

    const unansweredWebhook = await processVoiceCallWebhook({
      callSid: unansweredSid,
      status: "no-answer",
      sentiment: "UNRESPONSIVE",
    });
    assert(unansweredWebhook.escalated === true, "Voice agent escalated unanswered call to partner Task");

    // Clean up temporary records
    await db.task.deleteMany({ where: { clientId: testClient.id } });
    await db.communication.deleteMany({ where: { clientId: testClient.id } });
    await db.document.deleteMany({ where: { id: testDoc.id } });
    await db.invoice.deleteMany({ where: { id: testInvoice.id } });
    await db.client.deleteMany({ where: { id: testClient.id } });
    await db.automationEvent.deleteMany({
      where: {
        id: { in: [draftEvent.id, anomalyEvent.id, noticeEvent.id] },
      },
    });

    console.log("\n==================================================================");
    console.log(`AI & Autonomous Voice Suite Complete: ${passed} PASSED | ${failed} FAILED`);
    console.log("==================================================================\n");

    if (failed > 0) process.exit(1);
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runAiAndVoiceSuite();
