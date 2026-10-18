import { Role } from "@prisma/client";
import { SessionContext } from "@/lib/auth/session";

export interface GodmodeAuthResult {
  authorized: boolean;
  status: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZED";
  reason?: string;
}

/**
 * Server-authoritative check for Godmode administration access.
 * Denies access by default. Requires an authenticated, explicitly authorized administrator identity.
 * Client-provided role values, query parameters, or UI state are strictly ignored.
 */
export function verifyGodmodeAuthorization(context: SessionContext | null): GodmodeAuthResult {
  if (!context?.user) {
    return { authorized: false, status: "UNAUTHENTICATED", reason: "No active authenticated session" };
  }

  // 1. Platform Superadmin: Global unrestricted administrative authorization
  if (Boolean(context.user.isSuperAdmin)) {
    return { authorized: true, status: "AUTHORIZED" };
  }

  // 2. Tenant-level GODMODE_ADMIN role check
  if (context.membership?.role === Role.GODMODE_ADMIN) {
    if (context.membership.status !== "ACTIVE") {
      return { authorized: false, status: "FORBIDDEN", reason: "Tenant membership is not active" };
    }
    if (context.tenant && (!context.tenant.active || context.tenant.isSuspended)) {
      return { authorized: false, status: "FORBIDDEN", reason: "Tenant practice is suspended or inactive" };
    }
    return { authorized: true, status: "AUTHORIZED" };
  }

  // 3. Deny by default for all other roles (FIRM_OWNER, FIRM_ADMIN, PARTNER, MANAGER, EXECUTIVE, CLIENT)
  return {
    authorized: false,
    status: "FORBIDDEN",
    reason: `User role '${context.membership?.role || "NONE"}' lacks platform godmode authorization`,
  };
}
