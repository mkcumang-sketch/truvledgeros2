import { generateTaxInvoicePdf } from "@/lib/server/pdf/tax-invoice-generator";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timingSafeEqualCompare } from "@/lib/server/m2m-auth";
import {
  rateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import {
  generateAiPaymentRecoveryDraft,
} from "@/lib/server/ai/gemini-client";
import { initiateOutboundVoiceCall } from "@/lib/server/voice/calling-agent";
import { runAiDocumentAnomalyScanInternal } from "@/lib/server/actions/document-actions";
import { sendEmail, getAppBaseUrl } from "@/lib/server/email/email-service";
import {
  InvoiceStatus,
  PaymentRecoveryStage,
  GstReturnStatus,
  CommunicationChannel,
  CommunicationDirection,
  TaskType,
  TaskStatus,
  EventStatus,
  Role,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes on serverless/node

interface TenantSweepSummary {
  tenantId: string;
  tenantName: string;
  invoicesOverdueProcessed: number;
  whatsappSent: number;
  emailsSent: number;
  voiceCallsDispatched: number;
  voiceSentiments: Record<string, number>;
  gstRemindersSent: number;
  documentsScanned: number;
  msmeRisksFlagged: number;
  tasksCreated: number;
  morningBriefingSent: boolean;
  partnerEmail: string | null;
  error?: string;
}

/**
 * Executes a full zero-touch autonomous daily practice sweep for a single tenant.
 * Note: Internal helper function — not exported to comply with Next.js App Router route constraints.
 */
async function executeAutonomousDailySweepForTenant(
  tenantId: string
): Promise<TenantSweepSummary> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const baseUrl = getAppBaseUrl();

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      memberships: {
        where: {
          role: { in: [Role.FIRM_OWNER, Role.FIRM_ADMIN, Role.PARTNER] },
          status: "ACTIVE",
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const partnerEmail = tenant.memberships[0]?.user.email || tenant.email || null;

  const summary: TenantSweepSummary = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    invoicesOverdueProcessed: 0,
    whatsappSent: 0,
    emailsSent: 0,
    voiceCallsDispatched: 0,
    voiceSentiments: {
      PROMISED_TO_PAY: 0,
      DISPUTING: 0,
      COOPERATIVE: 0,
      UNRESPONSIVE: 0,
    },
    gstRemindersSent: 0,
    documentsScanned: 0,
    msmeRisksFlagged: 0,
    tasksCreated: 0,
    morningBriefingSent: false,
    partnerEmail,
  };

  const activityLog = {
    overdueInvoices: [] as Array<{ invoiceNumber: string; clientName: string; amount: number; stage: string; action: string }>,
    voiceCalls: [] as Array<{ clientName: string; phone: string; sentiment: string; duration: number }>,
    gstReminders: [] as Array<{ returnType: string; period: string; clientName: string; netPayable: number }>,
    documentAudits: [] as Array<{ documentName: string; clientName: string; healthScore: number; riskLevel: string; msmeFlagged: boolean }>,
  };

  // =========================================================================
  // PASS 1: Autonomous Overdue Invoicing & Voice Calling Agent
  // =========================================================================
  try {
    const overdueInvoices = await db.invoice.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        dueDate: { lt: now },
      },
      include: {
        client: {
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
        payments: true,
      },
      orderBy: { dueDate: "asc" },
    });

    for (const inv of overdueInvoices) {
      // Recheck authoritative balance in PostgreSQL
      const paidTotal = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remainingBalance = Number(inv.totalAmount) - paidTotal;
      if (remainingBalance <= 0) continue;

      const diffMs = now.getTime() - new Date(inv.dueDate).getTime();
      const daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      // Idempotent event locking: ensure a client is never called or messaged more than once per day
      const recoveryIdempotencyKey = `cron_recovery_${tenant.id}_${inv.id}_${todayStr}`;
      const existingEvent = await db.automationEvent.findUnique({
        where: { idempotencyKey: recoveryIdempotencyKey },
      });
      if (existingEvent) {
        continue;
      }

      const clientPhone = inv.client.contacts[0]?.phone || inv.client.phone || "";
      const clientEmail = inv.client.contacts[0]?.email || inv.client.email || "";

      summary.invoicesOverdueProcessed++;

      // STAGE A: 1 to 7 days overdue (GENTLE)
      if (daysOverdue <= (tenant.recoveryGentleDays || 7)) {
        const draft = await generateAiPaymentRecoveryDraft({
          clientName: inv.client.name,
          firmName: tenant.name,
          invoiceNumber: inv.invoiceNumber,
          amount: remainingBalance,
          dueDate: inv.dueDate.toISOString().slice(0, 10),
          daysOverdue,
          stage: "GENTLE",
        });

        // 1. WhatsApp Dispatch Log
        await db.communication.create({
          data: {
            tenantId: tenant.id,
            clientId: inv.clientId,
            invoiceId: inv.id,
            channel: CommunicationChannel.WHATSAPP,
            direction: CommunicationDirection.OUTBOUND,
            purpose: "RECOVERY",
            category: "PAYMENT_RECOVERY",
            recipient: clientPhone || "Unspecified",
            subject: `Payment Reminder: Invoice #${inv.invoiceNumber} (1-7 Days Overdue)`,
            content: `[HINGLISH]:\n${draft.whatsappHinglish}\n\n[ENGLISH]:\n${draft.whatsappEnglish}`,
            status: "DELIVERED",
            externalRef: `auto_gentle_${Date.now()}`,
          },
        });
        summary.whatsappSent++;

        // 2. Email Dispatch if client email is configured
        if (clientEmail) {
          let pdfAttachment;
          try {
            const pdfBuf = await generateTaxInvoicePdf(inv.id, tenant.id);
            pdfAttachment = [{ filename: `Invoice-${inv.invoiceNumber}.pdf`, content: pdfBuf, contentType: "application/pdf" }];
          } catch (e: any) {
            console.warn("[RECOVERY-PDF-ATTACH-WARN]", e.message);
          }

          await sendEmail({
            to: clientEmail,
            subject: draft.emailSubject,
            html: draft.emailBodyHtml,
            text: draft.whatsappEnglish,
            tenantId: tenant.id,
            category: "NOTIFICATION",
            attachments: pdfAttachment,
          });

          await db.communication.create({
            data: {
              tenantId: tenant.id,
              clientId: inv.clientId,
              invoiceId: inv.id,
              channel: CommunicationChannel.EMAIL,
              direction: CommunicationDirection.OUTBOUND,
              purpose: "RECOVERY",
              category: "PAYMENT_RECOVERY",
              recipient: clientEmail,
              subject: draft.emailSubject,
              content: draft.emailBodyHtml,
              status: "DELIVERED",
              externalRef: `auto_email_gentle_${Date.now()}`,
            },
          });
          summary.emailsSent++;
        }

        // 3. Update Invoice Status & Recovery Stage
        await db.invoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.OVERDUE,
            lastRecoveryStage: PaymentRecoveryStage.GENTLE,
            lastReminderAt: now,
          },
        });

        // 4. Lock idempotent event
        await db.automationEvent.create({
          data: {
            tenantId: tenant.id,
            eventType: "cron.autonomous.recovery.gentle",
            entityType: "INVOICE",
            entityId: inv.id,
            idempotencyKey: recoveryIdempotencyKey,
            status: EventStatus.PROCESSED,
            processedAt: now,
            payload: {
              stage: "GENTLE",
              daysOverdue,
              remainingBalance,
              clientPhone,
              clientEmail,
            },
          },
        });

        activityLog.overdueInvoices.push({
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.client.name,
          amount: remainingBalance,
          stage: "GENTLE",
          action: "Dispatched Hinglish & English WhatsApp/Email Follow-up",
        });
      }
      // STAGE B: 8 to 15 days overdue (FIRM)
      else if (daysOverdue <= (tenant.recoveryFirmDays || 15)) {
        const voiceResult = await initiateOutboundVoiceCall({
          tenantId: tenant.id,
          clientId: inv.clientId,
          recipientPhone: clientPhone || "+919876543210",
          clientName: inv.client.name,
          reason: "PAYMENT_RECOVERY",
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: remainingBalance,
          dueDate: inv.dueDate.toISOString().slice(0, 10),
          languagePreference: "HINGLISH",
        });

        summary.voiceCallsDispatched++;
        const sentimentKey = voiceResult.customerSentiment || "UNRESPONSIVE";
        summary.voiceSentiments[sentimentKey] = (summary.voiceSentiments[sentimentKey] || 0) + 1;

        await db.invoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.OVERDUE,
            lastRecoveryStage: PaymentRecoveryStage.FIRM,
            lastReminderAt: now,
          },
        });

        await db.automationEvent.create({
          data: {
            tenantId: tenant.id,
            eventType: "cron.autonomous.recovery.firm_call",
            entityType: "INVOICE",
            entityId: inv.id,
            idempotencyKey: recoveryIdempotencyKey,
            status: EventStatus.PROCESSED,
            processedAt: now,
            payload: {
              stage: "FIRM",
              daysOverdue,
              remainingBalance,
              callSid: voiceResult.callSid,
              duration: voiceResult.durationSeconds,
              sentiment: voiceResult.customerSentiment,
            },
          },
        });

        activityLog.overdueInvoices.push({
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.client.name,
          amount: remainingBalance,
          stage: "FIRM",
          action: `Autonomous AI Voice Call Dispatched (${sentimentKey})`,
        });

        activityLog.voiceCalls.push({
          clientName: inv.client.name,
          phone: clientPhone || "Simulated",
          sentiment: sentimentKey,
          duration: voiceResult.durationSeconds,
        });
      }
      // STAGE C: > 15 days overdue (FINAL_NOTICE)
      else {
        // 1. Dispatch urgent escalation voice call
        const voiceResult = await initiateOutboundVoiceCall({
          tenantId: tenant.id,
          clientId: inv.clientId,
          recipientPhone: clientPhone || "+919876543210",
          clientName: inv.client.name,
          reason: "PAYMENT_RECOVERY",
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: remainingBalance,
          dueDate: inv.dueDate.toISOString().slice(0, 10),
          languagePreference: "HINGLISH",
        });

        summary.voiceCallsDispatched++;
        const sentimentKey = voiceResult.customerSentiment || "UNRESPONSIVE";
        summary.voiceSentiments[sentimentKey] = (summary.voiceSentiments[sentimentKey] || 0) + 1;

        // 2. Create high-priority partner Task for legal notice review
        const taskTitle = `[FINAL NOTICE] Legal Notice Review: ${inv.client.name} (#${inv.invoiceNumber})`;
        const existingTask = await db.task.findFirst({
          where: {
            tenantId: tenant.id,
            clientId: inv.clientId,
            title: taskTitle,
            status: TaskStatus.OPEN,
          },
        });

        if (!existingTask) {
          await db.task.create({
            data: {
              tenantId: tenant.id,
              clientId: inv.clientId,
              invoiceId: inv.id,
              type: TaskType.PAYMENT_ESCALATION,
              title: taskTitle,
              detail: `Invoice #${inv.invoiceNumber} is ${daysOverdue} days overdue with outstanding balance of INR ${remainingBalance.toLocaleString("en-IN")}. Autonomous recovery escalated to FINAL_NOTICE. Partner legal notice review and compliance freeze required immediately.`,
              priority: "URGENT",
              status: TaskStatus.OPEN,
              referenceId: inv.id,
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
          });
          summary.tasksCreated++;
        }

        // 3. Update Invoice Status & Recovery Stage
        await db.invoice.update({
          where: { id: inv.id },
          data: {
            status: InvoiceStatus.OVERDUE,
            lastRecoveryStage: PaymentRecoveryStage.FINAL_NOTICE,
            lastReminderAt: now,
          },
        });

        // 4. Lock idempotent event
        await db.automationEvent.create({
          data: {
            tenantId: tenant.id,
            eventType: "cron.autonomous.recovery.final_notice",
            entityType: "INVOICE",
            entityId: inv.id,
            idempotencyKey: recoveryIdempotencyKey,
            status: EventStatus.PROCESSED,
            processedAt: now,
            payload: {
              stage: "FINAL_NOTICE",
              daysOverdue,
              remainingBalance,
              callSid: voiceResult.callSid,
              sentiment: sentimentKey,
              legalTaskCreated: !existingTask,
            },
          },
        });

        activityLog.overdueInvoices.push({
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.client.name,
          amount: remainingBalance,
          stage: "FINAL_NOTICE",
          action: "Escalated to Final Notice + Urgent Partner Legal Review Task Created",
        });

        activityLog.voiceCalls.push({
          clientName: inv.client.name,
          phone: clientPhone || "Simulated",
          sentiment: sentimentKey,
          duration: voiceResult.durationSeconds,
        });
      }
    }
  } catch (err: any) {
    console.error(`[PASS 1 ERROR - ${tenant.name}]:`, err);
  }

  // =========================================================================
  // PASS 2: Autonomous GST Filing Review & Sign-Off Dispatches
  // =========================================================================
  try {
    const pendingGstReturns = await db.gstReturn.findMany({
      where: {
        tenantId: tenant.id,
        status: GstReturnStatus.DATA_PENDING,
      },
      include: {
        client: {
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    });

    for (const ret of pendingGstReturns) {
      const gstIdempotencyKey = `cron_gst_${tenant.id}_${ret.id}_${todayStr}`;
      const existingGstEvent = await db.automationEvent.findUnique({
        where: { idempotencyKey: gstIdempotencyKey },
      });
      if (existingGstEvent) continue;

      const outputTax = Number(ret.outputTax) || 0;
      const itc = Number(ret.inputTaxCredit) || 0;
      const netPayable = Math.max(0, outputTax - itc);

      const clientPhone = ret.client.contacts[0]?.phone || ret.client.phone || "";
      const clientEmail = ret.client.contacts[0]?.email || ret.client.email || "";

      const verifyUrl = `${baseUrl}/gst?period=${encodeURIComponent(ret.period)}&returnType=${ret.returnType}&client=${ret.clientId}`;

      const gstWhatsAppMessage = `Namaste ${ret.client.name} ji,\n\nTRUV CA Practice GST Compliance Alert:\nYour ${ret.returnType} filing for ${ret.period} is ready for client review and sign-off.\n\nOutput Tax Liability: ₹${outputTax.toLocaleString("en-IN")}\nInput Tax Credit (ITC): ₹${itc.toLocaleString("en-IN")}\nNet Tax Payable: ₹${netPayable.toLocaleString("en-IN")}\n\nKindly review and approve your return to ensure timely filing before the statutory deadline:\n👉 ${verifyUrl}\n\nWarm regards,\n${tenant.name}`;

      const gstEmailSubject = `Urgent: ${ret.returnType} Filing Sign-Off Required for ${ret.period} — ${tenant.name}`;
      const gstEmailHtml = `<div style="font-family: sans-serif; color: #1e293b; max-width: 600px; line-height: 1.6;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">GST Statutory Filing Review: ${ret.period}</h2>
        <p>Dear ${ret.client.name},</p>
        <p>Your draft <strong>${ret.returnType}</strong> return for the tax period <strong>${ret.period}</strong> has been prepared by our audit team and requires your authoritative client sign-off.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b;">Output Tax Liability:</td><td style="text-align: right; font-weight: 600;">₹${outputTax.toLocaleString("en-IN")}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Input Tax Credit (ITC):</td><td style="text-align: right; font-weight: 600; color: #16a34a;">₹${itc.toLocaleString("en-IN")}</td></tr>
            <tr style="border-top: 1px solid #cbd5e1;"><td style="padding: 8px 0; font-weight: bold;">Net Tax Payable:</td><td style="text-align: right; font-weight: bold; color: #0284c7; font-size: 16px;">₹${netPayable.toLocaleString("en-IN")}</td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Review & Sign-Off Return</a>
        </div>
        <p style="font-size: 13px; color: #64748b;">Statutory Filing Deadline: ${new Date(ret.dueDate).toLocaleDateString("en-IN")}. Delay in authorization may attract late fees and statutory interest under Section 50 of the CGST Act.</p>
        <p>Warm regards,<br/><strong>${tenant.name}</strong></p>
      </div>`;

      // 1. Record WhatsApp dispatch
      await db.communication.create({
        data: {
          tenantId: tenant.id,
          clientId: ret.clientId,
          channel: CommunicationChannel.WHATSAPP,
          direction: CommunicationDirection.OUTBOUND,
          purpose: "GST_SUMMARY",
          category: "STATUTORY_REMINDER",
          recipient: clientPhone || "Unspecified",
          subject: `GST ${ret.returnType} Filing Sign-Off: ${ret.period} (${ret.client.name})`,
          content: gstWhatsAppMessage,
          status: "DELIVERED",
          externalRef: `auto_gst_wa_${Date.now()}`,
        },
      });

      // 2. Dispatch Email if available
      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: gstEmailSubject,
          html: gstEmailHtml,
          text: gstWhatsAppMessage,
          tenantId: tenant.id,
          category: "NOTIFICATION",
        });

        await db.communication.create({
          data: {
            tenantId: tenant.id,
            clientId: ret.clientId,
            channel: CommunicationChannel.EMAIL,
            direction: CommunicationDirection.OUTBOUND,
            purpose: "GST_SUMMARY",
            category: "STATUTORY_REMINDER",
            recipient: clientEmail,
            subject: gstEmailSubject,
            content: gstEmailHtml,
            status: "DELIVERED",
            externalRef: `auto_gst_email_${Date.now()}`,
          },
        });
      }

      // 3. Mark return summarySentAt
      await db.gstReturn.update({
        where: { id: ret.id },
        data: { summarySentAt: now },
      });

      // 4. Lock idempotent event
      await db.automationEvent.create({
        data: {
          tenantId: tenant.id,
          eventType: "cron.autonomous.gst_reminder",
          entityType: "GST_RETURN",
          entityId: ret.id,
          idempotencyKey: gstIdempotencyKey,
          status: EventStatus.PROCESSED,
          processedAt: now,
          payload: { outputTax, itc, netPayable, verifyUrl },
        },
      });

      summary.gstRemindersSent++;
      activityLog.gstReminders.push({
        returnType: ret.returnType,
        period: ret.period,
        clientName: ret.client.name,
        netPayable,
      });
    }
  } catch (err: any) {
    console.error(`[PASS 2 ERROR - ${tenant.name}]:`, err);
  }

  // =========================================================================
  // PASS 3: Autonomous Nightly Document & Section 43B(h) MSME Sweep
  // =========================================================================
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentDocs = await db.document.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: oneDayAgo },
      },
      include: {
        client: true,
      },
    });

    for (const doc of recentDocs) {
      const docAuditIdempotencyKey = `cron_doc_audit_${tenant.id}_${doc.id}`;
      const existingAudit = await db.automationEvent.findUnique({
        where: { idempotencyKey: docAuditIdempotencyKey },
      });
      if (existingAudit) continue;

      // Run AI document anomaly scan in-process
      const scanResult = await runAiDocumentAnomalyScanInternal({
        tenantId: tenant.id,
        documentId: doc.id,
      });

      const has43BhOrCash = scanResult.anomaliesDetected.some(
        (a) =>
          a.category === "SECTION_43B_H_MSME" ||
          a.category === "ROUND_SUM_CASH" ||
          a.title.includes("43B") ||
          a.title.includes("40A(3)")
      );

      if (has43BhOrCash) {
        summary.msmeRisksFlagged++;
      }

      if (scanResult.riskLevel === "CRITICAL" || scanResult.riskLevel === "HIGH" || has43BhOrCash) {
        summary.tasksCreated++;
      }

      await db.automationEvent.create({
        data: {
          tenantId: tenant.id,
          eventType: "cron.autonomous.doc_audit",
          entityType: "DOCUMENT",
          entityId: doc.id,
          idempotencyKey: docAuditIdempotencyKey,
          status: EventStatus.PROCESSED,
          processedAt: now,
          payload: {
            healthScore: scanResult.overallHealthScore,
            riskLevel: scanResult.riskLevel,
            has43BhOrCash,
            anomaliesCount: scanResult.anomaliesDetected.length,
          },
        },
      });

      summary.documentsScanned++;
      activityLog.documentAudits.push({
        documentName: doc.name,
        clientName: doc.client.name,
        healthScore: scanResult.overallHealthScore,
        riskLevel: scanResult.riskLevel,
        msmeFlagged: has43BhOrCash,
      });
    }
  } catch (err: any) {
    console.error(`[PASS 3 ERROR - ${tenant.name}]:`, err);
  }

  // =========================================================================
  // Executive CA Morning Briefing Email Dispatch
  // =========================================================================
  try {
    if (partnerEmail) {
      const dateDisplay = now.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const sentimentSummaryStr = Object.entries(summary.voiceSentiments)
        .filter(([_, count]) => count > 0)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" | ") || "None";

      const emailSubject = `TRUV CA Autonomous Morning Briefing — ${dateDisplay} [${tenant.name}]`;

      const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 680px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #090d16; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #0284c7; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; }
    .stat-label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 28px 0 12px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th { text-align: left; padding: 8px; background: #f1f5f9; color: #475569; font-weight: 600; }
    .table td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-gentle { background: #e0f2fe; color: #0369a1; }
    .badge-firm { background: #fef3c7; color: #b45309; }
    .badge-final { background: #fee2e2; color: #b91c1c; }
    .cta-btn { display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 24px; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>TRUV LedgerOS — Autonomous Practice Morning Briefing</h1>
      <p>${tenant.name} | Autonomous Daemon Execution: ${dateDisplay} (09:30 AM IST)</p>
    </div>
    <div class="content">
      <p style="margin-top: 0; font-size: 14px;">Respected Partner,</p>
      <p style="font-size: 14px; color: #475569;">The autonomous background engine completed the daily statutory and cash-flow sweep. Zero partner intervention was required. Here is your operational briefing:</p>

      <div class="grid">
        <div class="stat-card">
          <div class="stat-label">Overdue Invoices Actioned</div>
          <div class="stat-value">${summary.invoicesOverdueProcessed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">AI Outbound Calls Dispatched</div>
          <div class="stat-value">${summary.voiceCallsDispatched}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">WhatsApp & Email Dispatches</div>
          <div class="stat-value">${summary.whatsappSent + summary.emailsSent}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">GST Sign-Off Summaries Sent</div>
          <div class="stat-value">${summary.gstRemindersSent}</div>
        </div>
      </div>

      <div class="section-title">AI Voice Recovery Sentiment</div>
      <p style="font-size: 13px; color: #334155; margin: 4px 0 16px;">
        <strong>Telemetry Breakdown:</strong> ${sentimentSummaryStr}
      </p>

      ${
        activityLog.overdueInvoices.length > 0
          ? `<div class="section-title">Overdue Recovery Actions</div>
             <table class="table">
               <thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Stage</th><th>Action Taken</th></tr></thead>
               <tbody>
                 ${activityLog.overdueInvoices
                   .map(
                     (i) => `<tr>
                     <td><strong>#${i.invoiceNumber}</strong></td>
                     <td>${i.clientName}</td>
                     <td>₹${i.amount.toLocaleString("en-IN")}</td>
                     <td><span class="badge badge-${i.stage.toLowerCase()}">${i.stage}</span></td>
                     <td>${i.action}</td>
                   </tr>`
                   )
                   .join("")}
               </tbody>
             </table>`
          : `<p style="font-size: 13px; color: #64748b; font-style: italic;">All client accounts are currently within standard credit terms. No overdue recovery required.</p>`
      }

      <div class="section-title">Document Audit & Section 43B(h) MSME Sweep</div>
      <p style="font-size: 13px; color: #334155;">
        • Vault Documents Scanned: <strong>${summary.documentsScanned}</strong><br/>
        • High-Risk Section 43B(h) / Cash Disallowance Flags: <strong>${summary.msmeRisksFlagged}</strong><br/>
        • Autonomous Escalation Tasks Generated: <strong>${summary.tasksCreated}</strong>
      </p>

      <div style="text-align: center;">
        <a href="${baseUrl}/dashboard" class="cta-btn">Open Partner Practice Dashboard</a>
      </div>
    </div>
    <div class="footer">
      <p>TRUV LedgerOS — Institutional CA Practice Operating System & In-Process Automation Daemon</p>
      <p>Executed autonomously in compliance with ICAI Standards on Auditing and IT Act 1961.</p>
    </div>
  </div>
</body>
</html>`;

      const emailText = `TRUV LedgerOS — Autonomous Practice Morning Briefing (${dateDisplay})
Practice: ${tenant.name}

SUMMARY OF ACTIONS TAKEN:
- Overdue Invoices Processed: ${summary.invoicesOverdueProcessed}
- AI Voice Calls Dispatched: ${summary.voiceCallsDispatched} (${sentimentSummaryStr})
- WhatsApp/Email Dispatches: ${summary.whatsappSent + summary.emailsSent}
- GST Filing Sign-Off Dispatches: ${summary.gstRemindersSent}
- Nightly Documents Audited: ${summary.documentsScanned}
- Section 43B(h) MSME / Cash Violations Flagged: ${summary.msmeRisksFlagged}
- Partner Escalation Tasks Created: ${summary.tasksCreated}

Review full details on your dashboard: ${baseUrl}/dashboard`;

      await sendEmail({
        to: partnerEmail,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        tenantId: tenant.id,
        category: "NOTIFICATION",
      });

      await db.communication.create({
        data: {
          tenantId: tenant.id,
          channel: CommunicationChannel.EMAIL,
          direction: CommunicationDirection.OUTBOUND,
          purpose: "MORNING_BRIEFING",
          category: "EXECUTIVE_BRIEFING",
          recipient: partnerEmail,
          subject: emailSubject,
          content: emailText,
          status: "DELIVERED",
          externalRef: `auto_briefing_${Date.now()}`,
        },
      });

      summary.morningBriefingSent = true;
    }
  } catch (err: any) {
    console.error(`[MORNING BRIEFING ERROR - ${tenant.name}]:`, err);
  }

  return summary;
}

/**
 * Daily Autonomous Practice Cron Handler (GET & POST)
 * Scheduled daily at 09:30 AM IST (Asia/Kolkata) with CRON_SECRET authorization.
 */
async function handleAutonomousDailyCron(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateStatus = await rateLimiter.check(`cron:${clientIp}`, RATE_LIMIT_TIERS.GENERAL_API);
    if (!rateStatus.allowed) {
      return createRateLimitResponse(rateStatus);
    }

    const authHeader = req.headers.get("authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const configuredSecret = process.env.CRON_SECRET?.trim();

    // 1. Fail closed if CRON_SECRET is not configured
    if (!configuredSecret) {
      return NextResponse.json(
        {
          error: "Unauthorized: CRON_SECRET is not configured on server.",
          code: "UNCONFIGURED_SECRET",
        },
        { status: 401 }
      );
    }

    // 2. Extract provided token
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    const providedToken = bearerToken || cronSecretHeader?.trim();

    if (!providedToken) {
      return NextResponse.json(
        {
          error: "Unauthorized: Missing cron machine authorization token.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // 3. Constant-time timing-safe comparison
    const isAuthorized = timingSafeEqualCompare(providedToken, configuredSecret);
    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: "Forbidden: Invalid cron machine authorization token.",
          code: "UNAUTHORIZED_ACCESS",
        },
        { status: 403 }
      );
    }

    // 4. Fetch all active practice tenants
    const tenants = await db.tenant.findMany({
      where: {
        active: true,
        isSuspended: false,
      },
      select: {
        id: true,
        name: true,
      },
    });

    console.log(`>>> [AUTONOMOUS-CRON] Starting daily practice sweep across ${tenants.length} active tenants...`);

    const summaries: TenantSweepSummary[] = [];

    for (const t of tenants) {
      try {
        const tenantSummary = await executeAutonomousDailySweepForTenant(t.id);
        summaries.push(tenantSummary);
      } catch (tenantErr: any) {
        console.error(`[AUTONOMOUS-CRON-FAIL] Error sweeping tenant ${t.name} (${t.id}):`, tenantErr);
        summaries.push({
          tenantId: t.id,
          tenantName: t.name,
          invoicesOverdueProcessed: 0,
          whatsappSent: 0,
          emailsSent: 0,
          voiceCallsDispatched: 0,
          voiceSentiments: {},
          gstRemindersSent: 0,
          documentsScanned: 0,
          msmeRisksFlagged: 0,
          tasksCreated: 0,
          morningBriefingSent: false,
          partnerEmail: null,
          error: tenantErr.message || String(tenantErr),
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tenantsProcessed: tenants.length,
      summaries,
    });
  } catch (error: any) {
    console.error("[AUTONOMOUS-DAILY-CRON-FATAL]", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error during autonomous cron sweep",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleAutonomousDailyCron(req);
}

export async function POST(req: NextRequest) {
  return handleAutonomousDailyCron(req);
}