import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
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
 * Accepts: { phone, clientName, amount, invoiceNumber, tenantId?, clientId? }
 * Returns: { success, callSid, status, communicationId }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Request (Session Cookie or API Secret Header)
    const session = await getSessionContext().catch(() => null);
    const authHeader = req.headers.get("authorization") || "";
    const apiKeyHeader = req.headers.get("x-api-key") || "";

    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : "";

    const configuredSecret =
      process.env.INTERNAL_API_SECRET ||
      process.env.CRON_SECRET ||
      process.env.SARVAM_API_KEY ||
      process.env.ENCRYPTION_KEY;

    const isApiKeyValid =
      Boolean(configuredSecret) &&
      (apiKeyHeader === configuredSecret || bearerToken === configuredSecret);

    const isDev = process.env.NODE_ENV !== "production";

    // In production, require either valid session context or verified API secret
    if (!session && !isApiKeyValid && !isDev) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "Valid user session or x-api-key required to trigger voice calls.",
        },
        { status: 401 }
      );
    }

    // 2. Parse and Validate Request Body
    const body = await req.json().catch(() => ({}));
    const {
      phone,
      clientName,
      amount,
      invoiceNumber,
      dueDate,
      serviceDescription,
      paymentLinkUrl,
      handlingPartnerName,
      caFirmName,
    } = body;

    if (!phone || !clientName || amount === undefined || !invoiceNumber) {
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
    let resolvedTenantId = body.tenantId || session?.tenant?.id || session?.membership?.tenantId;

    if (!resolvedTenantId) {
      const activeTenant = await db.tenant.findFirst({
        where: { active: true },
        select: { id: true },
      }).catch(() => null);
      resolvedTenantId = activeTenant?.id;
    }

    // 4. Resolve Client and Invoice Context (if not explicitly provided)
    let resolvedClientId = body.clientId;
    let resolvedInvoiceId = body.invoiceId;

    if (resolvedTenantId) {
      if (!resolvedClientId) {
        const cleanDigits = String(phone).replace(/\D/g, "");
        const phoneSuffix = cleanDigits.slice(-10);

        const matchedClient = await db.client.findFirst({
          where: {
            tenantId: resolvedTenantId,
            OR: [
              { phone: { contains: phoneSuffix } },
              { name: { equals: String(clientName).trim(), mode: "insensitive" } },
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
            invoiceNumber: String(invoiceNumber).trim(),
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
      phone: String(phone),
      clientName: String(clientName),
      amount: amount,
      invoiceNumber: String(invoiceNumber),
      dueDate,
      serviceDescription,
      paymentLinkUrl,
      handlingPartnerName,
      caFirmName,
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
