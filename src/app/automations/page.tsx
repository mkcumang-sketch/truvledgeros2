import React from "react";
import { requireTenant } from "@/lib/auth/session";
import {
  getTenantAutomationsAction,
  getTenantOutboxEventsAction,
} from "@/lib/server/actions/automation-actions";
import { AutomationsClient } from "./AutomationsClient";
import { serializeForClient } from "@/lib/serialization";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "10-Suite Automations & AI Practice Engine — TRUV LedgerOS",
  description: "Enterprise workflow automation, Section 43B(h) audit scanner, tax notice drafter, and AI voice calling.",
};

export default async function AutomationsPage() {
  await requireTenant();

  const [automationsRes, outboxRes] = await Promise.all([
    getTenantAutomationsAction(),
    getTenantOutboxEventsAction({ limit: 50 }),
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

  return (
    <div className="flex-1 w-full max-w-full min-w-0 overflow-x-hidden">
      <AutomationsClient
        initialWorkflows={serializeForClient(workflows) as any}
        initialOutboxEvents={serializeForClient(outboxEvents) as any}
        stats={serializeForClient(stats)}
      />
    </div>
  );
}
