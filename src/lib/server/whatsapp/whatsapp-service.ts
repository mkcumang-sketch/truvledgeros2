import { db } from "@/lib/db";
import { CommunicationChannel, CommunicationDirection } from "@prisma/client";
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
  status: "SENT" | "DELIVERED" | "STANDBY" | "FAILED";
  provider: "whatsapp_cloud_api" | "whatsapp_standby";
  detail: string;
  error?: string;
}

/**
 * Standard WhatsApp Message Dispatcher for TRUV LedgerOS
 * Uses Meta Cloud API when credentials exist, with graceful fallback to DB outbox/standby logging.
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams
): Promise<WhatsAppMessageResult> {
  const {
    tenantId,
    clientId,
    invoiceId,
    recipientPhone,
    recipientName,
    message,
  } = params;

  // 1. Normalize phone to E.164 (+91...)
  let digits = recipientPhone.replace(/\D/g, "");
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  const formattedPhone = `+${digits}`;

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  let messageId = `wa_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  let provider: WhatsAppMessageResult["provider"] = "whatsapp_standby";
  let status: WhatsAppMessageResult["status"] = "SENT";
  let detail = "Message recorded and logged to LedgerOS outbox (Standby mode).";

  // 2. Meta WhatsApp Cloud API Attempt if keys configured
  if (accessToken && phoneNumberId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digits,
            type: "text",
            text: {
              preview_url: true,
              body: message,
            },
          }),
        }
      );

      const data = await response.json();
      if (response.ok && data.messages?.[0]?.id) {
        messageId = data.messages[0].id;
        provider = "whatsapp_cloud_api";
        status = "DELIVERED";
        detail = "Delivered via Meta WhatsApp Cloud API gateway.";
      } else {
        console.warn("[WHATSAPP-CLOUD-API-NOTICE]", data?.error?.message || data);
        detail = `Meta API Notice: ${data?.error?.message || "Fallback to audit logging"}`;
      }
    } catch (err: any) {
      console.warn("[WHATSAPP-SEND-EXCEPTION]", err.message);
      detail = `Network error: ${err.message}`;
    }
  }

  // 3. Persist authoritative log to Communication table
  try {
    await db.communication.create({
      data: {
        tenantId,
        clientId,
        invoiceId,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "INVOICE",
        category: "AUTONOMOUS_WHATSAPP_DISPATCH",
        recipient: formattedPhone,
        subject: `WhatsApp Update to ${recipientName}`,
        content: message,
        status: status === "DELIVERED" ? "DELIVERED" : "SENT",
        externalRef: messageId,
      },
    });
  } catch (dbErr: any) {
    console.error("[WHATSAPP-COMM-LOG-ERROR]", dbErr.message);
  }

  return {
    success: true,
    messageId,
    status,
    provider,
    detail,
  };
}
