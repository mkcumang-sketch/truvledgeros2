"use client";

import React, { useState, useMemo } from "react";
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
} from "lucide-react";

interface CallingCampaignsClientProps {
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

export function CallingCampaignsClient({
  initialMetrics,
  initialCampaigns,
  initialScheduledCalls,
  initialCallHistory,
  initialFollowUps,
  clients,
  teamMembers,
  tenantName,
  currentUserId,
}: CallingCampaignsClientProps) {
  // Navigation / active section
  const [activeTab, setActiveTab] = useState<"overview" | "queue" | "history" | "followups">("overview");

  // State
  const [metrics, setMetrics] = useState(initialMetrics);
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns);
  const [scheduledCalls, setScheduledCalls] = useState<any[]>(initialScheduledCalls);
  const [callHistory, setCallHistory] = useState<any[]>(initialCallHistory);
  const [followUps, setFollowUps] = useState<any[]>(initialFollowUps);

  // Filters
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [followUpQueue, setFollowUpQueue] = useState<string>("ALL");

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Wizard Form fields
  const [campaignName, setCampaignName] = useState("");
  const [campaignPurpose, setCampaignPurpose] = useState<"PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN">("PAYMENT_RECOVERY");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(currentUserId);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(true);
  const [clientSearchInWizard, setClientSearchInWizard] = useState("");
  const [isImmediateDispatch, setIsImmediateDispatch] = useState(true);
  const [scheduledDateStr, setScheduledDateStr] = useState("");
  const [scheduledTimeStr, setScheduledTimeStr] = useState("11:00");
  const [callingWindowStart, setCallingWindowStart] = useState("10:00");
  const [callingWindowEnd, setCallingWindowEnd] = useState("18:00");
  const [retryLimit, setRetryLimit] = useState(2);
  const [retryIntervalMinutes, setRetryIntervalMinutes] = useState(120);
  const [languagePref, setLanguagePref] = useState<"HINGLISH" | "HINDI" | "ENGLISH">("HINGLISH");
  const [wizardEligibility, setWizardEligibility] = useState<any>(null);
  const [confirmedRisk, setConfirmedRisk] = useState(false);

  // Reschedule Modal state
  const [rescheduleCallItem, setRescheduleCallItem] = useState<any | null>(null);
  const [rescheduleDateStr, setRescheduleDateStr] = useState("");
  const [rescheduleTimeStr, setRescheduleTimeStr] = useState("11:30");
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Transcript drawer
  const [inspectingCall, setInspectingCall] = useState<any | null>(null);

  // Follow-up resolution modal
  const [resolvingTaskId, setResolvingTaskId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  // Trigger sweep loading state
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepFeedback, setSweepFeedback] = useState<string | null>(null);

  // Helper to format timestamps to Indian Standard Time (Asia/Kolkata)
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

  // Filtered clients inside the wizard
  const wizardFilteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (filterOverdueOnly && !c.isOverdue) return false;
      if (clientSearchInWizard) {
        const q = clientSearchInWizard.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.city?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [clients, filterOverdueOnly, clientSearchInWizard]);

  // Filtered scheduled calls queue
  const filteredScheduledCalls = useMemo(() => {
    return scheduledCalls.filter((c) => {
      if (selectedCampaignFilter !== "ALL" && c.campaignId !== selectedCampaignFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const clientName = c.client?.name?.toLowerCase() || "";
        const clientPhone = c.client?.phone || "";
        return clientName.includes(q) || clientPhone.includes(q);
      }
      return true;
    });
  }, [scheduledCalls, selectedCampaignFilter, searchQuery]);

  // Filtered follow-up tasks
  const filteredFollowUps = useMemo(() => {
    const now = new Date();
    return followUps.filter((task) => {
      if (followUpQueue === "RESOLVED") return task.status === "COMPLETED";
      if (task.status === "COMPLETED") return false;

      if (followUpQueue === "CALLBACK_REQUESTED") return task.title.includes("Callback");
      if (followUpQueue === "NO_ANSWER" || followUpQueue === "FAILED_ATTEMPTS") return task.title.includes("Unanswered") || task.title.includes("Exhausted");
      if (followUpQueue === "OVERDUE") return task.dueDate && new Date(task.dueDate) < now;
      if (followUpQueue === "AWAITING_CLIENT_RESPONSE") return task.title.includes("Follow-up");
      return true;
    });
  }, [followUps, followUpQueue]);

