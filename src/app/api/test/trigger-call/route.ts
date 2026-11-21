import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { canManageCalling } from "@/lib/server/voice/authorization";
import { dispatchSarvamVoiceAgentCall } from "@/lib/server/voice/sarvam-telephony";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSessionContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !session.membership ||
    !session.tenant?.active ||
    session.tenant.isSuspended ||
    !canManageCalling(session.membership.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A valid JSON object is required" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const { phone, clientName, amount, invoiceNumber } = payload;
    if (
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof clientName !== "string" ||
      !clientName.trim() ||
      (typeof amount !== "string" && typeof amount !== "number") ||
      (typeof amount === "string" && !amount.trim()) ||
      (typeof amount === "number" && !Number.isFinite(amount)) ||
      typeof invoiceNumber !== "string" ||
      !invoiceNumber.trim()
    ) {
      return NextResponse.json(
        { error: "phone, clientName, amount, and invoiceNumber are required" },
        { status: 400 }
      );
    }

    const result = await dispatchSarvamVoiceAgentCall({
      phone,
      clientName,
      amount,
      invoiceNumber,
      dueDate: typeof payload.dueDate === "string" ? payload.dueDate : undefined,
      handlingPartnerName:
        typeof payload.handlingPartnerName === "string"
          ? payload.handlingPartnerName
          : undefined,
      caFirmName: typeof payload.caFirmName === "string" ? payload.caFirmName : undefined,
      paymentLinkUrl:
        typeof payload.paymentLinkUrl === "string" ? payload.paymentLinkUrl : undefined,
      serviceDescription:
        typeof payload.serviceDescription === "string"
          ? payload.serviceDescription
          : undefined,
      tenantId: session.membership.tenantId,
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