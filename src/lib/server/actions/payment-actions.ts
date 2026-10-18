"use server";

import { revalidatePath } from "next/cache";
import { recordPayment, RecordPaymentSchema } from "@/lib/server/payment-service";
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import { z } from "zod";

export async function recordPaymentAction(
  data: z.infer<typeof RecordPaymentSchema>
): Promise<ActionResult> {
  try {
    const validated = RecordPaymentSchema.parse(data);
    const result = await recordPayment(validated);
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(result) };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to record payment.",
    };
  }
}
