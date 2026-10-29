import { generateTaxInvoicePdf } from "@/lib/server/pdf/tax-invoice-generator";
import { db } from "@/lib/db";
import {
  EventStatus,
  InvoiceStatus,
  TaskType,
  TaskStatus,
  PaymentRecoveryStage,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
} from "@prisma/client";
import { sendEmail } from "@/lib/server/email/email-service";
import { generateSecureToken } from "@/lib/auth/password";
import { CORE_WORKFLOWS } from "./workflow-definitions";
import {
  generateAiPaymentRecoveryDraft,
  generateAiAnomalyAuditScan,
  generateAiTaxNoticeDraft,
} from "@/lib/server/ai/gemini-client";
import { initiateOutboundVoiceCall } from "@/lib/server/voice/calling-agent";

export interface NativeEventParams {
  tenantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface NativeEngineOptions {
  batchSize?: number;
  tenantId?: string;
  forceDispatch?: boolean;
}

export interface NativeEngineSummary {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  skipped: number;
  details: Array<{
    eventId: string;
    eventType: string;
    status: "PROCESSED" | "FAILED" | "RETRY_QUEUED" | "SKIPPED";
    error?: string;
  }>;
}

const MAX_RETRIES = 3;

/**
 * Maps an event type string to its canonical workflow code and fallback legacy codes
 */
export function mapEventToWorkflowCode(eventType: string): { canonical: string; legacy: string[] } {
  if (eventType === "invoice.ai_recovery_draft") {
    return { canonical: "AI_PAYMENT_RECOVERY", legacy: ["RECOVERY", "INVOICE"] };
  }
  if (eventType === "document.ai_anomaly_scan" || eventType === "document.verified") {
    return { canonical: "AI_DOCUMENT_AUDIT", legacy: ["DOCS"] };
  }
  if (eventType === "notice.ai_draft_response" || eventType === "notice.uploaded") {
    return { canonical: "AI_TAX_NOTICE", legacy: ["GST"] };
  }
  if (eventType === "voice.outbound_call_dispatch" || eventType.startsWith("voice")) {
    return { canonical: "AI_VOICE_AGENT", legacy: ["RECOVERY", "SUPPORT"] };
  }
  if (eventType.startsWith("client")) {
    return { canonical: "ONBOARDING", legacy: ["DOCS"] };
  }
  if (eventType.startsWith("gst")) {
    return { canonical: "GST_COMPLIANCE", legacy: ["GST"] };
  }
  if (eventType.startsWith("doc")) {
    return { canonical: "DOC_COLLECTION", legacy: ["DOCS"] };
  }
  if (eventType.startsWith("task")) {
    return { canonical: "TASK_APPROVALS", legacy: ["SUPPORT"] };
  }
  if (eventType.startsWith("invoice") || eventType.startsWith("payment")) {
    return { canonical: "INVOICE_REMINDERS", legacy: ["INVOICE", "RECOVERY"] };
  }
  return { canonical: "FAILURE_ALERTS", legacy: ["SUPPORT"] };
}

/**
 * Dispatches an event directly into the native PostgreSQL AutomationEvent ledger.
 * Safe and idempotent.
 */
export async function dispatchNativeEvent(params: NativeEventParams) {
  const key =
    params.idempotencyKey ||
    `evt_${params.eventType}_${params.entityId}_${Date.now()}_${generateSecureToken(8)}`;

  // True idempotency check
  const existing = await db.automationEvent.findUnique({
    where: { idempotencyKey: key },
  });

  if (existing) {
    return existing;
  }

  return await db.automationEvent.create({
    data: {
      tenantId: params.tenantId,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: params.payload as any,
      status: EventStatus.PENDING,
      idempotencyKey: key,
    },
  });
}

/**
 * Checks whether a workflow is enabled for a given tenant.
 * Defaults to true if no explicit record exists.
 */
async function isWorkflowEnabled(tenantId: string, eventType: string): Promise<boolean> {
  const { canonical, legacy } = mapEventToWorkflowCode(eventType);
  const codesToCheck = [canonical, ...legacy];

  const automation = await db.automation.findFirst({
    where: {
      tenantId,
      code: { in: codesToCheck },
    },
  });

  if (!automation) return true;
  return automation.enabled;
}

/**
 * Core In-Process Automation Worker
 * Drains pending AutomationEvents in atomic batches, evaluates tenant rules,
 * and executes domain handlers directly inside Node.js.
 */
export async function processPendingAutomations(
  options: NativeEngineOptions = {}
): Promise<NativeEngineSummary> {
  const batchSize = options.batchSize || 25;

  const whereClause: any = {
    status: EventStatus.PENDING,
    retryCount: { lt: MAX_RETRIES + 1 },
  };

  if (options.tenantId) {
    whereClause.tenantId = options.tenantId;
  }

  // 1. Fetch batch of pending events ordered by timestamp
  const events = await db.automationEvent.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const summary: NativeEngineSummary = {
    processed: events.length,
    succeeded: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    details: [],
  };

  if (events.length === 0) {
    return summary;
  }

  // 2. Process each event sequentially with atomic row-level claim
  for (const event of events) {
    try {
      // Atomic claim: update to PROCESSING only if still PENDING
      const claimResult = await db.automationEvent.updateMany({
        where: {
          id: event.id,
          status: EventStatus.PENDING,
        },
        data: {
          status: EventStatus.PROCESSING,
        },
      });

      if (claimResult.count === 0) {
        summary.skipped++;
        continue;
      }

      // Check tenant workflow rule toggle
      const enabled = await isWorkflowEnabled(event.tenantId, event.eventType);
      if (!enabled && !options.forceDispatch) {
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.PROCESSED,
            processedAt: new Date(),
            errorMessage: "Workflow disabled by practice settings. Skipped execution.",
          },
        });

        await logAutomationExecution({
          tenantId: event.tenantId,
          eventType: event.eventType,
          status: "SUCCESS",
          summary: `Workflow paused: event ${event.eventType} (${event.entityId}) marked PROCESSED.`,
        });

        summary.skipped++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "SKIPPED",
        });
        continue;
      }

      // Fetch tenant configuration for threshold rules
      const tenant = await db.tenant.findUnique({
        where: { id: event.tenantId },
      });

      if (!tenant) {
        throw new Error(`Tenant ${event.tenantId} not found in database.`);
      }

      // 3. Dispatch to native in-process domain handler
      const resultMessage = await executeDomainHandler(event, tenant);

      // 4. Mark PROCESSED
      await db.automationEvent.update({
        where: { id: event.id },
        data: {
          status: EventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      await logAutomationExecution({
        tenantId: event.tenantId,
        eventType: event.eventType,
        status: "SUCCESS",
        summary: resultMessage,
      });

      summary.succeeded++;
      summary.details.push({
        eventId: event.id,
        eventType: event.eventType,
        status: "PROCESSED",
      });
    } catch (err: any) {
      const errorMsg = err.message || "Unknown native execution failure";
      const nextRetryCount = event.retryCount + 1;

      if (nextRetryCount <= MAX_RETRIES) {
        // Queue for bounded retry
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.PENDING,
            retryCount: nextRetryCount,
            errorMessage: `Attempt ${nextRetryCount}/${MAX_RETRIES} failed: ${errorMsg}`,
          },
        });

        summary.retried++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "RETRY_QUEUED",
          error: errorMsg,
        });
      } else {
        // Dead-letter terminal state
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.FAILED,
            retryCount: nextRetryCount,
            errorMessage: `Dead-letter after ${MAX_RETRIES} failed attempts: ${errorMsg}`,
          },
        });

        await logAutomationExecution({
          tenantId: event.tenantId,
          eventType: event.eventType,
          status: "FAILED",
          summary: `Terminal failure for ${event.eventType} (${event.id}). Exhausted ${MAX_RETRIES} retries.`,
          errorDetails: errorMsg,
        });

        summary.failed++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "FAILED",
          error: errorMsg,
        });
      }
    }
  }

  return summary;
}

