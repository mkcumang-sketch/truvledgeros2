"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/financial/math";
import {
  Clock,
  PhoneCall,
  Sparkles,
  Loader2,
  Copy,
  Check,
  X,
  MessageSquare,
  Mail,
  UserCheck,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateInvoiceAiPaymentDraftAction,
  dispatchAutonomousVoiceCallAction,
} from "@/lib/server/actions/automation-actions";
import { AiPaymentRecoveryDraft } from "@/lib/server/ai/gemini-client";
import { VoiceCallResult } from "@/lib/server/voice/calling-agent";

export interface RecoveryItem {
  invoiceId: string;
  clientId: string;
  invoiceNumber: string;
  clientName: string;
  primaryContact: string;
  phone: string;
  totalAmount: any;
  remainingBalance: number;
  dueDate: Date | string;
  daysOverdue: number;
  bucket: string;
  lastRecoveryStage: string;
}

interface Props {
  recoveryItems: RecoveryItem[];
}

export function PaymentRecoveryClient({ recoveryItems }: Props) {
  // Draft Modal State
  const [isDraftingId, setIsDraftingId] = useState<string | null>(null);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<AiPaymentRecoveryDraft | null>(null);
  const [activeClientName, setActiveClientName] = useState("");
  const [activeInvoiceNumber, setActiveInvoiceNumber] = useState("");
  const [copiedHinglish, setCopiedHinglish] = useState(false);
  const [copiedEnglish, setCopiedEnglish] = useState(false);

  // Voice Call Modal State
  const [isCallingId, setIsCallingId] = useState<string | null>(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [activeCallResult, setActiveCallResult] = useState<VoiceCallResult | null>(null);

  const handleGenerateDraft = async (item: RecoveryItem) => {
    try {
      setIsDraftingId(item.invoiceId);
      setActiveClientName(item.clientName);
      setActiveInvoiceNumber(item.invoiceNumber);

      const res = await generateInvoiceAiPaymentDraftAction(item.invoiceId);
      if (!res.success) {
        toast.error(res.error || "Failed to generate AI recovery draft.");
        return;
      }

      setActiveDraft(res.data);
      setDraftModalOpen(true);
      toast.success("AI Payment Recovery draft generated via Gemini.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to draft recovery message.");
    } finally {
      setIsDraftingId(null);
    }
  };

  const handleInitiateCall = async (item: RecoveryItem) => {
    try {
      setIsCallingId(item.invoiceId);
      setActiveClientName(item.clientName);
      setActiveInvoiceNumber(item.invoiceNumber);

      const res = await dispatchAutonomousVoiceCallAction({
        invoiceId: item.invoiceId,
        clientId: item.clientId,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to dispatch autonomous voice call.");
        return;
      }

      setActiveCallResult(res.data);
      setCallModalOpen(true);
      toast.success("AI Voice Agent call executed and logged to database.");
    } catch (e: any) {
      toast.error(e?.message || "Voice call execution failed.");
    } finally {
      setIsCallingId(null);
    }
  };

  const copyToClipboard = (text: string, type: "hinglish" | "english") => {
    navigator.clipboard.writeText(text);
    if (type === "hinglish") {
      setCopiedHinglish(true);
      setTimeout(() => setCopiedHinglish(false), 2000);
    } else {
      setCopiedEnglish(true);
      setTimeout(() => setCopiedEnglish(false), 2000);
    }
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Payment Recovery Operations
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
              AI Powered
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Automated Gemini Hinglish/English follow-ups and autonomous AI voice collection calls.
          </p>
        </div>
      </div>

      {recoveryItems.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-xl">
          <Clock className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-200">No overdue invoices.</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Great — all client invoices are fully paid or within their payment terms.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Primary Contact</th>
                <th className="py-3 px-4 text-right">Outstanding Amount</th>
                <th className="py-3 px-4 text-center">Overdue Days</th>
                <th className="py-3 px-4 text-center">Ageing Bucket</th>
                <th className="py-3 px-4 text-center">Stage</th>
                <th className="py-3 px-4 text-right">Autonomous AI Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recoveryItems.map((item) => (
                <tr key={item.invoiceId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-200">{item.clientName}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">{item.invoiceNumber}</td>
                  <td className="py-3.5 px-4 text-xs">
                    <div>{item.primaryContact}</div>
                    <div className="text-slate-500 font-mono">{item.phone}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-red-400">
                    {formatINR(item.remainingBalance)}
                  </td>
                  <td className="py-3.5 px-4 text-center font-medium text-amber-400">
                    {item.daysOverdue} d
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {item.bucket}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-semibold">
                    <span className="text-amber-400">{item.lastRecoveryStage}</span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* AI Draft Follow-up Button */}
                      <button
                        type="button"
                        onClick={() => handleGenerateDraft(item)}
                        disabled={isDraftingId === item.invoiceId}
                        title="Draft context-aware Hinglish/English follow-up with Gemini"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-700 hover:bg-purple-800 text-white rounded font-medium shadow-xs transition-colors disabled:opacity-50"
                      >
                        {isDraftingId === item.invoiceId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        <span>AI Draft</span>
                      </button>

                      {/* AI Outbound Voice Call Button */}
                      <button
                        type="button"
                        onClick={() => handleInitiateCall(item)}
                        disabled={isCallingId === item.invoiceId}
                        title="Dispatch autonomous voice recovery agent"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded font-medium shadow-xs transition-colors disabled:opacity-50"
                      >
                        {isCallingId === item.invoiceId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PhoneCall className="w-3.5 h-3.5" />
                        )}
                        <span>AI Call</span>
                      </button>

                      {/* View Invoice Link */}
                      <Link
                        href={`/invoices/${item.invoiceId}`}
                        className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
                      >
                        Invoice
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Recovery Draft Modal */}
      {draftModalOpen && activeDraft && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-left shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">AI Payment Recovery Draft</h3>
                  <p className="text-xs text-slate-400">
                    {activeClientName} • Invoice #{activeInvoiceNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraftModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Recovery Stage:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {activeDraft.tone}
              </span>
            </div>

            {/* Hinglish WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp Follow-up (Hinglish)</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeDraft.whatsappHinglish, "hinglish")}
                  className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium"
                >
                  {copiedHinglish ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Hinglish</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                {activeDraft.whatsappHinglish}
              </div>
            </div>

            {/* English WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp Follow-up (English)</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeDraft.whatsappEnglish, "english")}
                  className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium"
                >
                  {copiedEnglish ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy English</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                {activeDraft.whatsappEnglish}
              </div>
            </div>

            {/* Email Subject & Body */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>Formal Email: {activeDraft.emailSubject}</span>
              </div>
              <div
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: activeDraft.emailBodyHtml }}
              />
            </div>

            {activeDraft.escalationRecommended && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-center gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Partner Escalation Task automatically registered in compliance queue.
                </span>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDraftModalOpen(false)}
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium"
              >
                Close Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Voice Call Modal */}
      {callModalOpen && activeCallResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 text-left shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-800">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Autonomous Voice Call Log</h3>
                  <p className="text-xs text-slate-400">
                    Target: {activeClientName} • Invoice #{activeInvoiceNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCallModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Call Status</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">{activeCallResult.status}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Duration</div>
                <div className="text-sm font-bold text-slate-200 mt-1">
                  {activeCallResult.durationSeconds}s
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Client Sentiment</div>
                <div className="text-sm font-bold text-amber-400 mt-1">
                  {activeCallResult.customerSentiment || "PENDING"}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">Call Transcript</div>
              <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {activeCallResult.transcript}
              </pre>
            </div>

            {activeCallResult.partnerTaskCreated && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-center gap-2 text-xs text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  Sentiment flagged or call unresolved. Escalated to partner task queue.
                </span>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCallModalOpen(false)}
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium"
              >
                Dismiss Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
