import { db } from "@/lib/db";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "INVITATION_CREATED"
  | "INVITATION_ACCEPTED"
  | "MEMBERSHIP_CREATED"
  | "MEMBERSHIP_ROLE_CHANGED"
  | "MEMBERSHIP_SUSPENDED"
  | "MEMBERSHIP_REVOKED"
  | "CLIENT_CREATED"
  | "CLIENT_UPDATED"
  | "CLIENT_ARCHIVED"
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "INVOICE_CREATED"
  | "INVOICE_UPDATED"
  | "INVOICE_ISSUED"
  | "INVOICE_VOIDED"
  | "PAYMENT_CREATED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_CORRECTION_ATTEMPTED"
  | "UNAUTHORIZED_ACCESS_ATTEMPT"
  | "UNAUTHORIZED_FINANCIAL_ACCESS";

export interface LogSecurityEventParams {
  tenantId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export async function logSecurityEvent(params: LogSecurityEventParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        oldValue: params.oldValue ? (params.oldValue as any) : undefined,
        newValue: params.newValue ? (params.newValue as any) : undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error("[AUDIT-LOG-FAIL]", error);
  }
}