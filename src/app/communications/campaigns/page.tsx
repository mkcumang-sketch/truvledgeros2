import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";
import { CallingCampaignsClient } from "./CallingCampaignsClient";
import { getAuthoritativeCallingMetrics } from "@/lib/server/voice/campaign-service";
import {
  CommunicationChannel,
  CommunicationDirection,
  InvoiceStatus,
  TaskType,
  TaskStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Calling Operations & Campaigns — TRUV LedgerOS",
  description: "Enterprise Automated Voice Campaigns, Scheduled Outbox & Client Follow-up Ledger.",
};

export default async function CallingCampaignsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;
  const now = new Date();

  // 1. Fetch Authoritative Aggregate Metrics
  const metrics = await getAuthoritativeCallingMetrics(tenantId);

  // 2. Fetch Active & Historical Campaigns
  const rawCampaigns = await db.callingCampaign.findMany({
    where: { tenantId },
    include: {
      assignedOwner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { scheduledCalls: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 3. Fetch Scheduled Calls Queue (Next 100 calls)
  const rawScheduledCalls = await db.scheduledCall.findMany({
    where: { tenantId },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      campaign: { select: { id: true, name: true, purpose: true } },
      assignedOwner: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });

  // 4. Fetch Historical Voice Communications (Audit Log)
  const rawComms = await db.communication.findMany({
    where: {
      tenantId,
      channel: CommunicationChannel.VOICE,
      direction: CommunicationDirection.OUTBOUND,
    },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 5. Fetch Follow-up Tasks (Call follow-ups)
  const rawFollowUps = await db.task.findMany({
    where: {
      tenantId,
      type: { in: [TaskType.PAYMENT_ESCALATION, TaskType.DOCUMENT_CALL, TaskType.GENERAL] },
      title: { contains: "Call" },
    },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  // 6. Fetch Active Practice Clients (for Campaign Creation Wizard)
  const rawClients = await db.client.findMany({
    where: { tenantId, active: true },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      notes: true,
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
          payments: { select: { amount: true } },
        },
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  // 7. Fetch Practice Staff / Team Members for Assignment
  const rawTeam = await db.membership.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const teamMembers = rawTeam.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));

  // Format clients with overdue calculations
  const clients = rawClients.map((client) => {
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

    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      city: client.city || "N/A",
      isOverdue,
      overdueAmount: overdueBalance,
      latestInvoiceNumber: latestOverdueInvoice || client.invoices[0]?.invoiceNumber || null,
      dueDate: latestDueDate || client.invoices[0]?.dueDate?.toISOString() || null,
      hasOptedOut: Boolean(client.notes && (client.notes.includes("[DO_NOT_CALL]") || client.notes.includes("[OPT_OUT]"))),
    };
  });

  return (
    <CallingCampaignsClient
      initialMetrics={serializeForClient(metrics)}
      initialCampaigns={serializeForClient(rawCampaigns)}
      initialScheduledCalls={serializeForClient(rawScheduledCalls)}
      initialCallHistory={serializeForClient(rawComms)}
      initialFollowUps={serializeForClient(rawFollowUps)}
      clients={serializeForClient(clients)}
      teamMembers={serializeForClient(teamMembers)}
      tenantName={context.tenant.name}
      currentUserId={context.user.id}
    />
  );
}
