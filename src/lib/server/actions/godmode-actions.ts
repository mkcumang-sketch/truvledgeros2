"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/auth/session";
import { verifyGodmodeAuthorization } from "@/lib/server/rbac/godmode-guard";
import { logSecurityEvent } from "@/lib/server/audit";
import { setRuntimeFeatureFlag } from "@/lib/server/feature-flags";
import { z } from "zod";

/**
 * Server-authoritative check that guarantees the caller is an active Platform Administrator.
 * Throws FORBIDDEN if the session lacks Godmode privileges.
 */
async function assertGodmodePrivilege() {
  const context = await getSessionContext();
  const auth = verifyGodmodeAuthorization(context);

  if (auth.status === "UNAUTHENTICATED") {
    throw new Error("UNAUTHENTICATED: Active session required.");
  }

  if (!auth.authorized) {
    if (context?.user) {
      await logSecurityEvent({
        tenantId: context.membership?.tenantId || null,
        userId: context.user.id,
        action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        entityType: "PLATFORM_MUTATION",
        entityId: "GODMODE_ACTION",
        newValue: { reason: auth.reason },
      }).catch(() => null);
    }
    throw new Error(`FORBIDDEN: ${auth.reason || "Lacks platform godmode authorization"}`);
  }

  return context!;
}

// =========================================================================
// 1. TENANT SUSPENSION / LOCKOUT MANAGEMENT
// =========================================================================

const ToggleSuspensionSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  suspend: z.boolean(),
  reason: z.string().min(5, "A substantive operational reason is required for suspension changes"),
});

export async function toggleTenantSuspensionAction(params: z.infer<typeof ToggleSuspensionSchema>) {
  try {
    const context = await assertGodmodePrivilege();
    const validated = ToggleSuspensionSchema.parse(params);

    const existingTenant = await db.tenant.findUnique({
      where: { id: validated.tenantId },
      select: { id: true, name: true, isSuspended: true, active: true },
    });

    if (!existingTenant) {
      return { success: false, error: "Practice firm tenant not found." };
    }

    const updated = await db.tenant.update({
      where: { id: validated.tenantId },
      data: {
        isSuspended: validated.suspend,
        active: !validated.suspend,
      },
    });

    // Record privileged audit trail
    await logSecurityEvent({
      tenantId: existingTenant.id,
      userId: context.user.id,
      action: validated.suspend ? "TENANT_SUSPENDED" : "TENANT_ACTIVATED",
      entityType: "TENANT",
      entityId: existingTenant.id,
      oldValue: { isSuspended: existingTenant.isSuspended, active: existingTenant.active },
      newValue: {
        isSuspended: updated.isSuspended,
        active: updated.active,
        reason: validated.reason,
        authorizedBy: context.user.name,
      },
    });

    revalidatePath("/godmode");
    revalidatePath("/service");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to alter tenant status." };
  }
}

// =========================================================================
// 2. TRUVTECH SERVICE CATALOGUE & INTERNAL TASKS
// =========================================================================

const InternalTaskSchema = z.object({
  title: z.string().min(3, "Task title is required"),
  category: z.enum(["ONBOARDING", "MIGRATION", "INTEGRATION", "SUPPORT_ESCALATION", "COMPLIANCE_DELIVERY"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
  assigneeName: z.string().min(2, "Assignee is required"),
  customerFirmId: z.string().optional().nullable(),
  customerFirmName: z.string().optional().nullable(),
  detail: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export async function createInternalServiceTaskAction(params: z.infer<typeof InternalTaskSchema>) {
  try {
    const context = await assertGodmodePrivilege();
    const validated = InternalTaskSchema.parse(params);

    // Durable audit logging of TRUVTECH internal operational assignments
    await logSecurityEvent({
      tenantId: validated.customerFirmId || null,
      userId: context.user.id,
      action: "INTERNAL_SERVICE_TASK_CREATED" as any,
      entityType: "SERVICE_TASK",
      entityId: `int-task-${Date.now()}`,
      newValue: {
        title: validated.title,
        category: validated.category,
        priority: validated.priority,
        assignee: validated.assigneeName,
        customerFirm: validated.customerFirmName || "Platform Wide",
        detail: validated.detail,
        dueDate: validated.dueDate,
        createdBy: context.user.name,
      },
    });

    revalidatePath("/godmode");
    revalidatePath("/service");
    return { success: true, message: "Internal service delivery task dispatched." };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create internal service task." };
  }
}

// =========================================================================
// 3. AUTHORIZED CUSTOMER SUPPORT NOTES (TIME-LIMITED & AUDITED)
// =========================================================================

const SupportNoteSchema = z.object({
  tenantId: z.string().min(1, "Customer Tenant ID is required"),
  tenantName: z.string().min(1),
  ticketId: z.string().min(1),
  summary: z.string().min(5, "Support note must be descriptive"),
  urgency: z.enum(["STANDARD", "ELEVATED", "CRITICAL"]),
  resolutionStatus: z.enum(["INVESTIGATING", "CLIENT_ACTION_REQUIRED", "RESOLVED"]),
});

export async function createAuthorizedSupportNoteAction(params: z.infer<typeof SupportNoteSchema>) {
  try {
    const context = await assertGodmodePrivilege();
    const validated = SupportNoteSchema.parse(params);

    // Support notes are cryptographically preserved in the audit log
    await logSecurityEvent({
      tenantId: validated.tenantId,
      userId: context.user.id,
      action: "SUPPORT_NOTE_RECORDED" as any,
      entityType: "SUPPORT_TICKET",
      entityId: validated.ticketId,
      newValue: {
        tenantName: validated.tenantName,
        summary: validated.summary,
        urgency: validated.urgency,
        status: validated.resolutionStatus,
        technician: context.user.name,
        technicianEmail: context.user.email,
        timestamp: new Date().toISOString(),
      },
    });

    revalidatePath("/godmode");
    revalidatePath("/service");
    return { success: true, message: "Authorized support memorandum recorded." };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to record support note." };
  }
}

// =========================================================================
// 4. PLATFORM FEATURE TOGGLE HOT-SWAP
// =========================================================================

export async function togglePlatformFeatureFlagAction(params: {
  flagKey: string;
  enabled: boolean;
}) {
  try {
    const context = await assertGodmodePrivilege();

    await logSecurityEvent({
      tenantId: null,
      userId: context.user.id,
      action: "PLATFORM_FLAG_TOGGLED" as any,
      entityType: "FEATURE_FLAG",
      entityId: params.flagKey,
      newValue: {
        flag: params.flagKey,
        enabled: params.enabled,
        actor: context.user.name,
      },
    });

    setRuntimeFeatureFlag(params.flagKey as any, params.enabled);

    revalidatePath("/godmode");
    return { success: true, flagKey: params.flagKey, enabled: params.enabled };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to toggle platform flag." };
  }
}
