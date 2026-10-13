"use client";

import React, { useState, useTransition } from "react";
import {
  Cpu,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Search,
  Filter,
  Check,
  FileCode,
  Info,
  Server,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import {
  toggleAutomationAction,
  retryOutboxEventAction,
  triggerOutboxDispatchAction,
} from "@/lib/server/actions/automation-actions";

interface WorkflowItem {
  code: string;
  name: string;
  description: string;
  trigger: string;
  category: string;
  id: string | null;
  enabled: boolean;
  totalRuns: number;
  lastRunAt: string | null;
  recentRuns: Array<{
    id: string;
    status: string;
    summary: string | null;
    triggeredAt: string;
    errorDetails: string | null;
  }>;
}

interface OutboxEventItem {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  status: string;
  retryCount: number;
  idempotencyKey: string;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

interface AutomationsClientProps {
  initialWorkflows: WorkflowItem[];
  initialOutboxEvents: OutboxEventItem[];
  stats: {
    totalRuns: number;
    pendingOutbox: number;
    processedOutbox: number;
    failedOutbox: number;
    n8nConfigured: boolean;
    webhookBaseUrl: string;
  };
}

export function AutomationsClient({
  initialWorkflows,
  initialOutboxEvents,
  stats: initialStats,
}: AutomationsClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [outboxEvents, setOutboxEvents] = useState<OutboxEventItem[]>(initialOutboxEvents);
  const [stats, setStats] = useState(initialStats);
  const [activeTab, setActiveTab] = useState<"workflows" | "outbox" | "diagnostics">("workflows");
  const [searchTerm, setSearchTerm] = useState("");
  const [outboxFilter, setOutboxFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Toggle automation enabled/disabled
  const handleToggle = (code: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setWorkflows((prev) =>
      prev.map((w) => (w.code === code ? { ...w, enabled: nextEnabled } : w))
    );

    startTransition(async () => {
      const res = await toggleAutomationAction(code, nextEnabled);
      if (!res.success) {
        // Rollback
        setWorkflows((prev) =>
          prev.map((w) => (w.code === code ? { ...w, enabled: currentEnabled } : w))
        );
        setStatusMessage(`Error: ${res.error}`);
      } else {
        setStatusMessage(`Workflow ${code} updated to ${nextEnabled ? "Active" : "Paused"}.`);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    });
  };

  // Retry outbox event
  const handleRetryEvent = (eventId: string) => {
    startTransition(async () => {
      const res = await retryOutboxEventAction(eventId);
      if (res.success) {
        setOutboxEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, status: "PENDING", retryCount: 0, errorMessage: null }
              : e
          )
        );
        setStatusMessage(`Event re-queued for outbox dispatch.`);
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage(`Failed to retry: ${res.error}`);
      }
    });
  };

  // Trigger dispatch manually
  const handleTriggerDispatch = () => {
    startTransition(async () => {
      setStatusMessage("Dispatching pending outbox queue...");
      const res = await triggerOutboxDispatchAction();
      if (res.success && res.data) {
        setStatusMessage(
          `Outbox run complete: ${res.data.succeeded} processed, ${res.data.retried} retried, ${res.data.failed} failed.`
        );
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage(`Dispatch completed.`);
      }
    });
  };

  const filteredWorkflows = workflows.filter(
    (w) =>
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.trigger.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOutbox = outboxEvents.filter((e) => {
    if (outboxFilter === "pending") return e.status === "PENDING" || e.status === "PROCESSING";
    if (outboxFilter === "processed") return e.status === "PROCESSED";
    if (outboxFilter === "failed") return e.status === "FAILED";
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <Cpu className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-graphite-900">
              5-Suite Automation Hub
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              n8n Powered
            </span>
          </div>
          <p className="mt-1 text-sm text-graphite-500">
            Tenant-scoped workflow orchestration, transactional outbox ledger, and statutory reminder automation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTriggerDispatch}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-white border border-border px-3.5 py-2 text-xs font-semibold text-graphite-800 shadow-sm hover:bg-slate-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 text-emerald-600 ${isPending ? "animate-spin" : ""}`} />
            Dispatch Outbox
          </button>
          <button
            onClick={() => setActiveTab("diagnostics")}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 transition active:scale-[0.98]"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Security & Config
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {statusMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-medium text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-emerald-700" />
            <span>{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-graphite-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Workflows</span>
            <Layers className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-graphite-900">
            {workflows.filter((w) => w.enabled).length} / {workflows.length}
          </p>
          <span className="text-xs text-emerald-600 font-medium">All canonical pipelines active</span>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-graphite-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Dispatches</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-graphite-900">
            {stats.processedOutbox + stats.totalRuns}
          </p>
          <span className="text-xs text-graphite-400">Transactional outbox verified</span>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-graphite-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Outbox</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-700">
            {stats.pendingOutbox}
          </p>
          <span className="text-xs text-graphite-400">Awaiting worker pickup</span>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-graphite-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Failed / Dead-Letter</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-rose-700">
            {stats.failedOutbox}
          </p>
          <span className="text-xs text-graphite-400">Bounded retry exhausted</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition ${
            activeTab === "workflows"
              ? "bg-graphite-900 text-white"
              : "text-graphite-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Configured Workflows ({workflows.length})
        </button>
        <button
          onClick={() => setActiveTab("outbox")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition ${
            activeTab === "outbox"
              ? "bg-graphite-900 text-white"
              : "text-graphite-600 hover:bg-slate-100"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Outbox Delivery Ledger ({outboxEvents.length})
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition ${
            activeTab === "diagnostics"
              ? "bg-graphite-900 text-white"
              : "text-graphite-600 hover:bg-slate-100"
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          Integration Architecture
        </button>
      </div>

      {/* TAB 1: WORKFLOWS */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
            <input
              type="text"
              placeholder="Filter workflows by name, category, or trigger..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border py-2 pl-9 pr-4 text-xs text-graphite-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filteredWorkflows.map((w) => (
              <div
                key={w.code}
                className="flex flex-col justify-between rounded-xl border border-border bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-graphite-700 uppercase">
                          {w.category}
                        </span>
                        <span className="text-xs font-mono text-graphite-400">[{w.code}]</span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-graphite-900">{w.name}</h3>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggle(w.code, w.enabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        w.enabled ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                      role="switch"
                      aria-checked={w.enabled}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          w.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-graphite-600 line-clamp-2">{w.description}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-graphite-500">
                    <span className="font-semibold text-graphite-700">Trigger:</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-graphite-800 font-mono text-[10px]">
                      {w.trigger}
                    </code>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-graphite-500">
                  <div className="flex items-center gap-3">
                    <span>
                      Runs: <strong className="text-graphite-800">{w.totalRuns}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Last:{" "}
                      <strong className="text-graphite-800">
                        {w.lastRunAt ? new Date(w.lastRunAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Standby"}
                      </strong>
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      w.enabled
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {w.enabled ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: OUTBOX LEDGER */}
      {activeTab === "outbox" && (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-graphite-900">
                Transactional Outbox Ledger
              </h3>
              <p className="text-xs text-graphite-500">
                Guaranteed delivery events queued for n8n processing with bounded retries.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {["all", "pending", "processed", "failed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setOutboxFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase transition ${
                    outboxFilter === f
                      ? "bg-graphite-900 text-white"
                      : "bg-slate-50 text-graphite-600 hover:bg-slate-100"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-graphite-600">
              <thead className="bg-slate-50/75 uppercase text-graphite-500 text-[10px]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Event Type</th>
                  <th className="px-5 py-3 font-semibold">Entity</th>
                  <th className="px-5 py-3 font-semibold">Idempotency Key</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Retries</th>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-graphite-400">
                      No outbox events match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredOutbox.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono font-medium text-graphite-900">
                        {evt.eventType}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-graphite-700">
                          {evt.entityType}:{evt.entityId.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[10px] text-graphite-500">
                        {evt.idempotencyKey.slice(0, 18)}...
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            evt.status === "PROCESSED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : evt.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : evt.status === "PROCESSING"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-graphite-600 font-mono">
                        {evt.retryCount} / 3
                      </td>
                      <td className="px-5 py-3 text-graphite-500">
                        {new Date(evt.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {evt.status === "FAILED" ? (
                          <button
                            onClick={() => handleRetryEvent(evt.id)}
                            className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                          >
                            Retry
                          </button>
                        ) : (
                          <span className="text-[10px] text-graphite-400">Immutable</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DIAGNOSTICS & ARCHITECTURE */}
      {activeTab === "diagnostics" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Architecture Spec */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-graphite-900 font-semibold text-sm">
              <Server className="h-4 w-4 text-emerald-700" />
              <span>n8n Integration Security Protocol</span>
            </div>

            <div className="space-y-3 text-xs text-graphite-600">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Signing Engine</span>
                  <span className="font-mono text-emerald-700 font-bold">HMAC-SHA256</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Headers include <code>x-truv-signature</code> and <code>x-truv-timestamp</code>. Verified in constant time via <code>crypto.timingSafeEqual</code>.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Replay Attack Window</span>
                  <span className="font-mono text-emerald-700 font-bold">300 Seconds (5 min)</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Requests with timestamps outside the 5-minute tolerance are rejected immediately.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Transactional Outbox</span>
                  <span className="font-mono text-emerald-700 font-bold">PostgreSQL AutomationEvent</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Domain events are committed in the same database transaction as business records, ensuring zero data loss during network partitions.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Database Direct Exposure</span>
                  <span className="font-mono text-emerald-700 font-bold">STRICTLY PROHIBITED (Zero)</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  n8n never receives production database credentials. All communication is routed through authenticated LedgerOS endpoints.
                </p>
              </div>
            </div>
          </div>

          {/* Environment & Credentials Health */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-graphite-900 font-semibold text-sm">
              <KeyRound className="h-4 w-4 text-emerald-700" />
              <span>Integration Environment Health</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Target n8n Base URL</strong>
                  <p className="font-mono text-[11px] text-graphite-500">{stats.webhookBaseUrl}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-graphite-700">
                  Configured
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Webhook Secret (HMAC)</strong>
                  <p className="text-[11px] text-graphite-500">Shared cryptographic secret for signing</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Vault Ready
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Inbound Callback API</strong>
                  <p className="font-mono text-[11px] text-graphite-500">/api/webhooks/n8n</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Multi-Channel Providers</strong>
                  <p className="text-[11px] text-graphite-500">WhatsApp / Voice / Email Gateways</p>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                  Configurable in Settings
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
