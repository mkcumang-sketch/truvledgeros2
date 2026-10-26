"use server";

import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import { CreateInvoiceSchema, createDraftInvoice } from "@/lib/server/invoice-service";
import { saveAndAttachInvoicePdf } from "@/lib/server/pdf/tax-invoice-generator";
import { requireTenant } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

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
}): Promise<ActionResult<{ invoiceId: string }> & { invoiceId?: string }> {
  try {
    const validated = CreateInvoiceSchema.parse(data);
    const invoice = await createDraftInvoice(validated);
    return {
      success: true,
      data: serializeForClient({ invoiceId: invoice.id }),
      invoiceId: invoice.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to create invoice.",
    };
  }
}

/**
 * Server action to generate, persist to Object Storage, and attach a Rule 46 Tax Invoice PDF.
 */
export async function generateAndAttachInvoicePdfAction(
  invoiceId: string
): Promise<ActionResult<{ pdfUrl: string }>> {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!invoiceId?.trim()) {
      return { success: false, error: "Invoice ID is required." };
    }

    const result = await saveAndAttachInvoicePdf({
      invoiceId: invoiceId.trim(),
      tenantId,
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);

    return {
      success: true,
      data: serializeForClient({ pdfUrl: result.pdfUrl }),
    };
  } catch (error: any) {
    console.error("[generateAndAttachInvoicePdfAction Error]", error);
    return {
      success: false,
      error: error?.message || "Failed to generate and attach Tax Invoice PDF.",
    };
  }
}
