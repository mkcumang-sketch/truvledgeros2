import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { InvoiceStatus } from "@prisma/client";

export const AGEING_BUCKETS = {
  BUCKET_1_7: "1-7 days",
  BUCKET_8_15: "8-15 days",
  BUCKET_16_30: "16-30 days",
  BUCKET_OVER_30: "30+ days",
} as const;

export async function getDashboardFinancialMetrics() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const now = new Date();

  // Tenant-scoped database queries
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId },
      include: { payments: true },
    }),
    db.payment.findMany({
      where: { tenantId },
      select: { amount: true, receivedAt: true },
    }),
  ]);

  let totalInvoiced = 0;
  let totalOutstanding = 0;
  let totalOverdue = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.CANCELLED) continue;

    totalInvoiced += Number(inv.totalAmount);
    const invPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(inv.totalAmount) - invPaid;

    if (remaining <= 0 || inv.status === InvoiceStatus.PAID) {
      paidCount++;
    } else {
      totalOutstanding += remaining;
      pendingCount++;
      if (new Date(inv.dueDate) < now) {
        totalOverdue += remaining;
        overdueCount++;
      }
    }
  }

  const totalCollectedRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    totalCollectedRevenue,
    totalOutstanding,
    totalOverdue,
    totalInvoiced,
    counts: {
      totalInvoices: invoices.length,
      paid: paidCount,
      pending: pendingCount,
      overdue: overdueCount,
    },
  };
}

export async function getPaymentRecoveryList() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const now = new Date();

  const overdueInvoices = await db.invoice.findMany({
    where: {
      tenantId,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      dueDate: { lt: now },
    },
    include: {
      client: {
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      },
      payments: true,
    },
    orderBy: { dueDate: "asc" },
  });

  return overdueInvoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(inv.totalAmount) - paid;
    const diffTime = Math.abs(now.getTime() - new Date(inv.dueDate).getTime());
    const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let bucket: string = AGEING_BUCKETS.BUCKET_1_7;
    if (daysOverdue > 30) bucket = AGEING_BUCKETS.BUCKET_OVER_30;
    else if (daysOverdue >= 16) bucket = AGEING_BUCKETS.BUCKET_16_30;
    else if (daysOverdue >= 8) bucket = AGEING_BUCKETS.BUCKET_8_15;

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client.name,
      primaryContact: inv.client.contacts[0]?.name || "N/A",
      phone: inv.client.contacts[0]?.phone || inv.client.phone,
      totalAmount: inv.totalAmount,
      remainingBalance: remaining,
      dueDate: inv.dueDate,
      daysOverdue,
      bucket,
      lastRecoveryStage: inv.lastRecoveryStage || "GENTLE",
    };
  });
}