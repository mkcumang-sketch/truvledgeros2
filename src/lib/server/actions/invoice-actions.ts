"use server";

import { createDraftInvoice, CreateInvoiceSchema } from "@/lib/server/invoice-service";

export async function createDraftInvoiceAction(data: {
  clientId: string;
  dueDate: string;
  isInterState: boolean;
  serviceDescription: string;
  items: {
    description: string;
    hsnSacCode?: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRatePercent: number;
  }[];
}) {
  try {
    const validated = CreateInvoiceSchema.parse(data);
    const invoice = await createDraftInvoice(validated);
    return { success: true, invoiceId: invoice.id };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create invoice." };
  }
}