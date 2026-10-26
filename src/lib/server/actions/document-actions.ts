"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import {
  DocumentStatus,
  TaskType,
  TaskStatus,
  CommunicationChannel,
  CommunicationDirection,
} from "@prisma/client";
import {
  generateAiAnomalyAuditScan,
  AiAnomalyScanResult,
} from "@/lib/server/ai/gemini-client";
import { logSecurityEvent } from "@/lib/server/audit";
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";

export interface CreateDocumentRequestParams {
  clientId: string;
  title: string;
  description?: string | null;
}

/**
 * Creates a formal document request for a client.
 */
export async function createDocumentRequestAction(params: CreateDocumentRequestParams) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!params.title.trim()) {
      return { success: false, error: "Document title is required." };
    }

    // Verify target client belongs to the authenticated firm (IDOR protection)
    const client = await db.client.findFirst({
      where: { id: params.clientId, tenantId },
    });
    if (!client) {
      return { success: false, error: "Client not found in this practice." };
    }

    const request = await db.documentRequest.create({
      data: {
        tenantId,
        clientId: params.clientId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        status: DocumentStatus.PENDING,
        reminderCount: 0,
      },
    });

    revalidatePath("/documents");
    revalidatePath(`/clients/${params.clientId}`);
    return { success: true, data: serializeForClient(request) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create document request." };
  }
}

/**
 * Escalates reminders for an outstanding document request.
 * Increments reminderCount, updates lastReminderAt, and notifies partners
 * if threshold is exceeded.
 */
export async function escalateDocumentRequestReminderAction(requestId: string) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const request = await db.documentRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        client: { select: { id: true, name: true } },
        tenant: { select: { docReminderLimit: true } },
      },
    });

    if (!request) {
      return { success: false, error: "Document request not found." };
    }

    if (request.status === DocumentStatus.VERIFIED) {
      return { success: false, error: "Document has already been submitted and verified." };
    }

    const newReminderCount = request.reminderCount + 1;
    const isEscalatedToPartner = newReminderCount >= (request.tenant.docReminderLimit || 3);

    const updated = await db.documentRequest.update({
      where: { id: requestId },
      data: {
        reminderCount: newReminderCount,
        lastReminderAt: new Date(),
      },
    });

    // If exceeded reminder limit, record audit event and notify firm partners
    if (isEscalatedToPartner) {
      await logSecurityEvent({
        tenantId,
        userId: context.user.id,
        action: "DOCUMENT_REMINDER_ESCALATED" as any,
        entityType: "DOCUMENT",
        entityId: requestId,
        newValue: {
          client: request.client.name,
          reminderCount: newReminderCount,
          status: "ESCALATED_TO_PARTNER",
        },
      });

      await db.notification.create({
        data: {
          tenantId,
          title: `Document Escalation: ${request.client.name}`,
          message: `Client ${request.client.name} has not submitted requested document "${request.title}" after ${newReminderCount} reminders. Partner intervention required.`,
          linkUrl: `/clients/${request.clientId}`,
        },
      });
    }

    revalidatePath("/documents");
    revalidatePath(`/clients/${request.clientId}`);
    return {
      success: true,
      data: serializeForClient({
        ...updated,
        isEscalatedToPartner,
        clientName: request.client.name,
      }),
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to escalate document reminder." };
  }
}

/**
 * Creates a document entry in the client vault.
 */
export async function createDocumentAction(params: {
  clientId: string;
  name: string;
  category: string;
  fileSize?: number | null;
  mimeType?: string | null;
  fileUrl?: string | null;
  requestId?: string | null;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!params.name.trim()) {
      return { success: false, error: "Document name is required." };
    }

    const client = await db.client.findFirst({
      where: { id: params.clientId, tenantId },
    });
    if (!client) {
      return { success: false, error: "Client not found in this practice." };
    }

    const doc = await db.document.create({
      data: {
        tenantId,
        clientId: params.clientId,
        name: params.name.trim(),
        category: params.category || "General",
        fileSize: params.fileSize || null,
        mimeType: params.mimeType || "application/pdf",
        fileUrl: params.fileUrl || null,
        requestId: params.requestId || null,
        status: DocumentStatus.UPLOADED,
      },
    });

    if (params.requestId) {
      await db.documentRequest.updateMany({
        where: { id: params.requestId, tenantId },
        data: { status: DocumentStatus.UPLOADED },
      });
    }

    revalidatePath("/documents");
    revalidatePath(`/clients/${params.clientId}`);
    return { success: true, data: serializeForClient(doc) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to upload document." };
  }
}

/**
 * Verifies or rejects a document with audit tracking.
 */
