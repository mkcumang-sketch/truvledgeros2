import { db } from "@/lib/db";
import { CommunicationChannel, CommunicationDirection, CommunicationStatus } from "@prisma/client";
import crypto from "crypto";

export interface SendWhatsAppMessageParams {
  tenantId: string;
  clientId?: string;
  invoiceId?: string;
  recipientPhone: string;
  recipientName: string;
  message: string;
  paymentLinkUrl?: string;
}

export interface WhatsAppMessageResult {
  success: boolean;
  messageId: string;
  communicationId?: string;
  status: "SENT" | "DELIVERED" | "STANDBY" | "FAILED";
  provider: "whatsapp_cloud_api" | "whatsapp_standby";
  detail: string;
  error?: string;
}

/**
 * Sends a WhatsApp text message when Meta Cloud API is configured.
 * Without credentials it records a STANDBY intent; it never reports standby
 * or API acceptance as recipient delivery.
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams
): Promise<WhatsAppMessageResult> {
  const { tenantId, clientId, invoiceId, recipientPhone, recipientName, message } = params;
  const digits = recipientPhone.replace(/\D/g, "");
  const normalizedDigits = digits.length === 10 ? `91${digits}` : digits;
  let messageId = `wa_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  if (!tenantId || !normalizedDigits || normalizedDigits.length < 10 || normalizedDigits.length > 15 || !message.trim()) {
    return {
      success: false,
      messageId,
      status: "FAILED",
      provider: "whatsapp_standby",
      detail: "A valid tenant, recipient phone number, and message are required.",
      error: "INVALID_WHATSAPP_MESSAGE",
    };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const configuredApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  const graphApiVersion = configuredApiVersion && /^v\\d{1,2}\\.0$/.test(configuredApiVersion) ? configuredApiVersion : "v26.0";

  let provider: WhatsAppMessageResult["provider"] = "whatsapp_standby";
  let status: WhatsAppMessageResult["status"] = "STANDBY";
  let detail = "No live WhatsApp provider is configured. Message intent was recorded in standby; nothing was sent.";
  let error: string | undefined;

  if (accessToken && phoneNumberId) {
    provider = "whatsapp_cloud_api";
    try {
      const response = await fetch(
        `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: normalizedDigits,
            type: "text",
            text: { preview_url: true, body: message },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      const data = await response.json();
      if (response.ok && data.messages?.[0]?.id) {
        messageId = data.messages[0].id;
        status = "SENT";
        detail = "Accepted by Meta WhatsApp Cloud API. Recipient delivery is not confirmed until a delivery webhook arrives.";
      } else {
        status = "FAILED";
        error = data?.error?.message || `Meta WhatsApp API returned HTTP ${response.status}.`;
        detail = "Meta WhatsApp Cloud API rejected the message.";
      }
    } catch (err: any) {
      status = "FAILED";
      error = err?.message || "WhatsApp provider request failed.";
      detail = "WhatsApp provider request failed before acceptance.";
    }
  }

  let communicationId: string | undefined;
  try {
    const communication = await db.communication.create({
      data: {
        tenantId,
        clientId,
        invoiceId,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "INVOICE",
        category: "AUTONOMOUS_WHATSAPP_DISPATCH",
        recipient: `+${normalizedDigits}`,
        subject: `WhatsApp Update to ${recipientName || "Client"}`,
        content: message,
        status: status as CommunicationStatus,
        externalRef: messageId,
      },
      select: { id: true },
    });
    communicationId = communication.id;
  } catch (dbErr: any) {
    console.error("[WHATSAPP-COMM-LOG-ERROR]", dbErr?.message || dbErr);
    detail += " Communication audit record could not be saved.";
  }

  return {
    success: status !== "FAILED",
    messageId,
    communicationId,
    status,
    provider,
    detail,
    error,
  };
}
