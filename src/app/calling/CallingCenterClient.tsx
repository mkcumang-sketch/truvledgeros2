"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  PhoneCall,
  Clock,
  CheckCircle2,
  PhoneOff,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Filter,
  Plus,
  Play,
  Pause,
  XCircle,
  Search,
  Users,
  BarChart3,
  ListOrdered,
  History,
  FileCheck2,
  Check,
  ChevronRight,
  ChevronLeft,
  Info,
  ShieldCheck,
  Volume2,
  UserCheck,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Bot,
  Mic,
  Server,
  Zap,
  PhoneForwarded,
  ArrowRight,
  Layers,
  Settings2,
  FileText,
  BadgeAlert,
  Sliders,
  Cpu,
  Radio,
  PhoneIncoming,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrowserVoiceCallingModal } from "@/components/calling/BrowserVoiceCallingModal";

interface CallingCenterClientProps {
  initialMetrics: any;
  initialCampaigns: any[];
  initialScheduledCalls: any[];
  initialCallHistory: any[];
  initialFollowUps: any[];
  clients: any[];
  teamMembers: any[];
  tenantName: string;
  currentUserId: string;
}

export function CallingCenterClient({
  initialMetrics,
  initialCampaigns,
  initialScheduledCalls,
  initialCallHistory,
  initialFollowUps,
  clients,
  teamMembers,
  tenantName,
  currentUserId,
}: CallingCenterClientProps) {
  // Primary Tabs
  const [activeTab, setActiveTab] = useState<
    "studio" | "campaigns" | "queue" | "personas" | "logs" | "escalations"
  >("studio");

  // State
  const [metrics, setMetrics] = useState(initialMetrics);
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns);
  const [scheduledCalls, setScheduledCalls] = useState<any[]>(initialScheduledCalls);
  const [callHistory, setCallHistory] = useState<any[]>(initialCallHistory);
  const [followUps, setFollowUps] = useState<any[]>(initialFollowUps);

  // Engine & Provider Telemetry
  const [databaseAvailable, setDatabaseAvailable] = useState<boolean>(false);
  const [serverEnvironment, setServerEnvironment] = useState<"local" | "cloud">("local");
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean>(true);
  const [ollamaLatency, setOllamaLatency] = useState<number>(0);
  const [installedOllamaModels, setInstalledOllamaModels] = useState<string[]>([
    "llama3.2:3b",
    "gemma4:12b",
    "llama3:latest",
  ]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>("llama3.2:3b");
  const [customModelInput, setCustomModelInput] = useState<string>("");
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [ollamaHost, setOllamaHost] = useState<string>("http://localhost:11434");
  const [isCheckingOllama, setIsCheckingOllama] = useState<boolean>(false);

  // Live Studio Dialer State
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || "");
  const [customPhone, setCustomPhone] = useState<string>("");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("PRIYA");
  const [callPurpose, setCallPurpose] = useState<
    "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN"
  >("PAYMENT_RECOVERY");
  const [previewGreeting, setPreviewGreeting] = useState<string>("");

  // Browser Voice Calling Modal State
  const [isLiveCallModalOpen, setIsLiveCallModalOpen] = useState(false);
  const [modalCallProps, setModalCallProps] = useState<{
    clientName: string;
    clientId?: string;
    recipientPhone?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    amount?: number;
    dueDate?: string;
    reason?: "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN";
    direction?: "OUTBOUND" | "INBOUND";
    personaId?: string;
  }>({
    clientName: clients[0]?.name || "Practice Client",
    recipientPhone: clients[0]?.phone || "+919876543210",
    personaId: "PRIYA",
    reason: "PAYMENT_RECOVERY",
    direction: "OUTBOUND",
  });

  // Transcript drawer
  const [inspectingCall, setInspectingCall] = useState<any | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [logSentimentFilter, setLogSentimentFilter] = useState("ALL");

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignPurpose, setNewCampaignPurpose] = useState<
    "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN"
  >("PAYMENT_RECOVERY");
  const [campaignWindowStart, setCampaignWindowStart] = useState("10:00");
  const [campaignWindowEnd, setCampaignWindowEnd] = useState("18:00");

  // Fetch detected providers and local Ollama info
  const loadProviderTelemetry = async (host = ollamaHost) => {
    setIsCheckingOllama(true);
    try {
      const res = await fetch(`/api/voice/providers?host=${encodeURIComponent(host)}`);
      if (res.ok) {
        const data = await res.json();
        setDatabaseAvailable(Boolean(data.databaseAvailable));
        setServerEnvironment(data.serverEnvironment || "local");

        if (data.ollama) {
          setOllamaAvailable(Boolean(data.ollama.isAvailable));
          setOllamaLatency(data.ollama.latencyMs || 0);
          if (Array.isArray(data.ollama.installedModels) && data.ollama.installedModels.length > 0) {
            setInstalledOllamaModels(data.ollama.installedModels);
            if (!isCustomModel && !data.ollama.installedModels.includes(selectedOllamaModel)) {
              setSelectedOllamaModel(data.ollama.installedModels[0]);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to query voice providers:", err);
      setOllamaAvailable(false);
    } finally {
      setIsCheckingOllama(false);
    }
  };

  useEffect(() => {
    loadProviderTelemetry();
  }, []);

  // Update preview greeting when client or persona changes
  const activeClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || clients[0];
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (!activeClient) return;
    const invNo = activeClient.latestInvoice?.invoiceNumber || "INV-2026-089";
    const amt = activeClient.latestInvoice?.amount
      ? `₹${activeClient.latestInvoice.amount.toLocaleString("en-IN")}`
      : "₹45,000";

    if (selectedPersonaId === "PRIYA") {
      setPreviewGreeting(
        `Namaste ${activeClient.name}. This is Priya Sharma calling from ${tenantName}. I am following up on invoice #${invNo} for ${amt} which is pending settlement.`
      );
    } else if (selectedPersonaId === "RAHUL") {
      setPreviewGreeting(
        `Good afternoon. Rahul Verma here from ${tenantName}. Reaching out to ensure your compliance filing schedule is on track for this tax cycle.`
      );
    } else {
      setPreviewGreeting(
        `Namaste! Ananya Sen here from ${tenantName}. Welcome to our advisory practice. Reaching out to complete your ledger onboarding.`
      );
    }
  }, [activeClient, selectedPersonaId, tenantName]);

  // Audio preview (TTS)
  const [isAuditioning, setIsAuditioning] = useState(false);
  const handleAuditionGreeting = (text: string, persona: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Browser SpeechSynthesis is not supported in this environment.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = persona === "PRIYA" ? 1.0 : 0.95;
    utterance.pitch = persona === "PRIYA" ? 1.1 : 0.95;

    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((v) => v.lang.includes("IN") || v.lang.includes("hi") || v.name.includes("India")) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0];
    if (voice) utterance.voice = voice;

    setIsAuditioning(true);
    utterance.onend = () => setIsAuditioning(false);
    utterance.onerror = () => setIsAuditioning(false);
    window.speechSynthesis.speak(utterance);
  };

  // Launch browser call (Outbound or Inbound simulation)
  const launchCallForClient = (
    client: any,
    reason = callPurpose,
    persona = selectedPersonaId,
    direction: "OUTBOUND" | "INBOUND" = "OUTBOUND"
  ) => {
    setModalCallProps({
      clientName: client?.name || "Practice Client",
      clientId: client?.id,
      recipientPhone: customPhone || client?.phone || "+919876543210",
      invoiceId: client?.latestInvoice?.id,
      invoiceNumber: client?.latestInvoice?.invoiceNumber,
      amount: client?.latestInvoice?.amount || 50000,
      dueDate: client?.latestInvoice?.dueDate,
      reason,
      direction,
      personaId: persona,
    });
    setIsLiveCallModalOpen(true);
  };

  const handleCallFinished = (summary: any) => {
    // Add call to callHistory
    const newLogItem = {
      id: `call-${Date.now()}`,
      channel: "VOICE",
      direction: modalCallProps.direction || "OUTBOUND",
      status: "DELIVERED",
      subject: `${modalCallProps.direction === "INBOUND" ? "Inbound Client Session" : "Outbound AI Call"} — ${summary.clientName || "Client"}`,
      recipient: modalCallProps.recipientPhone || "+919876543210",
      createdAt: new Date().toISOString(),
      durationSeconds: summary.durationSeconds || 60,
      sentiment: summary.sentiment || "POSITIVE",
      transcript: summary.transcriptText || "Call transcript recorded in browser session.",
      client: {
        id: modalCallProps.clientId || "mock-id",
        name: modalCallProps.clientName,
        phone: modalCallProps.recipientPhone,
        email: "client@truv.in",
      },
      invoice: modalCallProps.invoiceNumber
        ? {
            id: modalCallProps.invoiceId || "inv-id",
            invoiceNumber: modalCallProps.invoiceNumber,
            totalAmount: modalCallProps.amount || 0,
          }
        : null,
    };
    setCallHistory((prev) => [newLogItem, ...prev]);

    // Update aggregate metrics
    setMetrics((prev: any) => ({
      ...prev,
      callsAttemptedCount: (prev.callsAttemptedCount || 0) + 1,
      completedCallsCount: (prev.completedCallsCount || 0) + 1,
      answeredCallsCount: (prev.answeredCallsCount || 0) + 1,
      totalDurationMinutes: +(
        (prev.totalDurationMinutes || 0) +
        (summary.durationSeconds || 60) / 60
      ).toFixed(1),
    }));
  };

  // Format dates to IST
  const formatIST = (dateInput: string | Date | null | undefined) => {
    if (!dateInput) return "—";
    try {
      const d = new Date(dateInput);
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return String(dateInput);
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return callHistory.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.recipient?.includes(searchQuery) ||
        item.subject?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSentiment =
        logSentimentFilter === "ALL" || item.sentiment === logSentimentFilter;

      return matchesSearch && matchesSentiment;
    });
  }, [callHistory, searchQuery, logSentimentFilter]);

  const activeModelDisplay = isCustomModel
    ? customModelInput || "custom"
    : selectedOllamaModel;

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F1F5F9] pb-24">
      {/* Database Offline / Session Demo Mode Notice Banner */}
      {!databaseAvailable && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Local Session Demo Mode:</strong> Postgres DB is offline. Transcripts, campaigns, and call dispositions are actively tracked in session memory. Connect database to persist across server restarts.
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 w-fit">
            Zero-Loss Session
          </span>
        </div>
      )}

      {/* Top Header */}
      <div className="border-b border-white/[0.08] bg-[#0B0F19]/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                    AI Calling Center
                  </h1>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
                    Zero-Budget Architecture
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Autonomous Voice System, Live Browser Studio & Omnichannel Calling Ledger for {tenantName}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Engine Telemetry & Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs">
              <div
                className={`w-2 h-2 rounded-full ${
                  ollamaAvailable ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="text-[#94A3B8]">AI Engine:</span>
              <span className="font-mono font-medium text-emerald-300">
                {ollamaAvailable ? `Ollama (${activeModelDisplay})` : "Deterministic Engine"}
              </span>
            </div>

            <Button
              onClick={() => {
                if (activeClient) launchCallForClient(activeClient, callPurpose, selectedPersonaId, "OUTBOUND");
              }}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs h-9 px-4 rounded-lg flex items-center gap-2 shadow-sm transition-all"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Launch Studio Call</span>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 mt-4 overflow-x-auto no-scrollbar border-t border-white/[0.06] pt-2">
          {[
            { id: "studio", label: "Live Voice Studio", icon: PhoneCall },
            { id: "campaigns", label: "Active Campaigns", icon: Zap, badge: campaigns.length },
            { id: "queue", label: "Call Outbox", icon: ListOrdered, badge: scheduledCalls.length },
            { id: "personas", label: "AI Agent Studio", icon: Bot, badge: "3" },
            { id: "logs", label: "Call Transcripts & Logs", icon: History, badge: callHistory.length },
            { id: "escalations", label: "Partner Escalations", icon: BadgeAlert, badge: followUps.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap min-h-[40px] ${
                  isActive
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "text-[#94A3B8] hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-[#94A3B8]"}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded ${
                      isActive ? "bg-amber-400/20 text-amber-200" : "bg-white/[0.06] text-[#94A3B8]"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* KPI Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-xl bg-[#0F1422] border border-white/[0.08] relative overflow-hidden">
            <div className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">
              Calls Attempted
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {metrics.callsAttemptedCount || 0}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{metrics.answeredCallsCount || 0} answered ({metrics.answerRatePct || 0}%)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F1422] border border-white/[0.08] relative overflow-hidden">
            <div className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">
              Total Airtime
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {metrics.totalDurationMinutes || 0}m
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>₹0 Telecom Cost (Browser Audio)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F1422] border border-white/[0.08] relative overflow-hidden">
            <div className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">
              Recovered Promissory
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              ₹{(metrics.totalRecoveredAmount || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-2">
              From automated payment reminders
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F1422] border border-white/[0.08] relative overflow-hidden">
            <div className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">
              Escalations
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {followUps.length}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Partner intervention needed</span>
            </div>
          </div>
        </div>

        {/* TAB 1: LIVE VOICE STUDIO */}
        {activeTab === "studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Interactive Dial Pad & Client Selector */}
            <div className="lg:col-span-2 space-y-4">
              <div className="p-5 rounded-2xl bg-[#0F1422] border border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                      Interactive Voice Studio & Browser Calling
                    </h2>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    Zero PSTN Charge
                  </span>
                </div>

                {/* Local Ollama Model Configuration Strip */}
                <div className="mb-4 p-3.5 rounded-xl bg-[#07090E] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        ollamaAvailable ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        Local Ollama Host: <code className="text-amber-400">{ollamaHost}</code>
                        {ollamaAvailable && (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            ({ollamaLatency}ms)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {ollamaAvailable
                          ? "On-device private inference active. No cloud tokens billed."
                          : "Ollama not detected on localhost:11434. Running in rule-engine fallback mode."}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={isCustomModel ? "CUSTOM" : selectedOllamaModel}
                      onChange={(e) => {
                        if (e.target.value === "CUSTOM") {
                          setIsCustomModel(true);
                        } else {
                          setIsCustomModel(false);
                          setSelectedOllamaModel(e.target.value);
                        }
                      }}
                      className="h-8 px-2.5 rounded-lg bg-[#0F1422] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {installedOllamaModels.map((m) => (
                        <option key={m} value={m}>
                          Model: {m}
                        </option>
                      ))}
                      <option value="CUSTOM">Custom Model...</option>
                    </select>

                    {isCustomModel && (
                      <input
                        type="text"
                        placeholder="Model tag (e.g. mistral)"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        className="h-8 px-2 rounded-lg bg-[#0F1422] border border-white/[0.12] text-xs text-white w-28 focus:outline-none"
                      />
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadProviderTelemetry()}
                      disabled={isCheckingOllama}
                      className="h-8 px-2.5 text-xs text-[#94A3B8] hover:text-white border-white/[0.1]"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingOllama ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select Client */}
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                      Target Practice Client
                    </label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#07090E] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.isOverdue ? `(Overdue ₹${c.overdueAmount?.toLocaleString("en-IN")})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Indian Mobile Number */}
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                      Recipient Phone (E.164 Indian Standard)
                    </label>
                    <input
                      type="tel"
                      value={customPhone || activeClient?.phone || "+919876543210"}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="+919876543210"
                      className="w-full h-10 px-3 rounded-lg bg-[#07090E] border border-white/[0.12] text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* AI Agent Persona */}
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                      Autonomous AI Agent Persona
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "PRIYA", name: "Priya Sharma", role: "Recovery" },
                        { id: "RAHUL", name: "Rahul Verma", role: "GST Filing" },
                        { id: "ANANYA", name: "Ananya Sen", role: "Onboarding" },
                      ].map((persona) => (
                        <button
                          key={persona.id}
                          type="button"
                          onClick={() => setSelectedPersonaId(persona.id)}
                          className={`p-2 rounded-lg text-left border transition-all ${
                            selectedPersonaId === persona.id
                              ? "bg-amber-500/15 border-amber-400 text-white"
                              : "bg-[#07090E] border-white/[0.08] text-[#94A3B8] hover:text-white"
                          }`}
                        >
                          <div className="text-xs font-bold leading-none">{persona.name}</div>
                          <div className="text-[10px] text-[#94A3B8] mt-1">{persona.role}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Campaign / Call Purpose */}
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                      Call Objective & Strategy
                    </label>
                    <select
                      value={callPurpose}
                      onChange={(e) => setCallPurpose(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-lg bg-[#07090E] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="PAYMENT_RECOVERY">Payment Recovery & Overdue Invoices</option>
                      <option value="DOCUMENT_COLLECTION">Document & Bank Statement Collection</option>
                      <option value="GST_DEADLINE">GST / TDS Statutory Filing Reminders</option>
                      <option value="CLIENT_CHECKIN">Quarterly Client Advisory Check-in</option>
                    </select>
                  </div>
                </div>

                {/* Live Context & Script Preview */}
                <div className="mt-5 p-4 rounded-xl bg-[#07090E] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#94A3B8] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Dynamic Opening Script (AI Persona Preview)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAuditionGreeting(previewGreeting, selectedPersonaId)}
                      disabled={isAuditioning}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {isAuditioning ? "Speaking Audio..." : "Audition Voice (TTS)"}
                    </button>
                  </div>
                  <div className="text-xs text-[#CBD5E1] bg-white/[0.02] p-3 rounded-lg border border-white/[0.04] italic">
                    &ldquo;{previewGreeting}&rdquo;
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-[#94A3B8]">
                    <div>
                      <span className="text-[#64748B]">Client City:</span>{" "}
                      <span className="text-white font-medium">{activeClient?.city || "Mumbai"}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Invoice:</span>{" "}
                      <span className="text-amber-300 font-mono">
                        {activeClient?.latestInvoice?.invoiceNumber || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Amount:</span>{" "}
                      <span className="text-emerald-400 font-mono">
                        ₹{(activeClient?.latestInvoice?.amount || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Disclaimer:</span>{" "}
                      <span className="text-white font-medium">TRAI Compliant</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <div className="text-xs text-[#94A3B8] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Quiet Hours Enforced: 10:00 AM – 6:00 PM IST</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => launchCallForClient(activeClient, "CLIENT_CHECKIN", selectedPersonaId, "INBOUND")}
                      className="border-white/[0.1] hover:bg-white/[0.05] text-white text-xs h-10 px-4 rounded-lg flex items-center gap-2"
                    >
                      <PhoneIncoming className="w-4 h-4 text-blue-400" />
                      <span>Simulate Inbound Call</span>
                    </Button>

                    <Button
                      onClick={() => launchCallForClient(activeClient, callPurpose, selectedPersonaId, "OUTBOUND")}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs h-10 px-5 rounded-lg flex items-center gap-2 shadow-lg shadow-amber-500/10"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Start Outbound Call</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: Zero-Budget Architecture Overview & Fallback Tree */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#0F1422] border border-white/[0.08] space-y-4">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Zero-Budget Engine Stack
                  </h3>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.06] flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        Local Ollama Engine
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded ${
                            ollamaAvailable
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {ollamaAvailable ? "Active" : "Offline"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Target Model: <code className="text-amber-300">{activeModelDisplay}</code> on localhost:11434. 100% on-device, zero API charges.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.06] flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">Browser Web Speech & Audio</div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Client speech converted via HTML5 Web Speech STT and browser SpeechSynthesis. Works with or without microphone.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.06] flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                      <PhoneForwarded className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">Carrier Webhook Architecture</div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        TwiML and JSON route live at <code className="text-amber-300">/api/voice/inbound</code>. Notice: Receiving real phone calls requires an external SIP trunk (Twilio/Exotel).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.06] text-[11px] text-[#94A3B8] flex items-center justify-between">
                  <span>PSTN Telephony Mode:</span>
                  <span className="font-mono text-emerald-400 font-semibold">Zero-Cost Simulation</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE CAMPAIGNS */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Automated Calling Campaigns
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Orchestrated outbound campaigns scheduled across client portfolios (Simulation / Browser Mode)
                </p>
              </div>
              <Button
                onClick={() => setIsWizardOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs h-9 px-4 rounded-lg flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Campaign</span>
              </Button>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0F1422] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.02] text-[#94A3B8] border-b border-white/[0.08] uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Campaign Name</th>
                      <th className="px-5 py-3.5">Objective</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Calling Window</th>
                      <th className="px-5 py-3.5">Language</th>
                      <th className="px-5 py-3.5">Target Clients</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-[#CBD5E1]">
                    {campaigns.map((camp) => (
                      <tr key={camp.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{camp.name}</div>
                          <div className="text-[11px] text-[#94A3B8]">
                            Owner: {camp.assignedOwner?.name || "Managing Partner"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-amber-300">
                            {camp.purpose?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            {camp.status || "ACTIVE"}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px]">
                          {camp.callingWindowStart || "10:00"} – {camp.callingWindowEnd || "18:00"} IST
                        </td>
                        <td className="px-5 py-4 text-[11px] text-white">
                          {camp.languagePreference || "HINGLISH"}
                        </td>
                        <td className="px-5 py-4 font-mono text-white">
                          {camp._count?.scheduledCalls || camp.totalClients || 0} calls
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveTab("queue");
                            }}
                            className="text-[11px] h-7 border-white/[0.1] text-white hover:bg-white/[0.05]"
                          >
                            View Queue
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CALL OUTBOX & QUEUE */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Scheduled Call Outbox
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Calls queued for automatic simulation or browser dispatch (10:00 – 18:00 IST)
                </p>
              </div>
              <div className="text-xs text-emerald-400 font-mono">
                {scheduledCalls.length} calls in queue
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0F1422] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.02] text-[#94A3B8] border-b border-white/[0.08] uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Client</th>
                      <th className="px-5 py-3.5">Phone Number</th>
                      <th className="px-5 py-3.5">Campaign</th>
                      <th className="px-5 py-3.5">Scheduled Window</th>
                      <th className="px-5 py-3.5">Attempts</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-[#CBD5E1]">
                    {scheduledCalls.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{item.client?.name || "Client"}</div>
                          <div className="text-[11px] text-[#94A3B8]">{item.client?.email || "—"}</div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-amber-300">
                          {item.recipientPhone || item.client?.phone || "+919876543210"}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[11px] text-white">
                            {item.campaign?.name || "Direct Follow-up"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[11px] font-mono text-[#94A3B8]">
                          {formatIST(item.scheduledFor)}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs">
                          {item.attemptsCount || 0} / {item.maxAttempts || 2}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              launchCallForClient(
                                item.client || { name: "Client", phone: item.recipientPhone },
                                "PAYMENT_RECOVERY"
                              );
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[11px] h-7 px-3 rounded flex items-center gap-1.5 ml-auto"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Call in Browser</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AI AGENT PERSONAS */}
        {activeTab === "personas" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Autonomous AI Voice Personas
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Customized Indian Chartered Accountant firm personas tuned for collection, statutory reminders, and onboarding
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  id: "PRIYA",
                  name: "Priya Sharma",
                  title: "Senior Payment Recovery Specialist",
                  desc: "Firm, polite, and authoritative. Expert in handling payment delays, RTGS commitments, and invoice dispute resolution.",
                  traits: ["Authoritative", "Empathetic", "Bilingual Hinglish"],
                  pitch: 1.05,
                  rate: 1.0,
                  greeting:
                    "Namaste, this is Priya Sharma calling from TRUV Advisory. I am reaching out regarding your pending invoice settlement.",
                },
                {
                  id: "RAHUL",
                  name: "Rahul Verma",
                  title: "Tax & GST Compliance Officer",
                  desc: "Precision-focused, regulatory clarity. Specializes in GSTR-1, GSTR-3B, Form 3CD, and Advance Tax deadlines.",
                  traits: ["Strict Deadline Focus", "Formal", "TRAI Compliant"],
                  pitch: 0.95,
                  rate: 0.98,
                  greeting:
                    "Good afternoon, this is Rahul Verma from TRUV CA firm. Reaching out to confirm your statutory tax documentation.",
                },
                {
                  id: "ANANYA",
                  name: "Ananya Sen",
                  title: "Client Onboarding & Relations",
                  desc: "Warm, welcoming, consultative. Guides new business owners through KYC, document submission, and ledger configuration.",
                  traits: ["Warm", "Consultative", "Hinglish/English"],
                  pitch: 1.1,
                  rate: 1.02,
                  greeting:
                    "Namaste! Ananya Sen here from TRUV Advisory. Welcome to our practice! I am assisting with your onboarding checklist.",
                },
              ].map((persona) => (
                <div
                  key={persona.id}
                  className="p-5 rounded-2xl bg-[#0F1422] border border-white/[0.08] flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                        {persona.name[0]}
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-[#94A3B8]">
                        Pitch: {persona.pitch}x
                      </span>
                    </div>

                    <div className="mt-3">
                      <h3 className="font-bold text-white text-sm">{persona.name}</h3>
                      <div className="text-xs text-amber-400 font-medium">{persona.title}</div>
                      <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">{persona.desc}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {persona.traits.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-[#CBD5E1] border border-white/[0.06]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleAuditionGreeting(persona.greeting, persona.id)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Audition Voice</span>
                    </button>

                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedPersonaId(persona.id);
                        setActiveTab("studio");
                      }}
                      className="text-[11px] h-7 bg-white/[0.05] hover:bg-white/[0.1] text-white"
                    >
                      Use in Studio
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: CALL TRANSCRIPTS & LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Call Transcripts & Audit Ledger
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Dual-color transcript records, client sentiment, and compliance timestamps
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search client or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 px-3 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white placeholder-[#64748B] focus:outline-none"
                />
                <select
                  value={logSentimentFilter}
                  onChange={(e) => setLogSentimentFilter(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Sentiments</option>
                  <option value="POSITIVE">Positive</option>
                  <option value="NEUTRAL">Neutral</option>
                  <option value="DISPUTE">Dispute</option>
                  <option value="DO_NOT_CALL">Opt Out / DND</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0F1422] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.02] text-[#94A3B8] border-b border-white/[0.08] uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Client & Call Info</th>
                      <th className="px-5 py-3.5">Duration</th>
                      <th className="px-5 py-3.5">Sentiment</th>
                      <th className="px-5 py-3.5">Timestamp (IST)</th>
                      <th className="px-5 py-3.5">Transcript Snippet</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-[#CBD5E1]">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{log.client?.name || "Client"}</div>
                          <div className="text-[11px] text-[#94A3B8] font-mono">{log.recipient}</div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs">
                          {log.durationSeconds || 0}s
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.sentiment === "POSITIVE"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : log.sentiment === "DISPUTE" || log.sentiment === "DISPUTING"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : log.sentiment === "DO_NOT_CALL"
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                : "bg-white/[0.05] text-[#94A3B8] border border-white/[0.1]"
                            }`}
                          >
                            {log.sentiment || "COMPLETED"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[11px] font-mono text-[#94A3B8]">
                          {formatIST(log.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-[#94A3B8] max-w-xs truncate">
                          {log.transcript || "Call completed in browser."}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setInspectingCall(log)}
                            className="text-[11px] h-7 border-white/[0.1] text-white hover:bg-white/[0.05]"
                          >
                            Inspect Transcript
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PARTNER ESCALATIONS */}
        {activeTab === "escalations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Partner Escalation Tasks
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Automated tasks generated when AI identifies billing disputes, callbacks, or opt-out requests
                </p>
              </div>
              <span className="text-xs font-mono text-amber-400">{followUps.length} pending tasks</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {followUps.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-[#0F1422] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                        High Priority
                      </span>
                      <span className="text-xs text-[#64748B]">•</span>
                      <span className="text-xs text-white font-medium">{task.client?.name}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{task.title}</div>
                    <p className="text-xs text-[#94A3B8] max-w-2xl">{task.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        launchCallForClient(
                          task.client || { name: "Client", phone: "+919876543210" },
                          "PAYMENT_RECOVERY"
                        );
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs h-8 px-3 rounded flex items-center gap-1.5"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call Client in Browser</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transcript Inspection Drawer Modal */}
      {inspectingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0B0F19] border border-white/[0.12] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-sm font-bold text-white">Full Voice Transcript</h3>
                <div className="text-xs text-[#94A3B8]">
                  {inspectingCall.client?.name} • {formatIST(inspectingCall.createdAt)}
                </div>
              </div>
              <button
                onClick={() => setInspectingCall(null)}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 bg-[#07090E]">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-[#94A3B8] font-mono leading-relaxed whitespace-pre-wrap">
                {inspectingCall.transcript}
              </div>

              <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-xs text-[#94A3B8]">
                <div>
                  <span className="text-[#64748B]">Duration:</span>{" "}
                  <span className="text-white font-mono">{inspectingCall.durationSeconds}s</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Sentiment:</span>{" "}
                  <span className="text-emerald-400 font-semibold">{inspectingCall.sentiment}</span>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectingCall(null)}
                className="text-xs text-white border-white/[0.1]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0B0F19] border border-white/[0.12] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-sm font-bold text-white">Create Automated Calling Campaign</h3>
                <div className="text-xs text-[#94A3B8]">
                  Zero-budget batch voice outreach (Simulated dispatch & browser calling)
                </div>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 bg-[#07090E]">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. FY26 Advance Tax & GST Q3 Reconciliation"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Objective
                </label>
                <select
                  value={newCampaignPurpose}
                  onChange={(e) => setNewCampaignPurpose(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white focus:outline-none"
                >
                  <option value="PAYMENT_RECOVERY">Payment Recovery</option>
                  <option value="DOCUMENT_COLLECTION">Document Collection</option>
                  <option value="GST_DEADLINE">GST Deadline</option>
                  <option value="CLIENT_CHECKIN">Client Check-in</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Calling Window (TRAI Quiet Hours Compliance)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={campaignWindowStart}
                    onChange={(e) => setCampaignWindowStart(e.target.value)}
                    className="h-10 px-3 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white font-mono"
                  />
                  <input
                    type="time"
                    value={campaignWindowEnd}
                    onChange={(e) => setCampaignWindowEnd(e.target.value)}
                    className="h-10 px-3 rounded-lg bg-[#0F1422] border border-white/[0.1] text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
              <span className="text-xs text-[#94A3B8]">Target: {clients.length} Practice Clients</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsWizardOpen(false)}
                  className="text-xs text-white border-white/[0.1]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const newCamp = {
                      id: `camp-${Date.now()}`,
                      name: newCampaignName || "Automated Follow-up Campaign",
                      purpose: newCampaignPurpose,
                      status: "ACTIVE",
                      callingWindowStart: campaignWindowStart,
                      callingWindowEnd: campaignWindowEnd,
                      languagePreference: "HINGLISH",
                      totalClients: clients.length,
                      assignedOwner: { name: "Managing Partner" },
                      _count: { scheduledCalls: clients.length },
                    };
                    setCampaigns((prev) => [newCamp, ...prev]);
                    setIsWizardOpen(false);
                    setNewCampaignName("");
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
                >
                  Create & Launch
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Browser Calling Modal */}
      <BrowserVoiceCallingModal
        isOpen={isLiveCallModalOpen}
        onClose={() => setIsLiveCallModalOpen(false)}
        clientName={modalCallProps.clientName}
        clientId={modalCallProps.clientId}
        recipientPhone={modalCallProps.recipientPhone}
        invoiceId={modalCallProps.invoiceId}
        invoiceNumber={modalCallProps.invoiceNumber}
        amount={modalCallProps.amount}
        dueDate={modalCallProps.dueDate}
        reason={modalCallProps.reason}
        direction={modalCallProps.direction}
        personaId={modalCallProps.personaId}
        ollamaModel={activeModelDisplay}
        customOllamaHost={ollamaHost}
        onCallCompleted={handleCallFinished}
      />
    </div>
  );
}
