"use server";

import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { EventStatus, Role, CommunicationChannel, CommunicationDirection, TaskType, TaskStatus } from "@prisma/client";
import { generateAiPaymentRecoveryDraft, AiPaymentRecoveryDraft } from "@/lib/server/ai/gemini-client";
import { initiateOutboundVoiceCall, VoiceCallResult } from "@/lib/server/voice/calling-agent";
import { processPendingAutomations, dispatchNativeEvent } from "@/lib/server/automation/native-engine";
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import { CORE_WORKFLOWS } from "@/lib/server/automation/workflow-definitions";

/**
 * Returns all configured workflows with their live run metrics, status, and execution stats.
 */
export async function getTenantAutomationsAction() {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    // Fetch existing Automation records for this tenant
    const automations = await db.automation.findMany({
      where: { tenantId },
      include: {
        runs: {
          orderBy: { triggeredAt: "desc" },
          take: 5,
        },
      },
    });

    const automationsByCode = new Map(automations.map((a) => [a.code, a]));

    // Combine canonical workflow definitions with persisted database state
    const workflows = CORE_WORKFLOWS.map((def) => {
      const persisted = automationsByCode.get(def.code);
      return {
        ...def,
        id: persisted?.id || null,
        enabled: persisted ? persisted.enabled : true,
        totalRuns: persisted?.totalRuns || 0,
        lastRunAt: persisted?.lastRunAt ? persisted.lastRunAt.toISOString() : null,
        recentRuns: persisted?.runs.map((r) => ({
          id: r.id,
          status: r.status,
          summary: r.summary,
          triggeredAt: r.triggeredAt.toISOString(),
          errorDetails: r.errorDetails,
        })) || [],
      };
    });

    // Aggregate overall execution and outbox metrics
    const outboxCounts = await db.automationEvent.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    });

    let pendingCount = 0;
    let processedCount = 0;
    let failedCount = 0;

    for (const group of outboxCounts) {
      if (group.status === EventStatus.PENDING || group.status === EventStatus.PROCESSING) {
        pendingCount += group._count.id;
      } else if (group.status === EventStatus.PROCESSED) {
        processedCount += group._count.id;
      } else if (group.status === EventStatus.FAILED) {
        failedCount += group._count.id;
      }
    }

    const totalRuns = workflows.reduce((sum, w) => sum + w.totalRuns, 0);

    return {
      success: true,
      data: serializeForClient({
        workflows,
        stats: {
          totalRuns,
          pendingOutbox: pendingCount,
          processedOutbox: processedCount,
          failedOutbox: failedCount,
          isNativeEngine: true,
          engineMode: "NATIVE_IN_PROCESS",
          engineName: "Native In-Process Node.js / PostgreSQL",
        },
      }),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load automations" };
  }
}

/**
 * Toggles an automation on or off for the tenant.
 */
export async function toggleAutomationAction(code: string, enabled: boolean) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const def = CORE_WORKFLOWS.find((w) => w.code === code);
    if (!def) {
      return { success: false, error: "Invalid automation workflow code" };
    }

    const automation = await db.automation.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
      update: { enabled },
      create: {
        tenantId,
        code,
        name: def.name,
        description: def.description,
        enabled,
      },
    });

    revalidatePath("/automations");
    return { success: true, data: serializeForClient(automation) };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to toggle automation" };
  }
}

/**
 * Fetches recent outbox events for audit and diagnostic inspection.
 */
export async function getTenantOutboxEventsAction(params?: {
  status?: EventStatus;
  limit?: number;
}) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const where: any = { tenantId };
    if (params?.status) {
      where.status = params.status;
    }

    const events = await db.automationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params?.limit || 20,
    });

    return {
      success: true,
      data: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        entityType: e.entityType,
        entityId: e.entityId,
        status: e.status,
        retryCount: e.retryCount,
        idempotencyKey: e.idempotencyKey,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
        processedAt: e.processedAt ? e.processedAt.toISOString() : null,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load outbox events" };
  }
}

/**
 * Retries a failed or dead-letter outbox event.
 */
export async function retryOutboxEventAction(eventId: string) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const event = await db.automationEvent.findFirst({
      where: { id: eventId, tenantId },
    });

    if (!event) {
      return { success: false, error: "Event not found" };
    }

    // Reset to PENDING with cleared error message and reset retries
    const updated = await db.automationEvent.update({
      where: { id: event.id },
      data: {
        status: EventStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
      },
    });

    revalidatePath("/automations");
    return { success: true, data: serializeForClient(updated) };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to retry outbox event" };
  }
}

