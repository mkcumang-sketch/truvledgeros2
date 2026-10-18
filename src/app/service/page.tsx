import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/server/audit";
import { verifyGodmodeAuthorization } from "@/lib/server/rbac/godmode-guard";
import { db } from "@/lib/db";
import { ServiceClient } from "./ServiceClient";

export const metadata: Metadata = {
  title: "Service Operations & My Team // TRUVTECH Internal",
  description: "TRUVTECH internal service-delivery, employee operations, and customer onboarding oversight.",
};

export const dynamic = "force-dynamic";

export default async function ServiceOperationsPage() {
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
        entityId: "/service",
        newValue: {
          userRole: context.membership?.role || "NONE",
          isSuperAdmin: Boolean(context.user.isSuperAdmin),
          reason: authResult.reason,
        },
      }).catch(() => null);
    }

    redirect("/dashboard");
  }

  // Fetch tenant onboarding progress, recent customer audit logs, and service records
  const [tenants, recentServiceLogs, internalStaff] = await Promise.all([
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        active: true,
        isSuspended: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            clients: true,
            invoices: true,
            tasks: true,
          },
        },
      },
      take: 30,
    }),
    db.auditLog.findMany({
      where: {
        action: {
          in: [
            "INTERNAL_SERVICE_TASK_CREATED",
            "SUPPORT_NOTE_RECORDED",
            "DEMO_REQUEST_RECEIVED",
            "PRACTICE_ENQUIRY_RECEIVED",
            "FIRM_REGISTERED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { name: true, email: true } },
        tenant: { select: { name: true } },
      },
    }),
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

  const serializedTenants = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    email: t.email,
    phone: t.phone,
    active: t.active,
    isSuspended: t.isSuspended,
    createdAt: t.createdAt.toISOString(),
    usersCount: t._count.memberships,
    clientsCount: t._count.clients,
    tasksCount: t._count.tasks,
  }));

  const serializedServiceLogs = recentServiceLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    tenantName: log.tenant?.name || "Global / TRUVTECH",
    userName: log.user?.name || "Internal System",
    createdAt: log.createdAt.toISOString(),
    newValue: (log.newValue as any) || null,
  }));

  return (
    <ServiceClient
      tenants={serializedTenants}
      serviceLogs={serializedServiceLogs}
      internalStaff={internalStaff}
      currentAdmin={{
        id: context?.user?.id || "",
        name: context?.user?.name || "TRUVTECH Specialist",
        email: context?.user?.email || "service@truvtech.com",
        isSuperAdmin: Boolean(context?.user?.isSuperAdmin),
      }}
    />
  );
}
