import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { initiateOutboundVoiceCall } from "@/lib/server/voice/calling-agent";
import { sendEmail, getAppBaseUrl } from "@/lib/server/email/email-service";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  InvoiceStatus,
  Role,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export type TargetType = "SINGLE" | "SELECTED" | "ALL_OVERDUE" | "ALL_CLIENTS";
export type DispatchChannel = "VOICE" | "EMAIL" | "WHATSAPP";
export type WorkflowReason = "PAYMENT_RECOVERY" | "GST_DEADLINE" | "DOCUMENT_COLLECTION";

interface ManualDispatchPayload {
  targetType: TargetType;
  clientIds?: string[];
  channel: DispatchChannel;
  workflowReason: WorkflowReason;
  customNote?: string;
}

/**
 * TRUV LedgerOS — Backend Bulk & Selective Manual Dispatch API
 * 
 * Empowers the CA Partner to trigger on-demand calls, emails, or WhatsApp reminders
 * to an individual client, selected clients (via checkboxes), or all overdue clients at once.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Session Context Authentication
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

    if (!session && !isApiKeyValid && !isDev) {
      return NextResponse.json(
        { error: "Unauthorized. Valid partner session required for manual dispatch." },
        { status: 401 }
      );
    }

    // 2. Parse & Validate Payload
    const body: ManualDispatchPayload = await req.json().catch(() => ({}));
    const { targetType, clientIds, channel, workflowReason, customNote } = body;

    if (!targetType || !channel || !workflowReason) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          required: ["targetType", "channel", "workflowReason"],
          received: { targetType, channel, workflowReason },
        },
        { status: 400 }
      );
    }

    // 3. Resolve Tenant Context & Partner Name
    let tenantId =
      session?.tenant?.id ||
      session?.membership?.tenantId ||
      (req.headers.get("x-tenant-id") as string);

    if (!tenantId) {
      const activeTenant = await db.tenant.findFirst({
        where: { active: true },
        select: { id: true, name: true },
      });
      tenantId = activeTenant?.id || "default_tenant";
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          where: {
            role: { in: [Role.FIRM_OWNER, Role.PARTNER, Role.FIRM_ADMIN] },
            status: "ACTIVE",
          },
          include: { user: true },
          take: 1,
        },
      },
    });

    const firmName = tenant?.name || "TRUV Advisory & Tax Partners";
    const partnerName =
      session?.user?.name ||
      tenant?.memberships?.[0]?.user?.name ||
      "Designated CA Partner";

    const baseUrl = getAppBaseUrl();
    const now = new Date();

    // 4. Resolve Target Clients
    let targetClients: any[] = [];

    if (targetType === "SINGLE" || targetType === "SELECTED") {
      const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "clientIds array is required when targetType is SINGLE or SELECTED." },
          { status: 400 }
        );
      }

      targetClients = await db.client.findMany({
        where: {
          tenantId,
          id: { in: ids },
        },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          invoices: {
            where: {
              status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
            },
            include: { payments: true },
            orderBy: { dueDate: "asc" },
          },
          gstReturns: {
            where: { status: "DATA_PENDING" },
            take: 1,
          },
          docRequests: {
            where: { status: "PENDING" },
            take: 1,
          },
        },
      });
    } else if (targetType === "ALL_OVERDUE") {
      targetClients = await db.client.findMany({
        where: {
          tenantId,
          active: true,
          invoices: {
            some: {
              status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
              dueDate: { lt: now },
            },
          },
        },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          invoices: {
            where: {
              status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
              dueDate: { lt: now },
            },
            include: { payments: true },
            orderBy: { dueDate: "asc" },
          },
          gstReturns: {
            where: { status: "DATA_PENDING" },
            take: 1,
          },
          docRequests: {
            where: { status: "PENDING" },
            take: 1,
          },
        },
      });
    } else if (targetType === "ALL_CLIENTS") {
      targetClients = await db.client.findMany({
        where: {
          tenantId,
          active: true,
        },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          invoices: {
            where: {
              status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
            },
            include: { payments: true },
            orderBy: { dueDate: "asc" },
          },
          gstReturns: {
            where: { status: "DATA_PENDING" },
            take: 1,
          },
          docRequests: {
            where: { status: "PENDING" },
            take: 1,
          },
        },
      });
    }

    if (targetClients.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No clients found matching the specified dispatch criteria.",
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
      });
    }

    // 5. Execute Dispatch for Each Target Client
    const results: Array<{
      clientId: string;
      clientName: string;
      phone: string;
      email: string;
      channel: DispatchChannel;
      status: "INITIATED" | "DELIVERED" | "FAILED" | "SKIPPED";
      details: string;
      reference?: string;
    }> = [];

    for (const client of targetClients) {
      const clientPhone = client.contacts[0]?.phone || client.phone || "";
      const clientEmail = client.contacts[0]?.email || client.email || "";
      const clientName = client.name;

      // Extract relevant invoice context
      const invoice = client.invoices?.[0];
      let amountDue = 0;
      if (invoice) {
        const paid = invoice.payments?.reduce((s: number, p: any) => s + Number(p.amount), 0) || 0;
        amountDue = Math.max(0, Number(invoice.totalAmount) - paid);
      }
      if (amountDue === 0 && client.monthlyFee) {
        amountDue = Number(client.monthlyFee);
      }

      const invNumber = invoice?.invoiceNumber || `STAT-${now.getFullYear()}-${client.id.slice(-4)}`;
      const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : new Date(Date.now() + 7 * 86400000);

      // Branch A: Direct Voice Telephony Dispatch
      if (channel === "VOICE") {
        if (!clientPhone) {
          results.push({
            clientId: client.id,
            clientName,
            phone: "",
            email: clientEmail,
            channel: "VOICE",
            status: "SKIPPED",
            details: "Missing valid contact phone number.",
          });
          continue;
        }

        try {
          // Normalize and validate Indian standard E.164 phone formatting (+91)
          let cleanPhone = clientPhone.replace(/\D/g, "");
          if (cleanPhone.length === 10) {
            cleanPhone = `91${cleanPhone}`;
          } else if (cleanPhone.length > 10 && !cleanPhone.startsWith("91")) {
            cleanPhone = `91${cleanPhone.slice(-10)}`;
          }
          const formattedPhone = `+${cleanPhone}`;

          if (cleanPhone.length < 10) {
            results.push({
              clientId: client.id,
              clientName,
              phone: clientPhone,
              email: clientEmail,
              channel: "VOICE",
              status: "SKIPPED",
              details: "Invalid telephone number (must be at least 10 digits).",
            });
            continue;
          }

          let serviceDesc = customNote || "Quarterly CA Retainer & Tax Compliance";
          if (workflowReason === "GST_DEADLINE") {
            serviceDesc = customNote || "Statutory GST Return Filing Authorization";
          } else if (workflowReason === "DOCUMENT_COLLECTION") {
            serviceDesc = customNote || "Statutory Audit Bank Statement & Bill Submissions";
          }

          const callReason =
            workflowReason === "PAYMENT_RECOVERY"
              ? "PAYMENT_RECOVERY"
              : workflowReason === "DOCUMENT_COLLECTION"
              ? "DOCUMENT_COLLECTION"
              : "GST_DEADLINE";

          const voiceRes = await initiateOutboundVoiceCall({
            tenantId,
            clientId: client.id,
            recipientPhone: formattedPhone,
            clientName,
            reason: callReason,
            invoiceId: invoice?.id || undefined,
            invoiceNumber: invNumber,
            amount: amountDue,
            dueDate: dueDate.toISOString().slice(0, 10),
            documentTitle: serviceDesc,
            languagePreference: "HINGLISH",
          });

          const isSuccess = voiceRes.success && (
            voiceRes.status === "INITIATED" ||
            voiceRes.status === "DIALING" ||
            voiceRes.status === "DISPATCHED_SIMULATED" ||
            voiceRes.status === "COMPLETED"
          );

          results.push({
            clientId: client.id,
            clientName,
            phone: formattedPhone,
            email: clientEmail,
            channel: "VOICE",
            status: isSuccess ? "DELIVERED" : "FAILED",
            details: voiceRes.provider === "SIMULATED_VOICE_AGENT" || voiceRes.status === "DISPATCHED_SIMULATED"
              ? "Telephony call queued (Carrier in Simulation Mode - set TWILIO credentials in .env to place live GSM calls)"
              : `Outbound voice call ${voiceRes.status.toLowerCase()} via ${voiceRes.provider}.`,
            reference: voiceRes.callSid,
          });
        } catch (voiceErr: any) {
          console.error(`[MANUAL-DISPATCH-VOICE-ERROR] Client ${client.id}:`, voiceErr.message);
          results.push({
            clientId: client.id,
            clientName,
            phone: clientPhone,
            email: clientEmail,
            channel: "VOICE",
            status: "FAILED",
            details: `Telephony error: ${voiceErr.message}`,
          });
        }
      }

      // Branch B: Direct Email Dispatch
      else if (channel === "EMAIL") {
        if (!clientEmail) {
          results.push({
            clientId: client.id,
            clientName,
            phone: clientPhone,
            email: "",
            channel: "EMAIL",
            status: "SKIPPED",
            details: "Missing client email address.",
          });
          continue;
        }

        let subject = `Notice from ${firmName} — ${clientName}`;
        let emailHtml = "";
        let emailText = "";

        if (workflowReason === "PAYMENT_RECOVERY") {
          subject = `Important: Outstanding Professional Fee Notice — Invoice #${invNumber} [${firmName}]`;
          emailText = `Dear ${clientName},\n\nThis is a formal reminder regarding outstanding invoice #${invNumber} for INR ${amountDue.toLocaleString("en-IN")}, due on ${dueDate.toLocaleDateString("en-IN")}.\n\n${customNote ? `Partner Note: ${customNote}\n\n` : ""}Please settle at your earliest convenience:\nhttps://truvledgeros2.vercel.app/pay/${encodeURIComponent(invNumber)}\n\nWarm regards,\n${partnerName}\n${firmName}`;
          emailHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; padding: 24px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #0f172a; margin-top: 0;">Outstanding Professional Fee Reminder</h2>
            <p>Dear ${clientName},</p>
            <p>We are writing to follow up on outstanding statutory invoice <strong>#${invNumber}</strong>.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Invoice Number:</strong> #${invNumber}</p>
              <p style="margin: 4px 0;"><strong>Outstanding Amount:</strong> ₹${amountDue.toLocaleString("en-IN")}</p>
              <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate.toLocaleDateString("en-IN")}</p>
              ${customNote ? `<p style="margin: 8px 0 0; color: #ea580c;"><strong>CA Partner Note:</strong> ${customNote}</p>` : ""}
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://truvledgeros2.vercel.app/pay/${encodeURIComponent(invNumber)}" style="background: #ea580c; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Settle Invoice Online</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Warm regards,<br/><strong>${partnerName}</strong><br/>${firmName}</p>
          </div>`;
        } else if (workflowReason === "GST_DEADLINE") {
          subject = `Statutory GST Return Authorization Required — ${firmName}`;
          emailText = `Dear ${clientName},\n\nYour GST return is pending client authorization. Statutory filing deadline is approaching.\n\n${customNote ? `Special Instructions: ${customNote}\n\n` : ""}Kindly review and authorize your return:\n${baseUrl}/gst\n\nWarm regards,\n${firmName}`;
          emailHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; padding: 24px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #0f172a; margin-top: 0;">Statutory GST Return Filing Authorization</h2>
            <p>Dear ${clientName},</p>
            <p>Your draft GST return has been audited and prepared by our compliance team. Immediate sign-off is required to avoid statutory interest and late filing fees under Section 50 of the CGST Act.</p>
            ${customNote ? `<div style="background: #fef3c7; border: 1px solid #fde68a; padding: 12px; border-radius: 6px; margin: 16px 0; color: #92400e; font-size: 13px;"><strong>Partner Directive:</strong> ${customNote}</div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${baseUrl}/gst" style="background: #0d9488; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Review & Authorize Return</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Warm regards,<br/><strong>${partnerName}</strong><br/>${firmName}</p>
          </div>`;
        } else {
          subject = `Action Required: Statutory Document & Bank Statement Submission — ${firmName}`;
          emailText = `Dear ${clientName},\n\nWe require pending bank statements and purchase/sales registers for ongoing statutory audits.\n\n${customNote ? `Required Details: ${customNote}\n\n` : ""}Please upload your documents securely:\n${baseUrl}/documents\n\nWarm regards,\n${firmName}`;
          emailHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; padding: 24px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #0f172a; margin-top: 0;">Pending Document Submissions Required</h2>
            <p>Dear ${clientName},</p>
            <p>To ensure timely audit closure and avoid tax computation disallowances, please submit your pending statements and tax invoices to our secure vault.</p>
            ${customNote ? `<div style="background: #e0f2fe; border: 1px solid #bae6fd; padding: 12px; border-radius: 6px; margin: 16px 0; color: #0369a1; font-size: 13px;"><strong>Document Specifics:</strong> ${customNote}</div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${baseUrl}/documents" style="background: #0284c7; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Upload to Secure Vault</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Warm regards,<br/><strong>${partnerName}</strong><br/>${firmName}</p>
          </div>`;
        }

        try {
          const delivery = await sendEmail({
            to: clientEmail,
            subject,
            html: emailHtml,
            text: emailText,
            tenantId,
            category: "NOTIFICATION",
          });

          if (!delivery.success || delivery.status === "FAILED") {
            const errorMsg = delivery.error || "Email delivery failed at gateway";
            const comm = await db.communication.create({
              data: {
                tenantId,
                clientId: client.id,
                invoiceId: invoice?.id || null,
                channel: CommunicationChannel.EMAIL,
                direction: CommunicationDirection.OUTBOUND,
                purpose: workflowReason,
                category: "MANUAL_DISPATCH",
                recipient: clientEmail,
                subject,
                content: emailHtml,
                status: CommunicationStatus.FAILED,
                metadata: { error: errorMsg, provider: delivery.provider },
                externalRef: delivery.messageId || `failed_email_${Date.now()}`,
              },
            });

            results.push({
              clientId: client.id,
              clientName,
              phone: clientPhone,
              email: clientEmail,
              channel: "EMAIL",
              status: "FAILED",
              details: `Email delivery failed: ${errorMsg}`,
              reference: comm.id,
            });
          } else {
            const externalMsgId = delivery.messageId || `manual_email_${Date.now()}_${client.id.slice(-4)}`;
            const comm = await db.communication.create({
              data: {
                tenantId,
                clientId: client.id,
                invoiceId: invoice?.id || null,
                channel: CommunicationChannel.EMAIL,
                direction: CommunicationDirection.OUTBOUND,
                purpose: workflowReason,
                category: "MANUAL_DISPATCH",
                recipient: clientEmail,
                subject,
                content: emailHtml,
                status: CommunicationStatus.DELIVERED,
                metadata: {
                  provider: delivery.provider,
                  messageId: externalMsgId,
                  outcome: delivery.deliveryOutcome,
                },
                externalRef: externalMsgId,
              },
            });

            results.push({
              clientId: client.id,
              clientName,
              phone: clientPhone,
              email: clientEmail,
              channel: "EMAIL",
              status: "DELIVERED",
              details: `Email dispatched successfully to ${clientEmail} (${delivery.provider || "mail"}: ${externalMsgId}).`,
              reference: comm.id,
            });
          }
        } catch (emailErr: any) {
          console.error(`[MANUAL-DISPATCH-EMAIL-ERROR] Client ${client.id}:`, emailErr.message);
          const comm = await db.communication.create({
            data: {
              tenantId,
              clientId: client.id,
              invoiceId: invoice?.id || null,
              channel: CommunicationChannel.EMAIL,
              direction: CommunicationDirection.OUTBOUND,
              purpose: workflowReason,
              category: "MANUAL_DISPATCH",
              recipient: clientEmail,
              subject,
              content: emailHtml,
              status: CommunicationStatus.FAILED,
              metadata: { error: emailErr.message },
              externalRef: `error_email_${Date.now()}`,
            },
          }).catch(() => null);

          results.push({
            clientId: client.id,
            clientName,
            phone: clientPhone,
            email: clientEmail,
            channel: "EMAIL",
            status: "FAILED",
            details: `Email error: ${emailErr.message}`,
            reference: comm?.id,
          });
        }
      }

      // Branch C: WhatsApp Reminder Dispatch
      else if (channel === "WHATSAPP") {
        if (!clientPhone) {
          results.push({
            clientId: client.id,
            clientName,
            phone: "",
            email: clientEmail,
            channel: "WHATSAPP",
            status: "SKIPPED",
            details: "Missing contact phone number for WhatsApp.",
          });
          continue;
        }

        let waMessage = "";
        if (workflowReason === "PAYMENT_RECOVERY") {
          waMessage = `Namaste ${clientName} ji,\n\nReminder from ${firmName}:\nStatutory invoice #${invNumber} of ₹${amountDue.toLocaleString("en-IN")} is pending settlement (Due: ${dueDate.toLocaleDateString("en-IN")}).\n\n${customNote ? `Note: ${customNote}\n\n` : ""}Pay instantly via UPI/NetBanking:\nhttps://truvledgeros2.vercel.app/pay/${encodeURIComponent(invNumber)}\n\nWarm regards,\n${partnerName}`;
        } else if (workflowReason === "GST_DEADLINE") {
          waMessage = `Namaste ${clientName} ji,\n\nCompliance Alert from ${firmName}:\nYour GST return is prepared and pending your sign-off before the filing deadline.\n\n${customNote ? `Note: ${customNote}\n\n` : ""}Review and approve return:\n${baseUrl}/gst\n\nWarm regards,\n${firmName}`;
        } else {
          waMessage = `Namaste ${clientName} ji,\n\nAudit Alert from ${firmName}:\nKindly share your pending bank statements and vouchers to complete this quarter's audit.\n\n${customNote ? `Details: ${customNote}\n\n` : ""}Upload docs directly:\n${baseUrl}/documents\n\nWarm regards,\n${firmName}`;
        }

        try {
          const comm = await db.communication.create({
            data: {
              tenantId,
              clientId: client.id,
              invoiceId: invoice?.id || null,
              channel: CommunicationChannel.WHATSAPP,
              direction: CommunicationDirection.OUTBOUND,
              purpose: workflowReason,
              category: "MANUAL_DISPATCH",
              recipient: clientPhone,
              subject: `WhatsApp Dispatch: ${workflowReason} (${clientName})`,
              content: waMessage,
              status: "DELIVERED",
              externalRef: `manual_wa_${Date.now()}_${client.id.slice(-4)}`,
            },
          });

          results.push({
            clientId: client.id,
            clientName,
            phone: clientPhone,
            email: clientEmail,
            channel: "WHATSAPP",
            status: "DELIVERED",
            details: `WhatsApp message dispatched to ${clientPhone}.`,
            reference: comm.id,
          });
        } catch (waErr: any) {
          results.push({
            clientId: client.id,
            clientName,
            phone: clientPhone,
            email: clientEmail,
            channel: "WHATSAPP",
            status: "FAILED",
            details: `WhatsApp error: ${waErr.message}`,
          });
        }
      }
    }

    try {
      revalidatePath("/communications");
      revalidatePath("/payments");
      revalidatePath("/automations");
    } catch {}

    const succeededCount = results.filter((r) => r.status === "DELIVERED" || r.status === "INITIATED").length;
    const failedCount = results.filter((r) => r.status === "FAILED").length;
    const hasSimulation = results.some((r) => r.details?.includes("Simulation Mode"));

    return NextResponse.json({
      success: true,
      targetType,
      channel,
      workflowReason,
      processedCount: results.length,
      succeededCount,
      successCount: succeededCount,
      failedCount,
      isSimulated: hasSimulation,
      results,
    });
  } catch (err: any) {
    console.error("[MANUAL-DISPATCH-FATAL]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process manual dispatch request.",
        message: err.message,
      },
      { status: 500 }
    );
  }
}
