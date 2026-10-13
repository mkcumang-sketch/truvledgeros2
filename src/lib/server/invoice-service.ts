import { db } from "@/lib/db";
import { requireTenant, requireRole } from "@/lib/auth/session";
import { calculateInvoiceFinancials, LineItemInput, roundToPaise } from "@/lib/financial/math";
import { getNextInvoiceNumber } from "./invoice-counter";
import { logSecurityEvent } from "@/lib/server/audit";
import { publishDomainEvent } from "./domain-events";
import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";

export const CreateInvoiceSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  dueDate: z.string().or(z.date()),
  isInterState: z.boolean().default(false),
  serviceDescription: z.string().min(3, "Description is required"),
  items: z.array(
    z.object({
      description: z.string().min(1),
      hsnSacCode: z.string().optional().nullable(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discountPercent: z.number().min(0).max(100).default(0),
      taxRatePercent: z.number().min(0).max(28).default(18),
    })
  ).min(1, "At least one item is required"),
});

export async function createDraftInvoice(input: z.infer<typeof CreateInvoiceSchema>) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  // Verify client belongs to this tenant
  const client = await db.client.findFirst({
    where: { id: input.clientId, tenantId },
  });
  if (!client) throw new Error("Client not found in this firm.");

  // Authoritative financial calculation
  const calc = calculateInvoiceFinancials(input.items as LineItemInput[], input.isInterState);
  const invoiceNumber = await getNextInvoiceNumber(tenantId);
  const parsedDueDate = new Date(input.dueDate);

  const invoice = await db.$transaction(async (tx) => {
    return tx.invoice.create({
      data: {
        tenantId,
        clientId: client.id,
        invoiceNumber,
        serviceDescription: input.serviceDescription.trim(),
        subtotal: calc.subtotal,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        totalAmount: calc.totalAmount,
        gstRate: input.items[0]?.taxRatePercent || 18,
        status: InvoiceStatus.DRAFT,
        dueDate: parsedDueDate,
        createdById: context.user.id,
        items: {
          create: calc.items.map((it) => ({
            description: it.description,
            hsnSacCode: it.hsnSacCode,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.lineTotal,
          })),
        },
      },
      include: { items: true },
    });
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "INVOICE_CREATED" as any,
    entityType: "INVOICE",
    entityId: invoice.id,
  });

  await publishDomainEvent({
    tenantId,
    eventType: "invoice.created",
    entityType: "INVOICE",
    entityId: invoice.id,
    payload: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount },
  });

  return invoice;
}

export async function issueInvoice(invoiceId: string) {
  const context = await requireRole(["FIRM_OWNER", "FIRM_ADMIN", "PARTNER"]);
  const tenantId = context.membership.tenantId;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });

  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new Error(`Cannot issue invoice from status ${invoice.status}`);
  }

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.SENT,
      approvedById: context.user.id,
    },
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "INVOICE_ISSUED" as any,
    entityType: "INVOICE",
    entityId: invoice.id,
  });

  await publishDomainEvent({
    tenantId,
    eventType: "invoice.issued",
    entityType: "INVOICE",
    entityId: invoice.id,
    payload: { invoiceNumber: invoice.invoiceNumber },
  });

  return updated;
}

export async function voidInvoice(invoiceId: string, reason: string) {
  // Only Owners, Admins, or Partners can void invoices
  const context = await requireRole(["FIRM_OWNER", "FIRM_ADMIN", "PARTNER"]);
  const tenantId = context.membership.tenantId;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { payments: true },
  });

  if (!invoice) throw new Error("Invoice not found.");

  if (invoice.status === InvoiceStatus.PAID) {
    throw new Error("Cannot void a fully paid invoice. Reverse payments first.");
  }

  if (invoice.payments.length > 0) {
    throw new Error("Cannot void an invoice with existing recorded payments.");
  }

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.CANCELLED,
      rejectionReason: reason.trim(),
    },
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "INVOICE_VOIDED" as any,
    entityType: "INVOICE",
    entityId: invoice.id,
    newValue: { reason },
  });

  await publishDomainEvent({
    tenantId,
    eventType: "invoice.voided",
    entityType: "INVOICE",
    entityId: invoice.id,
    payload: { invoiceNumber: invoice.invoiceNumber, reason },
  });

  return updated;
}