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
  ChevronRight,
  Filter,
  DollarSign,
  Radio,
  Calendar,
  ExternalLink,
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

// Custom Audio Player Component (Unified Light TRUV Style)
function AudioPlayerBar({
  audioUrl,
  simulatedScript,
}: {
  audioUrl?: string | null;
  simulatedScript?: string | null;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = () => {
    if (audioUrl) {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
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
    <div className="flex items-center gap-3 bg-[#FFF4EE]/70 border border-[#FDBA74]/50 rounded-xl px-3 py-2 min-h-[44px]">
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
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shrink-0 shadow-xs ${
          active
            ? "bg-[#F26B38] text-white shadow-orange-500/30 scale-105"
            : "bg-white text-[#D95524] hover:bg-orange-50 border border-[#FDBA74]"
        }`}
      >
        {active ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex flex-col flex-1 min-w-[120px]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#263238]">
            {audioUrl ? "Live Audio Stream" : "AI Voice Stream"}
          </span>
          <span className="text-[#D95524] font-mono text-[10px] font-bold">
            {active ? "STREAMING" : "READY"}
          </span>
        </div>
        <div className="w-full bg-[#FED7AA] h-1.5 rounded-full mt-1.5 overflow-hidden">
          <div
            className={`h-full bg-[#F26B38] transition-all duration-300 ${
              active ? "w-full animate-pulse" : "w-1/4"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

// Dual-Color Interactive Transcript Component
function TranscriptView({
  transcript,
  clientName,
  sentiment,
}: {
  transcript: string;
  clientName: string;
  sentiment?: string | null;
}) {
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

    const cleanText = line
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
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
          <span className="text-[#64748B] font-medium">Recorded Client Sentiment:</span>
          <SentimentBadge sentiment={sentiment} />
        </div>
      )}

      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
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
                <div className="w-7 h-7 rounded-full bg-[#FFF4EE] border border-[#FED7AA] text-[#D95524] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3.5 rounded-2xl ${
                  isAgent
                    ? "bg-[#FFF4EE]/70 border border-[#FED7AA] text-[#263238] rounded-tl-xs shadow-xs"
                    : "bg-[#F8FAFC] border border-[#E2E8F0] text-[#263238] rounded-tr-xs shadow-xs text-right"
                }`}
              >
                <div className="text-[10px] font-bold mb-1 text-[#64748B] uppercase tracking-wider">
                  {isAgent ? "TRUV Sarvam AI Agent" : clientName}
                </div>
                <div className="text-xs whitespace-pre-wrap text-[#263238] font-normal">
                  {item.text}
                </div>
              </div>

              {!isAgent && (
                <div className="w-7 h-7 rounded-full bg-[#F1F5F9] border border-[#CBD5E1] text-[#475569] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle className="w-3 h-3 text-rose-500" />
        Disputing (Partner Escalated)
      </span>
    );
  }

  if (s === "PROMISED_TO_PAY") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
        <DollarSign className="w-3 h-3 text-sky-500" />
        Promised to Pay
      </span>
    );
  }

  if (s === "COOPERATIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        Cooperative
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3 text-amber-500" />
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
    <div className="min-h-screen bg-ivory text-[#263238] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Telemetry HUD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E5E7EB]">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF4EE] text-[#D95524] border border-[#FDBA74]">
            <Radio className="w-3.5 h-3.5 animate-pulse text-[#F26B38]" />
            Practice Communications & Telephony
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#263238] mt-1.5">
            Outreach & Comms Ledger
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Autonomous Sarvam AI telephony, playable audio logs, interactive dual-color transcripts, and on-demand client dispatch for {tenantName}.
          </p>
        </div>

        {/* Quick Action Touch Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/communications/campaigns"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-[#F8FAFC] text-[#263238] border border-[#E5E7EB] shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Calendar className="w-4 h-4 text-[#F26B38]" />
            <span>Calling Operations & Campaigns</span>
          </Link>

          <button
            type="button"
            onClick={() => openDispatch("ALL_OVERDUE")}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-[#F26B38] hover:bg-[#D95524] text-white shadow-sm shadow-orange-500/20 transition-all cursor-pointer active:scale-95"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Dispatch Overdue ({overdueStats.overdueClientsCount})</span>
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
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#F8FAFC] text-[#263238] border border-[#E5E7EB] shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Send className="w-3.5 h-3.5 text-[#F26B38]" />
            <span>
              {selectedClientIds.length > 0
                ? `Dispatch Selected (${selectedClientIds.length})`
                : "Select Clients"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.refresh()}
            aria-label="Refresh Telemetry"
            className="flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-white border border-[#E5E7EB] text-[#64748B] hover:text-[#263238] hover:bg-[#F8FAFC] shadow-xs transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Telemetry Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>Total Events</span>
            <Radio className="w-3.5 h-3.5 text-[#94A3B8]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#263238] mt-2">{totalDispatches}</div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">Audited records</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>Sarvam Voice</span>
            <PhoneCall className="w-3.5 h-3.5 text-[#D95524]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#D95524] mt-2">{voiceCallsCount}</div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">Regional AI voice</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>WhatsApp</span>
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-2">{whatsappCount}</div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">Automated nudges</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>Direct Email</span>
            <Mail className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-sky-600 mt-2">{emailCount}</div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">SMTP statements</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>Client Reverts</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-600 mt-2">{revertsCount}</div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">Inbound responses</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-medium">
            <span>Disputes Flagged</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className={`text-xl sm:text-2xl font-bold mt-2 ${disputedCount > 0 ? "text-rose-600" : "text-[#263238]"}`}>
            {disputedCount}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-0.5">Partner escalated</div>
        </div>
      </div>

      {/* Main Switcher: Audit Ledger vs Target Clients Roster */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E5E7EB] rounded-2xl p-2.5 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("ledger")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === "ledger"
                ? "bg-[#FFF4EE] text-[#D95524] border border-[#FFEDD5] shadow-xs"
                : "text-[#64748B] hover:text-[#263238] hover:bg-[#F8FAFC]"
            }`}
          >
            Audit Ledger & Voice Stream ({communications.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("roster")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === "roster"
                ? "bg-[#FFF4EE] text-[#D95524] border border-[#FFEDD5] shadow-xs"
                : "text-[#64748B] hover:text-[#263238] hover:bg-[#F8FAFC]"
            }`}
          >
            Client Dispatch Roster ({clients.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={viewMode === "ledger" ? "Search dispatches, transcripts..." : "Search clients, GSTIN, phone..."}
            className="w-full min-h-[44px] pl-9 pr-3 py-2 text-xs bg-[#FAF9F5] border border-[#E5E7EB] rounded-xl text-[#263238] placeholder:text-[#94A3B8] focus:outline-hidden focus:border-[#F26B38] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* VIEW MODE 1: AUDIT LEDGER */}
      {viewMode === "ledger" && (
        <div className="space-y-4">
          {/* Sub-Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {[
              { id: "all", label: "All Logs", icon: Radio },
              { id: "voice", label: "Sarvam Voice Calls", icon: PhoneCall },
              { id: "whatsapp", label: "WhatsApp Follow-ups", icon: MessageSquare },
              { id: "email", label: "Direct Emails", icon: Mail },
              { id: "reverts", label: "Inbound Reverts", icon: ArrowDownLeft },
            ].map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl font-semibold whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? "bg-white text-[#D95524] border border-[#FDBA74] shadow-xs"
                      : "bg-white/60 text-[#64748B] hover:text-[#263238] hover:bg-white border border-[#E5E7EB]"
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5 text-[#F26B38]" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {filteredComms.length === 0 ? (
            <div className="text-center py-16 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs">
              <PhoneCall className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#263238]">No communication records found</p>
              <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
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
                    className="bg-white border border-[#E5E7EB] rounded-2xl p-4 space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-[#263238]">{item.clientName}</div>
                        <div className="text-[11px] font-mono text-[#64748B] mt-0.5">{item.recipient}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.channel === "VOICE"
                            ? "bg-[#FFF4EE] text-[#D95524] border border-[#FED7AA]"
                            : item.channel === "WHATSAPP"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : item.direction === "INBOUND"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-sky-50 text-sky-700 border border-sky-200"
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
                    <div className="text-xs text-[#475569] line-clamp-2 bg-[#FAF9F5] p-2.5 rounded-xl border border-[#E5E7EB]">
                      <span className="font-semibold text-[#263238]">{item.purpose}:</span>{" "}
                      {item.subject || item.content.slice(0, 100)}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#F1F5F9] text-[11px] text-[#64748B]">
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
                        className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-[#D95524] hover:text-[#C2410C] active:bg-[#FFF4EE] transition-colors"
                      >
                        Inspect Transcript →
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / Tablet Table View (hidden sm:block) */}
              <div className="hidden sm:block bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs text-[#475569]">
                  <thead className="bg-[#FAF9F5] border-b border-[#E5E7EB] text-[11px] uppercase tracking-wider text-[#64748B] font-semibold">
                    <tr>
                      <th className="px-5 py-3.5">Client & Target</th>
                      <th className="px-5 py-3.5">Channel / Direction</th>
                      <th className="px-5 py-3.5">Voice Audio Stream</th>
                      <th className="px-5 py-3.5">Sentiment / Status</th>
                      <th className="px-5 py-3.5">Dispatched At</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {filteredComms.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FAF9F5] transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-[#263238] text-sm">{item.clientName}</div>
                          <div className="text-[11px] font-mono text-[#64748B] mt-0.5">{item.recipient}</div>
                          {item.invoiceNumber && (
                            <span className="inline-block mt-1 text-[10px] bg-[#F1F5F9] text-[#475569] px-2 py-0.5 rounded font-mono border border-[#E2E8F0]">
                              #{item.invoiceNumber}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              item.channel === "VOICE"
                                ? "bg-[#FFF4EE] text-[#D95524] border border-[#FED7AA]"
                                : item.channel === "WHATSAPP"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : item.direction === "INBOUND"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-sky-50 text-sky-700 border border-sky-200"
                            }`}
                          >
                            {item.channel === "VOICE" && <PhoneCall className="w-3 h-3" />}
                            {item.channel === "WHATSAPP" && <MessageSquare className="w-3 h-3" />}
                            {item.channel === "EMAIL" && item.direction === "INBOUND" && <ArrowDownLeft className="w-3 h-3" />}
                            {item.channel === "EMAIL" && item.direction === "OUTBOUND" && <Mail className="w-3 h-3" />}
                            {item.direction === "INBOUND" ? "INBOUND REVERT" : item.channel}
                          </span>
                        </td>

                        <td className="px-5 py-4 min-w-[200px]">
                          {item.channel === "VOICE" ? (
                            <AudioPlayerBar
                              audioUrl={item.recordingUrl}
                              simulatedScript={item.transcript || "Namaste. This is TRUV Advisory calling regarding your pending statutory invoice."}
                            />
                          ) : (
                            <span className="text-[11px] text-[#94A3B8] italic">Text-based Channel</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          {item.sentiment ? (
                            <SentimentBadge sentiment={item.sentiment} />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#64748B]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              {item.status}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-[#64748B]">
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
                            className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-[#D95524] hover:text-[#C2410C] hover:bg-[#FFF4EE] transition-colors"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E5E7EB] p-4 rounded-2xl shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllClients}
                className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-xs font-bold text-[#263238] hover:bg-[#F8FAFC] border border-[#E5E7EB] transition-colors"
              >
                {selectedClientIds.length === clients.length ? (
                  <CheckSquare className="w-4 h-4 text-[#F26B38]" />
                ) : (
                  <Square className="w-4 h-4 text-[#94A3B8]" />
                )}
                <span>Select All ({clients.length})</span>
              </button>
              <span className="text-xs text-[#64748B]">
                {selectedClientIds.length} of {clients.length} clients selected
              </span>
            </div>

            {selectedClientIds.length > 0 && (
              <button
                type="button"
                onClick={() => openDispatch("SELECTED")}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-[#F26B38] hover:bg-[#D95524] text-white shadow-sm shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
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
                      ? "bg-[#FFF4EE]/30 border-[#F26B38] shadow-sm"
                      : "bg-white border-[#E5E7EB] hover:border-[#CBD5E1] shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-[#F26B38]" />
                        ) : (
                          <Square className="w-5 h-5 text-[#94A3B8]" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#263238] text-sm">{client.name}</h4>
                        <div className="text-xs text-[#64748B] font-mono mt-0.5">{client.phone}</div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5 truncate max-w-[190px]">{client.email}</div>
                      </div>
                    </div>

                    {client.isOverdue ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        ₹{client.overdueAmount.toLocaleString("en-IN")} Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">
                      Retainer: ₹{client.monthlyFee.toLocaleString("en-IN")}/mo
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDispatch("SINGLE", client.id);
                      }}
                      className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg text-[#D95524] hover:text-[#C2410C] font-semibold"
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-white border border-[#E5E7EB] rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl relative text-[#263238]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div>
                <h3 className="text-base font-bold text-[#263238] flex items-center gap-2">
                  <span>{inspectItem.clientName}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-[#FFF4EE] text-[#D95524] font-mono border border-[#FED7AA]">
                    {inspectItem.channel}
                  </span>
                </h3>
                <p className="text-xs text-[#64748B] font-mono mt-0.5">
                  Recipient: {inspectItem.recipient} • {new Date(inspectItem.createdAt).toLocaleString("en-IN")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectItem(null)}
                aria-label="Close dialog"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] text-[#64748B] hover:text-[#263238] flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audio Stream Player */}
            {inspectItem.channel === "VOICE" && (
              <div className="p-3 bg-[#FAF9F5] rounded-2xl border border-[#E5E7EB]">
                <div className="text-xs font-semibold text-[#263238] mb-2">Voice Recording Playback:</div>
                <AudioPlayerBar
                  audioUrl={inspectItem.recordingUrl}
                  simulatedScript={inspectItem.transcript || "Namaste. This is TRUV Advisory calling regarding your pending statutory invoice."}
                />
              </div>
            )}

            {/* Dual Color Transcript View */}
            {inspectItem.transcript ? (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Communication Payload & Audit Trail
                </h4>
                <pre className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E7EB] text-xs font-mono text-[#263238] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {inspectItem.content}
                </pre>
              </div>
            )}

            {/* Diagnostics Metadata */}
            {inspectItem.diagnostics && (
              <div className="text-xs text-[#64748B] bg-[#F8FAFC] p-3 rounded-xl border border-[#E5E7EB]">
                <div className="font-semibold text-[#263238] mb-1">Telemetry Diagnostics:</div>
                <div className="font-mono text-[11px] break-all">{inspectItem.diagnostics}</div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold bg-[#FAF9F5] hover:bg-[#F1F5F9] text-[#263238] border border-[#E5E7EB] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL DISPATCH MODAL */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-white border border-[#E5E7EB] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl relative text-[#263238]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div>
                <h3 className="text-base font-bold text-[#263238] flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-[#F26B38]" />
                  <span>Manual Outreach & Dispatch</span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Execute immediate multi-channel client communications with audit logging.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                aria-label="Close dialog"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] text-[#64748B] hover:text-[#263238] flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#263238]">Dispatch Target</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "ALL_OVERDUE", label: `All Overdue (${overdueStats.overdueClientsCount})` },
                  { id: "SELECTED", label: `Selected (${selectedClientIds.length})` },
                  { id: "ALL_CLIENTS", label: `All Clients (${clients.length})` },
                  { id: "SINGLE", label: "Single Client" },
                ].map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setDispatchTargetType(target.id as any)}
                    className={`min-h-[44px] p-2.5 rounded-xl text-left text-xs font-medium border transition-all ${
                      dispatchTargetType === target.id
                        ? "bg-[#FFF4EE] text-[#D95524] border-[#FDBA74] font-bold shadow-xs"
                        : "bg-[#FAF9F5] text-[#475569] border-[#E5E7EB] hover:bg-white"
                    }`}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Single Client Dropdown if Selected */}
            {dispatchTargetType === "SINGLE" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#263238]">Select Target Client</label>
                <select
                  value={singleClientId}
                  onChange={(e) => setSingleClientId(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 bg-[#FAF9F5] border border-[#E5E7EB] rounded-xl text-xs text-[#263238] focus:outline-hidden focus:border-[#F26B38]"
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Channel Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#263238]">Delivery Channel</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchChannel("VOICE")}
                  className={`min-h-[48px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "VOICE"
                      ? "bg-[#FFF4EE] text-[#D95524] border-[#FDBA74] font-bold shadow-xs"
                      : "bg-[#FAF9F5] text-[#475569] border-[#E5E7EB] hover:bg-white"
                  }`}
                >
                  <PhoneCall className="w-4 h-4 text-[#D95524]" />
                  <span className="text-xs">Sarvam Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchChannel("EMAIL")}
                  className={`min-h-[48px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "EMAIL"
                      ? "bg-sky-50 text-sky-700 border-sky-300 font-bold shadow-xs"
                      : "bg-[#FAF9F5] text-[#475569] border-[#E5E7EB] hover:bg-white"
                  }`}
                >
                  <Mail className="w-4 h-4 text-sky-600" />
                  <span className="text-xs">Direct Email</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchChannel("WHATSAPP")}
                  className={`min-h-[48px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                    dispatchChannel === "WHATSAPP"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs"
                      : "bg-[#FAF9F5] text-[#475569] border-[#E5E7EB] hover:bg-white"
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs">WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Workflow Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#263238]">Workflow Intent / Statutory Reason</label>
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
                        ? "bg-[#FFF4EE] text-[#D95524] border-[#FDBA74] font-bold shadow-xs"
                        : "bg-[#FAF9F5] text-[#475569] border-[#E5E7EB] hover:bg-white"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Note / Partner Memo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#263238]">
                Partner Memo / Custom Instruction (Optional)
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Please expedite payment before quarterly Section 43B(h) MSME cutoff."
                rows={2}
                className="w-full p-3 bg-[#FAF9F5] border border-[#E5E7EB] rounded-xl text-xs text-[#263238] placeholder:text-[#94A3B8] focus:outline-hidden focus:border-[#F26B38] focus:bg-white"
              />
            </div>

            {/* Results Alert */}
            {dispatchResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  dispatchResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {dispatchResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
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
                className="min-h-[48px] px-4 py-2.5 rounded-xl text-xs font-semibold text-[#64748B] hover:text-[#263238]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteDispatch}
                disabled={isDispatching}
                className="min-h-[48px] px-6 py-2.5 rounded-xl text-xs font-bold bg-[#F26B38] hover:bg-[#D95524] disabled:opacity-50 text-white shadow-sm shadow-orange-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
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
