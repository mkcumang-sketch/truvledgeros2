import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/server/automation/webhook-signer";
import {
  classifyCredentialFormat,
  decryptRecoverableSecret,
} from "@/lib/server/security/credential-vault";
import { z } from "zod";
import { TaskType, TaskStatus, Role } from "@prisma/client";

// Zod schema for incoming n8n webhook commands
const InboundWebhookSchema = z.object({
  action: z.enum([
    "CREATE_ONBOARDING_TASKS",
    "SEND_COMPLIANCE_REMINDER",
    "SEND_DOCUMENT_REMINDER",
    "NOTIFY_TASK_ASSIGNEE",
    "SEND_INVOICE_REMINDER",
    "RECORD_FAILURE_ALERT",
  ]),
  tenantId: z.string().min(1, "tenantId is required"),
  correlationId: z.string().optional(),
  idempotencyKey: z.string().min(8, "idempotencyKey is required"),
  payload: z.record(z.any()),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-truv-signature");
    const timestampHeader = req.headers.get("x-truv-timestamp");

    // Resolve tenant secret if configured, otherwise fall back to system secret
    let tenantIdHint: string | undefined = req.headers.get("x-truv-tenant-id")?.trim() || undefined;
    try {
      const preParsed = JSON.parse(rawBody);
      if (preParsed?.tenantId && typeof preParsed.tenantId === "string") {
        tenantIdHint = preParsed.tenantId.trim();
      }
    } catch {
      // Body not yet parsed as JSON
    }

    let secretToUse = process.env.N8N_WEBHOOK_SECRET?.trim();
    if (tenantIdHint) {
      const tenantIntegration = await db.integration.findFirst({
        where: {
          tenantId: tenantIdHint,
          provider: { in: ["N8N_M2M", "WEBHOOK"] },
        },
        select: {
          id: true,
          provider: true,
          encryptedCredentials: true,
          iv: true,
          authTag: true,
          status: true,
        },
      });

      if (tenantIntegration) {
        if (tenantIntegration.status !== "ACTIVE") {
          return NextResponse.json(
            { error: "Unauthorized: Tenant webhook credential is revoked or disabled" },
            { status: 403 }
          );
        }

        const format = classifyCredentialFormat(tenantIntegration);
        if (format === "V1_ENCRYPTED") {
          try {
            secretToUse = decryptRecoverableSecret({
              encryptedCredentials: tenantIntegration.encryptedCredentials!,
              iv: tenantIntegration.iv!,
              authTag: tenantIntegration.authTag!,
              tenantId: tenantIdHint,
              provider: tenantIntegration.provider,
              integrationId: tenantIntegration.id,
            });
          } catch {
            return NextResponse.json(
              { error: "Unauthorized: Failed to decrypt tenant webhook credential" },
              { status: 401 }
            );
          }
        } else if (format === "LEGACY_PLAINTEXT") {
          if (tenantIntegration.encryptedCredentials?.trim()) {
            secretToUse = tenantIntegration.encryptedCredentials.trim();
          }
        } else {
          return NextResponse.json(
            { error: "Unauthorized: Invalid or malformed tenant webhook credential" },
            { status: 401 }
          );
        }
      }
    }

    if (!secretToUse) {
      return NextResponse.json(
        { error: "Unauthorized: Webhook authentication secret is not configured" },
        { status: 401 }
      );
    }

    // 1. Authenticate Request via HMAC-SHA256 & Timestamp Freshness
    const authResult = verifyWebhookSignature({
      payloadString: rawBody,
      signatureHeader,
      timestampHeader,
      secret: secretToUse,
      toleranceMs: 5 * 60 * 1000, // 5 min replay window
    });

    if (!authResult.valid) {
      return NextResponse.json(
        { error: "Unauthorized webhook request", details: authResult.error },
        { status: 401 }
      );
    }

    // 2. Parse & Validate Schema
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const validated = InboundWebhookSchema.safeParse(parsedBody);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid payload schema", issues: validated.error.format() },
        { status: 422 }
      );
    }

    const { action, tenantId, idempotencyKey, payload, correlationId } = validated.data;

    // 3. Verify Tenant Isolation
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, docReminderLimit: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Target tenant not found or inaccessible" },
        { status: 404 }
      );
    }

    // 4. Idempotency Check via AutomationRun summary or AuditLog
    const existingExecution = await db.auditLog.findFirst({
      where: {
        tenantId,
        action: `WEBHOOK_ACTION_${action}`,
        entityId: idempotencyKey,
      },
    });

    if (existingExecution) {
      return NextResponse.json({
        success: true,
        idempotentReplay: true,
        message: `Action ${action} already processed for idempotency key ${idempotencyKey}`,
        correlationId,
      });
    }

    // 5. Execute Action within strict business and security boundaries
    let actionResult: any = null;

    switch (action) {
      // ----------------------------------------------------------------------
      // Workflow A: Client Onboarding Task Generator
      // ----------------------------------------------------------------------
      case "CREATE_ONBOARDING_TASKS": {
        const clientId = payload.clientId;
        if (!clientId) {
          return NextResponse.json({ error: "clientId is required for onboarding tasks" }, { status: 400 });
        }

        const client = await db.client.findFirst({
          where: { id: clientId, tenantId },
          select: { id: true, name: true },
        });

        if (!client) {
          return NextResponse.json({ error: "Client not found in tenant" }, { status: 404 });
        }

        // Standard 3-step CA onboarding checklist
        const standardTasks = [
          {
            title: `Client Master & KYC Verification — ${client.name}`,
            detail: "Verify PAN, GSTIN certificate, Certificate of Incorporation, and authorized signatories.",
            priority: "HIGH",
            type: TaskType.GENERAL,
          },
          {
            title: `Statutory Portal Credential Audit — ${client.name}`,
            detail: "Securely document GST, Income Tax, and MCA portal credentials in encrypted vault.",
            priority: "NORMAL",
            type: TaskType.GENERAL,
          },
          {
            title: `Prior Financial Period Handover — ${client.name}`,
            detail: "Collect trial balance, filed GSTR-9/3B returns, and previous auditor working papers.",
            priority: "NORMAL",
            type: TaskType.DOCUMENT_CALL,
          },
        ];

        const createdTasks = [];
        for (const t of standardTasks) {
          // Prevent duplicates
          const existing = await db.task.findFirst({
            where: { tenantId, clientId: client.id, title: t.title },
          });

          if (!existing) {
            const created = await db.task.create({
              data: {
                tenantId,
                clientId: client.id,
                title: t.title,
                detail: t.detail,
                priority: t.priority,
                type: t.type,
                status: TaskStatus.OPEN,
              },
            });
            createdTasks.push(created.id);
          }
        }

        actionResult = { createdTaskCount: createdTasks.length, taskIds: createdTasks };
        break;
      }

      // ----------------------------------------------------------------------
      // Workflow B: GST & Compliance Reminders
      // ----------------------------------------------------------------------
      case "SEND_COMPLIANCE_REMINDER": {
        const returnId = payload.returnId;
        const gstReturn = await db.gstReturn.findFirst({
          where: { id: returnId, tenantId },
          include: { client: { select: { id: true, name: true, email: true, phone: true } } },
        });

        if (!gstReturn) {
          return NextResponse.json({ error: "GST Return not found" }, { status: 404 });
        }

        // Statutory rule: Reminder NEVER marks return as FILED
        await db.notification.create({
          data: {
            tenantId,
            title: `GST Return Reminder: ${gstReturn.returnType} (${gstReturn.period})`,
            message: `Compliance reminder queued for ${gstReturn.client.name}. Due on ${gstReturn.dueDate.toISOString().slice(0, 10)}.`,
            linkUrl: `/gst`,
          },
        });

        actionResult = { returnId, reminderDispatched: true, status: gstReturn.status };
        break;
      }

      // ----------------------------------------------------------------------
      // Workflow C: Document Collection & Escalation
      // ----------------------------------------------------------------------
      case "SEND_DOCUMENT_REMINDER": {
        const requestId = payload.requestId;
        const docRequest = await db.documentRequest.findFirst({
          where: { id: requestId, tenantId },
          include: { client: { select: { id: true, name: true } } },
        });

        if (!docRequest) {
          return NextResponse.json({ error: "Document Request not found" }, { status: 404 });
        }

        // Increment reminder count
        const updatedRequest = await db.documentRequest.update({
          where: { id: docRequest.id },
          data: {
            reminderCount: { increment: 1 },
            lastReminderAt: new Date(),
          },
        });

        const limit = tenant.docReminderLimit || 3;
        let partnerEscalated = false;

        if (updatedRequest.reminderCount >= limit) {
          partnerEscalated = true;
          // Notify partners of repeated unresponsive document request
          const partners = await db.user.findMany({
            where: {
              memberships: {
                some: { tenantId, role: { in: [Role.PARTNER, Role.FIRM_OWNER] } },
              },
            },
            select: { id: true },
          });

          for (const partner of partners) {
            await db.notification.create({
              data: {
                tenantId,
                userId: partner.id,
                title: `Escalation: Document Request Unanswered (${updatedRequest.reminderCount} reminders)`,
                message: `Client ${docRequest.client.name} has not provided '${docRequest.title}' after ${updatedRequest.reminderCount} reminder cycles.`,
                linkUrl: `/documents`,
              },
            });
          }
        }

        actionResult = {
          requestId: docRequest.id,
          reminderCount: updatedRequest.reminderCount,
          partnerEscalated,
        };
        break;
      }

      // ----------------------------------------------------------------------
      // Workflow D: Task Assignment & Approvals
      // ----------------------------------------------------------------------
      case "NOTIFY_TASK_ASSIGNEE": {
        const taskId = payload.taskId;
        const task = await db.task.findFirst({
          where: { id: taskId, tenantId },
          include: { assignedTo: { select: { id: true, name: true, email: true } } },
        });

        if (!task) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        if (task.assignedToId) {
          await db.notification.create({
            data: {
              tenantId,
              userId: task.assignedToId,
              title: `Task Assignment: ${task.title}`,
              message: `You have been assigned task '${task.title}' with priority ${task.priority}.`,
              linkUrl: `/tasks`,
            },
          });
        }

        actionResult = { taskId: task.id, notifiedUserId: task.assignedToId };
        break;
      }

      // ----------------------------------------------------------------------
      // Workflow E: Invoice & Payment Reminders
      // Strict rule: Verify authoritative remaining balance in DB before sending!
      // ----------------------------------------------------------------------
      case "SEND_INVOICE_REMINDER": {
        const invoiceId = payload.invoiceId;
        const invoice = await db.invoice.findFirst({
          where: { id: invoiceId, tenantId },
          include: {
            client: { select: { id: true, name: true, email: true } },
            payments: { select: { amount: true } },
          },
        });

        if (!invoice) {
          return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        // Authoritative balance verification
        const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const remainingBalance = Number(invoice.totalAmount) - totalPaid;

        // Strict suppression: Do NOT remind if settled, cancelled, or 0 balance
        if (remainingBalance <= 0 || invoice.status === "PAID" || invoice.status === "CANCELLED") {
          return NextResponse.json({
            success: true,
            suppressed: true,
            reason: `Reminder suppressed: Invoice ${invoice.invoiceNumber} has balance ₹${remainingBalance} and status ${invoice.status}.`,
            remainingBalance,
          });
        }

        // Log notification attempt
        await db.notification.create({
          data: {
            tenantId,
            title: `Payment Reminder: Invoice ${invoice.invoiceNumber}`,
            message: `Authoritative balance of ₹${remainingBalance.toLocaleString("en-IN")} remains due for ${invoice.client.name}.`,
            linkUrl: `/invoices/${invoice.id}`,
          },
        });

        actionResult = {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          remainingBalance,
          reminderLogged: true,
        };
        break;
      }

      // ----------------------------------------------------------------------
      // Workflow F: Automation Failure Alerts
      // ----------------------------------------------------------------------
      case "RECORD_FAILURE_ALERT": {
        const workflowName = payload.workflowName || "Unknown Automation";
        const safeSummary = (payload.errorSummary || "Automation execution encountered a terminal error.")
          .slice(0, 500); // Truncate to prevent secret bloat

        await db.notification.create({
          data: {
            tenantId,
            title: `Automation Alert: ${workflowName} Failed`,
            message: `Correlation ID: ${correlationId || "N/A"}. Diagnostic summary: ${safeSummary}`,
            linkUrl: `/automations`,
          },
        });

        actionResult = { alertRecorded: true, correlationId };
        break;
      }
    }

    // 6. Record Audit Log for Idempotency and Governance
    await db.auditLog.create({
      data: {
        tenantId,
        action: `WEBHOOK_ACTION_${action}`,
        entityType: "AUTOMATION_ACTION",
        entityId: idempotencyKey,
        newValue: {
          action,
          correlationId,
          result: actionResult,
        },
      },
    });

    return NextResponse.json({
      success: true,
      action,
      correlationId,
      result: actionResult,
    });
  } catch (err: any) {
    console.error("[INBOUND-N8N-WEBHOOK-ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error during webhook processing", message: err.message },
      { status: 500 }
    );
  }
}
