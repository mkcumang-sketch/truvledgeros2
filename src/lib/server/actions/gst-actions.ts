"use server";

import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { GstReturnType, GstReturnStatus } from "@prisma/client";

async function getAuthContext() {
  const session = await requireTenant();
  // Safe extraction regardless of SessionContext shape
  const tenantId = (session as any).tenantId || (session as any).tenant?.id;
  if (!tenantId) throw new Error("Unauthorized tenant access");
  return { tenantId };
}

export async function getTenantGstReturnsAction(period?: string) {
  const { tenantId } = await getAuthContext();
  const activePeriod = period || "Sep 2026";

  const returns = await db.gstReturn.findMany({
    where: {
      tenantId,
      period: activePeriod,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          businessName: true,
          gstin: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: {
      dueDate: "asc",
    },
  });

  return returns;
}

import { z } from "zod";

const UpdateGstTaxSchema = z.object({
  returnId: z.string().min(1, "Return ID is required"),
  outputTax: z.number().min(0, "Output tax cannot be negative"),
  inputTaxCredit: z.number().min(0, "Input tax credit cannot be negative"),
});

const MarkGstFiledSchema = z.object({
  returnId: z.string().min(1, "Return ID is required"),
  arnNumber: z.string().trim().min(1, "ARN number is required").max(50),
});

export async function updateGstReturnTaxAction(params: {
  returnId: string;
  outputTax: number;
  inputTaxCredit: number;
}) {
  const { tenantId } = await getAuthContext();
  const validated = UpdateGstTaxSchema.parse(params);

  const existing = await db.gstReturn.findFirst({
    where: { id: validated.returnId, tenantId },
  });

  if (!existing) {
    throw new Error("GST return not found or does not belong to this practice firm.");
  }

  const netPayable = Math.max(0, validated.outputTax - validated.inputTaxCredit);

  const updated = await db.gstReturn.update({
    where: { id: existing.id },
    data: {
      outputTax: validated.outputTax,
      inputTaxCredit: validated.inputTaxCredit,
      netPayable: netPayable,
      status: GstReturnStatus.READY_FOR_REVIEW,
      dataReceived: true,
    },
  });

  revalidatePath("/gst");
  return { success: true, updated };
}

export async function sendClientGstSummaryAction(returnId: string) {
  const { tenantId } = await getAuthContext();

  if (!returnId || typeof returnId !== "string" || !returnId.trim()) {
    throw new Error("Return ID is required.");
  }

  const gstReturn = await db.gstReturn.findFirst({
    where: { id: returnId.trim(), tenantId },
    include: { client: true },
  });

  if (!gstReturn) throw new Error("GST Return not found in this practice firm.");

  await db.gstReturn.update({
    where: { id: gstReturn.id },
    data: {
      status: GstReturnStatus.AWAITING_CLIENT_APPROVAL,
      summarySentAt: new Date(),
    },
  });

  await db.communication.create({
    data: {
      tenantId,
      clientId: gstReturn.clientId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      purpose: "GST_SUMMARY",
      category: "COMPLIANCE",
      recipient: gstReturn.client.phone,
      content: `Dear ${gstReturn.client.name}, your ${gstReturn.returnType} for ${gstReturn.period} is calculated. Net Tax Payable: INR ${Number(gstReturn.netPayable)}. Please reply YES to authorize filing.`,
      status: "DELIVERED",
    },
  });

  revalidatePath("/gst");
  return { success: true };
}

export async function markGstReturnFiledAction(params: {
  returnId: string;
  arnNumber: string;
}) {
  const { tenantId } = await getAuthContext();
  const validated = MarkGstFiledSchema.parse(params);

  const existing = await db.gstReturn.findFirst({
    where: { id: validated.returnId, tenantId },
  });

  if (!existing) {
    throw new Error("GST return not found in this practice firm.");
  }

  const filed = await db.gstReturn.update({
    where: { id: existing.id },
    data: {
      status: GstReturnStatus.FILED,
      arnNumber: validated.arnNumber,
      filedAt: new Date(),
    },
  });

  revalidatePath("/gst");
  return { success: true, filed };
}