export async function updateDocumentStatusAction(params: {
  documentId: string;
  status: DocumentStatus;
  rejectionReason?: string;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const doc = await db.document.findFirst({
      where: { id: params.documentId, tenantId },
    });
    if (!doc) {
      return { success: false, error: "Document not found in this practice." };
    }

    const updated = await db.document.update({
      where: { id: params.documentId },
      data: {
        status: params.status,
        verifiedAt: params.status === DocumentStatus.VERIFIED ? new Date() : null,
        verifiedById: params.status === DocumentStatus.VERIFIED ? context.user.id : null,
        rejectionReason: params.rejectionReason?.trim() || null,
      },
    });

    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "CLIENT_UPDATED",
      entityType: "DOCUMENT",
      entityId: doc.id,
      newValue: { status: params.status, rejectionReason: params.rejectionReason || null },
    });

    revalidatePath("/documents");
    revalidatePath(`/clients/${doc.clientId}`);
    return { success: true, data: serializeForClient(updated) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update document status." };
  }
}

/**
 * Executes a statutory AI anomaly audit scan on a client vault document using Google Gemini.
 * Identifies Section 43B(h) MSME overdue risks, Section 40A(3) cash transactions, and TDS mismatches.
 * Automatically persists the audit finding and escalates high-risk anomalies to firm partners.
 */
export async function runAiDocumentAnomalyScanAction(
  documentId: string
): Promise<ActionResult<AiAnomalyScanResult>> {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!documentId?.trim()) {
      return { success: false, error: "Document ID is required for AI audit scan." };
    }

    const doc = await db.document.findFirst({
      where: { id: documentId.trim(), tenantId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            businessName: true,
            email: true,
            phone: true,
            gstin: true,
            pan: true,
          },
        },
      },
    });

    if (!doc) {
      return { success: false, error: "Document not found in this practice firm." };
    }

    // Prepare contextual audit summary
    const sampleData = `Document: ${doc.name}
Category: ${doc.category}
Client: ${doc.client.name} (GSTIN: ${doc.client.gstin || "Unregistered"}, PAN: ${doc.client.pan || "N/A"})
Status: ${doc.status}
Uploaded: ${doc.createdAt.toISOString()}
File Size: ${doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : "Standard Scan"}`;

    // Execute live Gemini statutory scan
    const scanResult = await generateAiAnomalyAuditScan({
      documentName: doc.name,
      category: doc.category,
      clientName: doc.client.name,
      sampleDataOrSummary: sampleData,
    });

    // 1. Record audit scan report in Communication table
    await db.communication.create({
      data: {
        tenantId,
        clientId: doc.clientId,
        channel: CommunicationChannel.PORTAL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "AI_AUDIT",
        category: "AI_AUDIT_REPORT",
        recipient: doc.client.email || doc.client.phone || "Vault",
        subject: `AI Audit Scan: ${doc.name} (Health: ${scanResult.overallHealthScore}/100)`,
        content: `Statutory Risk Level: ${scanResult.riskLevel}
Health Score: ${scanResult.overallHealthScore}/100
Partner Summary: ${scanResult.partnerSummary}

Anomalies Detected:
${scanResult.anomaliesDetected
  .map(
    (a, i) =>
      `${i + 1}. [${a.category}] ${a.title} (${a.statutoryReference}) - Exposure: INR ${a.estimatedExposureInr || 0}\nAction: ${a.recommendedAction}`
  )
  .join("\n\n")}`,
        status: "DELIVERED",
      },
    });

    // 2. If Risk is Critical or High, create an escalation task for CA Partner review
    if (scanResult.riskLevel === "CRITICAL" || scanResult.riskLevel === "HIGH") {
      const topAnomaly = scanResult.anomaliesDetected[0];
      await db.task.create({
        data: {
          tenantId,
          clientId: doc.clientId,
          type: TaskType.DOCUMENT_CALL,
          title: `[AI Audit Alert] ${scanResult.riskLevel} Risk: ${doc.name}`,
          detail: `${scanResult.partnerSummary}\n\nTop Anomaly: ${topAnomaly?.title || "Review required"} (${topAnomaly?.statutoryReference || "Statutory Check"}). Recommended: ${topAnomaly?.recommendedAction || "Investigate voucher"}`,
          priority: scanResult.riskLevel === "CRITICAL" ? "URGENT" : "HIGH",
          status: TaskStatus.OPEN,
          referenceId: doc.id,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
        },
      });
    }

    // 3. Log security and compliance audit event
    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "CLIENT_UPDATED",
      entityType: "DOCUMENT",
      entityId: doc.id,
      newValue: {
        event: "AI_ANOMALY_SCAN_COMPLETED",
        riskLevel: scanResult.riskLevel,
        overallHealthScore: scanResult.overallHealthScore,
      },
    });

    revalidatePath("/documents");
    revalidatePath(`/clients/${doc.clientId}`);

    return {
      success: true,
      data: serializeForClient(scanResult),
    };
  } catch (error: any) {
    console.error("[runAiDocumentAnomalyScanAction Error]", error);
    return { success: false, error: error.message || "Failed to execute AI anomaly audit scan." };
  }
}
