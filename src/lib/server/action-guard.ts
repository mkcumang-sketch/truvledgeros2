import { z } from "zod";
import { requireTenant, requireRole, SessionContext } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission, Resource, Action } from "@/lib/server/rbac/permissions";

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates an action strictly isolated to the caller's server-resolved tenant.
 * Any client input containing `tenantId` is strictly ignored or rejected.
 */
export function createTenantAction<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: (params: {
    input: TInput;
    tenantId: string;
    context: Required<SessionContext>;
  }) => Promise<TOutput>,
  options?: {
    roles?: Role[];
    permission?: { resource: Resource; action: Action };
    auditAction?: string;
    entityType?: string;
  }
) {
  return async (rawInput: unknown): Promise<ActionResponse<TOutput>> => {
    try {
      let context: Required<SessionContext>;

      if (options?.permission) {
        context = await requirePermission(options.permission.resource, options.permission.action);
      } else if (options?.roles) {
        context = await requireRole(options.roles);
      } else {
        context = await requireTenant();
      }

      const tenantId = context.membership.tenantId;

      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error.errors.map((e) => e.message).join(", "),
        };
      }

      // Execute tenant isolated handler
      const result = await handler({
        input: parsed.data,
        tenantId,
        context,
      });

      // Write Audit Log if configured
      if (options?.auditAction) {
        await db.auditLog.create({
          data: {
            tenantId,
            userId: context.user.id,
            action: options.auditAction,
            entityType: options.entityType || "ACTION",
          },
        }).catch((err) => console.error("Audit log error:", err));
      }

      return { success: true, data: result };
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        return { success: false, error: "Authentication required." };
      }
      if (
        err.message?.startsWith("FORBIDDEN_PERMISSION") ||
        err.message === "FORBIDDEN_ROLE" ||
        err.message === "TENANT_MEMBERSHIP_REQUIRED"
      ) {
        return { success: false, error: "Access denied: insufficient permissions." };
      }
      return { success: false, error: err.message || "An unexpected error occurred." };
    }
  };
}