/**
 * Manually triggers the native in-process automation engine for pending events.
 */
export async function triggerAutomationsAction() {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const summary = await processPendingAutomations({
      tenantId,
      forceDispatch: true,
      batchSize: 25,
    });

    revalidatePath("/automations");
    revalidatePath("/invoices");
    revalidatePath("/tasks");
    revalidatePath("/clients");
    return { success: true, data: serializeForClient(summary) };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to trigger automations" };
  }
}

/**
 * Backwards compatibility alias for triggerAutomationsAction
 */
export async function triggerOutboxDispatchAction() {
  return await triggerAutomationsAction();
}

/**
 * Triggers an autonomous AI voice call test for the tenant.
 */
export async function triggerAiVoiceCallTestAction(clientId?: string) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    let targetClient = null;
    if (clientId) {
      targetClient = await db.client.findFirst({ where: { id: clientId, tenantId } });
    } else {
      targetClient = await db.client.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    }

    if (!targetClient) {
      return { success: false, error: "No client available for AI voice calling." };
    }

    const invoice = await db.invoice.findFirst({
      where: { clientId: targetClient.id, tenantId },
      orderBy: { createdAt: "desc" },
    });

    await dispatchNativeEvent({
      tenantId,
      eventType: "voice.outbound_call_dispatch",
      entityType: "CLIENT",
      entityId: targetClient.id,
      payload: {
        clientId: targetClient.id,
        invoiceId: invoice?.id,
        reason: "PAYMENT_RECOVERY",
        forceSimulated: true,
      },
    });

    const summary = await processPendingAutomations({
      tenantId,
      forceDispatch: true,
      batchSize: 10,
    });

    revalidatePath("/automations");
    revalidatePath("/tasks");
    return { success: true, data: serializeForClient(summary) };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to trigger AI voice call test" };
  }
}

/**
 * Triggers an AI document & bank anomaly audit scan test.
 */
export async function triggerAiAuditScanTestAction(documentId?: string) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    let targetDoc = null;
    if (documentId) {
      targetDoc = await db.document.findFirst({ where: { id: documentId, tenantId }, include: { client: true } });
    } else {
      targetDoc = await db.document.findFirst({ where: { tenantId }, include: { client: true } });
    }

    const docId = targetDoc?.id || "doc_demo_audit_scan";
    const clientName = targetDoc?.client?.name || "Premier Industrial Fabrics Pvt Ltd";

    await dispatchNativeEvent({
      tenantId,
      eventType: "document.ai_anomaly_scan",
      entityType: "DOCUMENT",
      entityId: docId,
      payload: {
        documentName: targetDoc?.name || "HDFC Bank Statement FY26 Q3",
        category: "Bank Statement",
        clientName,
        summary: "Audit sample: 12 supplier payments > 45 days pending to MSME vendors; 2 round-sum cash withdrawals of Rs 2,50,000; TDS deducted at 1% instead of 2% on contract payments.",
      },
    });

    const summary = await processPendingAutomations({
      tenantId,
      forceDispatch: true,
      batchSize: 10,
    });

    revalidatePath("/automations");
    revalidatePath("/tasks");
    return { success: true, data: serializeForClient(summary) };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to trigger AI audit scan" };
  }
}

/**
 * Workflow G Action: Generates context-aware Hinglish & English payment recovery drafts
 * calibrated to invoice ageing using Google Gemini.
 */
