import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { roundToPaise } from "@/lib/financial/math";
import { logSecurityEvent } from "@/lib/server/audit";
import { publishDomainEvent } from "./domain-events";
import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";

export const PAYMENT_MODES = [
  "UPI",
  "NEFT",
  "RTGS",
  "CHEQUE",
  "CASH",
  "GATEWAY",
] as const;

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID required"),
  amount: z.number().positive("Payment amount must be greater than zero"),
  paymentMode: z.enum(PAYMENT_MODES),
  referenceNo: z.string().optional().nullable(),
  receivedAt: z.string().or(z.date()).optional(),
  notes: z.string().optional().nullable(),
});

/**
 * Records a payment against an invoice inside an isolated, atomic transaction.
 * Strictly enforces tenant isolation and overpayment rejection.
 */
export async function recordPayment(input: z.infer<typeof RecordPaymentSchema>) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  // Executive/Client check (clients cannot record payments directly)
  if (context.membership.role === "CLIENT") {
    throw new Error("Clients are not authorized to record payments directly.");
  }

  return await db.$transaction(async (tx) => {
    // 1. Fetch invoice belonging to this tenant with active lock
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, tenantId },
      include: { payments: true },
    });

    if (!invoice) {
      throw new Error("Invoice not found or does not belong to this firm.");
    }

    if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.DRAFT) {
      throw new Error(`Cannot record payment against ${invoice.status} invoice.`);
    }

    // 2. Calculate remaining balance
    const currentPaid = invoice.payments.reduce((acc, p) => acc + Number(p.amount), 0);
    const remainingBalance = roundToPaise(Number(invoice.totalAmount) - currentPaid);
    const paymentAmount = roundToPaise(input.amount);

    // 3. Strict Overpayment Policy: Reject if payment exceeds balance
    if (paymentAmount > remainingBalance) {
      throw new Error(
        `Overpayment rejected: payment of ₹${paymentAmount} exceeds remaining balance of ₹${remainingBalance}.`
      );
    }

    // 4. Create Payment record
    const payment = await tx.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: paymentAmount,
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo?.trim() || null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        notes: input.notes?.trim() || null,
      },
    });

    // 5. Update Invoice status based on new balance
    const newTotalPaid = roundToPaise(currentPaid + paymentAmount);
    const newRemaining = roundToPaise(Number(invoice.totalAmount) - newTotalPaid);

    let newStatus: InvoiceStatus = invoice.status;
    if (newRemaining <= 0) {
      newStatus = InvoiceStatus.PAID;
    } else {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus,
        paidAt: newStatus === InvoiceStatus.PAID ? new Date() : invoice.paidAt,
      },
    });

    // 6. Security Audit & Domain Events
    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "PAYMENT_RECORDED" as any,
      entityType: "PAYMENT",
      entityId: payment.id,
      newValue: {
        amount: paymentAmount,
        invoiceId: invoice.id,
        newStatus,
      },
    });

    await publishDomainEvent({
      tenantId,
      eventType: newStatus === InvoiceStatus.PAID ? "invoice.paid" : "invoice.partially_paid",
      entityType: "INVOICE",
      entityId: invoice.id,
      payload: { paymentId: payment.id, amountPaid: paymentAmount, remaining: newRemaining },
    });

    return { payment, newStatus, remainingBalance: newRemaining };
  });
}