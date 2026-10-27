"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  PhoneCall,
  Mail,
  MessageSquare,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  FileText,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  Sparkles,
  RefreshCw,
  X,
  User,
  Bot,
  AlertTriangle,
  Building2,
  CheckSquare,
  Square,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Filter,
  DollarSign,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CommunicationItem {
  id: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  channel: string;
  direction: "OUTBOUND" | "INBOUND";
  purpose: string;
  category: string;
  recipient: string;
  subject?: string | null;
  content: string;
  status: string;
  externalRef: string | null;
  createdAt: string;
  recordingUrl: string | null;
  sentiment: string | null;
  duration: number;
  transcript: string | null;
  diagnostics: string | null;
}

export interface ClientDispatchTarget {
  id: string;
  name: string;
  phone: string;
  email: string;
  monthlyFee: number;
  isOverdue: boolean;
  overdueAmount: number;
  latestInvoiceNumber: string | null;
  dueDate: string | null;
}

interface Props {
  communications: CommunicationItem[];
  clients: ClientDispatchTarget[];
  overdueStats: {
    overdueClientsCount: number;
    totalOverdueAmount: number;
    totalClientsCount: number;
  };
  tenantName: string;
}

// Custom Audio Player Component
function AudioPlayerBar({
  audioUrl,
  simulatedScript,
}: {
  audioUrl?: string | null;
  simulatedScript?: string | null;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = () => {
    if (audioUrl) {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    } else if (simulatedScript && typeof window !== "undefined" && "speechSynthesis" in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      } else {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(simulatedScript);
        utterance.rate = 1.0;
        utterance.lang = "en-IN";
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      }
    }
  };

  const active = isPlaying || isSpeaking;

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 min-h-[44px]">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          onError={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
      <button
        type="button"
        onClick={toggleAudio}
        aria-label={active ? "Pause voice recording" : "Play voice recording"}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors min-w-[36px] min-h-[36px] ${
          active
            ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
            : "bg-slate-800 text-amber-400 hover:bg-slate-700"
        }`}
      >
        {active ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>

      <div className="flex flex-col flex-1 min-w-[100px]">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="font-medium text-slate-300">
            {audioUrl ? "Live Audio Recording" : "Voice Stream Demo"}
          </span>
          <span className="text-amber-400 font-mono text-[9px]">
            {active ? "PLAYING" : "READY"}
          </span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full bg-amber-400 transition-all duration-300 ${
              active ? "w-full animate-pulse" : "w-1/3"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

// Dual-Color Transcript Component
function TranscriptView({
  transcript,
  clientName,
  sentiment,
}: {
  transcript: string;
  clientName: string;
  sentiment?: string | null;
}) {
  // Parse lines or generate fallback structured dialogue
  const lines = transcript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedLines = lines.map((line) => {
    const isAgent =
      line.startsWith("Agent:") ||
      line.startsWith("TRUV:") ||
      line.startsWith("Assistant:") ||
      line.toLowerCase().includes("namaste") ||
      line.toLowerCase().includes("truv advisory");

    const isClient =
      line.startsWith("Client:") ||
      line.startsWith("User:") ||
      line.startsWith("Customer:");

    let cleanText = line
      .replace(/^(Agent|TRUV|Assistant|Client|User|Customer):\s*/i, "")
      .trim();

    return {
      speaker: isAgent ? "Agent" : isClient ? "Client" : "Agent",
      text: cleanText || line,
    };
  });

  return (
    <div className="space-y-3 p-1">
      {sentiment && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
          <span className="text-slate-400">Recorded Client Sentiment:</span>
          <SentimentBadge sentiment={sentiment} />
        </div>
      )}

      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {parsedLines.map((item, idx) => {
          const isAgent = item.speaker === "Agent";
          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 text-xs leading-relaxed ${
                isAgent ? "justify-start" : "justify-end"
              }`}
            >
              {isAgent && (
                <div className="w-7 h-7 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3 rounded-2xl ${
                  isAgent
                    ? "bg-slate-900 border border-emerald-500/30 text-slate-100 rounded-tl-xs shadow-md shadow-emerald-950/20"
                    : "bg-indigo-950/80 border border-indigo-500/30 text-indigo-100 rounded-tr-xs shadow-md shadow-indigo-950/20 text-right"
                }`}
              >
                <div className="text-[10px] font-semibold mb-1 opacity-75">
                  {isAgent ? "TRUV Sarvam AI Agent" : clientName}
                </div>
                <div className="text-xs whitespace-pre-wrap">{item.text}</div>
              </div>

              {!isAgent && (
                <div className="w-7 h-7 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sentiment Badge Component
function SentimentBadge({ sentiment }: { sentiment?: string | null }) {
  if (!sentiment) return null;
  const s = sentiment.toUpperCase();

  if (s === "DISPUTING") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
        <AlertTriangle className="w-3 h-3 text-rose-400" />
        Disputing (Partner Escalated)
      </span>
    );
  }

  if (s === "PROMISED_TO_PAY") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40">
        <DollarSign className="w-3 h-3 text-sky-400" />
        Promised to Pay
      </span>
    );
  }

  if (s === "COOPERATIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        Cooperative
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
      <Clock className="w-3 h-3 text-amber-400" />
      Unresponsive / Busy
    </span>
  );
}

export function CommunicationsClient({
  communications,
  clients,
  overdueStats,
  tenantName,
}: Props) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "voice" | "whatsapp" | "email" | "reverts">("all");
  const [viewMode, setViewMode] = useState<"ledger" | "roster">("ledger");

  // Selection state for Selective & Bulk Dispatch
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchTargetType, setDispatchTargetType] = useState<"SINGLE" | "SELECTED" | "ALL_OVERDUE" | "ALL_CLIENTS">("SELECTED");
  const [dispatchChannel, setDispatchChannel] = useState<"VOICE" | "EMAIL" | "WHATSAPP">("VOICE");
  const [dispatchReason, setDispatchReason] = useState<"PAYMENT_RECOVERY" | "GST_DEADLINE" | "DOCUMENT_COLLECTION">("PAYMENT_RECOVERY");
  const [customNote, setCustomNote] = useState("");
  const [singleClientId, setSingleClientId] = useState<string>("");

  // Inspect Modal State
  const [inspectItem, setInspectItem] = useState<CommunicationItem | null>(null);

  // Dispatch execution state
  const [isDispatching, startDispatchTransition] = useTransition();
  const [dispatchResult, setDispatchResult] = useState<any>(null);

  // Filtered Communications
  const filteredComms = communications.filter((item) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      item.clientName.toLowerCase().includes(term) ||
      item.recipient.toLowerCase().includes(term) ||
      (item.subject && item.subject.toLowerCase().includes(term)) ||
      item.category.toLowerCase().includes(term) ||
      item.content.toLowerCase().includes(term);

    let matchesTab = true;
    if (activeTab === "voice") {
      matchesTab = item.channel.toUpperCase() === "VOICE";
    } else if (activeTab === "whatsapp") {
      matchesTab = item.channel.toUpperCase() === "WHATSAPP";
    } else if (activeTab === "email") {
      matchesTab = item.channel.toUpperCase() === "EMAIL" && item.direction === "OUTBOUND";
    } else if (activeTab === "reverts") {
      matchesTab = item.direction === "INBOUND" || item.category === "EMAIL_REVERT";
    }

    return matchesSearch && matchesTab;
  });

  // KPI Metrics
  const totalDispatches = communications.length;
  const voiceCallsCount = communications.filter((c) => c.channel.toUpperCase() === "VOICE").length;
  const whatsappCount = communications.filter((c) => c.channel.toUpperCase() === "WHATSAPP").length;
  const emailCount = communications.filter((c) => c.channel.toUpperCase() === "EMAIL" && c.direction === "OUTBOUND").length;
  const revertsCount = communications.filter((c) => c.direction === "INBOUND" || c.category === "EMAIL_REVERT").length;
  const disputedCount = communications.filter((c) => c.sentiment === "DISPUTING").length;

  // Toggle Single Client Selection
  const toggleSelectClient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle Select All Visible Clients
  const toggleSelectAllClients = () => {
    if (selectedClientIds.length === clients.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(clients.map((c) => c.id));
    }
  };

  // Open Dispatch Modal with Preset Target
  const openDispatch = (
    targetType: "SINGLE" | "SELECTED" | "ALL_OVERDUE" | "ALL_CLIENTS",
    clientId?: string
  ) => {
    setDispatchTargetType(targetType);
    if (clientId) {
      setSingleClientId(clientId);
    }
    setDispatchResult(null);
    setIsDispatchModalOpen(true);
  };

  // Execute Manual Dispatch Call to Backend API
  const handleExecuteDispatch = () => {
    startDispatchTransition(async () => {
      try {
        const payload = {
          targetType: dispatchTargetType,
          clientIds:
            dispatchTargetType === "SINGLE"
              ? [singleClientId]
              : dispatchTargetType === "SELECTED"
              ? selectedClientIds
              : undefined,
          channel: dispatchChannel,
          workflowReason: dispatchReason,
          customNote: customNote.trim() || undefined,
        };

        const res = await fetch("/api/automations/manual-dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        setDispatchResult(data);
        if (data.success) {
          router.refresh();
        }
      } catch (err: any) {
        setDispatchResult({
          success: false,
          error: err.message || "Failed to execute manual dispatch.",
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Telemetry HUD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            Autonomous Operations Command Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">
            Omnichannel Telephony & Dispatch Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time Sarvam AI voice calls, playable audio streams, dual-color transcripts, and on-demand partner dispatch.
          </p>
        </div>

        {/* Quick Action Touch Bar (min-h-[44px]) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openDispatch("ALL_OVERDUE")}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Dispatch All Overdue ({overdueStats.overdueClientsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedClientIds.length > 0) {
                openDispatch("SELECTED");
              } else {
                setViewMode("roster");
              }
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all cursor-pointer active:scale-95"
          >
            <Send className="w-3.5 h-3.5 text-teal-400" />
            <span>
              {selectedClientIds.length > 0
                ? `Bulk Dispatch Selected (${selectedClientIds.length})`
                : "Select Clients"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.refresh()}
            aria-label="Refresh Telemetry"
            className="flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Telemetry Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Events</span>
            <Radio className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white mt-1.5">{totalDispatches}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Audited records</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Sarvam Voice</span>
            <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-400 mt-1.5">{voiceCallsCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Regional AI telephony</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>WhatsApp</span>
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1.5">{whatsappCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Automated nudges</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Direct Email</span>
            <Mail className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-sky-400 mt-1.5">{emailCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">SMTP statements</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Client Reverts</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-400 mt-1.5">{revertsCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Inbound replies</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Disputes Flagged</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className={`text-xl sm:text-2xl font-bold mt-1.5 ${disputedCount > 0 ? "text-rose-400" : "text-white"}`}>
            {disputedCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Partner escalated</div>
        </div>
      </div>

      {/* Main Switcher: Audit Ledger vs Target Clients Roster */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("ledger")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === "ledger"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            Audit Ledger & Voice Stream ({communications.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("roster")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === "roster"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            Client Dispatch Roster ({clients.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={viewMode === "ledger" ? "Search dispatches, transcripts..." : "Search clients, GSTIN, phone..."}
            className="w-full min-h-[44px] pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* VIEW MODE 1: AUDIT LEDGER */}
      {viewMode === "ledger" && (
        <div className="space-y-4">
          {/* Sub-Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {[
              { id: "all", label: "All Logs" },
              { id: "voice", label: "📞 Sarvam Voice Calls" },
              { id: "whatsapp", label: "💬 WhatsApp Follow-ups" },
              { id: "email", label: "✉️ Direct Emails" },
              { id: "reverts", label: "📥 Inbound Reverts" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-slate-800 text-amber-400 border border-slate-700 shadow-xs"
                    : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredComms.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <PhoneCall className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No communication records found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Trigger an automated recovery call or manual dispatch to populate live telemetry.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile Card List (sm:hidden) */}
              <div className="sm:hidden space-y-3">
                {filteredComms.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-white">{item.clientName}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{item.recipient}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.channel === "VOICE"
                            ? "bg-amber-950/80 text-amber-300 border border-amber-500/30"
                            : item.channel === "WHATSAPP"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30"
                            : item.direction === "INBOUND"
                            ? "bg-indigo-950/80 text-indigo-300 border border-indigo-500/30"
                            : "bg-sky-950/80 text-sky-300 border border-sky-500/30"
                        }`}
                      >
                        {item.channel === "VOICE" && <PhoneCall className="w-3 h-3" />}
                        {item.channel === "WHATSAPP" && <MessageSquare className="w-3 h-3" />}
                        {item.channel === "EMAIL" && item.direction === "INBOUND" && <ArrowDownLeft className="w-3 h-3" />}
                        {item.channel === "EMAIL" && item.direction === "OUTBOUND" && <Mail className="w-3 h-3" />}
                        {item.direction === "INBOUND" ? "INBOUND REVERT" : item.channel}
                      </span>
                    </div>

                    {/* Audio Player if Voice */}
                    {item.channel === "VOICE" && (
                      <AudioPlayerBar
                        audioUrl={item.recordingUrl}
                        simulatedScript={item.transcript || "Namaste. This is TRUV Advisory calling regarding your pending statutory invoice."}
                      />
                    )}

                    {/* Sentiment Tag */}
                    {item.sentiment && (
                      <div>
                        <SentimentBadge sentiment={item.sentiment} />
                      </div>
                    )}

                    {/* Subject / Purpose */}
                    <div className="text-xs text-slate-300 line-clamp-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="font-semibold text-slate-400">{item.purpose}:</span>{" "}
                      {item.subject || item.content.slice(0, 100)}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] text-slate-400">
                      <span>
                        {new Date(item.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectItem(item)}
                        className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-amber-400 hover:text-amber-300 active:bg-slate-800 transition-colors"
                      >
                        Inspect Transcript →
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / Tablet Table View (hidden sm:block) */}
              <div className="hidden sm:block bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    <tr>
                      <th className="px-5 py-3.5">Client & Target</th>
                      <th className="px-5 py-3.5">Channel / Direction</th>
                      <th className="px-5 py-3.5">Voice Audio Stream</th>
                      <th className="px-5 py-3.5">Sentiment / Status</th>
                      <th className="px-5 py-3.5">Dispatched At</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredComms.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-white text-sm">{item.clientName}</div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">{item.recipient}</div>
                          {item.invoiceNumber && (
                            <span className="inline-block mt-1 text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                              #{item.invoiceNumber}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              item.channel === "VOICE"
                                ? "bg-amber-950 text-amber-300 border border-amber-500/30"
                                : item.channel === "WHATSAPP"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30"
                                : item.direction === "INBOUND"
                                ? "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                                : "bg-sky-950 text-sky-300 border border-sky-500/30"
                            }`}
                          >
                            {item.channel === "VOICE" && <PhoneCall className="w-3 h-3" />}
                            {item.channel === "WHATSAPP" && <MessageSquare className="w-3 h-3" />}
                            {item.channel === "EMAIL" && item.direction === "INBOUND" && <ArrowDownLeft className="w-3 h-3" />}
                            {item.channel === "EMAIL" && item.direction === "OUTBOUND" && <Mail className="w-3 h-3" />}
                            {item.direction === "INBOUND" ? "INBOUND REVERT" : item.channel}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1">{item.purpose}</div>
                        </td>

                        <td className="px-5 py-4 min-w-[220px]">
                          {item.channel === "VOICE" ? (
                            <AudioPlayerBar
                              audioUrl={item.recordingUrl}
                              simulatedScript={item.transcript || "Namaste. This is TRUV Advisory calling regarding your pending statutory invoice."}
                            />
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">N/A (Text Channel)</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          {item.sentiment ? (
                            <SentimentBadge sentiment={item.sentiment} />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              {item.status}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-slate-400">
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectItem(item)}
                            className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                          >
                            Inspect Payload →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: CLIENT DISPATCH ROSTER */}
      {viewMode === "roster" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllClients}
                className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {selectedClientIds.length === clients.length ? (
                  <CheckSquare className="w-4 h-4 text-amber-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Select All ({clients.length})</span>
              </button>
              <span className="text-xs text-slate-400">
                {selectedClientIds.length} of {clients.length} clients selected
              </span>
            </div>

            {selectedClientIds.length > 0 && (
              <button
                type="button"
                onClick={() => openDispatch("SELECTED")}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Dispatch to Selected ({selectedClientIds.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clients.map((client) => {
              const isSelected = selectedClientIds.includes(client.id);
              return (
                <div
                  key={client.id}
                  onClick={() => toggleSelectClient(client.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? "bg-slate-900 border-amber-500/70 shadow-lg shadow-amber-500/10"
                      : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-amber-400" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{client.name}</h4>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{client.phone}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[190px]">{client.email}</div>
                      </div>
                    </div>

                    {client.isOverdue ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
                        ₹{client.overdueAmount.toLocaleString("en-IN")} Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Retainer: ₹{client.monthlyFee.toLocaleString("en-IN")}/mo
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDispatch("SINGLE", client.id);
                      }}
                      className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg text-amber-400 hover:text-amber-300 font-semibold"
                    >
                      Instant Dispatch →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INSPECT MODAL & DUAL-COLOR TRANSCRIPT VIEWER */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl relative text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{inspectItem.clientName}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono">
                    {inspectItem.channel}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Recipient: {inspectItem.recipient} • {new Date(inspectItem.createdAt).toLocaleString("en-IN")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectItem(null)}
                aria-label="Close dialog"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audio Stream Player */}
            {inspectItem.channel === "VOICE" && (
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-2">Voice Recording Playback:</div>
                <AudioPlayerBar
                  audioUrl={inspectItem.recordingUrl}
                  simulatedScript={inspectItem.transcript || "Namaste. This is TRUV Advisory calling regarding your pending statutory invoice."}
                />
              </div>
            )}

            {/* Dual Color Transcript View */}
            {inspectItem.transcript ? (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dual-Color Interactive Transcript
                </h4>
                <TranscriptView
                  transcript={inspectItem.transcript}
                  clientName={inspectItem.clientName}
                  sentiment={inspectItem.sentiment}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Communication Payload & Audit Trail
                </h4>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {inspectItem.content}
                </pre>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Close Audit Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTIVE & BULK ON-DEMAND DISPATCH MODAL / BOTTOM SHEET */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl relative max-h-[92vh] overflow-y-auto text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-amber-500" />
                  <span>On-Demand Practice Dispatch</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Trigger automated voice calls, emails, or WhatsApp reminders instantly.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                aria-label="Close dispatch sheet"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Target Group</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { id: "SELECTED", label: `Selected (${selectedClientIds.length})` },
                  { id: "ALL_OVERDUE", label: `All Overdue (${overdueStats.overdueClientsCount})` },
                  { id: "ALL_CLIENTS", label: `All Clients (${clients.length})` },
                  { id: "SINGLE", label: "Single Client" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDispatchTargetType(t.id as any)}
                    className={`min-h-[44px] p-2 rounded-xl text-center font-bold border transition-all ${
                      dispatchTargetType === t.id
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/60"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Single Client Dropdown (if target is SINGLE) */}
            {dispatchTargetType === "SINGLE" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Select Specific Client</label>
                <select
                  value={singleClientId}
                  onChange={(e) => setSingleClientId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="">-- Choose Practice Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.isOverdue ? `(Overdue: ₹${c.overdueAmount})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Dispatch Channel Selector (Touch Targets >= 44px) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Dispatch Channel</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchChannel("VOICE")}
                  className={`min-h-[48px] p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "VOICE"
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                  <span className="text-xs">Sarvam AI Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchChannel("EMAIL")}
                  className={`min-h-[48px] p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "EMAIL"
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span className="text-xs">Direct Email</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchChannel("WHATSAPP")}
                  className={`min-h-[48px] p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "WHATSAPP"
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-xs">WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Workflow Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Workflow Intent / Statutory Reason</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: "PAYMENT_RECOVERY", label: "Payment Recovery" },
                  { id: "GST_DEADLINE", label: "GST Sign-Off Deadline" },
                  { id: "DOCUMENT_COLLECTION", label: "Document Collection" },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDispatchReason(r.id as any)}
                    className={`min-h-[44px] p-2 rounded-xl text-center text-xs font-medium border transition-all ${
                      dispatchReason === r.id
                        ? "bg-slate-800 text-amber-400 border-amber-500/60 font-bold"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Note / Partner Memo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Partner Memo / Custom Instruction (Optional)
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Please expedite payment before quarterly Section 43B(h) MSME cutoff."
                rows={2}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            {/* Results Alert */}
            {dispatchResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  dispatchResult.success
                    ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/60 border-rose-500/40 text-rose-200"
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {dispatchResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  {dispatchResult.success ? "Dispatch Initiated Successfully" : "Dispatch Failed"}
                </div>
                <div className="mt-1">
                  {dispatchResult.message ||
                    `Processed ${dispatchResult.processedCount || 0} clients (${dispatchResult.successCount || 0} succeeded, ${dispatchResult.failedCount || 0} failed).`}
                </div>
              </div>
            )}

            {/* Bottom Execution Trigger Button */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteDispatch}
                disabled={isDispatching}
                className="min-h-[48px] px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 shadow-lg shadow-amber-500/25 flex items-center gap-2 cursor-pointer transition-all"
              >
                {isDispatching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Dispatches...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Execute Autonomous Dispatch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