export async function generateInvoiceAiPaymentDraftAction(
  invoiceId: string
): Promise<ActionResult<AiPaymentRecoveryDraft>> {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    if (!invoiceId?.trim()) {
      return { success: false, error: "Invoice ID is required." };
    }

    const [invoice, tenant] = await Promise.all([
      db.invoice.findFirst({
        where: { id: invoiceId.trim(), tenantId },
        include: {
          client: true,
          payments: true,
        },
      }),
      db.tenant.findUnique({
        where: { id: tenantId },
      }),
    ]);

    if (!invoice) {
      return { success: false, error: "Invoice not found in this practice firm." };
    }

    const firmName = tenant?.name || "TRUV Chartered Accountants";
    const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(invoice.totalAmount) - paid;

    const now = new Date();
    const dueTime = new Date(invoice.dueDate).getTime();
    const daysOverdue = Math.max(0, Math.ceil((now.getTime() - dueTime) / (1000 * 60 * 60 * 24)));

    let stage: "GENTLE" | "FIRM" | "FINAL_NOTICE" = "GENTLE";
    if (daysOverdue > 30) stage = "FINAL_NOTICE";
    else if (daysOverdue > 10) stage = "FIRM";

    // Call live Google Gemini client
    const draft = await generateAiPaymentRecoveryDraft({
      clientName: invoice.client.name,
      firmName,
      invoiceNumber: invoice.invoiceNumber,
      amount: remaining > 0 ? remaining : Number(invoice.totalAmount),
      dueDate: new Date(invoice.dueDate).toLocaleDateString("en-IN"),
      daysOverdue,
      stage,
      historyContext: `Client GSTIN: ${invoice.client.gstin || "N/A"}. Total billed: INR ${Number(invoice.totalAmount)}.`,
    });

    // Save draft communication to database
    await db.communication.create({
      data: {
        tenantId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "RECOVERY",
        category: "RECOVERY_DRAFT",
        recipient: invoice.client.phone || invoice.client.email || "Primary Contact",
        subject: draft.emailSubject,
        content: `[WhatsApp Hinglish]\n${draft.whatsappHinglish}\n\n[WhatsApp English]\n${draft.whatsappEnglish}\n\n[Email Body]\n${draft.emailBodyHtml}`,
        status: "DELIVERED",
      },
    });

    // If escalation recommended, create partner task
    if (draft.escalationRecommended) {
      await db.task.create({
        data: {
          tenantId,
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          type: TaskType.PAYMENT_ESCALATION,
          title: `Overdue Payment Escalation: ${invoice.client.name} (#${invoice.invoiceNumber})`,
          detail: `AI Recovery Agent flagged invoice #${invoice.invoiceNumber} (${daysOverdue} days overdue, ₹${remaining.toLocaleString("en-IN")} pending) for partner intervention.\nRationale: ${draft.rationale}`,
          priority: "URGENT",
          status: TaskStatus.OPEN,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Update invoice last recovery stage
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        lastRecoveryStage: stage,
        lastReminderAt: new Date(),
      },
    });

    revalidatePath("/payments");
    revalidatePath("/payments/recovery");
    revalidatePath("/invoices");

    return {
      success: true,
      data: serializeForClient(draft),
    };
  } catch (err: any) {
    console.error("[generateInvoiceAiPaymentDraftAction Error]", err);
    return { success: false, error: err.message || "Failed to generate AI recovery draft." };
  }
}

/**
 * Workflow J Action: Initiates an autonomous AI outbound voice call for an overdue invoice.
 */
export async function dispatchAutonomousVoiceCallAction(params: {
  invoiceId: string;
  clientId: string;
}): Promise<ActionResult<VoiceCallResult>> {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const [invoice, client] = await Promise.all([
      db.invoice.findFirst({
        where: { id: params.invoiceId, tenantId },
        include: { payments: true },
      }),
      db.client.findFirst({
        where: { id: params.clientId, tenantId },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      }),
    ]);

    if (!client) {
      return { success: false, error: "Client not found in this practice firm." };
    }
    if (!invoice) {
      return { success: false, error: "Invoice not found in this practice firm." };
    }

    const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(invoice.totalAmount) - paid;
    const phone = client.contacts[0]?.phone || client.phone;

    if (!phone) {
      return { success: false, error: "Client contact phone number missing for voice call." };
    }

    // Initiate voice calling agent
    const callResult = await initiateOutboundVoiceCall({
      tenantId,
      clientId: client.id,
      recipientPhone: phone,
      clientName: client.name,
      reason: "PAYMENT_RECOVERY",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: remaining > 0 ? remaining : Number(invoice.totalAmount),
      dueDate: new Date(invoice.dueDate).toLocaleDateString("en-IN"),
      forceSimulated: true, // Graceful simulation fallback if telephony trunk not dialed
    });

    revalidatePath("/payments");
    revalidatePath("/payments/recovery");
    revalidatePath("/tasks");

    return {
      success: true,
      data: serializeForClient(callResult),
    };
  } catch (err: any) {
    console.error("[dispatchAutonomousVoiceCallAction Error]", err);
    return { success: false, error: err.message || "Failed to dispatch voice call." };
  }
}

import { sendWhatsAppMessage as sendMsg } from "@/lib/server/whatsapp/whatsapp-service";

export async function sendWhatsAppMessage(...args: Parameters<typeof sendMsg>) {
  return sendMsg(...args);
}