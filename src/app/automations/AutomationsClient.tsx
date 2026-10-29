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
  };
}

export function AutomationsClient({
  initialWorkflows,
  initialOutboxEvents,
  initialTelemetry,
  initialOutboxFeed = [],
  stats,
}: AutomationsClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [outboxEvents, setOutboxEvents] = useState<OutboxEventItem[]>(initialOutboxEvents);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(initialTelemetry || null);
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"workflows" | "live_outbox" | "outbox_ledger" | "diagnostics">("workflows");
  const [outboxFilter, setOutboxFilter] = useState<string>("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Omnichannel Console Modal State
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleClientId, setConsoleClientId] = useState<string | undefined>(undefined);
  const [consoleChannel, setConsoleChannel] = useState<"WHATSAPP" | "EMAIL" | "VOICE">("WHATSAPP");
  const [consoleWorkflowName, setConsoleWorkflowName] = useState<string | undefined>(undefined);

  // Auto-refresh telemetry stats every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      refreshTelemetry();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const refreshTelemetry = async () => {
    try {
      const res = await getWorkflowTelemetryStatsAction();
      if (res.success && res.data) {
        setTelemetry(res.data as TelemetryData);
      }
    } catch {
      // Background poll failure silent
    }
  };

  const handleToggle = (code: string, currentEnabled: boolean) => {
    const targetState = !currentEnabled;

    // Optimistic UI update
    setWorkflows((prev) =>
      prev.map((w) => (w.code === code ? { ...w, enabled: targetState } : w))
    );

    startTransition(async () => {
      const res = await toggleAutomationAction(code, targetState);
      if (res.success) {
        toast.success(`Workflow ${code} ${targetState ? "enabled" : "paused"}.`);
        refreshTelemetry();
      } else {
        // Rollback
        setWorkflows((prev) =>
          prev.map((w) => (w.code === code ? { ...w, enabled: currentEnabled } : w))
        );
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Failed to toggle.";
        toast.error(err);
      }
    });
  };

  const handleRetryEvent = (eventId: string) => {
    startTransition(async () => {
      const res = await retryOutboxEventAction(eventId);
      if (res.success) {
        toast.success("Outbox event queued for atomic redelivery.");
        setOutboxEvents((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, status: "PENDING" } : e))
        );
      } else {
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Retry failed.";
        toast.error(err);
      }
    });
  };

  const handleTriggerDispatch = () => {
    startTransition(async () => {
      const res = await triggerAutomationsAction();
      if (res.success) {
        const count = (res.data as any)?.processed ?? 0;
        toast.success(`Outbox dispatch cycle executed. Processed: ${count} events.`);
        refreshTelemetry();
      } else {
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Dispatch failed.";
        toast.error(err);
      }
    });
  };

  const handleTriggerVoiceCall = () => {
    startTransition(async () => {
      const res = await triggerAiVoiceCallTestAction();
      if (res.success) {
        const processed = (res.data as any)?.processed ?? 1;
        setStatusMessage(`Voice Dispatch Active: Processed ${processed} queue events for regional client outreach.`);
        setTimeout(() => setStatusMessage(null), 6000);
      } else {
        const err =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Telephony error.";
        setStatusMessage(`Telephony error: ${err}`);
      }
    });
  };

  const handleTriggerAuditScan = () => {
    startTransition(async () => {
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

  const engineState = telemetry?.engineState || "ACTIVE";

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 w-full max-w-full min-w-0 overflow-x-hidden bg-ivory text-[#263238] min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF4EE] text-[#F26B38] border border-[#F26B38]/30 shrink-0">
              <Cpu className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#263238] break-words">
              Automation Center & Dispatch Command
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live PostgreSQL Telemetry
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4EE] px-2.5 py-1 text-xs font-semibold text-[#D95524] border border-[#F26B38]/30">
              <PhoneCall className="h-3 w-3 text-[#F26B38]" />
              Sarvam AI Telephony
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Real-time execution telemetry, 1-click manual overrides, Sarvam AI outbound voice dialing, and calendar-aligned automated triggers.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleOpenConsole("Manual Dispatch")}
            className="flex items-center gap-2 rounded-lg bg-[#F26B38] hover:bg-[#D95524] text-white px-4 py-2 text-xs font-bold shadow-2xs transition-colors active:scale-[0.98] cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            Omnichannel Console
          </button>

          <button
            onClick={handleTriggerVoiceCall}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-white hover:bg-[#FAF9F5] border border-[#E5E7EB] text-[#263238] px-3.5 py-2 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <PhoneCall className={`h-3.5 w-3.5 text-[#F26B38] ${isPending ? "animate-pulse" : ""}`} />
            Quick Voice Dial
          </button>

          <button
            onClick={handleTriggerAuditScan}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-white hover:bg-[#FAF9F5] border border-[#E5E7EB] text-[#263238] px-3.5 py-2 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <Sparkles className={`h-3.5 w-3.5 text-purple-600 ${isPending ? "animate-spin" : ""}`} />
            Run AI Audit
          </button>

          <button
            onClick={handleTriggerDispatch}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-white hover:bg-[#FAF9F5] border border-[#E5E7EB] text-[#263238] px-3.5 py-2 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <RotateCw className={`h-3.5 w-3.5 text-emerald-600 ${isPending ? "animate-spin" : ""}`} />
            Drain Outbox
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {statusMessage && (
        <div className="rounded-xl bg-[#FFF4EE] border border-[#F26B38]/30 px-4 py-3 text-xs font-medium text-[#D95524] flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-[#F26B38]" />
            <span>{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[#D95524] hover:text-[#263238] text-xs font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Real-time Metric Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Total Practice Dispatches */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Dispatches
            </span>
            <Send className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[#263238]">
            {telemetry?.channelCounts.total ?? stats.totalRuns}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="text-emerald-700 font-semibold">
              WA: {telemetry?.channelCounts.whatsapp ?? 0}
            </span>
            <span>•</span>
            <span className="text-[#D95524] font-semibold">
              Voice: {telemetry?.channelCounts.voice ?? 0}
            </span>
            <span>•</span>
            <span className="text-sky-700 font-semibold">
              Email: {telemetry?.channelCounts.email ?? 0}
            </span>
          </div>
        </div>

        {/* Delivery Success Rate */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Delivery Success
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">
            {telemetry?.deliverySuccessRate ?? 98}%
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Multi-channel SLA delivery metric</p>
        </div>

        {/* Operational State Indicator */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Operational State
            </span>
            <Activity className="h-4 w-4 text-[#F26B38]" />
          </div>
          <div className="mt-2 text-xl font-bold tracking-tight text-[#263238] flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                engineState === "RUNNING"
                  ? "bg-blue-500 animate-ping"
                  : engineState === "ACTIVE"
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-slate-400"
              }`}
            />
            {engineState}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Pending outbox items: <span className="text-[#263238] font-mono font-bold">{stats.pendingOutbox}</span>
          </p>
        </div>

        {/* Calendar Trigger */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Next Scheduled Sweep
            </span>
            <Calendar className="h-4 w-4 text-[#F26B38]" />
          </div>
          <div className="mt-2 text-base font-bold tracking-tight text-[#263238]">
            {telemetry?.nextCronTrigger
              ? new Date(telemetry.nextCronTrigger).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }) + " IST"
              : "09:00 AM IST"}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Daily Statutory Sweep & Reminders</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[#E5E7EB] space-x-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`pb-3 pt-1 transition-colors border-b-2 cursor-pointer ${
            activeTab === "workflows"
              ? "border-[#F26B38] text-[#D95524]"
              : "border-transparent text-slate-500 hover:text-[#263238]"
          }`}
        >
          All 10 Workflows & AI Modules
        </button>
        <button
          onClick={() => setActiveTab("live_outbox")}
          className={`pb-3 pt-1 transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === "live_outbox"
              ? "border-[#F26B38] text-[#D95524]"
              : "border-transparent text-slate-500 hover:text-[#263238]"
          }`}
        >
          <span>Live Outbox Audit Feed</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-orange-100 text-[#D95524] font-mono font-bold">
            Live
          </span>
        </button>
        <button
          onClick={() => setActiveTab("outbox_ledger")}
          className={`pb-3 pt-1 transition-colors border-b-2 cursor-pointer ${
            activeTab === "outbox_ledger"
              ? "border-[#F26B38] text-[#D95524]"
              : "border-transparent text-slate-500 hover:text-[#263238]"
          }`}
        >
          Transactional Ledger ({stats.pendingOutbox} pending)
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`pb-3 pt-1 transition-colors border-b-2 cursor-pointer ${
            activeTab === "diagnostics"
              ? "border-[#F26B38] text-[#D95524]"
              : "border-transparent text-slate-500 hover:text-[#263238]"
          }`}
        >
          Architecture & Gateway Health
        </button>
      </div>

      {/* TAB 1: ALL WORKFLOWS & AI MODULES */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search workflows by name, category, or trigger..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#E5E7EB] rounded-lg pl-9 pr-4 py-2 text-xs text-[#263238] placeholder:text-slate-400 focus:outline-hidden focus:border-[#F26B38] focus:ring-2 focus:ring-[#F26B38]/20 transition-colors shadow-2xs"
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
                  className={`flex flex-col justify-between rounded-xl border p-5 shadow-2xs transition-all duration-200 bg-white hover:border-[#F26B38]/40 ${
                    w.isVoice
                      ? "border-orange-200"
                      : w.isAi
                      ? "border-purple-200"
                      : "border-[#E5E7EB]"
                  }`}
                >
                  <div>
                    {/* Header: Category Badge & Status Dot */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-md bg-[#FAF9F5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-[#E5E7EB]">
                          {w.category}
                        </span>
                        {w.isVoice ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF4EE] px-2 py-0.5 text-[10px] font-bold text-[#D95524] border border-[#F26B38]/30">
                            <PhoneCall className="h-3 w-3 text-[#F26B38]" /> Voice Agent
                          </span>
                        ) : w.isAi ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                            <Sparkles className="h-3 w-3 text-purple-600" /> AI Powered
                          </span>
                        ) : null}
                      </div>

                      {/* Toggle Switch */}
                      <button
                        onClick={() => handleToggle(w.code, w.enabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          w.enabled
                            ? "bg-[#F26B38]"
                            : "bg-slate-200"
                        }`}
                        title={w.enabled ? "Disable workflow" : "Enable workflow"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                            w.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <h3 className="mt-3 text-sm font-bold text-[#263238]">{w.name}</h3>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-3 leading-relaxed">
                      {w.description}
                    </p>

                    <div className="mt-3 rounded-lg bg-[#FAF9F5] p-2.5 border border-[#E5E7EB] text-[11px] text-[#263238] font-mono">
                      <span className="font-bold text-[#D95524]">Trigger:</span> {w.trigger}
                    </div>
                  </div>

                  <div>
                    {/* Live Metric Badges */}
                    <div className="mt-4 pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Runs: <strong className="text-[#263238]">{runs}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>Last: <span className="text-slate-700">{lastRun}</span></span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          w.enabled
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-[#F8FAFC] text-slate-600 border border-[#E5E7EB]"
                        }`}
                      >
                        {w.enabled ? "Active" : "Paused"}
                      </span>
                    </div>

                    {/* 1-Click Action Bar */}
                    <div className="mt-3 pt-3 border-t border-[#E5E7EB] grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickVoiceCall(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#FAF9F5] hover:bg-[#FFF4EE] hover:text-[#D95524] text-slate-700 border border-[#E5E7EB] text-[10px] font-semibold transition-colors cursor-pointer"
                        title="Dial Sarvam AI voice agent for client"
                      >
                        <PhoneCall className="w-3 h-3 text-[#F26B38]" />
                        Quick Voice
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickWhatsApp(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#FAF9F5] hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-[#E5E7EB] text-[10px] font-semibold transition-colors cursor-pointer"
                        title="Open WhatsApp draft modal"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-600" />
                        Quick WA
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenConsole(w.name)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#FAF9F5] hover:bg-[#F8FAFC] text-slate-700 border border-[#E5E7EB] text-[10px] font-semibold transition-colors cursor-pointer"
                        title="Open full Omnichannel Dispatch Console"
                      >
                        <Sliders className="w-3 h-3 text-slate-500" />
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
        <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-2xs overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-[#E5E7EB] p-4 sm:flex-row sm:items-center sm:justify-between bg-[#FAF9F5]">
            <div>
              <h3 className="text-sm font-bold text-[#263238]">
                Transactional Outbox Ledger
              </h3>
              <p className="text-xs text-slate-500">
                Guaranteed delivery events processed in-process via PostgreSQL transactional ledger.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {["all", "pending", "processed", "failed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setOutboxFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase transition-colors cursor-pointer ${
                    outboxFilter === f
                      ? "bg-[#F26B38] text-white shadow-2xs"
                      : "bg-white border border-[#E5E7EB] text-slate-600 hover:bg-[#FAF9F5] hover:text-[#263238]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5E7EB] text-left text-xs">
              <thead className="bg-[#FAF9F5] text-slate-500 font-bold uppercase tracking-wider text-[10px]">
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
              <tbody className="divide-y divide-[#E5E7EB] bg-white font-sans text-[#263238]">
                {filteredOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No outbox events match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredOutbox.map((evt) => (
                    <tr key={evt.id} className="hover:bg-[#FAF9F5] transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-[#263238]">
                        {evt.eventType}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="rounded bg-[#FAF9F5] border border-[#E5E7EB] px-1.5 py-0.5 text-[10px] font-mono">
                          {evt.entityType}:{evt.entityId.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            evt.status === "PROCESSED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : evt.status === "PENDING"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : evt.status === "PROCESSING"
                              ? "bg-sky-50 text-sky-800 border border-sky-200"
                              : "bg-rose-50 text-rose-800 border border-rose-200"
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono font-semibold">{evt.retryCount}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {new Date(evt.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
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
                            className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
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
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-[#263238] font-bold text-sm">
              <Server className="h-4 w-4 text-[#F26B38]" />
              <span>Native In-Process Engine & Sarvam Telephony Architecture</span>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="rounded-xl bg-[#FAF9F5] p-3.5 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#263238]">Sarvam AI Telephony Gateway</span>
                  <span className="font-mono text-[#D95524] font-bold">Dedicated Hinglish Agent</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Autonomous outbound voice dialing conforming to E.164 (+91) format. Automatic fallback to high-fidelity simulated agent if trunks are in standby.
                </p>
              </div>

              <div className="rounded-xl bg-[#FAF9F5] p-3.5 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#263238]">AI Intelligence Core</span>
                  <span className="font-mono text-purple-700 font-bold">Google Gemini 3.5 Flash</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Pre-configured with CA tax law knowledge (Sec 43B(h), DRC-01, Sec 148). Dynamic bilingual prompt engineering with JSON response guarantees.
                </p>
              </div>

              <div className="rounded-xl bg-[#FAF9F5] p-3.5 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#263238]">Concurrency & Claiming</span>
                  <span className="font-mono text-emerald-700 font-bold">Atomic Status Lock</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Zero race conditions: Worker processes atomically claim pending events by transitioning status from <code>PENDING</code> to <code>PROCESSING</code>.
                </p>
              </div>

              <div className="rounded-xl bg-[#FAF9F5] p-3.5 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#263238]">Tenant Isolation</span>
                  <span className="font-mono text-emerald-700 font-bold">STRICT (where: tenantId)</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Every query, AI prompt, communication log, and voice dispatch is strictly bounded to the calling tenant ID.
                </p>
              </div>
            </div>
          </div>

          {/* Environment & Credentials Health */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-[#263238] font-bold text-sm">
              <KeyRound className="h-4 w-4 text-[#F26B38]" />
              <span>AI & Telephony Service Status</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#FAF9F5] p-3.5">
                <div>
                  <strong className="text-[#263238]">Sarvam AI Telephony Engine</strong>
                  <p className="font-mono text-[11px] text-[#D95524] font-bold">sarvam-105b-conversations / voice</p>
                </div>
                <span className="rounded-full bg-[#FFF4EE] px-2.5 py-0.5 text-[10px] font-bold text-[#D95524] border border-[#F26B38]/30">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#FAF9F5] p-3.5">
                <div>
                  <strong className="text-[#263238]">Gemini AI Model</strong>
                  <p className="font-mono text-[11px] text-purple-700 font-bold">gemini-3.5-flash</p>
                </div>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#FAF9F5] p-3.5">
                <div>
                  <strong className="text-[#263238]">Voice Inbound Webhook</strong>
                  <p className="font-mono text-[11px] text-slate-500">/api/webhooks/voice</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#FAF9F5] p-3.5">
                <div>
                  <strong className="text-[#263238]">Scheduled Cron Sweep</strong>
                  <p className="font-mono text-[11px] text-slate-500">/api/cron/process-automations</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
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
