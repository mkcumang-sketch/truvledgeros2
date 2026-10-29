import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GstClient } from "./GstClient";
import { serializeForClient } from "@/lib/serialization";

export const metadata = {
  title: "GST Compliance & Returns • TRUV LedgerOS",
  description: "Manage monthly GST returns, liability calculations, and client filing sign-offs.",
};

export default async function GstPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [returns, gstClients] = await Promise.all([
    db.gstReturn.findMany({
      where: { tenantId },
      include: {
        client: {
          select: { id: true, name: true, gstin: true },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    db.client.findMany({
      where: {
        tenantId,
        active: true,
        gstin: { not: null },
      },
      select: {
        id: true,
        name: true,
        gstin: true,
        planName: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <GstClient
      returns={serializeForClient(returns) as any}
      gstClients={serializeForClient(gstClients)}
    />
  );
}