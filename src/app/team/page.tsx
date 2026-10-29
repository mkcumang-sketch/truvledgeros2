import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { TeamManagementClient } from "./TeamManagementClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team & Access Management • TRUV LedgerOS",
  description: "Manage practice partners, managers, invitations, and role-based permissions.",
};

export default async function TeamPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [memberships, invitations, auditLogs] = await Promise.all([
    db.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.invitation.findMany({
      where: { tenantId },
      include: {
        invitedBy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({
      where: {
        tenantId,
        action: {
          in: [
            "INVITATION_CREATED",
            "INVITATION_ACCEPTED",
            "MEMBERSHIP_CREATED",
            "MEMBERSHIP_ROLE_CHANGED",
            "MEMBERSHIP_SUSPENDED",
            "MEMBERSHIP_REVOKED",
          ],
        },
      },
      include: {
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const serializedMembers = memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    phone: m.user.phone,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));

  const serializedInvites = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedByName: i.invitedBy.name,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));

  const serializedAudit = auditLogs.map((a) => {
    let details = a.action;
    if (a.newValue && typeof a.newValue === "object") {
      const nv = a.newValue as any;
      if (nv.email && nv.role) details = `${nv.email} as ${nv.role}`;
      else if (nv.role) details = `New role: ${nv.role}`;
      else if (nv.reason) details = String(nv.reason);
    }
    return {
      id: a.id,
      action: a.action.replace("MEMBERSHIP_", "").replace("INVITATION_", ""),
      userName: a.user?.name || "System",
      createdAt: a.createdAt.toISOString(),
      details,
    };
  });

  return (
    <div className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full max-w-full min-w-0 overflow-x-hidden">
      <TeamManagementClient
        members={serializedMembers}
        invitations={serializedInvites}
        auditLogs={serializedAudit}
        currentUserId={context.user.id}
        currentUserRole={context.membership.role}
        isSuperAdmin={Boolean(context.user.isSuperAdmin)}
        tenantName={context.tenant.name}
      />
    </div>
  );
}