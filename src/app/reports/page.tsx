import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";
import { ReportsClient, ReportMetrics } from "./ReportsClient";

export const metadata = {
  title: "Practice Reports & MIS — TRUV LedgerOS",
  description: "Real-time practice billing analytics, realization ratios, and client performance.",
};

export default async function ReportsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId },
      include: {
        client: { select: { id: true, name: true } },
        items: true,
      },
    }),
    db.payment.findMany({
      where: { tenantId },
      select: { amount: true },
    }),
  ]);

  let totalBilled = 0;
  const clientBillingMap = new Map<string, { name: string; billed: number; count: number }>();
  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const inv of invoices) {
    if (inv.status === "CANCELLED") continue;
    const invAmount = Number(inv.totalAmount) || 0;
    totalBilled += invAmount;

    // Client aggregation
    const clientName = inv.client?.name || "Unassigned";
    const existingClient = clientBillingMap.get(clientName) || {
      name: clientName,
      billed: 0,
      count: 0,
    };
    existingClient.billed += invAmount;
    existingClient.count += 1;
    clientBillingMap.set(clientName, existingClient);

    // Items / Category aggregation
    for (const item of inv.items) {
      const desc = item.description || "General Practice Fees";
      const itemAmount = Number(item.total) || 0;
      const existingCat = categoryMap.get(desc) || { amount: 0, count: 0 };
      existingCat.amount += itemAmount;
      existingCat.count += 1;
      categoryMap.set(desc, existingCat);
    }
  }

  const totalCollected = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const totalOutstanding = Math.max(0, totalBilled - totalCollected);
  const collectionRate =
    totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  const topClients = Array.from(clientBillingMap.values())
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      billed: c.billed,
      invoicesCount: c.count,
    }));

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, val]) => ({
      category,
      amount: val.amount,
      count: val.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const metrics: ReportMetrics = {
    totalBilled,
    totalCollected,
    totalOutstanding,
    collectionRate,
    invoicesCount: invoices.length,
    topClients,
    categoryBreakdown,
  };

  return <ReportsClient metrics={serializeForClient(metrics)} />;
}
