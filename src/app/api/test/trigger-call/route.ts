import { NextRequest, NextResponse } from "next/server";
import { dispatchSarvamVoiceAgentCall } from "@/lib/server/voice/sarvam-telephony";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const result = await dispatchSarvamVoiceAgentCall({
      phone: body.phone || "+919555572070",
      clientName: body.clientName || "Umang Sharma",
      amount: body.amount || "₹18,500",
      invoiceNumber: body.invoiceNumber || "INV-2026-LIVE-001",
      dueDate: body.dueDate || "05-11-2026",
      handlingPartnerName: body.handlingPartnerName || "Umang Sharma",
      caFirmName: body.caFirmName || "TRUV Advisory & Tax Partners",
      paymentLinkUrl: body.paymentLinkUrl || "https://truvledgeros2.vercel.app/pay/test-001",
      serviceDescription: body.serviceDescription || "Quarterly CA Retainer & GST Tax Compliance",
      tenantId: body.tenantId,
      clientId: body.clientId,
      invoiceId: body.invoiceId,
    });

    return NextResponse.json({
      success: result.success,
      callSid: result.callSid,
      status: result.status,
      communicationId: result.communicationId,
      diagnostics: result.diagnostics,
      error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}