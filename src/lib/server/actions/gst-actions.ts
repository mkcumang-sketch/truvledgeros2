"use server";

import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  GstReturnType,
  GstReturnStatus,
  CommunicationStatus,
  TaskType,
  TaskStatus,
  CommunicationChannel,
  CommunicationDirection,
} from "@prisma/client";
import { z } from "zod";
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import {
  generateAiTaxNoticeDraft,
  AiTaxNoticeRebuttal,
} from "@/lib/server/ai/gemini-client";

async function getAuthContext() {
  const session = await requireTenant();
  const tenantId = (session as any).tenantId || (session as any).tenant?.id || session.membership?.tenantId;
  if (!tenantId) throw new Error("Unauthorized tenant access");
  return { tenantId, session };
}

function isNextRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return Boolean(
    anyErr.digest?.startsWith("NEXT_REDIRECT") ||
    anyErr.message === "NEXT_REDIRECT" ||
    anyErr.name === "NEXT_REDIRECT"
  );
}

export async function getTenantGstReturnsAction(period?: string) {
  try {
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

    return serializeForClient(returns);
  } catch (err: any) {
    if (isNextRedirectError(err)) throw err;
    console.error("[getTenantGstReturnsAction Error]", err);
    return [];
  }
}

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
}): Promise<ActionResult> {
  try {
    const { tenantId } = await getAuthContext();
    const validated = UpdateGstTaxSchema.parse(params);

    const existing = await db.gstReturn.findFirst({
      where: { id: validated.returnId, tenantId },
    });

    if (!existing) {
      return { success: false, error: "GST return not found or does not belong to this practice firm." };
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
    return { success: true, data: serializeForClient(updated) };
  } catch (err: any) {
    if (isNextRedirectError(err)) throw err;
    console.error("[updateGstReturnTaxAction Error]", err);
    return { success: false, error: err?.message || "Failed to update GST tax amounts." };
  }
}

export async function sendClientGstSummaryAction(returnId: string): Promise<ActionResult> {
  try {
    const { tenantId } = await getAuthContext();

    if (!returnId || typeof returnId !== "string" || !returnId.trim()) {
      return { success: false, error: "Return ID is required." };
    }

    const gstReturn = await db.gstReturn.findFirst({
      where: { id: returnId.trim(), tenantId },
      include: { client: true },
    });

    if (!gstReturn) {
      return { success: false, error: "GST Return not found in this practice firm." };
    }

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
    return { success: true, data: { sent: true } };
  } catch (err: any) {
    if (isNextRedirectError(err)) throw err;
    console.error("[sendClientGstSummaryAction Error]", err);
    return { success: false, error: err?.message || "Failed to dispatch client GST summary." };
  }
}

export async function markGstReturnFiledAction(params: {
  returnId: string;
  arnNumber: string;
}): Promise<ActionResult> {
  try {
    const { tenantId } = await getAuthContext();
    const validated = MarkGstFiledSchema.parse(params);

    const existing = await db.gstReturn.findFirst({
      where: { id: validated.returnId, tenantId },
    });

    if (!existing) {
      return { success: false, error: "GST return not found in this practice firm." };
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
    return { success: true, data: serializeForClient(filed) };
  } catch (err: any) {
    if (isNextRedirectError(err)) throw err;
    console.error("[markGstReturnFiledAction Error]", err);
    return { success: false, error: err?.message || "Failed to mark GST return as filed." };
  }
}

/**
 * Workflow I Action: Analyzes statutory tax notice (DRC-01, Sec 148, 143(1))
 * and drafts an ICAI-compliant legal rebuttal using Google Gemini.
 */
export async function draftAiTaxNoticeRebuttalAction(params: {
  returnId?: string;
  clientId: string;
  noticeType: string;
  statutorySection: string;
  demandAmount?: number;
  summary: string;
}): Promise<ActionResult<AiTaxNoticeRebuttal>> {
  try {
    const { tenantId } = await getAuthContext();

    if (!params.clientId?.trim()) {
      return { success: false, error: "Target client is required." };
    }

    const [client, tenant] = await Promise.all([
      db.client.findFirst({
        where: { id: params.clientId, tenantId },
      }),
      db.tenant.findUnique({
        where: { id: tenantId },
      }),
    ]);

    if (!client) {
      return { success: false, error: "Client not found in this practice firm." };
    }

    const firmName = tenant?.name || "TRUV Chartered Accountants";

    // Call live Google Gemini client
    const rebuttal = await generateAiTaxNoticeDraft({
      noticeType: params.noticeType,
      issuingAuthority: "Goods & Services Tax Officer / Assessing Officer",
      statutorySection: params.statutorySection,
      demandAmount: params.demandAmount,
      dueDate: "Within 30 days of receipt",
      noticeSummary: params.summary,
      clientName: client.name,
      firmName,
    });

    // 1. Store draft reply letter in Communication table
    await db.communication.create({
      data: {
        tenantId,
        clientId: client.id,
        channel: CommunicationChannel.EMAIL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "TAX_NOTICE_REPLY",
        category: "COMPLIANCE",
        recipient: client.email || client.phone || "Notice Dossier",
        subject: `Draft Legal Reply: Notice u/s ${params.statutorySection} — ${client.name}`,
        content: rebuttal.rebuttalLetterText,
        status: CommunicationStatus.STANDBY,
      },
    });

    // 2. Create partner approval task
    await db.task.create({
      data: {
        tenantId,
        clientId: client.id,
        type: TaskType.GST_REVIEW,
        title: `Partner Review: AI Rebuttal for ${params.noticeType} (${params.statutorySection})`,
        detail: `Statutory reply drafted for ${client.name} (GSTIN: ${client.gstin || "N/A"}).
Alleged Demand: ₹${(params.demandAmount || 0).toLocaleString("en-IN")}.
Key Grounds:
${rebuttal.keyArguments.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Annexures Required:
${rebuttal.documentsToAnnex.map((d, i) => `${i + 1}. ${d}`).join("\n")}

ICAI Standard: ${rebuttal.icaiStandardComplianceNote}`,
        priority: "HIGH",
        status: TaskStatus.OPEN,
        referenceId: params.returnId || client.id,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
      },
    });

    revalidatePath("/gst");
    revalidatePath("/tasks");

    return {
      success: true,
      data: serializeForClient(rebuttal),
    };
  } catch (err: any) {
    if (isNextRedirectError(err)) throw err;
    console.error("[draftAiTaxNoticeRebuttalAction Error]", err);
    return { success: false, error: err?.message || "Failed to draft AI notice rebuttal." };
  }
}
