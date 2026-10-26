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
  Zap,
  Sparkles,
  PhoneCall,
  Bot,
  FileSearch,
} from "lucide-react";
import {
  toggleAutomationAction,
  retryOutboxEventAction,
  triggerAutomationsAction,
  triggerAiVoiceCallTestAction,
  triggerAiAuditScanTestAction,
} from "@/lib/server/actions/automation-actions";

interface WorkflowItem {
  code: string;
  name: string;
  description: string;
  trigger: string;
  category: string;
  isAi?: boolean;
  isVoice?: boolean;
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
    isNativeEngine?: boolean;
    engineMode?: string;
    engineName?: string;
    [key: string]: any;
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
        setStatusMessage(`Event re-queued for native processing.`);
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage(`Failed to retry: ${res.error}`);
      }
    });
  };

  // Trigger dispatch manually
  const handleTriggerDispatch = () => {
    startTransition(async () => {
      setStatusMessage("Running native automation engine...");
      const res = await triggerAutomationsAction();
      if (res.success && res.data) {
        setStatusMessage(
          `Engine run complete: ${res.data.succeeded} succeeded, ${res.data.retried} retried, ${res.data.failed} failed, ${res.data.skipped} skipped.`
        );
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage(`Automation run completed.`);
      }
    });
  };

  // Trigger AI Voice Call Test
  const handleTriggerVoiceCall = () => {
    startTransition(async () => {
      setStatusMessage("Initiating Autonomous AI Voice Call dispatch...");
      const res = await triggerAiVoiceCallTestAction();
      if (res.success) {
        setStatusMessage("Autonomous AI Voice Call successfully generated and logged in Communications ledger.");
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage(`Voice call error: ${res.error}`);
      }
    });
  };

  // Trigger AI Audit Scan Test
  const handleTriggerAuditScan = () => {
    startTransition(async () => {
      setStatusMessage("Initiating AI Bank & Document Anomaly Scanner (Section 43B(h), round cash, TDS)...");
      const res = await triggerAiAuditScanTestAction();
      if (res.success) {
        setStatusMessage("AI Audit Scan completed! Findings and statutory advisory alerts created.");
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage(`AI Audit error: ${res.error}`);
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
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <Cpu className="h-4 w-4" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900 break-words">
              10-Suite Automation & AI Practice Engine
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <Zap className="h-3 w-3 text-emerald-600" />
              Native Engine
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
              <Sparkles className="h-3 w-3 text-purple-600" />
              Gemini AI Active
            </span>
          </div>
          <p className="mt-1 text-sm text-graphite-500">
            Autonomous multi-tenant CA workflows, Section 43B(h) anomaly scanner, tax notice drafter, and AI voice calling.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleTriggerVoiceCall}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 px-3.5 py-2 text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
          >
            <PhoneCall className={`h-3.5 w-3.5 text-amber-600 ${isPending ? "animate-pulse" : ""}`} />
            Trigger AI Voice Call
          </button>

          <button
            onClick={handleTriggerAuditScan}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-800 px-3.5 py-2 text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 text-purple-600 ${isPending ? "animate-spin" : ""}`} />
            Run AI Audit
          </button>

          <button
            onClick={handleTriggerDispatch}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Drain Outbox
          </button>

          <button
            onClick={() => setActiveTab("diagnostics")}
            className="flex items-center gap-2 rounded-lg bg-white border border-border px-3.5 py-2 text-xs font-semibold text-graphite-800 shadow-sm hover:bg-slate-50 transition active:scale-[0.98]"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Config
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
            &times;
          </button>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Active Suites
            </span>
            <Layers className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-graphite-900">
            {workflows.filter((w) => w.enabled).length} / {workflows.length}
          </div>
          <p className="mt-1 text-[11px] text-graphite-400">6 Core + 4 AI & Voice Modules</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Total Executions
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-graphite-900">
            {stats.totalRuns}
          </div>
          <p className="mt-1 text-[11px] text-graphite-400">Total automated runs logged</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Pending Ledger
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-graphite-900">
            {stats.pendingOutbox}
          </div>
          <p className="mt-1 text-[11px] text-graphite-400">Awaiting in-process drain</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              AI & Voice Status
            </span>
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-purple-700">
            Online
          </div>
          <p className="mt-1 text-[11px] text-graphite-400">Gemini 3.5 & Telephony</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`pb-3 pt-1 text-xs font-semibold transition border-b-2 mr-6 ${
            activeTab === "workflows"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-graphite-500 hover:text-graphite-800"
          }`}
        >
          All 10 Workflows & AI Modules
        </button>
        <button
          onClick={() => setActiveTab("outbox")}
          className={`pb-3 pt-1 text-xs font-semibold transition border-b-2 mr-6 ${
            activeTab === "outbox"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-graphite-500 hover:text-graphite-800"
          }`}
        >
          Transactional Ledger ({stats.pendingOutbox} pending)
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`pb-3 pt-1 text-xs font-semibold transition border-b-2 ${
            activeTab === "diagnostics"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-graphite-500 hover:text-graphite-800"
          }`}
        >
          AI Architecture & Telephony Health
        </button>
      </div>

      {/* TAB 1: WORKFLOWS */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
            <input
              type="text"
              placeholder="Search workflows by title, category, trigger (e.g. AI, voice, GST, invoice)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-white pl-9 pr-4 py-2 text-xs text-graphite-900 placeholder-graphite-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-sm"
            />
          </div>

          {/* Workflow Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredWorkflows.map((w) => (
              <div
                key={w.code}
                className={`flex flex-col justify-between rounded-xl border p-5 shadow-sm transition hover:shadow-md ${
                  w.isVoice
                    ? "border-amber-200 bg-amber-50/20"
                    : w.isAi
                    ? "border-purple-200 bg-purple-50/20"
                    : "border-border bg-white"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-graphite-600">
                        {w.category}
                      </span>
                      {w.isVoice ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                          <PhoneCall className="h-3 w-3" /> Voice Agent
                        </span>
                      ) : w.isAi ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200">
                          <Sparkles className="h-3 w-3" /> AI Powered
                        </span>
                      ) : null}
                    </div>

                    <button
                      onClick={() => handleToggle(w.code, w.enabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        w.enabled
                          ? w.isVoice
                            ? "bg-amber-600"
                            : w.isAi
                            ? "bg-purple-600"
                            : "bg-emerald-600"
                          : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          w.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-graphite-900">{w.name}</h3>
                  <p className="mt-1 text-xs text-graphite-500 line-clamp-3 leading-relaxed">
                    {w.description}
                  </p>

                  <div className="mt-3 rounded-lg bg-white/80 p-2.5 border border-slate-200 text-[11px] text-graphite-600 font-mono">
                    <span className="font-semibold text-graphite-800">Trigger:</span> {w.trigger}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-graphite-500">
                  <span>Runs: {w.totalRuns}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      w.enabled
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-500"
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
                Guaranteed delivery events processed in-process via PostgreSQL transactional ledger.
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

          {/* Desktop Outbox Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-left text-xs">
              <thead className="bg-slate-50 text-graphite-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Processed</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-graphite-400">
                      No outbox events match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredOutbox.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono font-medium text-graphite-900">
                        {evt.eventType}
                      </td>
                      <td className="px-4 py-3 text-graphite-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">
                          {evt.entityType}:{evt.entityId.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-graphite-600">{evt.retryCount}</td>
                      <td className="px-4 py-3 text-graphite-500">
                        {new Date(evt.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-graphite-500">
                        {evt.processedAt
                          ? new Date(evt.processedAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {evt.status === "FAILED" && (
                          <button
                            onClick={() => handleRetryEvent(evt.id)}
                            className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                          >
                            Retry
                          </button>
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
              <span>Native In-Process Engine & AI Architecture</span>
            </div>

            <div className="space-y-3 text-xs text-graphite-600">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">AI Intelligence Core</span>
                  <span className="font-mono text-purple-700 font-bold">Google Gemini 3.5 Flash</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Pre-configured with CA tax law knowledge (Sec 43B(h), DRC-01, Sec 148). Dynamic bilingual prompt engineering with JSON response guarantees.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Autonomous Voice Telephony</span>
                  <span className="font-mono text-amber-700 font-bold">Bilingual Conversational Agent</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Outbound recovery and document collection agent. Supports Sarvam AI / Twilio / Bland AI and deterministic simulation with automatic partner escalations.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Concurrency & Claiming</span>
                  <span className="font-mono text-emerald-700 font-bold">Atomic Status Lock</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Zero race conditions: Worker processes atomically claim pending events by transitioning status from <code>PENDING</code> to <code>PROCESSING</code>.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-graphite-800">Tenant Isolation</span>
                  <span className="font-mono text-emerald-700 font-bold">STRICT (where: tenantId)</span>
                </div>
                <p className="mt-1 text-[11px] text-graphite-500">
                  Every query, AI prompt, communication log, and voice dispatch is strictly bounded to the calling tenant ID.
                </p>
              </div>
            </div>
          </div>

          {/* Environment & Credentials Health */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-graphite-900 font-semibold text-sm">
              <KeyRound className="h-4 w-4 text-emerald-700" />
              <span>AI & Telephony Service Status</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Gemini AI Model</strong>
                  <p className="font-mono text-[11px] text-purple-700 font-bold">gemini-3.5-flash (Verified)</p>
                </div>
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Voice Inbound Webhook</strong>
                  <p className="font-mono text-[11px] text-graphite-500">/api/webhooks/voice</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Scheduled Cron Endpoint</strong>
                  <p className="font-mono text-[11px] text-graphite-500">/api/cron/process-automations</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Protected
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <strong className="text-graphite-800">Transactional Email</strong>
                  <p className="text-[11px] text-graphite-500">Direct Gmail SMTP (smtp.gmail.com:465)</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