/**
 * Route event to its specific native business logic handler
 */
async function executeDomainHandler(
  event: {
    id: string;
    tenantId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: any;
  },
  tenant: any
): Promise<string> {
  const { eventType, entityId, tenantId, payload } = event;

  switch (eventType) {
    // ----------------------------------------------------
    // Production AI Module Handlers (Workflows G, H, I, J)
    // ----------------------------------------------------
    case "invoice.ai_recovery_draft":
      return await handleAiPaymentRecoveryDraft(entityId, tenantId, tenant);

    case "document.ai_anomaly_scan":
    case "document.verified":
      return await handleAiDocumentAnomalyScan(entityId, tenantId, tenant, payload);

    case "notice.ai_draft_response":
    case "notice.uploaded":
      return await handleAiTaxNoticeDraft(entityId, tenantId, tenant, payload);

    case "voice.outbound_call_dispatch":
      return await handleVoiceCallDispatch(entityId, tenantId, tenant, payload);

    // ----------------------------------------------------
    // Core Workflow Handlers (Workflows A, B, C, D, E)
    // ----------------------------------------------------
    case "invoice.issued":
    case "invoice.created":
      return await handleInvoiceIssuedOrCreated(entityId, tenantId, tenant);

    case "invoice.overdue":
    case "payment.recovery_check":
      return await handleInvoiceOverdue(entityId, tenantId, tenant);

    case "gst.deadline_approaching":
    case "gst.period_due":
      return await handleGstDeadlineApproaching(tenantId);

    case "doc.reminder_due":
    case "doc.request.pending":
      return await handleDocReminderDue(tenantId, tenant);

    case "client.created":
    case "clients.bulk_imported":
      return await handleClientCreatedOrImported(entityId, tenantId);

    case "task.assigned":
    case "task.rejected":
      return await handleTaskAssignedOrRejected(entityId, tenantId, eventType);

    case "invoice.paid":
    case "payment.created":
      return await handleInvoicePaidOrPaymentCreated(entityId, tenantId);

    default:
      return `Processed domain event ${eventType} for ${entityId} safely.`;
  }
}

