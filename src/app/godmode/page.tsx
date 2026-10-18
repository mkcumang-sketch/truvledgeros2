import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/server/audit";
import { verifyGodmodeAuthorization } from "@/lib/server/rbac/godmode-guard";
import { db } from "@/lib/db";
import { getAllFeatureFlags } from "@/lib/server/feature-flags";
import { GodmodeClient } from "./GodmodeClient";
import { serializeForClient } from "@/lib/serialization";

export const metadata: Metadata = {
  title: "Platform God Mode // TRUVTECH Operations",
  description: "Global tenant orchestration, service operations, and super-admin controls",
};

export const dynamic = "force-dynamic";

export default async function GodmodePage() {
  const context = await getSessionContext();

  const authResult = verifyGodmodeAuthorization(context);

  if (authResult.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (!authResult.authorized) {
    // Record immutable security audit trail of unauthorized access attempt
    if (context?.user) {
      await logSecurityEvent({
        tenantId: context.membership?.tenantId || null,
        userId: context.user.id,
        action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        entityType: "ROUTE",
        entityId: "/godmode",
        newValue: {
          userRole: context.membership?.role || "NONE",
          isSuperAdmin: Boolean(context.user.isSuperAdmin),
          reason: authResult.reason,
        },
      }).catch(() => null);
    }

    redirect("/dashboard");
  }

  // Fetch real platform-wide metrics, tenants, users, feature flags, and security logs
  const [
    rawTenants,
    totalTenantsCount,
    activeTenantsCount,
    totalUsersCount,
    totalInvoicesCount,
    totalAuditLogsCount,
    rawAuditLogs,
    rawUsers,
    rawIntegrations,
    rawSubscriptions,
    featureFlags,
    rawInternalStaff,
  ] = await Promise.all([
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            clients: true,
            invoices: true,
            tasks: true,
          },
        },
        memberships: {
          where: { role: { in: ["FIRM_OWNER", "FIRM_ADMIN", "PARTNER"] } },
          include: {
            user: { select: { name: true, email: true, phone: true } },
          },
          take: 3,
        },
      },
      take: 50,
    }),
    db.tenant.count(),
    db.tenant.count({ where: { active: true, isSuspended: false } }),
    db.user.count(),
    db.invoice.count(),
    db.auditLog.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        user: { select: { name: true, email: true } },
        tenant: { select: { name: true, slug: true } },
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        memberships: {
          include: {
            tenant: { select: { name: true, slug: true } },
          },
        },
      },
    }),
    db.integration.findMany({
      take: 20,
      include: {
        tenant: { select: { name: true, slug: true } },
      },
    }),
    db.subscription.findMany({
      take: 20,
      include: {
        tenant: { select: { name: true, slug: true } },
      },
    }),
    getAllFeatureFlags(),
    db.user.findMany({
      where: {
        OR: [
          { isSuperAdmin: true },
          { email: { contains: "truvtech.com" } },
          { email: { contains: "godmode" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isSuperAdmin: true,
      },
    }),
  ]);

  // Serialize tenants for client
  const tenants = rawTenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    email: t.email,
    phone: t.phone,
    gstin: t.gstin,
    pan: t.pan,
    active: t.active,
    isSuspended: t.isSuspended,
    approvalThreshold: Number(t.approvalThreshold),
    accountingSoftware: t.accountingSoftware,
    createdAt: t.createdAt.toISOString(),
    usersCount: t._count.memberships,
    clientsCount: t._count.clients,
    invoicesCount: t._count.invoices,
    tasksCount: t._count.tasks,
    keyPartners: t.memberships.map((m) => ({
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  }));

  // Serialize audit logs
  const auditLogs = rawAuditLogs.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    tenantName: a.tenant?.name || "Global Platform",
    userName: a.user?.name || "System Automated",
    userEmail: a.user?.email || "system@truvtech.com",
    ipAddress: a.ipAddress || "Internal Gateway",
    createdAt: a.createdAt.toISOString(),
    newValue: (a.newValue as any) || null,
  }));

  // Serialize platform users
  const platformUsers = rawUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    isSuperAdmin: u.isSuperAdmin,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    memberships: u.memberships.map((m) => ({
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      role: m.role,
      status: m.status,
    })),
  }));

  // Serialize integrations
  const integrations = rawIntegrations.map((i) => ({
    id: i.id,
    provider: i.provider,
    status: i.status,
    tenantName: i.tenant.name,
    lastTestedAt: i.lastTestedAt ? i.lastTestedAt.toISOString() : null,
  }));

  // Serialize subscriptions
  const subscriptions = rawSubscriptions.map((s) => ({
    id: s.id,
    tier: s.tier,
    status: s.status,
    tenantName: s.tenant.name,
    maxUsers: s.maxUsers,
    maxClients: s.maxClients,
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
  }));

  const stats = {
    totalTenants: totalTenantsCount,
    activeTenants: activeTenantsCount,
    suspendedTenants: totalTenantsCount - activeTenantsCount,
    totalUsers: totalUsersCount,
    totalInvoices: totalInvoicesCount,
    totalAuditLogs: totalAuditLogsCount,
    currentAdmin: {
      id: context?.user?.id || "",
      name: context?.user?.name || "Platform Admin",
      email: context?.user?.email || "admin@truvtech.com",
      isSuperAdmin: Boolean(context?.user?.isSuperAdmin),
    },
  };

  return (
    <GodmodeClient
      stats={serializeForClient(stats)}
      tenants={serializeForClient(tenants)}
      auditLogs={serializeForClient(auditLogs)}
      platformUsers={serializeForClient(platformUsers)}
      integrations={serializeForClient(integrations)}
      subscriptions={serializeForClient(subscriptions)}
      initialFeatureFlags={serializeForClient(featureFlags)}
      internalStaff={serializeForClient(rawInternalStaff)}
    />
  );
}