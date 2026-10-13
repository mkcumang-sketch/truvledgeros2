"use server";

import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { EventStatus, Role } from "@prisma/client";
import { processOutboxQueue } from "@/lib/server/automation/outbox-dispatcher";

import { CORE_WORKFLOWS } from "@/lib/server/automation/workflow-definitions";

/**
 * Returns all configured workflows with their live run metrics, status, and execution stats.
 */
export async function getTenantAutomationsAction() {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    // Fetch existing Automation records for this tenant
    const automations = await db.automation.findMany({
      where: { tenantId },
      include: {
        runs: {
          orderBy: { triggeredAt: "desc" },
          take: 5,
        },
      },
    });

    const automationsByCode = new Map(automations.map((a) => [a.code, a]));

    // Combine canonical workflow definitions with persisted database state
    const workflows = CORE_WORKFLOWS.map((def) => {
      const persisted = automationsByCode.get(def.code);
      return {
        ...def,
        id: persisted?.id || null,
        enabled: persisted ? persisted.enabled : true,
        totalRuns: persisted?.totalRuns || 0,
        lastRunAt: persisted?.lastRunAt ? persisted.lastRunAt.toISOString() : null,
        recentRuns: persisted?.runs.map((r) => ({
          id: r.id,
          status: r.status,
          summary: r.summary,
          triggeredAt: r.triggeredAt.toISOString(),
          errorDetails: r.errorDetails,
        })) || [],
      };
    });

    // Aggregate overall execution and outbox metrics
    const outboxCounts = await db.automationEvent.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    });

    let pendingCount = 0;
    let processedCount = 0;
    let failedCount = 0;

    for (const group of outboxCounts) {
      if (group.status === EventStatus.PENDING || group.status === EventStatus.PROCESSING) {
        pendingCount += group._count.id;
      } else if (group.status === EventStatus.PROCESSED) {
        processedCount += group._count.id;
      } else if (group.status === EventStatus.FAILED) {
        failedCount += group._count.id;
      }
    }

    const totalRuns = workflows.reduce((sum, w) => sum + w.totalRuns, 0);

    return {
      success: true,
      data: {
        workflows,
        stats: {
          totalRuns,
          pendingOutbox: pendingCount,
          processedOutbox: processedCount,
          failedOutbox: failedCount,
          n8nConfigured: Boolean(process.env.N8N_BASE_URL && process.env.N8N_WEBHOOK_SECRET),
          webhookBaseUrl: process.env.N8N_BASE_URL || "Standby / Not Configured",
        },
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load automations" };
  }
}

/**
 * Toggles an automation on or off for the tenant.
 */
export async function toggleAutomationAction(code: string, enabled: boolean) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const def = CORE_WORKFLOWS.find((w) => w.code === code);
    if (!def) {
      return { success: false, error: "Invalid automation workflow code" };
    }

    const automation = await db.automation.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
      update: { enabled },
      create: {
        tenantId,
        code,
        name: def.name,
        description: def.description,
        enabled,
      },
    });

    revalidatePath("/automations");
    return { success: true, data: automation };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to toggle automation" };
  }
}

/**
 * Fetches recent outbox events for audit and diagnostic inspection.
 */
export async function getTenantOutboxEventsAction(params?: {
  status?: EventStatus;
  limit?: number;
}) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const where: any = { tenantId };
    if (params?.status) {
      where.status = params.status;
    }

    const events = await db.automationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params?.limit || 20,
    });

    return {
      success: true,
      data: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        entityType: e.entityType,
        entityId: e.entityId,
        status: e.status,
        retryCount: e.retryCount,
        idempotencyKey: e.idempotencyKey,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
        processedAt: e.processedAt ? e.processedAt.toISOString() : null,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load outbox events" };
  }
}

/**
 * Retries a failed or dead-letter outbox event.
 */
export async function retryOutboxEventAction(eventId: string) {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const event = await db.automationEvent.findFirst({
      where: { id: eventId, tenantId },
    });

    if (!event) {
      return { success: false, error: "Event not found" };
    }

    // Reset to PENDING with cleared error message and reset retries
    const updated = await db.automationEvent.update({
      where: { id: event.id },
      data: {
        status: EventStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
      },
    });

    revalidatePath("/automations");
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to retry outbox event" };
  }
}

/**
 * Manually triggers the outbox processor for pending events.
 */
export async function triggerOutboxDispatchAction() {
  try {
    const session = await requireTenant();
    const tenantId = session.membership.tenantId;

    const summary = await processOutboxQueue({
      tenantId,
      forceDispatch: true,
      batchSize: 25,
    });

    revalidatePath("/automations");
    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to trigger dispatch" };
  }
}