/**
 * Handler G: AI Dynamic Payment Recovery Drafter (Workflow G)
 */
async function handleAiPaymentRecoveryDraft(
  invoiceId: string,
  tenantId: string,
  tenant: any
): Promise<string> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { client: true },
  });

  if (!invoice) return `Invoice ${invoiceId} not found; skipping AI draft.`;

  const daysOverdue = invoice.dueDate
    ? Math.max(1, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 7;

  const stage = invoice.lastRecoveryStage === "FINAL_NOTICE"
    ? "FINAL_NOTICE"
    : invoice.lastRecoveryStage === "FIRM"
    ? "FIRM"
    : "GENTLE";

  const aiDraft = await generateAiPaymentRecoveryDraft({
    clientName: invoice.client.name,
    firmName: tenant.name,
    invoiceNumber: invoice.invoiceNumber,
    amount: Number(invoice.totalAmount),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-IN") : "Past Due",
    daysOverdue,
    stage,
  });

  // Persist draft in Communication table awaiting partner dispatch/approval
  const comm = await db.communication.create({
    data: {
      tenantId,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      purpose: "RECOVERY",
      category: "AI_PAYMENT_DRAFT",
      recipient: invoice.client.phone || invoice.client.email,
      subject: aiDraft.emailSubject,
      content: `[AI DRAFT — ${stage}]\n\n[WHATSAPP HINGLISH]:\n${aiDraft.whatsappHinglish}\n\n[WHATSAPP ENGLISH]:\n${aiDraft.whatsappEnglish}\n\n[EMAIL BODY]:\n${aiDraft.emailBodyHtml}\n\n[RATIONALE]: ${aiDraft.rationale}`,
      status: CommunicationStatus.STANDBY,
    },
  });

  // Create partner approval task
  const taskTitle = `Approve AI Recovery Draft: ${invoice.client.name} (Invoice #${invoice.invoiceNumber})`;
  const existingTask = await db.task.findFirst({
    where: { tenantId, invoiceId: invoice.id, title: taskTitle, status: TaskStatus.OPEN },
  });

  if (!existingTask) {
    await db.task.create({
      data: {
        tenantId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        referenceId: comm.id,
        type: TaskType.INVOICE_APPROVAL,
        title: taskTitle,
        detail: `Gemini AI drafted a ${stage} payment recovery message for ₹${Number(invoice.totalAmount).toLocaleString("en-IN")}. Review Hinglish/English drafts in Communications and approve dispatch.`,
        priority: stage === "FINAL_NOTICE" ? "URGENT" : "HIGH",
        status: TaskStatus.OPEN,
      },
    });
  }

  return `AI Payment Recovery draft generated for Invoice ${invoice.invoiceNumber} (Stage: ${stage}, Comm ID: ${comm.id}).`;
}

/**
 * Handler H: AI Bank & Document Anomaly Scanner (Workflow H)
 */
