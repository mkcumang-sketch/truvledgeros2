"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { DocumentStatus } from "@prisma/client";
import { logSecurityEvent } from "@/lib/server/audit";

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
    return { success: true, data: request };
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
      data: {
        ...updated,
        isEscalatedToPartner,
        clientName: request.client.name,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to escalate document reminder." };
  }
}
