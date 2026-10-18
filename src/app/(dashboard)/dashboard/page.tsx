import React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { getDashboardFinancialMetrics } from "@/lib/server/financial-analytics";
import { formatINR } from "@/lib/financial/math";
import {
  Building2,
  FileText,
  CreditCard,
  ListTodo,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireTenant, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const metadata = {
  title: "Practice Overview — TRUV LedgerOS",
  description: "Live operational analytics, client billing, and compliance pipeline.",
};

export default async function DashboardPage() {
  let context: any;
  try {
    context = await requireTenant();
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT") || error?.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("[DashboardPage] requireTenant failed:", error);
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("next-auth.session-token");
      cookieStore.delete("__Secure-next-auth.session-token");
    } catch {}
    redirect("/login?error=SESSION_EXPIRED&force=true");
  }

  const tenantId = context.membership.tenantId;

  let clientCount = 0;
  let corporateCount = 0;
  let metrics = {
    totalCollectedRevenue: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    counts: { paid: 0, pending: 0, overdue: 0 },
  };
  let recentClients: any[] = [];
  let recentInvoices: any[] = [];
  let openTasksCount = 0;

  try {
    const results = await Promise.all([
      db.client.count({ where: { tenantId, active: true } }).catch(() => 0),
      db.client
        .count({
          where: {
            tenantId,
            active: true,
            OR: [
              { planName: { contains: "Pvt Ltd", mode: "insensitive" } },
              { planName: { contains: "PRIVATE_LIMITED", mode: "insensitive" } },
              { planName: { contains: "LLP", mode: "insensitive" } },
            ],
          },
        })
        .catch(() => 0),
      getDashboardFinancialMetrics().catch(() => ({
        totalCollectedRevenue: 0,
        totalOutstanding: 0,
        totalOverdue: 0,
        counts: { paid: 0, pending: 0, overdue: 0 },
      })),
      db.client
        .findMany({
          where: { tenantId, active: true },
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
            _count: { select: { invoices: true } },
          },
        })
        .catch(() => []),
      db.invoice
        .findMany({
          where: { tenantId },
          take: 5,
          orderBy: { issuedDate: "desc" },
          include: { client: { select: { name: true } } },
        })
        .catch(() => []),
      db.task.count({ where: { tenantId, status: "OPEN" } }).catch(() => 0),
    ]);

    clientCount = results[0];
    corporateCount = results[1];
    metrics = results[2] as typeof metrics;
    recentClients = results[3];
    recentInvoices = results[4];
    openTasksCount = results[5];
  } catch (dataErr) {
    console.error("[DashboardPage] Data fetching error:", dataErr);
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Practice Overview
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Real-time compliance telemetry for {context.tenant.name}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/clients">
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4 mr-1" />
              Onboard Client
            </Button>
          </Link>
          <Link href="/invoices">
            <Button variant="secondary" size="md">
              Issue Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Practice Clients"
          value={clientCount}
          subtitle={`${corporateCount} corporate entities`}
          badge="Live Roster"
          badgeVariant="success"
          icon={<Building2 className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Outstanding Receivables"
          value={formatINR(metrics.totalOutstanding)}
          subtitle={`${metrics.counts.pending} invoices pending collection`}
          badge={metrics.totalOutstanding > 0 ? "Receivables" : "All Clear"}
          badgeVariant={metrics.totalOutstanding > 0 ? "warning" : "success"}
          icon={<CreditCard className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Overdue Amounts"
          value={formatINR(metrics.totalOverdue)}
          subtitle={`${metrics.counts.overdue} invoices past due date`}
          badge={metrics.counts.overdue > 0 ? "Escalation" : "On Track"}
          badgeVariant={metrics.counts.overdue > 0 ? "danger" : "success"}
          icon={<Clock className="w-4 h-4 text-rose-600" />}
        />
        <MetricCard
          title="Pending Workflow Tasks"
          value={openTasksCount}
          subtitle="Approvals, return reviews, calls"
          badge="Queue"
          badgeVariant="neutral"
          icon={<ListTodo className="w-4 h-4 text-graphite-500" />}
        />
      </div>

      {/* Main Grid: Recent Clients & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Clients</CardTitle>
              <p className="text-xs text-graphite-500 mt-0.5">Authoritative client entities registered in firm</p>
            </div>
            <Link href="/clients" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">
              View All 360° →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentClients.length === 0 ? (
              <div className="py-8 text-center text-xs text-graphite-500">
                No clients registered yet.
              </div>
            ) : (
              <div className="divide-y divide-[#EBE9E1]">
                {recentClients.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 flex items-center justify-between hover:bg-[#FAF9F5] transition-colors"
                  >
                    <div>
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-semibold text-xs text-graphite-900 hover:text-emerald-700 transition-colors block"
                      >
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="neutral" size="sm">
                          {c.planName || "Pvt Ltd"}
                        </Badge>
                        <span className="text-[11px] font-mono text-graphite-500">
                          PAN: {c.pan || "N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold text-graphite-900">
                        {formatINR(Number(c.monthlyFee || 0))}
                      </div>
                      <div className="text-[10px] text-graphite-400">monthly fee</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Invoices</CardTitle>
              <p className="text-xs text-graphite-500 mt-0.5">Live billing records and collection status</p>
            </div>
            <Link href="/invoices" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">
              All Invoices →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-xs text-graphite-500">
                No invoices recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-[#EBE9E1]">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 flex items-center justify-between hover:bg-[#FAF9F5] transition-colors"
                  >
                    <div>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono font-semibold text-xs text-emerald-800 hover:text-emerald-950 transition-colors block"
                      >
                        {inv.invoiceNumber}
                      </Link>
                      <div className="text-xs text-graphite-600 mt-0.5">
                        {inv.client.name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-graphite-900">
                        {formatINR(Number(inv.totalAmount))}
                      </div>
                      <div className="mt-0.5">
                        <Badge
                          variant={
                            inv.status === "PAID"
                              ? "success"
                              : inv.status === "OVERDUE"
                              ? "danger"
                              : "warning"
                          }
                          size="sm"
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}