async function handleAiDocumentAnomalyScan(
  documentId: string,
  tenantId: string,
  tenant: any,
  payload?: any
): Promise<string> {
  const document = await db.document.findFirst({
    where: { id: documentId, tenantId },
    include: { client: true },
  });

  const clientName = document?.client?.name || payload?.clientName || "Practice Client";
  const docName = document?.name || payload?.documentName || "Bank Statement & Ledger FY26";
  const docCategory = document?.category || payload?.category || "Bank Statement";

  const scanResult = await generateAiAnomalyAuditScan({
    documentName: docName,
    category: docCategory,
    clientName,
    sampleDataOrSummary: payload?.summary || `Audit scan of ${docName} under category ${docCategory}`,
  });

  // Log in Communication / Audit log
  await db.communication.create({
    data: {
      tenantId,
      clientId: document?.clientId || null,
      channel: CommunicationChannel.PORTAL,
      direction: CommunicationDirection.INBOUND,
      purpose: "DOCS",
      category: "AI_AUDIT_REPORT",
      recipient: "practice-audit-team",
      subject: `AI Audit Scan [${scanResult.riskLevel}]: ${docName} (${clientName})`,
      content: `[OVERALL HEALTH SCORE]: ${scanResult.overallHealthScore}/100\n[RISK LEVEL]: ${scanResult.riskLevel}\n\n[SUMMARY]: ${scanResult.partnerSummary}\n\n[ANOMALIES DETECTED]:\n${scanResult.anomaliesDetected.map((a, i) => `${i + 1}. [${a.category}] ${a.title}: ${a.description} (Exposure: ₹${a.estimatedExposureInr || 0}) — Action: ${a.recommendedAction}`).join("\n\n")}`,
      status: "DELIVERED",
    },
  });

  // If high or critical risk, create review task
  if (scanResult.riskLevel === "CRITICAL" || scanResult.riskLevel === "HIGH" || scanResult.riskLevel === "MEDIUM") {
    const taskTitle = `Statutory Anomaly Review [${scanResult.riskLevel}]: ${docName} (${clientName})`;
    const existingTask = await db.task.findFirst({
      where: { tenantId, title: taskTitle, status: TaskStatus.OPEN },
    });

    if (!existingTask) {
      await db.task.create({
        data: {
          tenantId,
          clientId: document?.clientId || null,
          referenceId: document?.id || null,
          type: TaskType.GENERAL,
          title: taskTitle,
          detail: `AI audit scanner identified ${scanResult.anomaliesDetected.length} potential statutory anomalies in ${docName} (Health Score: ${scanResult.overallHealthScore}/100). Highlights: ${scanResult.partnerSummary}`,
          priority: scanResult.riskLevel === "CRITICAL" ? "URGENT" : "HIGH",
          status: TaskStatus.OPEN,
        },
      });
    }
  }

  return `AI Anomaly Scan completed for ${docName}: Risk ${scanResult.riskLevel}, ${scanResult.anomaliesDetected.length} anomalies flagged.`;
}

/**
 * Handler I: AI Smart Tax Notice & Demand Drafter (Workflow I)
 */
