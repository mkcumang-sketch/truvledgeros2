import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  TaskType,
  TaskStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * TRUV LedgerOS — Inbound Email Webhook & Client Revert Tracker
 * 
 * Ingests incoming emails/replies from clients, parses invoice context,
 * logs authoritative Communication audit records (direction: INBOUND, category: EMAIL_REVERT),
 * and flags partner tasks for disputes or payment promises.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    }

    // 1. Extract sender, recipient, subject, and body content
    const rawFrom =
      body.from ||
      body.sender ||
      body.from_email ||
      body.envelope?.from ||
      body.Headers?.From ||
      "";
    
    // Extract clean email address from "Sender Name <email@domain.com>" or "email@domain.com"
    const emailMatch = String(rawFrom).match(/<([^>]+)>/) || String(rawFrom).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const senderEmail = emailMatch ? emailMatch[1].trim().toLowerCase() : String(rawFrom).trim().toLowerCase();

    const recipient =
      body.to ||
      body.recipient ||
      body.to_email ||
      body.envelope?.to ||
      "partner@truvca.in";

    const subject = String(body.subject || body.Subject || "Inbound Client Revert").trim();
    const content = String(
      body.text ||
      body["stripped-text"] ||
      body.body ||
      body.html ||
      body["body-plain"] ||
      "Client sent an empty email reply."
    ).trim();

    const externalRef =
      body.message_id ||
      body["Message-ID"] ||
      body.id ||
      `inbound_email_${Date.now()}`;

    if (!senderEmail) {
      return NextResponse.json(
        { error: "Unable to parse valid sender email address." },
        { status: 400 }
      );
    }

    // 2. Identify client by email in database
    const matchedClient = await db.client.findFirst({
      where: {
        OR: [
          { email: { equals: senderEmail, mode: "insensitive" } },
          { contacts: { some: { email: { equals: senderEmail, mode: "insensitive" } } } },
        ],
      },
      include: {
        tenant: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    let tenantId = matchedClient?.tenantId;
    if (!tenantId) {
      const defaultTenant = await db.tenant.findFirst({
        where: { active: true },
        select: { id: true },
      });
      tenantId = defaultTenant?.id || "default_tenant";
    }

    // 3. Match Invoice Context (from subject, body, or client's latest invoice)
    let matchedInvoiceId: string | null = null;
    let matchedInvoiceNumber: string | null = null;

    // Search subject & content for invoice serial patterns: e.g. "INV-1001" or "#INV-2026-001"
    const invoiceNumberPattern = /(?:INV|INVOICE)[-\s#:]*([A-Za-z0-9_-]+)/i;
    const invMatch = (subject + " " + content).match(invoiceNumberPattern);

    if (invMatch && tenantId) {
      const candidateCode = invMatch[0].replace(/[^\w-]/g, "");
      const foundInv = await db.invoice.findFirst({
        where: {
          tenantId,
          invoiceNumber: { contains: candidateCode, mode: "insensitive" },
        },
      });
      if (foundInv) {
        matchedInvoiceId = foundInv.id;
        matchedInvoiceNumber = foundInv.invoiceNumber;
      }
    }

    // Fallback: If client has only one recent open or overdue invoice, associate it
    if (!matchedInvoiceId && matchedClient?.invoices && matchedClient.invoices.length > 0) {
      const activeInv = matchedClient.invoices.find(
        (i) => i.status === "OVERDUE" || i.status === "SENT" || i.status === "PARTIALLY_PAID"
      ) || matchedClient.invoices[0];
      if (activeInv) {
        matchedInvoiceId = activeInv.id;
        matchedInvoiceNumber = activeInv.invoiceNumber;
      }
    }

    // 4. Log authoritative Communication audit record: direction: INBOUND, category: EMAIL_REVERT
    const communication = await db.communication.create({
      data: {
        tenantId,
        clientId: matchedClient?.id || null,
        invoiceId: matchedInvoiceId,
        channel: CommunicationChannel.EMAIL,
        direction: CommunicationDirection.INBOUND,
        purpose: "RECOVERY",
        category: "EMAIL_REVERT",
        recipient: typeof recipient === "string" ? recipient : JSON.stringify(recipient),
        subject: subject,
        content: `[FROM]: ${senderEmail} (${matchedClient?.name || "Unregistered Counterparty"})\n[MATCHED INVOICE]: ${matchedInvoiceNumber || "N/A"}\n\n[REPLY CONTENT]:\n${content}`,
        status: "DELIVERED",
        externalRef,
      },
    });

    // 5. Intelligent Partner Escalation for Client Reverts
    const lowerContent = content.toLowerCase();
    const isDispute =
      lowerContent.includes("dispute") ||
      lowerContent.includes("wrong amount") ||
      lowerContent.includes("not agree") ||
      lowerContent.includes("incorrect") ||
      lowerContent.includes("billing error") ||
      lowerContent.includes("already paid");

    const isPromiseToPay =
      lowerContent.includes("will pay") ||
      lowerContent.includes("transferring") ||
      lowerContent.includes("rtgs") ||
      lowerContent.includes("neft") ||
      lowerContent.includes("cheque") ||
      lowerContent.includes("tomorrow") ||
      lowerContent.includes("next week");

    let taskCreated = false;
    let taskId: string | undefined;

    if (isDispute && tenantId) {
      const urgentTask = await db.task.create({
        data: {
          tenantId,
          clientId: matchedClient?.id || null,
          invoiceId: matchedInvoiceId,
          referenceId: communication.id,
          type: TaskType.PAYMENT_ESCALATION,
          title: `Client Email Dispute: ${matchedClient?.name || senderEmail} [${matchedInvoiceNumber || "Invoice"}]`,
          detail: `Client replied via email raising billing concern or dispute:\n"${content.slice(0, 400)}..."\n\nPartner intervention required immediately.`,
          priority: "URGENT",
          status: TaskStatus.OPEN,
        },
      });
      taskCreated = true;
      taskId = urgentTask.id;
    } else if (isPromiseToPay && tenantId) {
      const followUpTask = await db.task.create({
        data: {
          tenantId,
          clientId: matchedClient?.id || null,
          invoiceId: matchedInvoiceId,
          referenceId: communication.id,
          type: TaskType.PAYMENT_ESCALATION,
          title: `Payment Revert: Client Promised Settlement (${matchedClient?.name || senderEmail})`,
          detail: `Client reverted via email promising payment:\n"${content.slice(0, 400)}..."\n\nVerify bank ledger for NEFT/RTGS credit.`,
          priority: "NORMAL",
          status: TaskStatus.OPEN,
        },
      });
      taskCreated = true;
      taskId = followUpTask.id;
    }

    try {
      revalidatePath("/communications");
      revalidatePath("/tasks");
      revalidatePath("/payments");
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Inbound email revert successfully logged to Communication ledger.",
      communicationId: communication.id,
      clientId: matchedClient?.id || null,
      invoiceId: matchedInvoiceId,
      taskCreated,
      taskId,
    });
  } catch (err: any) {
    console.error("[INBOUND-EMAIL-WEBHOOK-ERROR]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process inbound email webhook.",
        message: err.message,
      },
      { status: 500 }
    );
  }
}
