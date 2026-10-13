import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { InvoicesClient } from "./InvoicesClient";

export const metadata = {
  title: "Billing & Invoices — TRUV LedgerOS",
  description: "Issue GST-compliant invoices and track live firm receivables.",
};

export default async function InvoicesPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [invoices, clients] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId },
      include: {
        client: {
          select: { id: true, name: true, gstin: true },
        },
        payments: {
          select: { amount: true },
        },
      },
      orderBy: { issuedDate: "desc" },
    }),
    db.client.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, gstin: true, pan: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <InvoicesClient invoices={invoices as any} clients={clients} />;
}