async function handleAiTaxNoticeDraft(
  entityId: string,
  tenantId: string,
  tenant: any,
  payload?: any
): Promise<string> {
  const client = await db.client.findFirst({
    where: { id: payload?.clientId || entityId, tenantId },
  });

  const clientName = client?.name || payload?.clientName || "Practice Client";
  const noticeType = payload?.noticeType || "GST DRC-01 (Show Cause Notice)";
  const issuingAuthority = payload?.issuingAuthority || "State GST Enforcement Wing, Range-IV";
  const statutorySection = payload?.statutorySection || "Section 73(1) of CGST Act, 2017";
  const demandAmount = Number(payload?.demandAmount) || 185000;

  const rebuttal = await generateAiTaxNoticeDraft({
    noticeType,
    issuingAuthority,
    statutorySection,
    demandAmount,
    dueDate: payload?.dueDate || "30 Days from date of receipt",
    noticeSummary: payload?.noticeSummary || "Alleged mismatch between GSTR-3B tax payment and GSTR-1 outward supplies for Q2 FY26.",
    clientName,
    firmName: tenant.name,
  });

  // Save legal rebuttal draft to Communication table
  const comm = await db.communication.create({
    data: {
      tenantId,
      clientId: client?.id || null,
      channel: CommunicationChannel.PORTAL,
      direction: CommunicationDirection.OUTBOUND,
      purpose: "GST_DATA",
      category: "AI_TAX_REBUTTAL",
      recipient: issuingAuthority,
      subject: `Preliminary Legal Reply: ${noticeType} under ${statutorySection} (${clientName})`,
      content: `[NOTICE TYPE]: ${rebuttal.noticeType}\n[AUTHORITY]: ${rebuttal.issuingAuthority}\n[SECTION]: ${rebuttal.statutorySection}\n[DEMAND]: ₹${rebuttal.allegedDemandInr.toLocaleString("en-IN")}\n\n[KEY ARGUMENTS]:\n${rebuttal.keyArguments.map((arg, i) => `${i + 1}. ${arg}`).join("\n")}\n\n[REBUTTAL LETTER TEXT]:\n${rebuttal.rebuttalLetterText}\n\n[ANNEXURES REQUIRED]:\n${rebuttal.documentsToAnnex.join(", ")}\n\n[COMPLIANCE]: ${rebuttal.icaiStandardComplianceNote}`,
      status: CommunicationStatus.STANDBY,
    },
  });

  // Create partner review task
  const taskTitle = `Review Tax Notice Rebuttal: ${statutorySection} (${clientName})`;
  const existing = await db.task.findFirst({
    where: { tenantId, title: taskTitle, status: TaskStatus.OPEN },
  });

  if (!existing) {
    await db.task.create({
      data: {
        tenantId,
        clientId: client?.id || null,
        referenceId: comm.id,
        type: TaskType.GST_REVIEW,
        title: taskTitle,
        detail: `AI Tax Notice Drafter generated a structured legal defense for ${noticeType} (Demand: ₹${demandAmount.toLocaleString("en-IN")}). Please review preliminary rebuttal letter and verify annexures.`,
        priority: "URGENT",
        status: TaskStatus.OPEN,
      },
    });
  }

  return `AI Tax Notice Rebuttal drafted for ${clientName} (${statutorySection}, Comm ID: ${comm.id}).`;
}

/**
 * Handler J: Autonomous AI Voice Calling Agent (Workflow J)
 */
async function handleVoiceCallDispatch(
  entityId: string,
  tenantId: string,
  tenant: any,
  payload?: any
): Promise<string> {
  const client = await db.client.findFirst({
    where: { id: payload?.clientId || entityId, tenantId },
  });

  if (!client) {
    return `Client not found for voice call dispatch.`;
  }

  const invoice = payload?.invoiceId
    ? await db.invoice.findFirst({ where: { id: payload.invoiceId, tenantId } })
    : await db.invoice.findFirst({ where: { clientId: client.id, tenantId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } }, orderBy: { dueDate: "asc" } });

  const callResult = await initiateOutboundVoiceCall({
    tenantId,
    clientId: client.id,
    recipientPhone: client.phone || "+919876543210",
    clientName: client.name,
    reason: payload?.reason || "PAYMENT_RECOVERY",
    invoiceId: invoice?.id,
    invoiceNumber: invoice?.invoiceNumber,
    amount: invoice ? Number(invoice.totalAmount) : undefined,
    dueDate: invoice?.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-IN") : undefined,
    documentTitle: payload?.documentTitle,
    languagePreference: payload?.languagePreference || "HINGLISH",
    forceSimulated: payload?.forceSimulated ?? true,
  });

  return `Autonomous Voice Call dispatched via ${callResult.provider} (SID: ${callResult.callSid}, Status: ${callResult.status}, Comm ID: ${callResult.communicationId}).`;
}

/**
 * Handler 1: Invoice Issued / Created Notification & Transactional Email
 */
