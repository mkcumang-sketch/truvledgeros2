import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";
import { CommunicationsClient, CommunicationItem, ClientDispatchTarget } from "./CommunicationsClient";
import { InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Autonomous Operations Command Center — TRUV LedgerOS",
  description: "Live Omnichannel Dispatch, Sarvam AI Voice Telephony & Statutory Audit Ledger.",
};

function parseCommunicationMetadata(content: string) {
  let recordingUrl: string | null = null;
  let sentiment: string | null = null;
  let duration: number = 0;
  let transcript: string | null = null;
  let diagnostics: string | null = null;

  if (!content) {
    return { recordingUrl, sentiment, duration, transcript, diagnostics };
  }

  // 1. Extract Recording URL
  const recMatch = content.match(/\[RECORDING\]:\s*(https?:\/\/[^\s\n]+)/i) ||
    content.match(/(?:recording_url|audio_url|RecordingUrl)["':\s]+(https?:\/\/[^\s"',\n]+)/i);
  if (recMatch && recMatch[1] && recMatch[1] !== "N/A") {
    recordingUrl = recMatch[1].trim();
  }

  // 2. Extract Sentiment
  const sentMatch = content.match(/\[CLIENT SENTIMENT\]:\s*([A-Za-z_]+)/i) ||
    content.match(/\[SENTIMENT\]:\s*([A-Za-z_]+)/i) ||
    content.match(/(?:sentiment)["':\s]+([A-Za-z_]+)/i);
  if (sentMatch && sentMatch[1]) {
    sentiment = sentMatch[1].toUpperCase().trim();
  }

  // 3. Extract Duration
  const durMatch = content.match(/\[DURATION\]:\s*(\d+)/i) ||
    content.match(/(?:duration|CallDuration)["':\s]+(\d+)/i);
  if (durMatch && durMatch[1]) {
    duration = parseInt(durMatch[1], 10);
  }

  // 4. Extract Transcript
  const transMatch = content.match(/\[TRANSCRIPT\]:\s*([\s\S]+?)(?:\n---|\n\[|\n$|$)/i);
  if (transMatch && transMatch[1] && !transMatch[1].includes("No transcript recorded")) {
    transcript = transMatch[1].trim();
  }

  // 5. Extract Diagnostics / Standby log
  const diagMatch = content.match(/\[DIAGNOSTICS\]:\s*([^\n]+)/i) ||
    content.match(/\[STATUS\]:\s*([^\n]+)/i);
  if (diagMatch && diagMatch[1]) {
    diagnostics = diagMatch[1].trim();
  }

  return { recordingUrl, sentiment, duration, transcript, diagnostics };
}

export default async function CommunicationsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;
  const now = new Date();

  // 1. Fetch Communications Audit Ledger
  const rawComms = await db.communication.findMany({
    where: { tenantId },
    include: {
      client: {
        select: { id: true, name: true, phone: true, email: true },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          dueDate: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  const communications: CommunicationItem[] = rawComms.map((c) => {
    const meta = parseCommunicationMetadata(c.content);
    return {
      id: c.id,
      clientId: c.clientId,
      clientName: c.client?.name || "Practice Notification",
      clientPhone: c.client?.phone || null,
      clientEmail: c.client?.email || null,
      invoiceId: c.invoiceId,
      invoiceNumber: c.invoice?.invoiceNumber || null,
      channel: c.channel,
      direction: c.direction,
      purpose: c.purpose,
      category: c.category,
      recipient: c.recipient,
      subject: c.subject,
      content: c.content,
      status: c.status,
      externalRef: c.externalRef,
      createdAt: c.createdAt.toISOString(),
      recordingUrl: meta.recordingUrl,
      sentiment: meta.sentiment,
      duration: meta.duration,
      transcript: meta.transcript,
      diagnostics: meta.diagnostics,
    };
  });

  // 2. Fetch Clients for Selective / Bulk Dispatch
  const rawClients = await db.client.findMany({
    where: { tenantId, active: true },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      monthlyFee: true,
      invoices: {
        where: {
          status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          dueDate: true,
          status: true,
          payments: {
            select: { amount: true },
          },
        },
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let totalOverdueCount = 0;
  let totalOverdueAmount = 0;

  const clients: ClientDispatchTarget[] = rawClients.map((client) => {
    let overdueBalance = 0;
    let isOverdue = false;
    let latestOverdueInvoice: string | null = null;
    let latestDueDate: string | null = null;

    client.invoices.forEach((inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(inv.totalAmount) - paid);
      const isPastDue = new Date(inv.dueDate) < now;

      if (remaining > 0 && isPastDue) {
        overdueBalance += remaining;
        isOverdue = true;
        if (!latestOverdueInvoice) {
          latestOverdueInvoice = inv.invoiceNumber;
          latestDueDate = inv.dueDate.toISOString();
        }
      }
    });

    if (isOverdue) {
      totalOverdueCount++;
      totalOverdueAmount += overdueBalance;
    }

    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      monthlyFee: Number(client.monthlyFee) || 0,
      isOverdue,
      overdueAmount: overdueBalance,
      latestInvoiceNumber: latestOverdueInvoice || client.invoices[0]?.invoiceNumber || null,
      dueDate: latestDueDate || client.invoices[0]?.dueDate?.toISOString() || null,
    };
  });

  return (
    <CommunicationsClient
      communications={serializeForClient(communications)}
      clients={serializeForClient(clients)}
      overdueStats={{
        overdueClientsCount: totalOverdueCount,
        totalOverdueAmount,
        totalClientsCount: clients.length,
      }}
      tenantName={context.tenant.name}
    />
  );
}
