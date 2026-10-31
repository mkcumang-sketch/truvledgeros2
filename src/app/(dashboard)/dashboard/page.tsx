import { AiDocumentTriageFeed } from "@/components/documents/AiDocumentTriageFeed";
import { serializeForClient } from "@/lib/serialization";
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
  AlertTriangle,
  Send,
  Bot,
  ShieldAlert,
  Radio,
  FileCheck2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { GlassCard } from "@/components/ui/GlassCard";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireTenant, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const metadata = {
  title: "Practice Overview • TRUV LedgerOS",
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
  let triagedDocuments: any[] = [];
  let upcomingGst: any[] = [];
  let urgentTasks: any[] = [];
  let failedOutboxCount = 0;

  try {
    const now = new Date();
    const fifteenDaysAhead = new Date(now.getTime() + 15 * 86400000);

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
      db.document.findMany({
        where: { tenantId },
        take: 4,
        orderBy: { createdAt: "desc" },
        include: { client: { select: { id: true, name: true, phone: true, email: true } } },
      }).catch(() => []),
      db.gstReturn.findMany({
        where: {
          tenantId,
          status: { not: "FILED" },
          dueDate: { lte: fifteenDaysAhead },
        },
        take: 3,
        orderBy: { dueDate: "asc" },
        include: { client: { select: { name: true } } },
      }).catch(() => []),
      db.task.findMany({
        where: {
          tenantId,
          status: "OPEN",
          priority: "URGENT",
        },
        take: 3,
        orderBy: { createdAt: "desc" },
        include: { client: { select: { name: true } } },
      }).catch(() => []),
      db.automationEvent.count({
        where: { tenantId, status: "FAILED" },
      }).catch(() => 0),
    ]);

    clientCount = results[0];
    corporateCount = results[1];
    metrics = results[2] as typeof metrics;
    recentClients = results[3];
    recentInvoices = results[4];
    openTasksCount = results[5];
    triagedDocuments = results[6] || [];
    upcomingGst = results[7] || [];
    urgentTasks = results[8] || [];
    failedOutboxCount = results[9] || 0;
  } catch (dataErr) {
    console.error("[DashboardPage] Data fetching error:", dataErr);
  }

  const attentionTotal = upcomingGst.length + urgentTasks.length + (metrics.counts.overdue > 0 ? 1 : 0) + (failedOutboxCount > 0 ? 1 : 0);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#263238] break-words">
            Practice Overview
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Operational dashboard and compliance telemetry for {context.tenant.name}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/clients?action=new">
            <ShimmerButton variant="primary" size="md">
              <Plus className="w-4 h-4 mr-1" />
              Onboard Client
            </ShimmerButton>
          </Link>
          <Link href="/invoices/new">
            <ShimmerButton variant="secondary" size="md">
              <FileText className="w-4 h-4 mr-1" />
              Issue Invoice
            </ShimmerButton>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Attention Required / Practice Health Radar */}
      <GlassCard className="border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-glass-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${attentionTotal > 0 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
              {attentionTotal > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#263238] flex items-center gap-2">
                <span>Attention Required</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${attentionTotal > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {attentionTotal > 0 ? `${attentionTotal} pending action` : "All systems normal"}
                </span>
              </h2>
              <p className="text-xs text-[#64748B]">Immediate statutory deadlines, overdue recovery, and partner approvals.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/automations" className="text-xs text-[#F26B38] hover:text-[#D95524] font-semibold inline-flex items-center gap-1">
              <span>Automation Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
          {/* Statutory Filings */}
          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E7EB] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#263238]">
              <span className="flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-[#F26B38]" />
                GST Due Soon (15d)
              </span>
              <span className="text-xs font-bold text-[#263238]">{upcomingGst.length}</span>
            </div>
            {upcomingGst.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">No statutory returns due within 15 days.</p>
            ) : (
              <div className="space-y-1">
                {upcomingGst.map((g) => (
                  <div key={g.id} className="text-[11px] flex items-center justify-between">
                    <span className="truncate max-w-[140px] text-[#263238] font-medium">{g.client.name}</span>
                    <span className="text-[#D95524] font-mono text-[10px] font-bold">{g.returnType}</span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/gst" className="block text-[11px] font-semibold text-[#D95524] hover:underline pt-1">
              Open GST Compliance →
            </Link>
          </div>

          {/* Overdue Debt Recovery */}
          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E7EB] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#263238]">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-rose-500" />
                Overdue Invoices
              </span>
              <span className={`text-xs font-bold ${metrics.counts.overdue > 0 ? "text-rose-600" : "text-[#263238]"}`}>
                {metrics.counts.overdue}
              </span>
            </div>
            {metrics.counts.overdue === 0 ? (
              <p className="text-[11px] text-[#64748B]">Zero invoices past due date.</p>
            ) : (
              <p className="text-[11px] text-[#475569]">
                {formatINR(metrics.totalOverdue)} awaiting recovery across {metrics.counts.overdue} clients.
              </p>
            )}
            <Link href="/communications" className="block text-[11px] font-semibold text-[#D95524] hover:underline pt-1">
              Dispatch AI Telephony →
            </Link>
          </div>

          {/* Urgent Workflow Tasks */}
          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E7EB] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#263238]">
              <span className="flex items-center gap-1.5">
                <ListTodo className="w-3.5 h-3.5 text-amber-500" />
                Urgent Tasks
              </span>
              <span className="text-xs font-bold text-[#263238]">{urgentTasks.length}</span>
            </div>
            {urgentTasks.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">No high-priority tasks pending review.</p>
            ) : (
              <div className="space-y-1">
                {urgentTasks.map((t) => (
                  <div key={t.id} className="text-[11px] truncate text-[#263238] font-medium">
                    • {t.title}
                  </div>
                ))}
              </div>
            )}
            <Link href="/tasks" className="block text-[11px] font-semibold text-[#D95524] hover:underline pt-1">
              View Task Queue →
            </Link>
          </div>

          {/* Outbox Event Status */}
          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E7EB] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#263238]">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                Outbox Telemetry
              </span>
              <span className={`text-xs font-bold ${failedOutboxCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {failedOutboxCount > 0 ? `${failedOutboxCount} failed` : "Healthy"}
              </span>
            </div>
            {failedOutboxCount === 0 ? (
              <p className="text-[11px] text-[#64748B]">All automated queue jobs processed cleanly.</p>
            ) : (
              <p className="text-[11px] text-rose-600 font-medium">
                {failedOutboxCount} delivery event(s) require retry or diagnostic inspection.
              </p>
            )}
            <Link href="/automations" className="block text-[11px] font-semibold text-[#D95524] hover:underline pt-1">
              Open Outbox Feed →
            </Link>
          </div>
        </div>
      </GlassCard>

      {/* AI Omnichannel Document Triage Feed */}
      <AiDocumentTriageFeed items={serializeForClient(triagedDocuments) as any} />

      {/* Main Grid: Recent Clients & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Clients</CardTitle>
              <p className="text-xs text-[#64748B] mt-0.5">Authoritative client entities registered in firm</p>
            </div>
            <Link href="/clients" className="text-xs text-[#D95524] hover:text-[#C2410C] font-semibold">
              View All 360° →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentClients.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#64748B]">
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
                        className="font-semibold text-xs text-[#263238] hover:text-[#D95524] transition-colors block"
                      >
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="neutral" size="sm">
                          {c.planName || "Pvt Ltd"}
                        </Badge>
                        <span className="text-[11px] font-mono text-[#64748B]">
                          PAN: {c.pan || "N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold text-[#263238]">
                        {formatINR(Number(c.monthlyFee || 0))}
                      </div>
                      <div className="text-[10px] text-[#94A3B8]">monthly fee</div>
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
              <p className="text-xs text-[#64748B] mt-0.5">Live billing records and collection status</p>
            </div>
            <Link href="/invoices" className="text-xs text-[#D95524] hover:text-[#C2410C] font-semibold">
              All Invoices →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#64748B]">
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
                        className="font-mono font-semibold text-xs text-[#D95524] hover:text-[#C2410C] transition-colors block"
                      >
                        {inv.invoiceNumber}
                      </Link>
                      <div className="text-xs text-[#475569] mt-0.5">
                        {inv.client.name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-[#263238]">
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