async function handleInvoiceIssuedOrCreated(
  invoiceId: string,
  tenantId: string,
  tenant: any
): Promise<string> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { client: true },
  });

  if (!invoice) {
    return `Invoice ${invoiceId} not found; skipping notification.`;
  }

  const client = invoice.client;
  const recipientEmail = client?.email?.trim();
  const formattedAmount = `₹${Number(invoice.totalAmount).toLocaleString("en-IN")}`;
  const dueDateStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Upon Receipt";

  let emailDelivered = false;

  if (recipientEmail) {
    const subject = `Tax Invoice #${invoice.invoiceNumber} from ${tenant.name}`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Tax Invoice Issued</h2>
        <p>Dear ${client.name},</p>
        <p>We have issued tax invoice <strong>#${invoice.invoiceNumber}</strong> for professional services rendered.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p style="margin: 4px 0;"><strong>Total Amount:</strong> ${formattedAmount}</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDateStr}</p>
          <p style="margin: 4px 0;"><strong>Service:</strong> ${invoice.serviceDescription || "Chartered Accountancy & Advisory Services"}</p>
        </div>
        <p>Please arrange payment prior to the due date. Thank you for your continued partnership.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">${tenant.name} &bull; Practice Management System</p>
      </div>
    `;
    const text = `Dear ${client.name},\n\nTax Invoice #${invoice.invoiceNumber} has been issued for ${formattedAmount}. Due Date: ${dueDateStr}.\n\nThank you,\n${tenant.name}`;

    try {
      let pdfAttachment;
      try {
        const pdfBuf = await generateTaxInvoicePdf(invoice.id, tenantId);
        pdfAttachment = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuf, contentType: "application/pdf" }];
      } catch (pdfErr: any) {
        console.warn("[PDF-ATTACH-WARN]", pdfErr.message);
      }

      const emailRes = await sendEmail({
        to: recipientEmail,
        subject,
        html,
        text,
        tenantId,
        category: "NOTIFICATION",
        attachments: pdfAttachment,
      });
      emailDelivered = emailRes.success;
    } catch (err: any) {
      console.warn(`[NATIVE-ENGINE-EMAIL-WARN] Invoice notification failed for ${recipientEmail}:`, err.message);
    }

    // Record outbound Communication
    await db.communication.create({
      data: {
        tenantId,
        clientId: client.id,
        invoiceId: invoice.id,
        channel: CommunicationChannel.EMAIL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "INVOICE",
        category: "BILLING",
        recipient: recipientEmail,
        subject,
        content: `Tax Invoice #${invoice.invoiceNumber} issued for ${formattedAmount}. Due: ${dueDateStr}.`,
        status: emailDelivered ? "SENT" : "FAILED",
      },
    });
  }

  return `Invoice ${invoice.invoiceNumber} notification logged${emailDelivered ? " and dispatched via SMTP" : ""}.`;
}

/**
 * Handler 2: Invoice Overdue / Aging Checks & Payment Recovery Stages
 */
