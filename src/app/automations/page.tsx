import React from "react";
import { requireTenant } from "@/lib/auth/session";
import {
  getTenantAutomationsAction,
  getTenantOutboxEventsAction,
} from "@/lib/server/actions/automation-actions";
import { AutomationsClient } from "./AutomationsClient";

export const metadata = {
  title: "5-Suite Automations & n8n Engine — TRUV LedgerOS",
  description: "Enterprise workflow automation, transactional outbox ledger, and compliance scheduling.",
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
        n8nConfigured: false,
        webhookBaseUrl: "Standby",
      };

  const outboxEvents = outboxRes.success && outboxRes.data ? outboxRes.data : [];

  return (
    <AutomationsClient
      initialWorkflows={workflows as any}
      initialOutboxEvents={outboxEvents as any}
      stats={stats}
    />
  );
}