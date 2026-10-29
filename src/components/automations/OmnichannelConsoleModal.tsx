"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  X,
  PhoneCall,
  MessageSquare,
  Mail,
  Sparkles,
  Send,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Search,
  Loader2,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import {
  executeManualOmnichannelDispatchAction,
  generateAiCommunicationDraftAction,
  getPracticeClientsForDispatchAction,
} from "@/lib/server/actions/automation-command-actions";

interface ClientOption {
  id: string;
  name: string;
  businessName: string | null;
  phone: string;
  email: string;
  pan: string | null;
  gstin: string | null;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: any;
    dueDate: any;
  }>;
}

interface OmnichannelConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedClientId?: string;
  preselectedChannel?: "WHATSAPP" | "EMAIL" | "VOICE";
  preselectedWorkflowName?: string;
  onDispatchSuccess?: () => void;
}

export function OmnichannelConsoleModal({
  isOpen,
  onClose,
  preselectedClientId,
  preselectedChannel = "WHATSAPP",
  preselectedWorkflowName,
  onDispatchSuccess,
}: OmnichannelConsoleModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>(preselectedClientId || "");
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL" | "VOICE">(preselectedChannel);
  const [searchQuery, setSearchQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contextType, setContextType] = useState<"SECTION_43B_H" | "GSTR_1" | "OVERDUE_INVOICE" | "DOCUMENT_REQUEST">("SECTION_43B_H");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isDispatching, startDispatchTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      setLoadingClients(true);
      getPracticeClientsForDispatchAction()
        .then((res) => {
          if (res.success && res.data) {
            setClients(res.data as ClientOption[]);
            if (!selectedClientId && res.data.length > 0) {
              setSelectedClientId(res.data[0].id);
            }
          }
        })
        .finally(() => setLoadingClients(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (preselectedClientId) {
      setSelectedClientId(preselectedClientId);
    }
  }, [preselectedClientId]);

  useEffect(() => {
    if (preselectedChannel) {
      setChannel(preselectedChannel);
    }
  }, [preselectedChannel]);

  if (!isOpen) return null;

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.businessName && c.businessName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.phone.includes(searchQuery)
  );

  const handleGenerateAiDraft = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client first.");
      return;
    }

    setIsGeneratingAi(true);
    try {
      const res = await generateAiCommunicationDraftAction({
        clientId: selectedClientId,
        contextType,
        invoiceId: selectedInvoiceId || undefined,
      });

      if (res.success && res.data) {
        setMessage(res.data.draft);
        if (channel === "EMAIL") {
          setSubject(
            contextType === "SECTION_43B_H"
              ? "Urgent: Section 43B(h) MSME Compliance Verification"
              : contextType === "GSTR_1"
              ? "Statutory Reminder: GSTR-1 Inward & Outward Reconciliation"
              : contextType === "OVERDUE_INVOICE"
              ? "Statement of Account & Outstanding Professional Fees"
              : "Urgent Document Request for Tax Audit Sign-Off"
          );
        }
        toast.success("AI Hinglish Draft generated successfully!");
      } else {
        const errorMsg =
          !res.success && "error" in res && typeof (res as any).error === "string"
            ? (res as any).error
            : "Failed to generate AI draft.";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Network error while generating AI draft.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleDispatch = () => {
    if (!selectedClientId) {
      toast.error("Please choose a client.");
      return;
    }

    if (channel !== "VOICE" && !message.trim()) {
      toast.error("Please provide message content or generate an AI draft.");
      return;
    }

    startDispatchTransition(async () => {
      try {
        const res = await executeManualOmnichannelDispatchAction({
          clientId: selectedClientId,
          channel,
          customMessage: message,
          subject: subject || undefined,
          invoiceId: selectedInvoiceId || undefined,
        });

        if (res.success && res.data) {
          toast.success(res.data.message || "Dispatch initiated successfully!");
          
          if (channel === "WHATSAPP" && res.data.waDirectUrl) {
            window.open(res.data.waDirectUrl, "_blank", "noopener,noreferrer");
          }

          onDispatchSuccess?.();
          onClose();
        } else {
          const errorMsg =
            !res.success && "error" in res && typeof (res as any).error === "string"
              ? (res as any).error
              : "Failed to dispatch communication.";
          toast.error(errorMsg);
        }
      } catch {
        toast.error("Failed to complete dispatch.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#090D16] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Omnichannel Practice Dispatch Console
                {preselectedWorkflowName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal border border-slate-700">
                    {preselectedWorkflowName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                1-Click Manual Execution with Sarvam Voice, WhatsApp & Transactional Email
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Step 1: Select Channel */}
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
              1. Choose Dispatch Channel
            </label>
            <div className="grid grid-cols-3 gap-3">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => setChannel("WHATSAPP")}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  channel === "WHATSAPP"
                    ? "bg-emerald-950/40 border-emerald-500/60 text-white shadow-xs"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    channel === "WHATSAPP"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-200">WhatsApp</div>
                  <div className="text-[11px] text-slate-400">Direct Web fallback</div>
                </div>
              </button>

              {/* Sarvam AI Voice */}
              <button
                type="button"
                onClick={() => setChannel("VOICE")}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  channel === "VOICE"
                    ? "bg-indigo-950/40 border-indigo-500/60 text-white shadow-xs"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    channel === "VOICE"
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-200">Sarvam Voice</div>
                  <div className="text-[11px] text-slate-400">Bilingual Telephony</div>
                </div>
              </button>

              {/* Email */}
              <button
                type="button"
                onClick={() => setChannel("EMAIL")}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  channel === "EMAIL"
                    ? "bg-sky-950/40 border-sky-500/60 text-white shadow-xs"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    channel === "EMAIL"
                      ? "bg-sky-500/20 text-sky-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-200">Transactional Email</div>
                  <div className="text-[11px] text-slate-400">Formal Audit Trail</div>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Select Client */}
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
              2. Target Client & Registered Endpoints
            </label>
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter client by name, firm, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setSelectedInvoiceId("");
                }}
                disabled={loadingClients}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {loadingClients ? (
                  <option>Loading practice clients...</option>
                ) : filteredClients.length === 0 ? (
                  <option>No matching clients found</option>
                ) : (
                  filteredClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.businessName ? `(${c.businessName})` : ""} — {c.phone}
                    </option>
                  ))
                )}
              </select>

              {/* Endpoint Preview Card */}
              {selectedClient && (
                <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-300">{selectedClient.name}</span>
                    {selectedClient.pan && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                        {selectedClient.pan}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1 text-slate-300 font-mono">
                      📞 {selectedClient.phone || "No phone"}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      ✉️ {selectedClient.email || "No email"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Optional: Associate with Invoice */}
          {selectedClient?.invoices && selectedClient.invoices.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                Linked Invoice (Optional)
              </label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">None (General Practice Follow-Up)</option>
                {selectedClient.invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    #{inv.invoiceNumber} — ₹{Number(inv.totalAmount).toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Voice Mode Banner */}
          {channel === "VOICE" && (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5" />
                  Sarvam AI Telephony Dispatch Mode
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
                  Hinglish Bilingual Agent
                </span>
              </div>
              <p className="text-xs text-slate-400">
                The autonomous voice agent will dial <strong className="text-slate-200">{selectedClient?.phone || "the client"}</strong> using the dedicated Sarvam AI engine. The conversation adapts dynamically to payment confirmations, dispute logs, and promise-to-pay dates.
              </p>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>Caller Persona: Senior Accounts Associate</span>
                <span>•</span>
                <span>Fallback: Auto Partner Escalation Task</span>
              </div>
            </div>
          )}

          {/* Email Subject Line (if Email channel) */}
          {channel === "EMAIL" && (
            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                Email Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Important Compliance & Accounts Advisory"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* AI Drafting Toolbar & Message Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                3. Message & Script Content
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={contextType}
                  onChange={(e) => setContextType(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                >
                  <option value="SECTION_43B_H">Section 43B(h) MSME Notice</option>
                  <option value="GSTR_1">GSTR-1 Filing Deadline</option>
                  <option value="OVERDUE_INVOICE">Overdue Fee Recovery</option>
                  <option value="DOCUMENT_REQUEST">Audit Workpapers Call</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerateAiDraft}
                  disabled={isGeneratingAi || !selectedClientId}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 text-xs font-medium transition-all disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  AI Hinglish Draft
                </button>
              </div>
            </div>

            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                channel === "VOICE"
                  ? "Leave blank to use dynamic Sarvam AI conversational script, or enter custom caller talking points..."
                  : "Type your message or click 'AI Hinglish Draft' for an institutional CA-compliant follow-up..."
              }
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDispatch}
              disabled={isDispatching || !selectedClientId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {isDispatching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initiating Dispatch...
                </>
              ) : channel === "VOICE" ? (
                <>
                  <PhoneCall className="w-4 h-4" />
                  Dial Sarvam AI Voice Call
                </>
              ) : channel === "WHATSAPP" ? (
                <>
                  <Send className="w-4 h-4" />
                  Send WhatsApp & Open Web
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Transmit Email Notice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