async function handleInvoiceOverdue(
  entityId: string,
  tenantId: string,
  tenant: any
): Promise<string> {
  const gentleDays = tenant.recoveryGentleDays ?? 7;
  const firmDays = tenant.recoveryFirmDays ?? 15;
  const finalDays = tenant.recoveryFinalDays ?? 30;

  const isSpecificInvoice = entityId && entityId.startsWith("cm");
  const where: any = {
    tenantId,
    status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
  };
  if (isSpecificInvoice) {
    where.id = entityId;
  }

  const overdueInvoices = await db.invoice.findMany({
    where,
    include: { client: true },
    take: 50,
  });

  let transitioned = 0;
  let escalated = 0;
  const now = Date.now();

  for (const inv of overdueInvoices) {
    if (!inv.dueDate) continue;

    const daysOverdue = Math.floor((now - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 0) continue;

    let targetStage: PaymentRecoveryStage | null = null;

    if (daysOverdue >= finalDays) {
      targetStage = PaymentRecoveryStage.FINAL_NOTICE;
    } else if (daysOverdue >= firmDays) {
      targetStage = PaymentRecoveryStage.FIRM;
    } else if (daysOverdue >= gentleDays) {
      targetStage = PaymentRecoveryStage.GENTLE;
    }

    if (targetStage && inv.lastRecoveryStage !== targetStage) {
      await db.invoice.update({
        where: { id: inv.id },
        data: {
          lastRecoveryStage: targetStage,
          status: InvoiceStatus.OVERDUE,
          lastReminderAt: new Date(),
        },
      });
      transitioned++;
    }

    // Overdue > finalDays (default 30 days): Queue partner escalation task & AI recovery draft
    if (daysOverdue >= finalDays) {
      const existingTask = await db.task.findFirst({
        where: {
          tenantId,
          invoiceId: inv.id,
          type: TaskType.PAYMENT_ESCALATION,
          status: TaskStatus.OPEN,
        },
      });

      if (!existingTask) {
        await db.task.create({
          data: {
            tenantId,
            invoiceId: inv.id,
            clientId: inv.clientId,
            type: TaskType.PAYMENT_ESCALATION,
            title: `Urgent Payment Escalation: Invoice #${inv.invoiceNumber} (${daysOverdue}d overdue)`,
            detail: `Invoice #${inv.invoiceNumber} for ₹${Number(inv.totalAmount).toLocaleString("en-IN")} issued to ${inv.client?.name || "Client"} is ${daysOverdue} days overdue. Recovery stage: FINAL_NOTICE. Partner intervention required.`,
            priority: "URGENT",
            status: TaskStatus.OPEN,
          },
        });
        escalated++;
      }
    }
  }

  return `Aging recovery evaluated: ${transitioned} stages transitioned, ${escalated} partner escalation tasks created.`;
}

/**
 * Handler 3: GST Compliance Reminders & Partner Review Tasks
 */
async function handleGstDeadlineApproaching(tenantId: string): Promise<string> {
  const pendingReturns = await db.gstReturn.findMany({
    where: {
      tenantId,
      status: "DATA_PENDING",
    },
    include: { client: true },
    take: 50,
  });

  let createdTasks = 0;

  for (const ret of pendingReturns) {
    const taskTitle = `GST Data Pending: ${ret.client?.name || "Client"} (${ret.returnType} ${ret.period})`;

    const existingTask = await db.task.findFirst({
      where: {
        tenantId,
        clientId: ret.clientId,
        type: TaskType.GST_REVIEW,
        title: taskTitle,
        status: TaskStatus.OPEN,
      },
    });

    if (!existingTask) {
      await db.task.create({
        data: {
          tenantId,
          clientId: ret.clientId,
          referenceId: ret.id,
          type: TaskType.GST_REVIEW,
          title: taskTitle,
          detail: `Statutory GST data for ${ret.returnType} (${ret.period}) has not been received from ${ret.client?.name || "Client"}. Due date: ${new Date(ret.dueDate).toLocaleDateString("en-IN")}. Please follow up to prevent statutory late fees.`,
          priority: "HIGH",
          dueDate: ret.dueDate,
          status: TaskStatus.OPEN,
        },
      });
      createdTasks++;
    }
  }

  return `GST compliance checked: ${createdTasks} staff review tasks created for ${pendingReturns.length} pending returns.`;
}

/**
 * Handler 4: Document Collection Reminders & Escalations
 */
async function handleDocReminderDue(tenantId: string, tenant: any): Promise<string> {
  const limit = tenant.docReminderLimit ?? 3;

  const pendingRequests = await db.documentRequest.findMany({
    where: {
      tenantId,
      status: "PENDING",
    },
    include: { client: true },
    take: 50,
  });

  let remindersSent = 0;
  let escalatedTasks = 0;

  for (const docReq of pendingRequests) {
    const nextCount = docReq.reminderCount + 1;

    await db.documentRequest.update({
      where: { id: docReq.id },
      data: {
        reminderCount: nextCount,
        lastReminderAt: new Date(),
      },
    });
    remindersSent++;

    // Threshold reached: Alert partner
    if (nextCount >= limit) {
      const taskTitle = `Document Collection Escalation: ${docReq.title}`;

      const existingTask = await db.task.findFirst({
        where: {
          tenantId,
          clientId: docReq.clientId,
          type: TaskType.DOCUMENT_CALL,
          title: taskTitle,
          status: TaskStatus.OPEN,
        },
      });

      if (!existingTask) {
        await db.task.create({
          data: {
            tenantId,
            clientId: docReq.clientId,
            referenceId: docReq.id,
            type: TaskType.DOCUMENT_CALL,
            title: taskTitle,
            detail: `Client ${docReq.client?.name || "Client"} has reached the maximum threshold of ${limit} reminders for "${docReq.title}". Partner phone call or manual intervention required.`,
            priority: "HIGH",
            status: TaskStatus.OPEN,
          },
        });
        escalatedTasks++;
      }
    }
  }

  return `Document collection evaluated: ${remindersSent} reminders incremented, ${escalatedTasks} partner escalation tasks created.`;
}

/**
 * Handler 5: Client Onboarding Standard 3-Step CA Tasks
 */
async function handleClientCreatedOrImported(
  clientId: string,
  tenantId: string
): Promise<string> {
  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
  });

  if (!client) {
    return `Client ${clientId} not found; skipping onboarding task creation.`;
  }

  const onboardingTasks = [
    {
      title: `KYC Verification & PAN Validation for ${client.name}`,
      detail: `Verify PAN, Aadhaar, GSTIN certificates, and incorporation documents for ${client.name}.`,
      priority: "HIGH",
      daysDue: 2,
    },
    {
      title: `GST Portal Credential Audit & Linking for ${client.name}`,
      detail: `Audit GST portal credentials, verify authorized signatory registration, and configure API sync for ${client.name}.`,
      priority: "NORMAL",
      daysDue: 5,
    },
    {
      title: `Prior Period Filing & Ledger Reconciliation for ${client.name}`,
      detail: `Examine past 12 months GSTR-1, GSTR-3B filings and 26AS/AIS tax credits for ${client.name}.`,
      priority: "NORMAL",
      daysDue: 7,
    },
  ];

  let tasksCreated = 0;

  for (const taskDef of onboardingTasks) {
    const existing = await db.task.findFirst({
      where: {
        tenantId,
        clientId: client.id,
        title: taskDef.title,
      },
    });

    if (!existing) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + taskDef.daysDue);

      await db.task.create({
        data: {
          tenantId,
          clientId: client.id,
          type: TaskType.GENERAL,
          title: taskDef.title,
          detail: taskDef.detail,
          priority: taskDef.priority,
          dueDate,
          status: TaskStatus.OPEN,
        },
      });
      tasksCreated++;
    }
  }

  return `Client onboarding initialized: ${tasksCreated} statutory setup tasks created for ${client.name}.`;
}

