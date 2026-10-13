import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  Users,
  Award,
  Briefcase,
  Clock,
  Mail,
  Phone,
  Shield,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";

export const metadata = {
  title: "Practice Team — TRUV LedgerOS",
  description: "Manage practice partners, managers, and executive staff memberships.",
};

export default async function TeamPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [memberships, clientsCount, tasksCount] = await Promise.all([
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
      orderBy: { role: "asc" },
    }),
    db.client.count({ where: { tenantId, active: true } }),
    db.task.count({ where: { tenantId, status: "OPEN" } }),
  ]);

  const partnersCount = memberships.filter(
    (m) => m.role === "FIRM_OWNER" || m.role === "PARTNER"
  ).length;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Practice Team & Member Roster
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Authorized team members, signing partners, and delegated practice managers for {context.tenant.name}.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Practice Team"
          value={memberships.length}
          subtitle="Authorized active users"
          badge="Active Roster"
          badgeVariant="success"
          icon={<Users className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Partners (FCA / Owner)"
          value={partnersCount}
          subtitle="Signing authority enabled"
          badge="Partners"
          badgeVariant="gold"
          icon={<Award className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Active Firm Clients"
          value={clientsCount}
          subtitle="Distributed across team"
          badge="Clients"
          badgeVariant="neutral"
          icon={<Briefcase className="w-4 h-4 text-graphite-500" />}
        />
        <MetricCard
          title="Open Action Queue"
          value={tasksCount}
          subtitle="Pending partner workflows"
          badge={tasksCount > 0 ? "In Progress" : "All Clear"}
          badgeVariant={tasksCount > 0 ? "warning" : "success"}
          icon={<Clock className="w-4 h-4 text-emerald-600" />}
        />
      </div>

      {/* Team Roster Table */}
      <Card>
        <CardHeader>
          <CardTitle>Authorized Staff & Practice Roles</CardTitle>
          <p className="text-xs text-graphite-500 mt-0.5">
            Role-based access control enforced through server-authoritative memberships
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto border-t border-[#EBE9E1]">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5">Member Name</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Contact Details</th>
                  <th className="px-4 py-3.5">Membership Status</th>
                  <th className="px-5 py-3.5 text-right">Access Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {memberships.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-graphite-900 text-xs">
                        {m.user.name}
                      </div>
                      <div className="text-[10px] text-graphite-400 mt-0.5 font-mono">
                        ID: {m.user.id.substring(0, 12)}...
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        variant={
                          m.role === "FIRM_OWNER"
                            ? "gold"
                            : m.role === "PARTNER"
                            ? "success"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {m.role.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-xs space-y-0.5">
                      <div className="text-graphite-800">{m.user.email}</div>
                      <div className="text-[11px] font-mono text-graphite-400">
                        {m.user.phone || "No phone listed"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        variant={m.status === "ACTIVE" ? "success" : "warning"}
                        size="sm"
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right text-xs font-semibold text-emerald-800">
                      {m.role === "FIRM_OWNER"
                        ? "Full Practice Governance"
                        : m.role === "PARTNER"
                        ? "Approvals & Signatures"
                        : "Client & Task Operations"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}