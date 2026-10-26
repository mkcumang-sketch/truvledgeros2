import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";
import { SubscriptionClient, SubscriptionData } from "./SubscriptionClient";

export const metadata = {
  title: "Subscription & Usage — TRUV LedgerOS",
  description: "Firm subscription plan, practice storage quota, and active team seats.",
};

export default async function SubscriptionPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [tenant, clientCount, documents, teamSeats, aiQueries, rawSubscriptions] =
    await Promise.all([
      db.tenant.findUnique({
        where: { id: tenantId },
      }),
      db.client.count({
        where: { tenantId, active: true },
      }),
      db.document.findMany({
        where: { tenantId },
        select: { fileSize: true },
      }),
      db.membership.count({
        where: { tenantId, status: "ACTIVE" },
      }),
      db.message.count({
        where: {
          conversation: { tenantId },
          senderType: "CLIENT",
        },
      }),
      db.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const totalStorageBytes = documents.reduce((sum, d) => sum + (d.fileSize || 0), 0);
  let storageUsedStr = "0.0 MB";
  if (totalStorageBytes > 1024 * 1024 * 1024) {
    storageUsedStr = `${(totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  } else if (totalStorageBytes > 0) {
    storageUsedStr = `${(totalStorageBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const subscriptionData: SubscriptionData = {
    planName: rawSubscriptions[0]?.tier ? `${rawSubscriptions[0].tier} Practice Plan` : "Professional CA Practice Tier",
    billingCycle: "Annual (Billed Yearly)",
    amount: "Active Practice License",
    status: tenant?.active ? "Active" : "Suspended",
    renewalDate: "Active Subscription",
    usage: {
      activeClients: clientCount,
      clientLimit: 300,
      storageUsedStr,
      storageLimitStr: "50 GB",
      teamSeats,
      seatsLimit: 10,
      aiQueries,
      aiLimit: 1000,
    },
    invoices: rawSubscriptions.map((s) => ({
      id: s.id.slice(0, 14),
      date: s.createdAt.toLocaleDateString("en-IN"),
      amount: "Platform License",
      status: s.status,
    })),
  };

  return <SubscriptionClient subscription={serializeForClient(subscriptionData)} />;
}
