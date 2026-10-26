import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";
import { CommunicationsClient, CommunicationItem } from "./CommunicationsClient";

export const metadata = {
  title: "Communications Hub — TRUV LedgerOS",
  description: "Automated client notifications, payment reminders, and statutory broadcasts.",
};

export default async function CommunicationsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const rawComms = await db.communication.findMany({
    where: { tenantId },
    include: {
      client: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const communications: CommunicationItem[] = rawComms.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    clientName: c.client?.name || "Practice Notification",
    channel: c.channel,
    purpose: c.purpose,
    category: c.category,
    recipient: c.recipient,
    subject: c.subject,
    content: c.content,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <CommunicationsClient communications={serializeForClient(communications)} />
  );
}
