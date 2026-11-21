import { Role } from "@prisma/client";
import type { SessionContext } from "@/lib/auth/session";

const CALLING_MANAGEMENT_ROLES: readonly Role[] = [
  Role.FIRM_OWNER,
  Role.FIRM_ADMIN,
  Role.PARTNER,
  Role.GODMODE_ADMIN,
  Role.MANAGER,
];

const MANUAL_DISPATCH_ROLES: readonly Role[] = [
  Role.FIRM_OWNER,
  Role.FIRM_ADMIN,
  Role.PARTNER,
  Role.GODMODE_ADMIN,
];

const CALLING_VIEW_ROLES: readonly Role[] = [
  ...CALLING_MANAGEMENT_ROLES,
  Role.EXECUTIVE,
];

export function canViewCalling(
  role: Role | undefined,
  isSuperAdmin = false
): boolean {
  return isSuperAdmin || (role !== undefined && CALLING_VIEW_ROLES.includes(role));
}

export function canManageCalling(
  role: Role | undefined,
  isSuperAdmin = false
): boolean {
  return isSuperAdmin || (role !== undefined && CALLING_MANAGEMENT_ROLES.includes(role));
}

export function canManageManualDispatch(
  role: Role | undefined,
  isSuperAdmin = false
): boolean {
  return isSuperAdmin || (role !== undefined && MANUAL_DISPATCH_ROLES.includes(role));
}

export function resolveCallingTenantId(
  context: Pick<SessionContext, "membership" | "tenant" | "user">,
  requestedTenantId: unknown
): string | undefined {
  const sessionTenantId = context.membership?.tenantId || context.tenant?.id;
  if (sessionTenantId) return sessionTenantId;

  if (context.user.isSuperAdmin && typeof requestedTenantId === "string") {
    const tenantId = requestedTenantId.trim();
    return tenantId || undefined;
  }

  return undefined;
}