  // Execute manual scheduler sweep
  const handleTriggerSweep = async () => {
    setIsSweeping(true);
    setSweepFeedback(null);
    try {
      const res = await fetch("/api/voice/scheduled-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TRIGGER_SWEEP", forceIgnoreWindow: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setSweepFeedback(`Sweep finished: ${data.sweepResult.dispatched} dispatched, ${data.sweepResult.answered} answered, ${data.sweepResult.retried} retried, ${data.sweepResult.tasksCreated} tasks created.`);
        // Refresh queue
        refreshData();
      } else {
        setSweepFeedback(`Sweep failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setSweepFeedback(`Error: ${err.message}`);
    } finally {
      setIsSweeping(false);
    }
  };

  // Refresh client data from server
  const refreshData = async () => {
    try {
      const [resCamps, resCalls, resTasks] = await Promise.all([
        fetch("/api/voice/campaigns").then((r) => r.json()),
        fetch("/api/voice/scheduled-calls").then((r) => r.json()),
        fetch("/api/voice/follow-ups").then((r) => r.json()),
      ]);

      if (resCamps.campaigns) setCampaigns(resCamps.campaigns);
      if (resCamps.metrics) setMetrics(resCamps.metrics);
      if (resCalls.calls) setScheduledCalls(resCalls.calls);
      if (resTasks.tasks) setFollowUps(resTasks.tasks);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  // Step 2 client selection helpers
  const handleToggleClient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const ids = wizardFilteredClients.map((c) => c.id);
    setSelectedClientIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleDeselectAll = () => {
    setSelectedClientIds([]);
  };

  // Validate eligibility before Step 5
  const handleProceedToReview = async () => {
    setIsSubmitting(true);
    setWizardError(null);
    try {
      const res = await fetch("/api/voice/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "VALIDATE_ELIGIBILITY",
          clientIds: selectedClientIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eligibility validation failed");
      setWizardEligibility(data.eligibility);
      setWizardStep(5);
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch campaign
  const handleLaunchCampaign = async () => {
    if (!confirmedRisk) {
      setWizardError("Please confirm review of the calling campaign parameters.");
      return;
    }

    setIsSubmitting(true);
    setWizardError(null);

    let scheduledAt: string | null = null;
    if (!isImmediateDispatch && scheduledDateStr) {
      scheduledAt = `${scheduledDateStr}T${scheduledTimeStr}:00.000Z`;
    }

    try {
      const res = await fetch("/api/voice/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          purpose: campaignPurpose,
          description: campaignDescription,
          clientIds: selectedClientIds,
          scheduledAt,
          callingWindowStart,
          callingWindowEnd,
          retryLimit,
          retryIntervalMinutes,
          languagePreference: languagePref,
          assignedOwnerId: selectedOwnerId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");

      // Success! Close wizard and refresh
      setIsWizardOpen(false);
      resetWizard();
      refreshData();
      setActiveTab("queue");
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setCampaignName("");
    setCampaignPurpose("PAYMENT_RECOVERY");
    setCampaignDescription("");
    setSelectedClientIds([]);
    setIsImmediateDispatch(true);
    setScheduledDateStr("");
    setWizardEligibility(null);
    setConfirmedRisk(false);
    setWizardError(null);
  };

  // Reschedule call action
  const handleExecuteReschedule = async () => {
    if (!rescheduleCallItem || !rescheduleDateStr) return;
    setIsRescheduling(true);
    try {
      const targetUtc = new Date(`${rescheduleDateStr}T${rescheduleTimeStr}:00`).toISOString();
      const res = await fetch("/api/voice/scheduled-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESCHEDULE",
          callId: rescheduleCallItem.id,
          scheduledFor: targetUtc,
        }),
      });
      if (res.ok) {
        setRescheduleCallItem(null);
        refreshData();
      }
    } catch (err) {
      console.error("Reschedule failed:", err);
    } finally {
      setIsRescheduling(false);
    }
  };

  // Pause or Cancel Scheduled Call
  const handleCallStatusAction = async (callId: string, action: "PAUSE" | "RESUME" | "CANCEL") => {
    try {
      const res = await fetch("/api/voice/scheduled-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, callId }),
      });
      if (res.ok) refreshData();
    } catch (err) {
      console.error("Call status update failed:", err);
    }
  };

  // Resolve Follow-up Task
  const handleResolveTask = async () => {
    if (!resolvingTaskId) return;
    setIsResolving(true);
    try {
      const res = await fetch("/api/voice/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: resolvingTaskId,
          action: "RESOLVE",
          resolutionNote,
        }),
      });
      if (res.ok) {
        setResolvingTaskId(null);
        setResolutionNote("");
        refreshData();
      }
    } catch (err) {
      console.error("Resolve task failed:", err);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0C0E12] pb-20">
      {/* Top Practice Sub-Navigation */}
      <div className="border-b border-[#E5E4DE] bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F26B38]/10 text-[#F26B38] flex items-center justify-center font-bold">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-[#0C0E12]">AI Client Calling Operations</h1>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Sarvam Voice Agent Live
                </span>
              </div>
              <p className="text-xs text-[#718096]">
                Automated Client Outreach, Scheduled Follow-up Queue & Telephony Outcome Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Nav Switcher */}
            <div className="flex items-center bg-[#F4F3EE] p-1 rounded-xl text-xs font-medium">
              <Link
                href="/communications"
                className="px-3 py-1.5 rounded-lg text-[#718096] hover:text-[#0C0E12] transition-colors"
              >
                Command Center
              </Link>
              <button
                className="px-3 py-1.5 rounded-lg bg-white text-[#0C0E12] shadow-sm font-semibold transition-colors"
              >
                Calling Operations & Campaigns
              </button>
            </div>

            {/* Sweep Trigger */}
            <button
              onClick={handleTriggerSweep}
              disabled={isSweeping}
              className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[#E5E4DE] bg-white text-[#0C0E12] hover:bg-[#F9F8F3] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Execute immediate check for pending scheduled calls"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#718096] ${isSweeping ? "animate-spin" : ""}`} />
              Run Scheduler Sweep
            </button>

            {/* New Campaign Button */}
            <button
              onClick={() => {
                resetWizard();
                setIsWizardOpen(true);
              }}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-[#F26B38] text-white hover:bg-[#D95524] transition-colors flex items-center gap-2 shadow-sm shadow-[#F26B38]/20 font-semibold"
            >
              <Plus className="w-4 h-4" />
              New Calling Campaign
            </button>
          </div>
        </div>
      </div>

      {/* Sweep Feedback Banner */}
      {sweepFeedback && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              <span>{sweepFeedback}</span>
            </div>
            <button onClick={() => setSweepFeedback(null)} className="text-blue-500 hover:text-blue-700">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#E5E4DE] pb-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              activeTab === "overview"
                ? "bg-[#0C0E12] text-white"
                : "text-[#718096] hover:text-[#0C0E12] hover:bg-white"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Overview & Analytics
          </button>

          <button
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              activeTab === "queue"
                ? "bg-[#0C0E12] text-white"
                : "text-[#718096] hover:text-[#0C0E12] hover:bg-white"
            }`}
          >
            <Clock className="w-4 h-4" />
            Scheduled Call Queue
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold ml-1">
              {metrics.scheduledCallsCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              activeTab === "history"
                ? "bg-[#0C0E12] text-white"
                : "text-[#718096] hover:text-[#0C0E12] hover:bg-white"
            }`}
          >
            <History className="w-4 h-4" />
            Call History & Recordings
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold ml-1">
              {metrics.callsAttemptedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("followups")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              activeTab === "followups"
                ? "bg-[#0C0E12] text-white"
                : "text-[#718096] hover:text-[#0C0E12] hover:bg-white"
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            Follow-up Workspace
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 text-red-800 font-bold ml-1">
              {metrics.followUpsPendingCount}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SECTION A & B: OVERVIEW & PERFORMANCE                                     */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {/* 1. Scheduled Calls */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Scheduled</span>
                <div className="text-2xl font-bold tracking-tight text-[#0C0E12] font-mono mt-1">
                  {metrics.scheduledCallsCount}
                </div>
                <span className="text-[11px] text-amber-600 mt-1 block font-medium">In calling queue</span>
              </div>

              {/* 2. Calls Attempted */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Attempts</span>
                <div className="text-2xl font-bold tracking-tight text-[#0C0E12] font-mono mt-1">
                  {metrics.callsAttemptedCount}
                </div>
                <span className="text-[11px] text-[#718096] mt-1 block">
                  {metrics.uniqueClientsAttempted} unique clients
                </span>
              </div>

              {/* 3. Answered */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Answered</span>
                <div className="text-2xl font-bold tracking-tight text-emerald-600 font-mono mt-1">
                  {metrics.answeredCount}
                </div>
                <span className="text-[11px] text-emerald-700 mt-1 block font-medium">
                  {metrics.uniqueClientsAnswered} clients connected
                </span>
              </div>

              {/* 4. Unanswered */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Unanswered</span>
                <div className="text-2xl font-bold tracking-tight text-amber-600 font-mono mt-1">
                  {metrics.unansweredCount}
                </div>
                <span className="text-[11px] text-[#718096] mt-1 block">No answer / busy</span>
              </div>

              {/* 5. Failed */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Failed</span>
                <div className="text-2xl font-bold tracking-tight text-rose-600 font-mono mt-1">
                  {metrics.failedCount}
                </div>
                <span className="text-[11px] text-[#718096] mt-1 block">Gateway/network</span>
              </div>

              {/* 6. Callbacks */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Callbacks</span>
                <div className="text-2xl font-bold tracking-tight text-blue-600 font-mono mt-1">
                  {metrics.callbacksRequestedCount}
                </div>
                <span className="text-[11px] text-blue-700 mt-1 block font-medium">Client requested</span>
              </div>

              {/* 7. Follow-ups Pending */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <span className="text-[11px] font-medium text-[#718096] uppercase tracking-wider block">Follow-ups</span>
                <div className="text-2xl font-bold tracking-tight text-[#F26B38] font-mono mt-1">
                  {metrics.followUpsPendingCount}
                </div>
                <span className="text-[11px] text-[#F26B38] mt-1 block font-medium">Staff action items</span>
              </div>
            </div>

            {/* Performance Ratios Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0C0E12]">Answer Rate</span>
                  <span className="font-mono font-bold text-emerald-600">{metrics.answerRate}%</span>
                </div>
                <div className="w-full bg-[#E5E4DE] h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${metrics.answerRate}%` }} />
                </div>
                <p className="text-[11px] text-[#718096] mt-2">
                  Denominator: {metrics.callsAttemptedCount} attempted calls
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0C0E12]">Unanswered Rate</span>
                  <span className="font-mono font-bold text-amber-600">{metrics.unansweredRate}%</span>
                </div>
                <div className="w-full bg-[#E5E4DE] h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${metrics.unansweredRate}%` }} />
                </div>
                <p className="text-[11px] text-[#718096] mt-2">
                  Eligible for automatic retry policies
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0C0E12]">Provider Failure Rate</span>
                  <span className="font-mono font-bold text-rose-600">{metrics.failureRate}%</span>
                </div>
                <div className="w-full bg-[#E5E4DE] h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${metrics.failureRate}%` }} />
                </div>
                <p className="text-[11px] text-[#718096] mt-2">
                  Telephony route & SIP gateway dropouts
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0C0E12]">Follow-up Resolution</span>
                  <span className="font-mono font-bold text-blue-600">{metrics.followUpResolutionRate}%</span>
                </div>
                <div className="w-full bg-[#E5E4DE] h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${metrics.followUpResolutionRate}%` }} />
                </div>
                <p className="text-[11px] text-[#718096] mt-2">
                  Completed partner & staff action tasks
                </p>
              </div>
            </div>

            {/* Calling Campaigns Roster */}
            <div className="bg-white rounded-xl border border-[#E5E4DE] shadow-sm overflow-hidden">
              <div className="p-4 border-b border-[#E5E4DE] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#0C0E12]">Active & Historical Campaigns</h2>
                  <p className="text-xs text-[#718096]">Scheduled batches, target recipients, and completion status</p>
                </div>
                <span className="text-xs text-[#718096]">Showing {campaigns.length} campaigns</span>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-[#718096]">
                  <PhoneCall className="w-8 h-8 mx-auto text-[#CBD5E1] mb-2" />
                  <p className="text-sm font-medium">No calling campaigns created yet.</p>
                  <p className="text-xs text-[#718096] mt-1">
                    Click "New Calling Campaign" above to launch an automated client outreach wave.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E4DE]">
                  {campaigns.map((camp) => {
                    const percentComplete = camp.targetCount > 0 ? Math.round((camp.completedCount / camp.targetCount) * 100) : 0;
                    return (
                      <div key={camp.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[#FAF9F5] transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[#0C0E12]">{camp.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                              {camp.purpose}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                camp.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : camp.status === "PAUSED"
                                  ? "bg-amber-100 text-amber-800"
                                  : camp.status === "COMPLETED"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {camp.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-[#718096]">
                            <span>Scheduled: {formatIST(camp.scheduledAt)}</span>
                            <span>Calling Window: {camp.callingWindowStart} - {camp.callingWindowEnd} IST</span>
                            <span>Owner: {camp.assignedOwner?.name || "Practice Lead"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                          <div className="text-right">
                            <div className="text-xs font-medium text-[#0C0E12]">
                              <span className="font-mono font-bold">{camp.completedCount}</span> / {camp.targetCount} Calls ({percentComplete}%)
                            </div>
                            <div className="w-32 bg-[#E5E4DE] h-1.5 rounded-full overflow-hidden mt-1.5">
                              <div className="bg-[#F26B38] h-full rounded-full" style={{ width: `${percentComplete}%` }} />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {camp.status === "ACTIVE" && (
                              <button
                                onClick={async () => {
                                  await fetch(`/api/voice/campaigns/${camp.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "PAUSE" }),
                                  });
                                  refreshData();
                                }}
                                className="p-1.5 rounded-lg border border-[#E5E4DE] text-[#718096] hover:text-[#0C0E12] hover:bg-white"
                                title="Pause campaign"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            )}

                            {camp.status === "PAUSED" && (
                              <button
                                onClick={async () => {
                                  await fetch(`/api/voice/campaigns/${camp.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "RESUME" }),
                                  });
                                  refreshData();
                                }}
                                className="p-1.5 rounded-lg border border-[#E5E4DE] text-emerald-600 hover:bg-emerald-50"
                                title="Resume campaign"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedCampaignFilter(camp.id);
                                setActiveTab("queue");
                              }}
                              className="px-3 py-1 text-xs font-semibold rounded-lg border border-[#E5E4DE] text-[#0C0E12] hover:bg-white flex items-center gap-1"
                            >
                              View Queue
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION C: SCHEDULED CALL QUEUE                                           */}
        {/* ========================================================================= */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="w-4 h-4 text-[#718096] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search client or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                  />
                </div>

                <select
                  value={selectedCampaignFilter}
                  onChange={(e) => setSelectedCampaignFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                >
                  <option value="ALL">All Campaigns</option>
                  {campaigns.map((camp) => (
                    <option key={camp.id} value={camp.id}>
                      {camp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-[#718096]">
                Showing <span className="font-mono font-bold text-[#0C0E12]">{filteredScheduledCalls.length}</span> queued calls
              </div>
            </div>

            {/* Queue Table */}
            <div className="bg-white rounded-xl border border-[#E5E4DE] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F5] border-b border-[#E5E4DE] text-[#718096] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Scheduled Time (IST)</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Campaign / Purpose</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3">Next Action</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DE]">
                    {filteredScheduledCalls.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-[#718096]">
                          No scheduled calls match current filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredScheduledCalls.map((call) => (
                        <tr key={call.id} className="hover:bg-[#FAF9F5] transition-colors">
                          <td className="px-4 py-3 font-mono font-medium text-[#0C0E12]">
                            {formatIST(call.scheduledFor)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/clients/${call.clientId}`}
                              className="font-semibold text-[#0C0E12] hover:text-[#F26B38] flex items-center gap-1"
                            >
                              {call.client?.name || "Client"}
                              <ExternalLink className="w-3 h-3 text-[#718096]" />
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-[#718096]">
                            {call.client?.phone}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                              {call.campaign?.name || "Autonomous Outreach"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                call.status === "SCHEDULED"
                                  ? "bg-amber-100 text-amber-800"
                                  : call.status === "DISPATCHING"
                                  ? "bg-blue-100 text-blue-800 animate-pulse"
                                  : call.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : call.status === "PAUSED"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {call.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-medium">
                            {call.attemptCount} / {call.maxAttempts}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#FAF9F5] text-[#0C0E12] border border-[#E5E4DE]">
                              {call.nextAction || "DISPATCH_PENDING"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {call.status === "SCHEDULED" && (
                                <>
                                  <button
                                    onClick={() => {
                                      setRescheduleCallItem(call);
                                      setRescheduleDateStr(new Date().toISOString().slice(0, 10));
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold rounded border border-[#E5E4DE] text-[#0C0E12] hover:bg-white"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    onClick={() => handleCallStatusAction(call.id, "PAUSE")}
                                    className="p-1 rounded text-amber-600 hover:bg-amber-50"
                                    title="Pause this call"
                                  >
                                    <Pause className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleCallStatusAction(call.id, "CANCEL")}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50"
                                    title="Cancel scheduled call"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {call.status === "PAUSED" && (
                                <button
                                  onClick={() => handleCallStatusAction(call.id, "RESUME")}
                                  className="px-2 py-1 text-[11px] font-semibold rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                >
                                  Resume
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION D: CALL HISTORY & RECORDINGS                                      */}
        {/* ========================================================================= */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#E5E4DE] shadow-sm overflow-hidden">
              <div className="p-4 border-b border-[#E5E4DE] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#0C0E12]">Dispatched Call Audit History</h2>
                  <p className="text-xs text-[#718096]">Actual telephony attempts, call duration, and AI transcripts</p>
                </div>
                <span className="text-xs text-[#718096]">Showing {callHistory.length} calls</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F5] border-b border-[#E5E4DE] text-[#718096] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Timestamp (IST)</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Sentiment</th>
                      <th className="px-4 py-3 text-right">Inspection</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DE]">
                    {callHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-[#718096]">
                          No historical call logs found.
                        </td>
                      </tr>
                    ) : (
                      callHistory.map((c) => (
                        <tr key={c.id} className="hover:bg-[#FAF9F5] transition-colors">
                          <td className="px-4 py-3 font-mono font-medium text-[#0C0E12]">
                            {formatIST(c.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#0C0E12]">
                            {c.client?.name || "Practice Notification"}
                          </td>
                          <td className="px-4 py-3 font-mono text-[#718096]">
                            {c.recipient}
                          </td>
                          <td className="px-4 py-3 font-mono text-[#0C0E12]">
                            {c.durationSeconds ? `${c.durationSeconds}s` : "0s"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                c.status === "DELIVERED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : c.status === "SENT"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {c.sentiment || "NEUTRAL"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setInspectingCall(c)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#E5E4DE] text-[#0C0E12] hover:bg-white"
                            >
                              View Transcript
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION E: FOLLOW-UP WORKSPACE                                            */}
        {/* ========================================================================= */}
        {activeTab === "followups" && (
          <div className="space-y-4">
            {/* Follow-up Sub-Queue Selector */}
            <div className="bg-white p-3 rounded-xl border border-[#E5E4DE] shadow-sm flex flex-wrap gap-2">
              {[
                { id: "ALL", label: "All Pending" },
                { id: "CALLBACK_REQUESTED", label: "Callback Requested" },
                { id: "NO_ANSWER", label: "No Answer Follow-up" },
                { id: "OVERDUE", label: "Overdue Follow-ups" },
                { id: "RESOLVED", label: "Resolved" },
              ].map((q) => (
                <button
                  key={q.id}
                  onClick={() => setFollowUpQueue(q.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    followUpQueue === q.id
                      ? "bg-[#0C0E12] text-white"
                      : "text-[#718096] hover:text-[#0C0E12] hover:bg-[#FAF9F5]"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Follow-up Tasks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFollowUps.length === 0 ? (
                <div className="col-span-2 p-12 text-center text-[#718096] bg-white rounded-xl border border-[#E5E4DE]">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-medium">All follow-ups in this queue are completed.</p>
                </div>
              ) : (
                filteredFollowUps.map((task) => (
                  <div key={task.id} className="bg-white p-4 rounded-xl border border-[#E5E4DE] shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          {task.priority || "HIGH"} PRIORITY
                        </span>
                        <h3 className="text-sm font-bold text-[#0C0E12] mt-1">{task.title}</h3>
                        <p className="text-xs text-[#718096]">
                          Client: <span className="font-semibold text-[#0C0E12]">{task.client?.name}</span> ({task.client?.phone})
                        </p>
                      </div>

                      <span className="text-xs font-mono font-semibold text-[#718096]">
                        Due: {formatIST(task.dueDate)}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#FAF9F5] rounded-lg text-xs text-[#4A5568] border border-[#E5E4DE] whitespace-pre-wrap">
                      {task.detail}
                    </div>

                    {task.resolutionNote && (
                      <div className="p-2.5 bg-emerald-50 rounded-lg text-xs text-emerald-900 border border-emerald-200">
                        <span className="font-bold">Resolution Note:</span> {task.resolutionNote}
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#E5E4DE] flex items-center justify-between">
                      <div className="text-xs text-[#718096]">
                        Assigned: <span className="font-medium text-[#0C0E12]">{task.assignedTo?.name || "Unassigned"}</span>
                      </div>

                      {task.status !== "COMPLETED" ? (
                        <button
                          onClick={() => setResolvingTaskId(task.id)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Resolve Follow-up
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          Resolved
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PHASE 3: CAMPAIGN CREATION WIZARD MODAL (5 STEPS)                         */}
      {/* ========================================================================= */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E4DE] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E5E4DE] flex items-center justify-between bg-[#FAF9F5]">
              <div>
                <h3 className="text-base font-bold text-[#0C0E12]">Create Automated Calling Campaign</h3>
                <p className="text-xs text-[#718096]">Step {wizardStep} of 5</p>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="text-[#718096] hover:text-[#0C0E12] p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="grid grid-cols-5 border-b border-[#E5E4DE] text-[11px] font-semibold text-center bg-white">
              {[
                "1. Details",
                "2. Clients",
                "3. Schedule",
                "4. Policy",
                "5. Review",
              ].map((label, idx) => (
                <div
                  key={label}
                  className={`py-2.5 border-b-2 ${
                    wizardStep === idx + 1
                      ? "border-[#F26B38] text-[#F26B38] font-bold"
                      : wizardStep > idx + 1
                      ? "border-emerald-500 text-emerald-600"
                      : "border-transparent text-[#718096]"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Error Banner */}
            {wizardError && (
              <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{wizardError}</span>
              </div>
            )}

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* STEP 1: Details */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Campaign Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Q2 Advance Tax & GST 3B Calling Wave"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Campaign Purpose *</label>
                    <select
                      value={campaignPurpose}
                      onChange={(e: any) => setCampaignPurpose(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                    >
                      <option value="PAYMENT_RECOVERY">Payment Recovery (Overdue Invoices)</option>
                      <option value="DOCUMENT_COLLECTION">Document Collection (Audit Workpapers)</option>
                      <option value="GST_DEADLINE">Statutory GST Filing Deadline Alert</option>
                      <option value="CLIENT_CHECKIN">Client Check-in & Advisory Follow-up</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Description (Internal Notes)</label>
                    <textarea
                      rows={3}
                      placeholder="Context for practice staff regarding this outreach wave..."
                      value={campaignDescription}
                      onChange={(e) => setCampaignDescription(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Responsible Staff / Partner</label>
                    <select
                      value={selectedOwnerId}
                      onChange={(e) => setSelectedOwnerId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none focus:border-[#F26B38]"
                    >
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* STEP 2: Client Selection */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[#0C0E12]">Select Client Recipients</h4>
                      <p className="text-[11px] text-[#718096]">
                        {selectedClientIds.length} clients selected
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="text-xs text-[#F26B38] hover:underline font-semibold"
                      >
                        Select All Filtered ({wizardFilteredClients.length})
                      </button>
                      <span className="text-[#E5E4DE]">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="text-xs text-[#718096] hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Filter clients..."
                      value={clientSearchInWizard}
                      onChange={(e) => setClientSearchInWizard(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none"
                    />
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterOverdueOnly}
                        onChange={(e) => setFilterOverdueOnly(e.target.checked)}
                        className="rounded border-[#E5E4DE] text-[#F26B38] focus:ring-0"
                      />
                      <span>Overdue Only</span>
                    </label>
                  </div>

                  {/* Client Checkbox List */}
                  <div className="border border-[#E5E4DE] rounded-xl max-h-60 overflow-y-auto divide-y divide-[#E5E4DE]">
                    {wizardFilteredClients.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#718096]">
                        No clients match the search filters.
                      </div>
                    ) : (
                      wizardFilteredClients.map((c) => {
                        const isSelected = selectedClientIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => handleToggleClient(c.id)}
                            className={`p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-[#FAF9F5] transition-colors ${
                              isSelected ? "bg-orange-50/50" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded border-[#E5E4DE] text-[#F26B38] focus:ring-0"
                              />
                              <div>
                                <span className="font-semibold text-[#0C0E12]">{c.name}</span>
                                <span className="text-xs text-[#718096] ml-2 font-mono">{c.phone}</span>
                              </div>
                            </div>

                            <div className="text-right">
                              {c.isOverdue ? (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  ₹{c.overdueAmount.toLocaleString("en-IN")} Overdue
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Up to Date
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: Configure Schedule */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-2">Dispatch Timing</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        onClick={() => setIsImmediateDispatch(true)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isImmediateDispatch
                            ? "border-[#F26B38] bg-orange-50 text-[#0C0E12] font-semibold"
                            : "border-[#E5E4DE] bg-white text-[#718096]"
                        }`}
                      >
                        <div className="font-bold text-sm">Immediate Dispatch</div>
                        <p className="text-[11px] mt-1">Start calling now within permitted business hours</p>
                      </div>

                      <div
                        onClick={() => setIsImmediateDispatch(false)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          !isImmediateDispatch
                            ? "border-[#F26B38] bg-orange-50 text-[#0C0E12] font-semibold"
                            : "border-[#E5E4DE] bg-white text-[#718096]"
                        }`}
                      >
                        <div className="font-bold text-sm">Scheduled Dispatch</div>
                        <p className="text-[11px] mt-1">Specify target date and time in Asia/Kolkata</p>
                      </div>
                    </div>
                  </div>

                  {!isImmediateDispatch && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE]">
                      <div>
                        <label className="text-[11px] font-semibold text-[#718096] block mb-1">Target Date</label>
                        <input
                          type="date"
                          value={scheduledDateStr}
                          onChange={(e) => setScheduledDateStr(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#718096] block mb-1">Target Time (IST)</label>
                        <input
                          type="time"
                          value={scheduledTimeStr}
                          onChange={(e) => setScheduledTimeStr(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-white rounded-xl border border-[#E5E4DE] space-y-2">
                    <label className="text-xs font-semibold text-[#0C0E12] block">Allowed Calling Window (Asia/Kolkata)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-[#718096] block mb-1">Window Opens</span>
                        <input
                          type="time"
                          value={callingWindowStart}
                          onChange={(e) => setCallingWindowStart(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-[#718096] block mb-1">Window Closes</span>
                        <input
                          type="time"
                          value={callingWindowEnd}
                          onChange={(e) => setCallingWindowEnd(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE] focus:outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#718096] pt-1">
                      Statutory compliance: Calls are strictly suppressed outside 10:00 AM - 6:00 PM IST.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 4: Calling Policy */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Language Preference</label>
                      <select
                        value={languagePref}
                        onChange={(e: any) => setLanguagePref(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none"
                      >
                        <option value="HINGLISH">Hinglish (Natural Conversational Hindi + English)</option>
                        <option value="HINDI">Formal Hindi</option>
                        <option value="ENGLISH">Indian Professional English</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Retry Limit</label>
                      <select
                        value={retryLimit}
                        onChange={(e) => setRetryLimit(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none"
                      >
                        <option value={1}>1 Retry (2 Total Attempts)</option>
                        <option value={2}>2 Retries (3 Total Attempts)</option>
                        <option value={3}>3 Retries (4 Total Attempts)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Retry Interval (Minutes)</label>
                    <select
                      value={retryIntervalMinutes}
                      onChange={(e) => setRetryIntervalMinutes(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none"
                    >
                      <option value={60}>60 minutes</option>
                      <option value={120}>120 minutes (2 Hours)</option>
                      <option value={240}>240 minutes (4 Hours)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      Automatic Compliance & Quiet Hours Protection
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      All calls are bound to TRAI telemarketing regulations. Unanswered calls will strictly follow retry limits and never attempt contact during national holidays or after 8:00 PM.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 5: Review & Confirm */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  {wizardEligibility && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">Eligible Recipients</span>
                        <div className="text-xl font-bold font-mono mt-1">{wizardEligibility.eligibleClients.length}</div>
                        <span className="text-[11px]">Valid phone numbers & active records</span>
                      </div>

                      <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 text-xs">
                        <span className="text-[10px] uppercase font-bold text-rose-700 block">Excluded Clients</span>
                        <div className="text-xl font-bold font-mono mt-1">{wizardEligibility.excludedClients.length}</div>
                        <span className="text-[11px]">Opt-outs / invalid numbers suppressed</span>
                      </div>
                    </div>
                  )}

                  {/* Excluded clients breakdown */}
                  {wizardEligibility?.excludedClients?.length > 0 && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 max-h-28 overflow-y-auto">
                      <span className="font-bold text-slate-700">Suppression Log:</span>
                      {wizardEligibility.excludedClients.map((ex: any) => (
                        <div key={ex.id} className="text-[11px] text-slate-600">
                          • {ex.name}: {ex.reason}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Script Preview */}
                  <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE] space-y-2 text-xs">
                    <span className="font-bold text-[#0C0E12] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#F26B38]" />
                      Calling Script Preview ({languagePref})
                    </span>
                    <p className="text-[#4A5568] italic leading-relaxed bg-white p-3 rounded-lg border border-[#E5E4DE]">
                      "Namaste [Client Name] ji! Main {tenantName} ki automated AI accounts desk se bol rahi hoon. Hum aapke pending invoice ke baare mein connect kar rahe hain... Agar aap busy hain toh callback bol dijiye..."
                    </p>
                  </div>

                  {/* Confirmation Checkbox */}
                  <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E4DE] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmedRisk}
                      onChange={(e) => setConfirmedRisk(e.target.checked)}
                      className="mt-0.5 rounded border-[#E5E4DE] text-[#F26B38] focus:ring-0"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-[#0C0E12]">I authorize scheduling this automated voice outreach</span>
                      <p className="text-[11px] text-[#718096]">
                        Calls will be initiated autonomously by the Sarvam AI telephony gateway within allowed calling hours.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-[#E5E4DE] bg-[#FAF9F5] flex items-center justify-between">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((prev) => prev - 1)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-[#E5E4DE] text-[#0C0E12] hover:bg-white flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              {wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 1 && !campaignName.trim()) {
                      setWizardError("Campaign name is required.");
                      return;
                    }
                    if (wizardStep === 2 && selectedClientIds.length === 0) {
                      setWizardError("Select at least one client recipient.");
                      return;
                    }
                    setWizardError(null);
                    setWizardStep((prev) => prev + 1);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0C0E12] text-white hover:bg-black flex items-center gap-1.5"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : wizardStep === 4 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleProceedToReview}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0C0E12] text-white hover:bg-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? "Validating..." : "Review Campaign"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting || !confirmedRisk}
                  onClick={handleLaunchCampaign}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#F26B38] text-white hover:bg-[#D95524] shadow-md shadow-[#F26B38]/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Scheduling Calls..." : "Launch Campaign"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Call Modal */}
      {rescheduleCallItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E4DE] shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <h3 className="text-sm font-bold text-[#0C0E12]">Reschedule Client Call</h3>
              <button onClick={() => setRescheduleCallItem(null)} className="text-[#718096]">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#718096]">
              Client: <span className="font-semibold text-[#0C0E12]">{rescheduleCallItem.client?.name}</span> ({rescheduleCallItem.client?.phone})
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[#718096] block mb-1">New Date</label>
                <input
                  type="date"
                  value={rescheduleDateStr}
                  onChange={(e) => setRescheduleDateStr(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#718096] block mb-1">New Time (IST)</label>
                <input
                  type="time"
                  value={rescheduleTimeStr}
                  onChange={(e) => setRescheduleTimeStr(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5E4DE]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRescheduleCallItem(null)}
                className="px-3 py-1.5 text-xs font-semibold text-[#718096] hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={isRescheduling}
                onClick={handleExecuteReschedule}
                className="px-4 py-1.5 text-xs font-bold bg-[#F26B38] text-white rounded-lg shadow-sm"
              >
                {isRescheduling ? "Saving..." : "Save Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Resolution Modal */}
      {resolvingTaskId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E4DE] shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
              <h3 className="text-sm font-bold text-[#0C0E12]">Resolve Follow-up Task</h3>
              <button onClick={() => setResolvingTaskId(null)} className="text-[#718096]">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#0C0E12] block mb-1">Verified Client Response / Notes</label>
              <textarea
                rows={4}
                placeholder="e.g. Spoke to Director. NEFT payment will be released by 4 PM tomorrow. Reference # provided."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5E4DE] focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setResolvingTaskId(null)}
                className="px-3 py-1.5 text-xs font-semibold text-[#718096] hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={isResolving}
                onClick={handleResolveTask}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg shadow-sm"
              >
                {isResolving ? "Completing..." : "Confirm Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Transcript & Recording Inspection Drawer */}
      {inspectingCall && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E4DE] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0C0E12]">Telephony Call Transcript</h3>
                  <p className="text-xs text-[#718096]">{inspectingCall.client?.name} ({inspectingCall.recipient})</p>
                </div>
                <button onClick={() => setInspectingCall(null)} className="text-[#718096]">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE]">
                  <span className="text-[#718096] block text-[10px] uppercase font-bold">Call Status</span>
                  <span className="font-semibold text-emerald-600 mt-1 block">{inspectingCall.status}</span>
                </div>
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE]">
                  <span className="text-[#718096] block text-[10px] uppercase font-bold">Duration</span>
                  <span className="font-semibold text-[#0C0E12] mt-1 block">{inspectingCall.durationSeconds || 0} seconds</span>
                </div>
              </div>

              {inspectingCall.recordingUrl && (
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE] space-y-2">
                  <span className="text-xs font-bold text-[#0C0E12] flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-[#F26B38]" />
                    Call Audio Recording
                  </span>
                  <audio controls className="w-full h-8">
                    <source src={inspectingCall.recordingUrl} type="audio/mpeg" />
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              <div>
                <span className="text-xs font-bold text-[#0C0E12] block mb-1">Full Conversational Transcript</span>
                <div className="p-4 bg-[#FAF9F5] rounded-xl border border-[#E5E4DE] text-xs font-mono text-[#0C0E12] whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {inspectingCall.content}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E5E4DE]">
              <button
                onClick={() => setInspectingCall(null)}
                className="w-full py-2 text-xs font-bold bg-[#0C0E12] text-white rounded-xl"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