/**
 * Handler 6: Task Assigned / Rejected Notification
 */
async function handleTaskAssignedOrRejected(
  taskId: string,
  tenantId: string,
  eventType: string
): Promise<string> {
  const task = await db.task.findFirst({
    where: { id: taskId, tenantId },
    include: { assignedTo: true },
  });

  if (!task) return `Task ${taskId} not found.`;

  const assigneeEmail = task.assignedTo?.email;
  if (assigneeEmail) {
    const isRejection = eventType === "task.rejected";
    const subject = isRejection
      ? `Task Returned for Review: ${task.title}`
      : `Task Assigned: ${task.title}`;

    try {
      await sendEmail({
        to: assigneeEmail,
        subject,
        html: `<p>Hello ${task.assignedTo?.name || "Team Member"},</p><p>${subject}</p><p><strong>Priority:</strong> ${task.priority}</p>`,
        text: `${subject}\nPriority: ${task.priority}`,
        tenantId,
        category: "NOTIFICATION",
      });
    } catch (err: any) {
      console.warn("[NATIVE-ENGINE-TASK-NOTIFY-WARN]", err.message);
    }
  }

  return `Task ${taskId} ${eventType} handled successfully.`;
}

/**
 * Handler 7: Invoice Paid / Payment Created Reconciliation
 */
async function handleInvoicePaidOrPaymentCreated(
  entityId: string,
  tenantId: string
): Promise<string> {
  const invoice = await db.invoice.findFirst({
    where: { id: entityId, tenantId },
  });

  if (invoice && invoice.status === "PAID") {
    await db.task.updateMany({
      where: {
        tenantId,
        invoiceId: invoice.id,
        type: TaskType.PAYMENT_ESCALATION,
        status: TaskStatus.OPEN,
      },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        resolutionNote: "Automatically resolved: Invoice marked PAID.",
      },
    });
    return `Payment reconciled: Invoice ${invoice.invoiceNumber} paid, escalation tasks resolved.`;
  }

  return `Reconciliation checked for ${entityId}.`;
}

/**
 * Helper to record Automation and AutomationRun logs in database
 */
async function logAutomationExecution(params: {
  tenantId: string;
  eventType: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  summary: string;
  errorDetails?: string;
}) {
  try {
    const { canonical, legacy } = mapEventToWorkflowCode(params.eventType);

    let automation = await db.automation.findFirst({
      where: {
        tenantId: params.tenantId,
        code: { in: [canonical, ...legacy] },
      },
    });

    if (!automation) {
      const def = CORE_WORKFLOWS.find((w) => w.code === canonical);
      automation = await db.automation.create({
        data: {
          tenantId: params.tenantId,
          code: canonical,
          name: def?.name || `${canonical} Automation`,
          description: def?.description || `Native automated engine for ${canonical}`,
          enabled: true,
          totalRuns: 1,
          lastRunAt: new Date(),
        },
      });
    } else {
      await db.automation.update({
        where: { id: automation.id },
        data: {
          totalRuns: { increment: 1 },
          lastRunAt: new Date(),
        },
      });
    }

    await db.automationRun.create({
      data: {
        automationId: automation.id,
        status: params.status,
        summary: params.summary,
        errorDetails: params.errorDetails || null,
      },
    });
  } catch (logErr) {
    console.error("[NATIVE-AUTOMATION-LOG-ERROR]", logErr);
  }
}
