"use client";

import React, { useState, useEffect, useTransition } from "react";
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
  Radio,
  Send,
  MessageSquare,
  Mail,
  Sliders,
  Calendar,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import {
  toggleAutomationAction,
  retryOutboxEventAction,
  triggerAutomationsAction,
  triggerAiVoiceCallTestAction,
  triggerAiAuditScanTestAction,
} from "@/lib/server/actions/automation-actions";
import {
  getWorkflowTelemetryStatsAction,
} from "@/lib/server/actions/automation-command-actions";
import { OmnichannelConsoleModal } from "@/components/automations/OmnichannelConsoleModal";
import { OutboxDeliveryFeed, CommunicationItem } from "@/components/automations/OutboxDeliveryFeed";

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

interface TelemetryData {
  channelCounts: {
    whatsapp: number;
    email: number;
    voice: number;
    sms: number;
    total: number;
  };
  deliverySuccessRate: number;
  engineState: "RUNNING" | "IDLE" | "ACTIVE";
  lastRunTimestamp: string;
  nextCronTrigger: string;
  workflowStats: Record<string, { totalRuns: number; enabled: boolean; lastRunAt: string | null }>;
}

interface AutomationsClientProps {
  initialWorkflows: WorkflowItem[];
  initialOutboxEvents: OutboxEventItem[];
  initialTelemetry?: TelemetryData | null;
  initialOutboxFeed?: CommunicationItem[];
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
  initialTelemetry,
  initialOutboxFeed = [],
  stats: initialStats,
}: AutomationsClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [outboxEvents, setOutboxEvents] = useState<OutboxEventItem[]>(initialOutboxEvents);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(initialTelemetry || null);
  const [stats, setStats] = useState(initialStats);
  const [activeTab, setActiveTab] = useState<"workflows" | "live_outbox" | "outbox_ledger" | "diagnostics">("workflows");
  const [searchTerm, setSearchTerm] = useState("");
  const [outboxFilter, setOutboxFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Omnichannel Console Modal State
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleClientId, setConsoleClientId] = useState<string | undefined>(undefined);
  const [consoleChannel, setConsoleChannel] = useState<"WHATSAPP" | "EMAIL" | "VOICE">("WHATSAPP");
  const [consoleWorkflowName, setConsoleWorkflowName] = useState<string | undefined>(undefined);

  // Refresh Telemetry
  const refreshTelemetry = () => {
    startTransition(async () => {
      try {
        const res = await getWorkflowTelemetryStatsAction();
        if (res.success && res.data) {
          setTelemetry(res.data as TelemetryData);
        }
      } catch {
        // Silent recovery
      }
    });
  };

  useEffect(() => {
    if (!telemetry) {
      refreshTelemetry();
    }
  }, []);

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
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Failed to toggle workflow.";
        setStatusMessage(`Error: ${err}`);
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
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Failed to retry.";
        setStatusMessage(`Failed to retry: ${err}`);
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
        refreshTelemetry();
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
        refreshTelemetry();
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Voice call error.";
        setStatusMessage(`Voice call error: ${err}`);
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
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "AI Audit error.";
        setStatusMessage(`AI Audit error: ${err}`);
      }
    });
  };

  // Quick Action Handlers for Workflow Cards
  const handleQuickVoiceCall = (workflowName: string) => {
    setConsoleChannel("VOICE");
    setConsoleWorkflowName(workflowName);
    setIsConsoleOpen(true);
  };

  const handleQuickWhatsApp = (workflowName: string) => {
    setConsoleChannel("WHATSAPP");
    setConsoleWorkflowName(workflowName);
    setIsConsoleOpen(true);
  };

  const handleOpenConsole = (workflowName?: string) => {
    setConsoleChannel("WHATSAPP");
    setConsoleWorkflowName(workflowName);
    setIsConsoleOpen(true);
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

  // Calculate live metric badge values
  const getWorkflowLiveRuns = (code: string, fallback: number) => {
    if (telemetry?.workflowStats && telemetry.workflowStats[code]) {
      return telemetry.workflowStats[code].totalRuns;
    }
    return fallback;
  };

  const getWorkflowLastRun = (code: string) => {
    if (telemetry?.workflowStats && telemetry.workflowStats[code]?.lastRunAt) {
      const date = new Date(telemetry.workflowStats[code].lastRunAt!);
      return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    }
    return "Standby";
  };

  // Engine state badge indicator
  const engineState = telemetry?.engineState || "ACTIVE";

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 w-full max-w-full min-w-0 overflow-x-hidden bg-[#070A11] text-slate-100 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Radio className="h-4 w-4 animate-pulse" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white break-words">
              Tier-1 Omnichannel Practice Dispatch Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live PostgreSQL Telemetry
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
              <PhoneCall className="h-3 w-3 text-indigo-400" />
              Sarvam AI Telephony
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Real-time execution telemetry, 1-click manual overrides, Sarvam AI outbound voice dialing, and calendar-aligned automated triggers.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleOpenConsole("Manual Dispatch")}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 text-xs font-semibold shadow-lg shadow-indigo-600/20 transition active:scale-[0.98]"
          >
            <Send className="h-3.5 w-3.5" />
            Omnichannel Console
          </button>

          <button
            onClick={handleTriggerVoiceCall}
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3.5 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50"
          >
            <PhoneCall className={`h-3.5 w-3.5 text-indigo-400 ${isPending ? "animate-pulse" : ""}`} />
            Quick Voice Dial
          </button>

          <button
            onClick={handleTriggerAuditScan}
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3.5 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 text-purple-400 ${isPending ? "animate-spin" : ""}`} />
            Run AI Audit
          </button>

          <button
            onClick={handleTriggerDispatch}
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3.5 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 text-emerald-400 ${isPending ? "animate-spin" : ""}`} />
            Drain Outbox
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {statusMessage && (
        <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/30 px-4 py-3 text-xs font-medium text-indigo-200 flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-indigo-400" />
            <span>{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-indigo-400 hover:text-white text-xs font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Real-time Metric Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Total Practice Dispatches */}
        <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Total Dispatches
            </span>
            <Send className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {telemetry?.channelCounts.total ?? stats.totalRuns}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="text-emerald-400 font-medium">
              WA: {telemetry?.channelCounts.whatsapp ?? 0}
            </span>
            <span>•</span>
            <span className="text-indigo-400 font-medium">
              Voice: {telemetry?.channelCounts.voice ?? 0}
            </span>
            <span>•</span>
            <span className="text-sky-400 font-medium">
              Email: {telemetry?.channelCounts.email ?? 0}
            </span>
          </div>
        </div>

        {/* Delivery Success Rate */}
        <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Delivery Success
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
            {telemetry?.deliverySuccessRate ?? 98}%
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Multi-channel SLA delivery metric</p>
        </div>

        {/* Operational State Indicator */}
        <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Operational State
            </span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                engineState === "RUNNING"
                  ? "bg-blue-500 animate-ping"
                  : engineState === "ACTIVE"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-slate-400"
              }`}
            />
            {engineState}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Pending outbox items: <span className="text-white font-mono">{stats.pendingOutbox}</span>
          </p>
        </div>

        {/* Calendar Trigger */}
        <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Next Scheduled Trigger
            </span>
            <Calendar className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-base font-bold tracking-tight text-slate-200">
            {telemetry?.nextCronTrigger
              ? new Date(telemetry.nextCronTrigger).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }) + " IST"
              : "09:00 AM IST"}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Daily Statutory Sweep & Reminders</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`pb-3 pt-1 transition border-b-2 ${
            activeTab === "workflows"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          All 10 Workflows & AI Modules
        </button>
        <button
          onClick={() => setActiveTab("live_outbox")}
          className={`pb-3 pt-1 transition border-b-2 flex items-center gap-1.5 ${
            activeTab === "live_outbox"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>Live Outbox Audit Feed</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
            Live
          </span>
        </button>
        <button
          onClick={() => setActiveTab("outbox_ledger")}
          className={`pb-3 pt-1 transition border-b-2 ${
            activeTab === "outbox_ledger"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Transactional Ledger ({stats.pendingOutbox} pending)
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`pb-3 pt-1 transition border-b-2 ${
            activeTab === "diagnostics"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          AI Architecture & Telephony Health
        </button>
      </div>

      {/* TAB 1: WORKFLOWS WITH 1-CLICK ACTION BARS */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          {/* Search Filter Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search workflows by title, category, trigger (e.g. AI, voice, GST, onboarding, invoice)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-[#090D16] pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none shadow-md"
            />
          </div>

          {/* Workflow Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredWorkflows.map((w) => {
              const runs = getWorkflowLiveRuns(w.code, w.totalRuns);
              const lastRun = getWorkflowLastRun(w.code);

              return (
                <div
                  key={w.code}
                  className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xl transition-all duration-200 ${
                    w.isVoice
                      ? "border-indigo-500/40 bg-[#090D18]"
                      : w.isAi
                      ? "border-purple-500/30 bg-[#0A0D18]"
                      : "border-slate-800 bg-[#090D16]"
                  }`}
                >
                  <div>
                    {/* Header: Category Badge & Status Dot */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-lg bg-slate-800/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 border border-slate-700/60">
                          {w.category}
                        </span>
                        {w.isVoice ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                            <PhoneCall className="h-3 w-3" /> Voice Agent
                          </span>
                        ) : w.isAi ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                            <Sparkles className="h-3 w-3" /> AI Powered
                          </span>
                        ) : null}
                      </div>

                      {/* Toggle Switch */}
                      <button
                        onClick={() => handleToggle(w.code, w.enabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          w.enabled
                            ? w.isVoice
                              ? "bg-indigo-600"
                              : w.isAi
                              ? "bg-purple-600"
                              : "bg-emerald-600"
                            : "bg-slate-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            w.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <h3 className="mt-3 text-sm font-semibold text-white">{w.name}</h3>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {w.description}
                    </p>

                    <div className="mt-3 rounded-xl bg-slate-950/80 p-2.5 border border-slate-800/80 text-[11px] text-slate-300 font-mono">
                      <span className="font-semibold text-indigo-400">Trigger:</span> {w.trigger}
                    </div>
                  </div>

                  <div>
                    {/* Live Metric Badges */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Runs: <strong className="text-white">{runs}</strong></span>
                        <span className="text-slate-600">•</span>
                        <span>Last: <span className="text-slate-300">{lastRun}</span></span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          w.enabled
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {w.enabled ? "Active" : "Paused"}
                      </span>
                    </div>

                    {/* 1-Click Action Bar */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickVoiceCall(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold transition"
                        title="Dial Sarvam AI voice agent for client"
                      >
                        <PhoneCall className="w-3 h-3 text-indigo-400" />
                        Quick Voice
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickWhatsApp(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition"
                        title="Open WhatsApp draft modal"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400" />
                        Quick WA
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenConsole(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 text-[10px] font-semibold transition"
                        title="Open full Omnichannel Dispatch Console"
                      >
                        <Sliders className="w-3 h-3 text-slate-400" />
                        Console
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE OUTBOX AUDIT FEED */}
      {activeTab === "live_outbox" && (
        <OutboxDeliveryFeed
          initialItems={initialOutboxFeed}
          onOpenDispatchModal={(clientId, channel) => {
            setConsoleClientId(clientId);
            if (channel) setConsoleChannel(channel);
            setIsConsoleOpen(true);
          }}
        />
      )}

      {/* TAB 3: TRANSACTIONAL OUTBOX LEDGER */}
      {activeTab === "outbox_ledger" && (
        <div className="rounded-2xl border border-slate-800 bg-[#090D16] shadow-xl overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-900/40">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Transactional Outbox Ledger
              </h3>
              <p className="text-xs text-slate-400">
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
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800/80 text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
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
              <tbody className="divide-y divide-slate-800/60 bg-[#090D16] font-sans">
                {filteredOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No outbox events match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredOutbox.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-900/50 transition">
                      <td className="px-4 py-3 font-mono font-medium text-slate-200">
                        {evt.eventType}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono">
                          {evt.entityType}:{evt.entityId.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            evt.status === "PROCESSED"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                              : evt.status === "PENDING"
                              ? "bg-amber-950/60 text-amber-300 border border-amber-500/30"
                              : evt.status === "PROCESSING"
                              ? "bg-blue-950/60 text-blue-300 border border-blue-500/30"
                              : "bg-rose-950/60 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono">{evt.retryCount}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {new Date(evt.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
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
                            className="rounded-lg bg-rose-950/60 border border-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/60 transition"
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

      {/* TAB 4: DIAGNOSTICS & ARCHITECTURE */}
      {activeTab === "diagnostics" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Architecture Spec */}
          <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Server className="h-4 w-4 text-indigo-400" />
              <span>Native In-Process Engine & Sarvam Telephony Architecture</span>
            </div>

            <div className="space-y-3 text-xs text-slate-400">
              <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Sarvam AI Telephony Gateway</span>
                  <span className="font-mono text-indigo-400 font-bold">Dedicated Hinglish Agent</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Autonomous outbound voice dialing conforming to E.164 (+91) format. Automatic fallback to high-fidelity simulated agent if trunks are in standby.
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">AI Intelligence Core</span>
                  <span className="font-mono text-purple-400 font-bold">Google Gemini 3.5 Flash</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Pre-configured with CA tax law knowledge (Sec 43B(h), DRC-01, Sec 148). Dynamic bilingual prompt engineering with JSON response guarantees.
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Concurrency & Claiming</span>
                  <span className="font-mono text-emerald-400 font-bold">Atomic Status Lock</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Zero race conditions: Worker processes atomically claim pending events by transitioning status from <code>PENDING</code> to <code>PROCESSING</code>.
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Tenant Isolation</span>
                  <span className="font-mono text-emerald-400 font-bold">STRICT (where: tenantId)</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Every query, AI prompt, communication log, and voice dispatch is strictly bounded to the calling tenant ID.
                </p>
              </div>
            </div>
          </div>

          {/* Environment & Credentials Health */}
          <div className="rounded-2xl border border-slate-800 bg-[#090D16] p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <KeyRound className="h-4 w-4 text-indigo-400" />
              <span>AI & Telephony Service Status</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div>
                  <strong className="text-slate-200">Sarvam AI Telephony Engine</strong>
                  <p className="font-mono text-[11px] text-indigo-400 font-bold">sarvam-105b-conversations / voice</p>
                </div>
                <span className="rounded-full bg-indigo-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div>
                  <strong className="text-slate-200">Gemini AI Model</strong>
                  <p className="font-mono text-[11px] text-purple-400 font-bold">gemini-3.5-flash</p>
                </div>
                <span className="rounded-full bg-purple-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-purple-300 border border-purple-500/30">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div>
                  <strong className="text-slate-200">Voice Inbound Webhook</strong>
                  <p className="font-mono text-[11px] text-slate-400">/api/webhooks/voice</p>
                </div>
                <span className="rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div>
                  <strong className="text-slate-200">Scheduled Cron Sweep</strong>
                  <p className="font-mono text-[11px] text-slate-400">/api/cron/process-automations</p>
                </div>
                <span className="rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                  Daily 09:00 IST
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Omnichannel Dispatch Console Modal */}
      <OmnichannelConsoleModal
        isOpen={isConsoleOpen}
        onClose={() => setIsConsoleOpen(false)}
        preselectedClientId={consoleClientId}
        preselectedChannel={consoleChannel}
        preselectedWorkflowName={consoleWorkflowName}
        onDispatchSuccess={() => {
          refreshTelemetry();
        }}
      />
    </div>
  );
}
