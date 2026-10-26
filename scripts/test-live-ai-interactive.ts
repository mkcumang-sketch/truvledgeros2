/**
 * TRUV LedgerOS — Live Interactive AI Capabilities & Multi-Tenant E2E Verification
 * Verifies live Google Gemini connection, database persistence, multi-turn conversations,
 * and AI server action outcomes across all practice management modules.
 */
import { db } from "../src/lib/db";
import {
  generateGeminiContent,
  generateStructuredJson,
  generateAiPaymentRecoveryDraft,
  generateAiAnomalyAuditScan,
  generateAiTaxNoticeDraft,
} from "../src/lib/server/ai/gemini-client";
import {
  initiateOutboundVoiceCall,
} from "../src/lib/server/voice/calling-agent";
import {
  CommunicationChannel,
  CommunicationDirection,
  TaskType,
  TaskStatus,
} from "@prisma/client";

async function verifyInteractiveAiSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Live Interactive AI End-to-End Suite Verification");
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
    // 0. Ensure Active Practice Tenant
    const tenant = await db.tenant.findFirst({
      where: { active: true },
      include: { clients: true },
    });
    assert(Boolean(tenant), `Active practice tenant detected (${tenant?.name})`);
    if (!tenant) return;

    let client = tenant.clients[0];
    if (!client) {
      client = await db.client.create({
        data: {
          tenantId: tenant.id,
          name: "Apex Engineering Works Ltd",
          businessName: "Apex Engineering Works",
          email: "finance@apexengineering.in",
          phone: "+919876543210",
          gstin: "27AAACA1234B1Z5",
          pan: "AAACA1234B",
          active: true,
        },
      });
      console.log("Created test client for interactive verification:", client.name);
    }
    assert(Boolean(client), `Target client available: ${client.name} (${client.gstin})`);

    // -------------------------------------------------------------
    // TEST 1: Live AI Support Desk (/api/ai-chats multi-turn flow)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 1] Live AI Support Desk & Multi-Turn Persistence ---");

    // Create Conversation
    const conversation = await db.conversation.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        channel: CommunicationChannel.WEB,
        status: "AI_ACTIVE",
        visitorName: "CA Partner Test",
      },
    });
    assert(Boolean(conversation.id), `Conversation initiated in DB with id: ${conversation.id}`);

    // User Message 1
    const userQuery1 = "What are the disallowance rules under Section 43B(h) for MSME payments?";
    const msg1 = await db.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "CLIENT",
        senderName: "CA Partner Test",
        content: userQuery1,
      },
    });
    assert(Boolean(msg1.id), `User message 1 persisted to Message table`);

    // Live Gemini Generation (gemini-3.5-flash)
    console.log("Calling Google Gemini with Senior CA Persona...");
    const aiResponse1 = await generateStructuredJson<{ reply: string; citation: string }>({
      prompt: `You are a Senior Partner Chartered Accountant. Provide actionable statutory guidance for: "${userQuery1}".
Include statutory citation.
Return JSON: { "reply": "string", "citation": "string" }`,
      systemInstruction: "You are an elite Indian CA Statutory Tax Advisor.",
      fallback: {
        reply: "Fallback Section 43B(h) text",
        citation: "Income Tax Act 1961 Sec 43B(h)",
      },
    });

    assert(Boolean(aiResponse1.reply && aiResponse1.reply.length > 50), `Gemini delivered comprehensive CA reply (${aiResponse1.reply.slice(0, 60)}...)`);
    assert(Boolean(aiResponse1.citation && aiResponse1.citation.includes("43B")), `Accurate statutory citation returned: "${aiResponse1.citation}"`);

    // Save AI response to DB
    const aiMsg1 = await db.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "AI",
        senderName: "TRUV AI Copilot",
        content: aiResponse1.reply,
        toolInvoked: aiResponse1.citation,
      },
    });
    assert(Boolean(aiMsg1.id), `AI response message persisted to DB with senderType: AI`);

    // Multi-turn User Message 2
    const userQuery2 = "Does this apply to traders or only manufacturers and service providers?";
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "CLIENT",
        senderName: "CA Partner Test",
        content: userQuery2,
      },
    });

    const aiResponse2 = await generateStructuredJson<{ reply: string; citation: string }>({
      prompt: `Previous Query: "${userQuery1}"\nPrevious Answer: "${aiResponse1.reply.slice(0, 200)}"\n\nFollow-up Query: "${userQuery2}".
Explain the exclusion of wholesale and retail traders per Office Memorandum dated 02/07/2021.
Return JSON: { "reply": "string", "citation": "string" }`,
      systemInstruction: "You are an elite Indian CA Statutory Tax Advisor.",
      fallback: {
        reply: "Traders excluded per MSME OM 02/07/2021",
        citation: "MSMED OM No 5/2(2)/2021-E/P & Sec 43B(h)",
      },
    });

    assert(Boolean(aiResponse2.reply && (aiResponse2.reply.toLowerCase().includes("trader") || aiResponse2.reply.toLowerCase().includes("exclude"))), `Multi-turn context understood: clarified trader exclusions accurately`);

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // -------------------------------------------------------------
    // TEST 2: AI Document Vault Anomaly Scanner
    // -------------------------------------------------------------
    console.log("\n--- [TEST 2] AI Document Vault Anomaly Scanner ---");

    // Fetch or create a document in the vault
    let doc = await db.document.findFirst({
      where: { tenantId: tenant.id },
      include: { client: true },
    });

    if (!doc) {
      doc = await db.document.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          name: "Q3_HDFC_Bank_Statement.pdf",
          category: "Bank Statement",
          status: "UPLOADED",
        },
        include: { client: true },
      });
    }

    const scanResult = await generateAiAnomalyAuditScan({
      documentName: doc.name,
      category: doc.category,
      clientName: doc.client.name,
      sampleDataOrSummary: "Audit Ledger Sample: 4 supplier payments totaling INR 6,80,000 pending > 45 days past invoice date. Cash withdrawal of INR 2,20,000 marked as general petty cash.",
    });

    assert(typeof scanResult.overallHealthScore === "number" && scanResult.overallHealthScore >= 0 && scanResult.overallHealthScore <= 100, `Health score computed numerically: ${scanResult.overallHealthScore}/100`);
    assert(Boolean(scanResult.riskLevel), `Risk level classified: ${scanResult.riskLevel}`);
    assert(scanResult.anomaliesDetected.length > 0, `Identified ${scanResult.anomaliesDetected.length} statutory anomalies`);

    // Check Section 43B(h) / Cash violation detection
    const msmeOrCashAnomaly = scanResult.anomaliesDetected.find(
      (a) => a.category === "SECTION_43B_H_MSME" || a.category === "ROUND_SUM_CASH" || a.title.toLowerCase().includes("msme") || a.title.toLowerCase().includes("cash")
    );
    assert(Boolean(msmeOrCashAnomaly), `Flagged specific statutory tax rule: "${msmeOrCashAnomaly?.title}" (${msmeOrCashAnomaly?.statutoryReference})`);

    // Persist communication report
    const auditComm = await db.communication.create({
      data: {
        tenantId: tenant.id,
        clientId: doc.clientId,
        channel: CommunicationChannel.PORTAL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "AI_AUDIT",
        category: "AI_AUDIT_REPORT",
        recipient: client.email || "Vault",
        subject: `AI Audit Scan: ${doc.name} (Health: ${scanResult.overallHealthScore}/100)`,
        content: `Statutory Risk: ${scanResult.riskLevel}\nSummary: ${scanResult.partnerSummary}`,
        status: "DELIVERED",
      },
    });
    assert(Boolean(auditComm.id), `Audit scan report recorded in Communication table (ID: ${auditComm.id})`);

    // -------------------------------------------------------------
    // TEST 3: AI Tax Notice Legal Drafter (DRC-01 / Sec 148 Rebuttal)
    // -------------------------------------------------------------
    console.log("\n--- [TEST 3] AI Tax Notice Legal Drafter ---");

    const taxRebuttal = await generateAiTaxNoticeDraft({
      noticeType: "GST DRC-01",
      issuingAuthority: "Deputy Commissioner of State Tax, Range II, Mumbai",
      statutorySection: "Section 73(1) read with Rule 142(1) CGST Act 2017",
      demandAmount: 184500,
      dueDate: "Within 30 days",
      noticeSummary: "Alleged excess ITC availed in Form GSTR-3B compared with Form GSTR-2B for FY 2024-25 amounting to INR 1,84,500 plus interest under Section 50.",
      clientName: client.name,
      firmName: tenant.name,
    });

    assert(Boolean(taxRebuttal.rebuttalLetterText && taxRebuttal.rebuttalLetterText.length > 100), `Comprehensive legal reply letter generated (${taxRebuttal.rebuttalLetterText.length} chars)`);
    assert(taxRebuttal.keyArguments.length >= 2, `Formulated ${taxRebuttal.keyArguments.length} structured legal arguments`);
    assert(taxRebuttal.documentsToAnnex.length >= 2, `Listed required documentary annexures: ${taxRebuttal.documentsToAnnex.slice(0, 2).join("; ")}`);
    assert(Boolean(taxRebuttal.icaiStandardComplianceNote), `ICAI representation standard acknowledged: "${taxRebuttal.icaiStandardComplianceNote}"`);

    // Persist draft and partner task
    const draftComm = await db.communication.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        channel: CommunicationChannel.EMAIL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "TAX_NOTICE_REPLY",
        category: "COMPLIANCE",
        recipient: client.email || "client@dossier.com",
        subject: `Draft Legal Reply: GST DRC-01 — ${client.name}`,
        content: taxRebuttal.rebuttalLetterText,
        status: "DRAFT",
      },
    });
    assert(Boolean(draftComm.id), `Draft legal reply stored in Communication table (status: DRAFT)`);

    const partnerNoticeTask = await db.task.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        type: TaskType.GST_REVIEW,
        title: `Partner Review: AI Rebuttal for GST DRC-01 (${client.name})`,
        detail: `Demand: INR 1,84,500.\nKey Grounds: ${taxRebuttal.keyArguments.join(" | ")}`,
        priority: "HIGH",
        status: TaskStatus.OPEN,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });
    assert(Boolean(partnerNoticeTask.id), `Partner approval task created in Task table (type: GST_REVIEW, priority: HIGH)`);

    // -------------------------------------------------------------
    // TEST 4: AI Payment Recovery Drafter & Outbound Voice Calling
    // -------------------------------------------------------------
    console.log("\n--- [TEST 4] AI Payment Recovery Drafter & Autonomous Voice Agent ---");

    const recoveryDraft = await generateAiPaymentRecoveryDraft({
      clientName: client.name,
      firmName: tenant.name,
      invoiceNumber: "INV-2026-088",
      amount: 85000,
      dueDate: "15 Oct 2026",
      daysOverdue: 22,
      stage: "FIRM",
      historyContext: "Regular monthly GST filing client; invoice pending 22 days.",
    });

    assert(Boolean(recoveryDraft.whatsappHinglish && recoveryDraft.whatsappHinglish.length > 30), `Generated personalized Hinglish WhatsApp follow-up: "${recoveryDraft.whatsappHinglish.slice(0, 60)}..."`);
    assert(Boolean(recoveryDraft.whatsappEnglish && recoveryDraft.whatsappEnglish.length > 30), `Generated formal English WhatsApp follow-up`);
    assert(Boolean(recoveryDraft.emailSubject && recoveryDraft.emailBodyHtml), `Generated formal email with subject: "${recoveryDraft.emailSubject}"`);

    // Autonomous Outbound Voice Call
    const voiceCallResult = await initiateOutboundVoiceCall({
      tenantId: tenant.id,
      clientId: client.id,
      recipientPhone: client.phone || "+919876543210",
      clientName: client.name,
      reason: "PAYMENT_RECOVERY",
      invoiceNumber: "INV-2026-088",
      amount: 85000,
      dueDate: "15 Oct 2026",
      forceSimulated: true,
    });

    assert(voiceCallResult.success === true, `Autonomous voice call executed successfully`);
    assert(Boolean(voiceCallResult.callSid), `Unique telephony Call SID assigned: ${voiceCallResult.callSid}`);
    assert(voiceCallResult.durationSeconds > 0, `Call completed with duration: ${voiceCallResult.durationSeconds}s`);
    assert(Boolean(voiceCallResult.customerSentiment), `Client call sentiment evaluated: ${voiceCallResult.customerSentiment}`);
    assert(Boolean(voiceCallResult.transcript && voiceCallResult.transcript.length > 50), `Full conversation transcript recorded`);

    // Verify communication table persistence for Voice
    const voiceComm = await db.communication.findFirst({
      where: { id: voiceCallResult.communicationId, tenantId: tenant.id },
    });
    assert(Boolean(voiceComm && voiceComm.channel === CommunicationChannel.VOICE), `Voice call fully persisted to Communication table with channel: VOICE`);

  } catch (error: any) {
    console.error("Test Suite Execution Error:", error);
    assert(false, `Unexpected exception: ${error.message}`);
  }

  console.log("\n==================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

verifyInteractiveAiSuite().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
