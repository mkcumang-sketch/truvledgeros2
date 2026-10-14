import { Role } from "@prisma/client";
import { requireTenant, SessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type Resource =
  | "dashboard"
  | "clients"
  | "invoices"
  | "payments"
  | "gst"
  | "tasks"
  | "documents"
  | "reports"
  | "team"
  | "settings"
  | "automations"
  | "audit_logs"
  | "subscription";

export type Action =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "invite"
  | "manage_roles"
  | "manage_settings";

export type PermissionString = `${Resource}:${Action}` | `${Resource}:*` | "*";

/**
 * Standard Role-to-Permissions Definition Matrix
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  GODMODE_ADMIN: ["*"],
  FIRM_OWNER: ["*"],
  FIRM_ADMIN: [
    "dashboard:view",
    "clients:*",
    "invoices:*",
    "payments:*",
    "gst:*",
    "tasks:*",
    "documents:*",
    "reports:*",
    "team:view",
    "team:invite",
    "team:edit",
    "settings:view",
    "settings:manage_settings",
    "automations:*",
    "audit_logs:view",
    "subscription:view",
  ],
  PARTNER: [
    "dashboard:view",
    "clients:view",
    "clients:create",
    "clients:edit",
    "clients:export",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "invoices:approve",
    "invoices:export",
    "payments:view",
    "payments:create",
    "payments:edit",
    "payments:export",
    "gst:*",
    "tasks:*",
    "documents:*",
    "reports:*",
    "team:view",
    "audit_logs:view",
  ],
  MANAGER: [
    "dashboard:view",
    "clients:view",
    "clients:create",
    "clients:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "payments:view",
    "gst:view",
    "tasks:view",
    "tasks:create",
    "tasks:edit",
    "tasks:approve",
    "documents:view",
    "documents:create",
    "documents:edit",
    "reports:view",
    "team:view",
  ],
  EXECUTIVE: [
    "dashboard:view",
    "clients:view",
    "invoices:view",
    "invoices:create",
    "payments:view",
    "gst:view",
    "tasks:view",
    "tasks:edit",
    "documents:view",
    "documents:create",
  ],
  CLIENT: [
    "invoices:view",
    "payments:view",
    "documents:view",
    "documents:create",
  ],
};

export interface PermissionCheckOptions {
  customPermissions?: Record<string, boolean> | null;
}

/**
 * Checks if a role + custom permissions grant access to a resource and action.
 * Deny by default.
 */
export function hasPermission(
  role: Role,
  resource: Resource | string,
  action: Action | string,
  options?: PermissionCheckOptions
): boolean {
  const permKey = `${resource}:${action}`;
  const resourceWildcard = `${resource}:*`;

  // Explicit custom permission override takes precedence
  if (options?.customPermissions && typeof options.customPermissions === "object") {
    if (options.customPermissions[permKey] === false) return false;
    if (options.customPermissions[permKey] === true) return true;
    if (options.customPermissions[resourceWildcard] === false) return false;
    if (options.customPermissions[resourceWildcard] === true) return true;
  }

  const rolePerms = DEFAULT_ROLE_PERMISSIONS[role] || [];
  if (rolePerms.includes("*")) return true;
  if (rolePerms.includes(resourceWildcard)) return true;
  if (rolePerms.includes(permKey)) return true;

  return false;
}

/**
 * Returns list of effective permissions for a role + custom overrides.
 */
export function getEffectivePermissions(
  role: Role,
  customPermissions?: Record<string, boolean> | null
): string[] {
  const base = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);

  if (customPermissions && typeof customPermissions === "object") {
    for (const [key, enabled] of Object.entries(customPermissions)) {
      if (enabled) {
        base.add(key);
      } else {
        base.delete(key);
      }
    }
  }

  return Array.from(base);
}

/**
 * Enforces a permission check on the authenticated server context.
 * Throws FORBIDDEN_PERMISSION if denied.
 */
export async function requirePermission(
  resource: Resource | string,
  action: Action | string
): Promise<Required<SessionContext>> {
  const context = await requireTenant();
  const membership = context.membership;

  if (context.user.isSuperAdmin || membership.role === Role.GODMODE_ADMIN) {
    return context;
  }

  const customPermissions = (membership as any).permissions as Record<string, boolean> | null;
  const allowed = hasPermission(membership.role, resource, action, { customPermissions });

  if (!allowed) {
    throw new Error(`FORBIDDEN_PERMISSION: Missing required permission ${resource}:${action}`);
  }

  return context;
}

/**
 * Validates role management authority:
 * - Only FIRM_OWNER or FIRM_ADMIN can manage roles.
 * - FIRM_ADMIN cannot modify FIRM_OWNER or create new FIRM_OWNER.
 * - FIRM_OWNER cannot be demoted by FIRM_ADMIN.
 */
export function canManageMemberRole(
  actorRole: Role,
  targetCurrentRole: Role,
  targetNewRole?: Role
): { allowed: boolean; reason?: string } {
  if (actorRole === Role.GODMODE_ADMIN || actorRole === Role.FIRM_OWNER) {
    return { allowed: true };
  }

  if (actorRole === Role.FIRM_ADMIN) {
    if (targetCurrentRole === Role.FIRM_OWNER) {
      return { allowed: false, reason: "Administrators cannot alter or suspend Organization Owner accounts." };
    }
    if (targetNewRole === Role.FIRM_OWNER) {
      return { allowed: false, reason: "Only an Organization Owner can grant Owner privileges." };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "You do not have administrative authority to manage team members." };
}

/**
 * Protects the organization from losing its last active Owner.
 * Returns true if the target member is the sole remaining active FIRM_OWNER.
 */
export async function isSoleActiveOwner(tenantId: string, memberId: string): Promise<boolean> {
  const member = await db.membership.findFirst({
    where: { id: memberId, tenantId },
    select: { role: true, status: true },
  });

  if (!member || member.role !== Role.FIRM_OWNER) {
    return false;
  }

  const activeOwnersCount = await db.membership.count({
    where: {
      tenantId,
      role: Role.FIRM_OWNER,
      status: "ACTIVE",
    },
  });

  return activeOwnersCount <= 1;
}
