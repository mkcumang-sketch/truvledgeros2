import React from "react";
import { requireTenant } from "@/lib/auth/session";
import {
  getTenantAutomationsAction,
  getTenantOutboxEventsAction,
} from "@/lib/server/actions/automation-actions";
import {
  getWorkflowTelemetryStatsAction,
  getLiveOutboxFeedAction,
} from "@/lib/server/actions/automation-command-actions";
import { AutomationsClient } from "./AutomationsClient";
import { serializeForClient } from "@/lib/serialization";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Omnichannel Practice Dispatch Command Center — TRUV LedgerOS",
  description: "Live PostgreSQL metrics, real-time telemetry, Sarvam AI outbound voice calling, and calendar-aligned automated triggers.",
};

export default async function AutomationsPage() {
  await requireTenant();

  const [automationsRes, outboxRes, telemetryRes, liveFeedRes] = await Promise.all([
    getTenantAutomationsAction(),
    getTenantOutboxEventsAction({ limit: 50 }),
    getWorkflowTelemetryStatsAction(),
    getLiveOutboxFeedAction({ limit: 50 }),
  ]);

  const workflows = automationsRes.success && automationsRes.data ? automationsRes.data.workflows : [];
  const stats = automationsRes.success && automationsRes.data
    ? automationsRes.data.stats
    : {
        totalRuns: 0,
        pendingOutbox: 0,
        processedOutbox: 0,
        failedOutbox: 0,
        isNativeEngine: true,
        engineMode: "NATIVE_IN_PROCESS",
        engineName: "Native In-Process Node.js / PostgreSQL",
      };

  const outboxEvents = outboxRes.success && outboxRes.data ? outboxRes.data : [];
  const initialTelemetry = telemetryRes.success && telemetryRes.data ? telemetryRes.data : null;
  const initialOutboxFeed = liveFeedRes.success && liveFeedRes.data ? liveFeedRes.data : [];

  return (
    <div className="flex-1 w-full max-w-full min-w-0 overflow-x-hidden">
      <AutomationsClient
        initialWorkflows={serializeForClient(workflows) as any}
        initialOutboxEvents={serializeForClient(outboxEvents) as any}
        initialTelemetry={serializeForClient(initialTelemetry) as any}
        initialOutboxFeed={serializeForClient(initialOutboxFeed) as any}
        stats={serializeForClient(stats)}
      />
    </div>
  );
}
