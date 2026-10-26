import { dispatchNativeEvent } from "@/lib/server/automation/native-engine";

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
  eventType: FinancialEventType | string;
  entityType: "CLIENT" | "INVOICE" | "PAYMENT" | "DOCUMENT" | string;
  entityId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Stores idempotent domain events in the AutomationEvent ledger.
 * Consumed by the native in-process automation engine.
 */
export async function publishDomainEvent(params: PublishDomainEventParams): Promise<void> {
  try {
    await dispatchNativeEvent({
      tenantId: params.tenantId,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: params.payload,
      idempotencyKey: params.idempotencyKey,
    });
  } catch (error) {
    // Domain event failure should never break transaction flow, but must log
    console.error("[DOMAIN-EVENT-ERROR]", params.eventType, error);
  }
}
