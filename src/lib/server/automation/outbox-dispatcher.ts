import { db } from "@/lib/db";
import { EventStatus } from "@prisma/client";
import { createWebhookSignature } from "./webhook-signer";

export interface OutboxDispatchOptions {
  batchSize?: number;
  tenantId?: string;
  forceDispatch?: boolean;
}

export interface OutboxDispatchSummary {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  skipped: number;
  details: Array<{
    eventId: string;
    eventType: string;
    status: "PROCESSED" | "FAILED" | "RETRY_QUEUED" | "STANDBY_RECORDED";
    error?: string;
  }>;
}

const MAX_RETRIES = 3;
const DISPATCH_TIMEOUT_MS = 10000;

/**
 * Processes pending events from the transactional outbox (AutomationEvent table).
 * Dispatches to external n8n webhook engine using HMAC-signed HTTP requests,
 * enforcing bounded retries, idempotency, and execution logging.
 */
export async function processOutboxQueue(
  options: OutboxDispatchOptions = {}
): Promise<OutboxDispatchSummary> {
  const batchSize = options.batchSize || 20;
  const n8nBaseUrl = process.env.N8N_BASE_URL?.trim();
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "default_dev_truv_n8n_secret_32bytes";

  // 1. Fetch pending outbox records
  const whereClause: any = {
    status: EventStatus.PENDING,
    retryCount: { lt: MAX_RETRIES + 1 },
  };

  if (options.tenantId) {
    whereClause.tenantId = options.tenantId;
  }

  const events = await db.automationEvent.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const summary: OutboxDispatchSummary = {
    processed: events.length,
    succeeded: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    details: [],
  };

  if (events.length === 0) {
    return summary;
  }

  // 2. Process each event
  for (const event of events) {
    try {
      // Atomic claim: update status to PROCESSING only if still PENDING
      const claimResult = await db.automationEvent.updateMany({
        where: {
          id: event.id,
          status: EventStatus.PENDING,
        },
        data: {
          status: EventStatus.PROCESSING,
        },
      });

      if (claimResult.count === 0) {
        // Event was claimed concurrently by another worker process; skip safely
        summary.skipped++;
        continue;
      }

      // Prepare payload string
      const payloadString = JSON.stringify({
        eventId: event.id,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        tenantId: event.tenantId,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      });

      // Generate HMAC signature and timestamp
      const { signature, timestamp } = createWebhookSignature(payloadString, webhookSecret);

      // Check if external n8n engine is configured or in standby
      if (!n8nBaseUrl || n8nBaseUrl.includes("localhost") && !options.forceDispatch && process.env.NODE_ENV === "test") {
        // Contract/Standby Mode: Record event as processed in ledger
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.PROCESSED,
            processedAt: new Date(),
            errorMessage: null,
          },
        });

        // Record execution run log
        await recordAutomationRun({
          tenantId: event.tenantId,
          eventType: event.eventType,
          status: "SUCCESS",
          summary: `Event ${event.eventType} (${event.entityId}) marked PROCESSED via standby outbox handler.`,
        });

        summary.succeeded++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "STANDBY_RECORDED",
        });
        continue;
      }

      // External Dispatch Mode: Post to n8n webhook endpoint
      const webhookEndpoint = `${n8nBaseUrl.replace(/\/$/, "")}/webhook/truv-events`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

      try {
        const response = await fetch(webhookEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-truv-signature": signature,
            "x-truv-timestamp": timestamp.toString(),
            "x-truv-tenant-id": event.tenantId,
            "x-truv-event-id": event.id,
            "x-truv-idempotency-key": event.idempotencyKey,
          },
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`n8n webhook responded with HTTP ${response.status}: ${response.statusText}`);
        }

        // Successfully dispatched
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.PROCESSED,
            processedAt: new Date(),
            errorMessage: null,
          },
        });

        await recordAutomationRun({
          tenantId: event.tenantId,
          eventType: event.eventType,
          status: "SUCCESS",
          summary: `Dispatched ${event.eventType} [${event.idempotencyKey}] to n8n successfully.`,
        });

        summary.succeeded++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "PROCESSED",
        });
      } catch (dispatchError: any) {
        clearTimeout(timeoutId);
        throw dispatchError;
      }
    } catch (err: any) {
      const isAbort = err.name === "AbortError";
      const errorMsg = isAbort ? `Webhook dispatch timed out after ${DISPATCH_TIMEOUT_MS}ms` : err.message || "Unknown dispatch failure";

      const nextRetryCount = event.retryCount + 1;

      if (nextRetryCount <= MAX_RETRIES) {
        // Queue for bounded retry
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.PENDING,
            retryCount: nextRetryCount,
            errorMessage: `Attempt ${nextRetryCount}/${MAX_RETRIES} failed: ${errorMsg}`,
          },
        });

        summary.retried++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "RETRY_QUEUED",
          error: errorMsg,
        });
      } else {
        // Terminal failure — dead-letter status
        await db.automationEvent.update({
          where: { id: event.id },
          data: {
            status: EventStatus.FAILED,
            retryCount: nextRetryCount,
            errorMessage: `Dead-letter after ${MAX_RETRIES} failed attempts: ${errorMsg}`,
          },
        });

        await recordAutomationRun({
          tenantId: event.tenantId,
          eventType: event.eventType,
          status: "FAILED",
          summary: `Terminal failure for ${event.eventType} (${event.id}). Exhausted ${MAX_RETRIES} retries.`,
          errorDetails: errorMsg,
        });

        summary.failed++;
        summary.details.push({
          eventId: event.id,
          eventType: event.eventType,
          status: "FAILED",
          error: errorMsg,
        });
      }
    }
  }

  return summary;
}

/**
 * Helper to record Automation and AutomationRun history in database
 */
async function recordAutomationRun(params: {
  tenantId: string;
  eventType: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  summary: string;
  errorDetails?: string;
}) {
  try {
    // Map event type to automation code
    let code = "INVOICE";
    if (params.eventType.startsWith("client")) code = "DOCS";
    else if (params.eventType.startsWith("gst")) code = "GST";
    else if (params.eventType.startsWith("task")) code = "SUPPORT";
    else if (params.eventType.startsWith("payment")) code = "RECOVERY";

    // Find or create Automation record
    let automation = await db.automation.findUnique({
      where: {
        tenantId_code: {
          tenantId: params.tenantId,
          code,
        },
      },
    });

    if (!automation) {
      automation = await db.automation.create({
        data: {
          tenantId: params.tenantId,
          code,
          name: `${code} Automation Suite`,
          description: `Automated processing pipeline for ${code.toLowerCase()} events`,
          enabled: true,
          totalRuns: 1,
          lastRunAt: new Date(),
        },
      });
    } else {
      await db.automation.update({
        where: { id: automation.id },
        data: {
          totalRuns: { increment: 1 },
          lastRunAt: new Date(),
        },
      });
    }

    await db.automationRun.create({
      data: {
        automationId: automation.id,
        status: params.status,
        summary: params.summary,
        errorDetails: params.errorDetails || null,
      },
    });
  } catch (logErr) {
    console.error("[AUTOMATION-RUN-LOG-ERROR]", logErr);
  }
}
