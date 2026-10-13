import { Role } from "@prisma/client";

export type Permission =
  | "platform:manage"
  | "firm:manage"
  | "firm:settings"
  | "team:manage"
  | "team:view"
  | "client:create"
  | "client:read"
  | "client:update"
  | "client:delete"
  | "invoice:create"
  | "invoice:read"
  | "invoice:approve"
  | "invoice:update"
  | "payment:record"
  | "payment:read"
  | "gst:manage"
  | "gst:read"
  | "document:manage"
  | "document:read"
  | "task:manage"
  | "task:read"
  | "report:read"
  | "client_portal:access";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  GODMODE_ADMIN: [
    "platform:manage",
    "firm:manage",
    "firm:settings",
    "team:manage",
    "team:view",
    "client:create",
    "client:read",
    "client:update",
    "client:delete",
    "invoice:create",
    "invoice:read",
    "invoice:approve",
    "invoice:update",
    "payment:record",
    "payment:read",
    "gst:manage",
    "gst:read",
    "document:manage",
    "document:read",
    "task:manage",
    "task:read",
    "report:read",
    "client_portal:access",
  ],
  FIRM_OWNER: [
    "firm:manage",
    "firm:settings",
    "team:manage",
    "team:view",
    "client:create",
    "client:read",
    "client:update",
    "client:delete",
    "invoice:create",
    "invoice:read",
    "invoice:approve",
    "invoice:update",
    "payment:record",
    "payment:read",
    "gst:manage",
    "gst:read",
    "document:manage",
    "document:read",
    "task:manage",
    "task:read",
    "report:read",
  ],
  FIRM_ADMIN: [
    "firm:settings",
    "team:manage",
    "team:view",
    "client:create",
    "client:read",
    "client:update",
    "invoice:create",
    "invoice:read",
    "invoice:approve",
    "invoice:update",
    "payment:record",
    "payment:read",
    "gst:manage",
    "gst:read",
    "document:manage",
    "document:read",
    "task:manage",
    "task:read",
    "report:read",
  ],
  PARTNER: [
    "team:view",
    "client:create",
    "client:read",
    "client:update",
    "invoice:create",
    "invoice:read",
    "invoice:approve",
    "invoice:update",
    "payment:record",
    "payment:read",
    "gst:manage",
    "gst:read",
    "document:manage",
    "document:read",
    "task:manage",
    "task:read",
    "report:read",
  ],
  MANAGER: [
    "team:view",
    "client:read",
    "client:update",
    "invoice:create",
    "invoice:read",
    "payment:read",
    "gst:read",
    "document:manage",
    "document:read",
    "task:manage",
    "task:read",
    "report:read",
  ],
  EXECUTIVE: [
    "client:read",
    "invoice:read",
    "payment:read",
    "gst:read",
    "document:read",
    "task:manage",
    "task:read",
  ],
  CLIENT: [
    "client_portal:access",
    "invoice:read",
    "payment:read",
    "document:read",
    "gst:read",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}