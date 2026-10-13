import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getPaymentRecoveryList,
  getDashboardFinancialMetrics,
} from "@/lib/server/financial-analytics";
import { PaymentsClient } from "./PaymentsClient";

export const metadata = {
  title: "Payments & Recovery — TRUV LedgerOS",
  description: "Track receivables aging buckets and record verified client payments.",
};

export default async function PaymentsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [recoveryList, metrics, recentPayments] = await Promise.all([
    getPaymentRecoveryList(),
    getDashboardFinancialMetrics(),
    db.payment.findMany({
      where: { tenantId },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <PaymentsClient
      recoveryList={recoveryList as any}
      recentPayments={recentPayments as any}
      totalCollected={metrics.totalCollectedRevenue}
      totalOutstanding={metrics.totalOutstanding}
    />
  );
}