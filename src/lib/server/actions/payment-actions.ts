"use server";

import { revalidatePath } from "next/cache";
import { recordPayment, RecordPaymentSchema } from "@/lib/server/payment-service";
import { z } from "zod";

export async function recordPaymentAction(data: z.infer<typeof RecordPaymentSchema>) {
  try {
    const validated = RecordPaymentSchema.parse(data);
    const result = await recordPayment(validated);
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to record payment.",
    };
  }
}
