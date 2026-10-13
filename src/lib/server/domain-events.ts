import { db } from "@/lib/db";
import { generateSecureToken } from "@/lib/auth/password";
import { EventStatus } from "@prisma/client";

export type FinancialEventType =
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "clients.bulk_imported"
  | "invoice.created"
  | "invoice.issued"
  | "invoice.paid"
  | "invoice.partially_paid"
  | "invoice.overdue"
  | "invoice.voided"
  | "payment.created"
  | "payment.allocated";

export interface PublishDomainEventParams {
  tenantId: string;
  eventType: FinancialEventType;
  entityType: "CLIENT" | "INVOICE" | "PAYMENT" | "DOCUMENT";
  entityId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Stores idempotent domain events in the AutomationEvent ledger.
 * Ready to be consumed by n8n or message workers in Phase 6.
 */
export async function publishDomainEvent(params: PublishDomainEventParams): Promise<void> {
  try {
    const key = params.idempotencyKey || `evt_${params.eventType}_${params.entityId}_${generateSecureToken(16)}`;

    await db.automationEvent.create({
      data: {
        tenantId: params.tenantId,
        eventType: params.eventType,
        entityType: params.entityType as any,
        entityId: params.entityId,
        payload: params.payload as any,
        status: EventStatus.PENDING,
        idempotencyKey: key,
      },
    });
  } catch (error) {
    // Domain event failure should never break transaction flow, but must log
    console.error("[DOMAIN-EVENT-ERROR]", params.eventType, error);
  }
}