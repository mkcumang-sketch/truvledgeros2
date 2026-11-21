import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  canManageCalling,
  resolveCallingTenantId,
} from "@/lib/server/voice/authorization";
import { dispatchSarvamVoiceAgentCall } from "@/lib/server/voice/sarvam-telephony";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Cloud-Safe Autonomous Voice Trigger API Route
 * 
 * Enables secure dispatch of Sarvam AI voice calls from cloud-hosted runtimes
 * (Vercel, Railway, Render) bypassing local development ISP / network blocks.
 * 
 * Method: POST
 * Accepts: { phone, clientName, amount, invoiceNumber, clientId? }
 * A tenantId may be supplied only by a platform superadmin without an active tenant.
 * Returns: { success, callSid, status, communicationId }
 */
export async function POST(req: NextRequest) {
  try {
    // Tenant-scoped voice dispatch requires an authenticated calling manager.
    const session = await getSessionContext().catch(() => null);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageCalling(session.membership?.role, session.user.isSuperAdmin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Parse and Validate Request Body
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
        {
          error: "Missing required fields",
          required: ["phone", "clientName", "amount", "invoiceNumber"],
          received: { phone, clientName, amount, invoiceNumber },
        },
        { status: 400 }
      );
    }

    // 3. Resolve Tenant Context
    let resolvedTenantId = resolveCallingTenantId(session, payload.tenantId);
    if (
      resolvedTenantId &&
      !session.membership?.tenantId &&
      !session.tenant?.id &&
      session.user.isSuperAdmin
    ) {
      const tenant = await db.tenant.findUnique({
        where: { id: resolvedTenantId },
        select: { id: true, active: true, isSuspended: true },
      });
      if (!tenant?.active || tenant.isSuspended) {
        return NextResponse.json({ error: "Tenant not found or unavailable" }, { status: 404 });
      }
      resolvedTenantId = tenant.id;
    }
    if (!resolvedTenantId) {
      return NextResponse.json({ error: "Tenant context is required" }, { status: 400 });
    }

    // 4. Resolve Client and Invoice Context (if not explicitly provided)
    if (payload.clientId !== undefined && typeof payload.clientId !== "string") {
      return NextResponse.json({ error: "clientId must be a string" }, { status: 400 });
    }
    if (payload.invoiceId !== undefined && typeof payload.invoiceId !== "string") {
      return NextResponse.json({ error: "invoiceId must be a string" }, { status: 400 });
    }
    let resolvedClientId =
      typeof payload.clientId === "string" ? payload.clientId : undefined;
    let resolvedInvoiceId =
      typeof payload.invoiceId === "string" ? payload.invoiceId : undefined;

    if (resolvedClientId) {
      const client = await db.client.findFirst({
        where: { id: resolvedClientId, tenantId: resolvedTenantId },
        select: { id: true },
      });
      if (!client) {
        return NextResponse.json({ error: "Client not found in tenant" }, { status: 404 });
      }
    }
    if (resolvedInvoiceId) {
      const invoice = await db.invoice.findFirst({
        where: { id: resolvedInvoiceId, tenantId: resolvedTenantId },
        select: { id: true },
      });
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found in tenant" }, { status: 404 });
      }
    }

    if (resolvedTenantId) {
      if (!resolvedClientId) {
        const cleanDigits = phone.replace(/\D/g, "");
        const phoneSuffix = cleanDigits.slice(-10);

        const matchedClient = await db.client.findFirst({
          where: {
            tenantId: resolvedTenantId,
            OR: [
              { phone: { contains: phoneSuffix } },
              { name: { equals: clientName.trim(), mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }).catch(() => null);

        if (matchedClient) {
          resolvedClientId = matchedClient.id;
        }
      }

      if (!resolvedInvoiceId && invoiceNumber) {
        const matchedInvoice = await db.invoice.findFirst({
          where: {
            tenantId: resolvedTenantId,
            invoiceNumber: invoiceNumber.trim(),
          },
          select: { id: true },
        }).catch(() => null);

        if (matchedInvoice) {
          resolvedInvoiceId = matchedInvoice.id;
        }
      }
    }

    // 5. Dispatch Sarvam Voice Call Server-Side
    const dispatchResult = await dispatchSarvamVoiceAgentCall({
      phone,
      clientName,
      amount,
      invoiceNumber,
      dueDate: typeof payload.dueDate === "string" ? payload.dueDate : undefined,
      serviceDescription:
        typeof payload.serviceDescription === "string"
          ? payload.serviceDescription
          : undefined,
      paymentLinkUrl:
        typeof payload.paymentLinkUrl === "string" ? payload.paymentLinkUrl : undefined,
      handlingPartnerName:
        typeof payload.handlingPartnerName === "string"
          ? payload.handlingPartnerName
          : undefined,
      caFirmName: typeof payload.caFirmName === "string" ? payload.caFirmName : undefined,
      tenantId: resolvedTenantId,
      clientId: resolvedClientId,
      invoiceId: resolvedInvoiceId,
    });

    return NextResponse.json(
      {
        success: dispatchResult.success,
        callSid: dispatchResult.callSid,
        status: dispatchResult.status,
        communicationId: dispatchResult.communicationId,
        diagnostics: dispatchResult.diagnostics,
        error: dispatchResult.error,
        payload: dispatchResult.payload,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[VOICE-TRIGGER-ROUTE-EXCEPTION]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Internal error processing voice call trigger",
        message: err.message,
      },
      { status: 500 }
    );
  }
}
