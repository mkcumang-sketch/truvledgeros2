"use client";

import React, { useState } from "react";
import {
  sendClientGstSummaryAction,
  markGstReturnFiledAction,
  draftAiTaxNoticeRebuttalAction,
} from "@/lib/server/actions/gst-actions";
import { AiTaxNoticeRebuttal } from "@/lib/server/ai/gemini-client";
import { toast } from "sonner";
import {
  Send,
  CheckCircle2,
  Loader2,
  X,
  FileText,
  Sparkles,
  Scale,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";

export interface GstReturnRowActionsProps {
  returnId: string;
  status: string;
  arnNumber?: string | null;
  clientId?: string;
  clientName?: string;
}

export function GstReturnRowActions({
  returnId,
  status,
  arnNumber,
  clientId,
  clientName,
}: GstReturnRowActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showArnModal, setShowArnModal] = useState(false);
  const [arnInput, setArnInput] = useState(arnNumber || "");
  const [feedback, setFeedback] = useState<string | null>(null);

  // AI Notice Rebuttal Modal State
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeType, setNoticeType] = useState("GST DRC-01");
  const [statutorySection, setStatutorySection] = useState("Section 73(1) read with Rule 142(1)");
  const [demandAmount, setDemandAmount] = useState("125000");
  const [noticeSummary, setNoticeSummary] = useState(
    "Alleged mismatch in Input Tax Credit between GSTR-2B and GSTR-3B under Section 16(2)(aa) for the relevant period."
  );
  const [isGeneratingRebuttal, setIsGeneratingRebuttal] = useState(false);
  const [rebuttalResult, setRebuttalResult] = useState<AiTaxNoticeRebuttal | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSendSummary() {
    try {
      setLoading(true);
      setFeedback(null);
      const res = await sendClientGstSummaryAction(returnId);
      if (!res.success) {
        toast.error(res.error || "Unable to send summary");
        return;
      }
      toast.success("Sign-off dispatched to client");
      setFeedback("Sign-off dispatched to client");
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to dispatch client GST summary.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkFiled(e: React.FormEvent) {
    e.preventDefault();
    if (!arnInput.trim()) return;
    try {
      setLoading(true);
      const res = await markGstReturnFiledAction({ returnId, arnNumber: arnInput.trim() });
      if (!res.success) {
        toast.error(res.error || "Unable to record filing");
        return;
      }
      setShowArnModal(false);
      toast.success("Filing ARN recorded successfully");
      setFeedback("Filing recorded successfully");
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to record filing ARN.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRebuttal(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Client identification required to draft notice rebuttal.");
      return;
    }

    try {
      setIsGeneratingRebuttal(true);
      const res = await draftAiTaxNoticeRebuttalAction({
        returnId,
        clientId,
        noticeType,
        statutorySection,
        demandAmount: Number(demandAmount) || 0,
        summary: noticeSummary,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to draft AI notice rebuttal.");
        return;
      }

      setRebuttalResult(res.data);
      toast.success("AI Legal Rebuttal & Partner Approval Task generated.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate legal rebuttal.");
    } finally {
      setIsGeneratingRebuttal(false);
    }
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Legal rebuttal text copied to clipboard.");
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {feedback && (
        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 animate-in fade-in">
          {feedback}
        </span>
      )}

      {status === "FILED" && (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          ARN: {arnNumber ? arnNumber.slice(0, 14) : "VERIFIED"}
        </span>
      )}

      {status === "READY_FOR_REVIEW" && (
        <button
          onClick={handleSendSummary}
          disabled={loading}
          aria-label="Send GST summary for client sign-off"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#171A19] hover:bg-[#202522] text-white rounded-md font-medium transition-colors shadow-xs disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5 text-[#C89B3C]" />
          )}
          <span>Send Sign-Off</span>
        </button>
      )}

      {(status === "AWAITING_CLIENT_APPROVAL" ||
        status === "APPROVED_BY_CLIENT" ||
        status === "DATA_PENDING") && (
        <button
          onClick={() => setShowArnModal(true)}
          disabled={loading}
          aria-label="Record GST return ARN and mark filed"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-medium transition-colors shadow-xs disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Record ARN</span>
        </button>
      )}

      {/* AI Tax Notice Rebuttal Trigger */}
      {clientId && (
        <button
          type="button"
          onClick={() => setShowNoticeModal(true)}
          title="Analyze Statutory Notice & Draft Legal Rebuttal (DRC-01, Sec 148)"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-700 hover:bg-purple-800 text-white rounded-md font-medium transition-colors shadow-xs"
        >
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span className="hidden sm:inline">Notice Rebuttal</span>
        </button>
      )}

      {/* ARN Modal */}
      {showArnModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleMarkFiled}
            className="bg-white border border-[#D3DBD6] p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-xl text-left"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#EDEBE3]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-[#171A19]">Record GST Filing ARN</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowArnModal(false)}
                className="p-1 rounded-md text-[#74817A] hover:bg-[#F2F4F2]"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5B6660]">
              Enter the government GST portal Acknowledgement Reference Number (ARN) once filed:
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-[#171A19] mb-1">
                Acknowledgement Reference Number (ARN) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. AA2710260012345"
                value={arnInput}
                onChange={(e) => setArnInput(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D3DBD6] rounded-lg text-[#171A19] font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowArnModal(false)}
                className="px-3 py-1.5 text-xs text-[#5B6660] hover:text-[#171A19] rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !arnInput.trim()}
                className="px-3.5 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? "Recording..." : "Confirm & Lock ARN"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI Tax Notice Rebuttal Modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    AI Tax Notice Legal Rebuttal Drafter
                  </h3>
                  <p className="text-xs text-slate-500">
                    Client: {clientName || "Taxpayer"} • ICAI Standards Compliant
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNoticeModal(false);
                  setRebuttalResult(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!rebuttalResult ? (
              <form onSubmit={handleGenerateRebuttal} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Notice Form / Type
                    </label>
                    <select
                      value={noticeType}
                      onChange={(e) => setNoticeType(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                    >
                      <option value="GST DRC-01">GST DRC-01 (Show Cause Notice)</option>
                      <option value="GST DRC-01A">GST DRC-01A (Pre-Notice Intimation)</option>
                      <option value="GST ASMT-10">GST ASMT-10 (Scrutiny Notice)</option>
                      <option value="Income Tax Sec 148">Income Tax Sec 148 (Reassessment)</option>
                      <option value="Income Tax Sec 143(1)">Income Tax Sec 143(1) Intimation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Statutory Section
                    </label>
                    <input
                      type="text"
                      value={statutorySection}
                      onChange={(e) => setStatutorySection(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alleged Tax Demand (INR)
                  </label>
                  <input
                    type="number"
                    value={demandAmount}
                    onChange={(e) => setDemandAmount(e.target.value)}
                    placeholder="e.g. 150000"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notice Ground / Discrepancy Summary
                  </label>
                  <textarea
                    rows={3}
                    value={noticeSummary}
                    onChange={(e) => setNoticeSummary(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(false)}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingRebuttal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    {isGeneratingRebuttal ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Formulating Legal Defense (Gemini)...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Generate Legal Rebuttal</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-700" />
                    <span className="font-semibold text-purple-900">
                      Draft Rebuttal Saved to Communications & Partner Approval Task Created
                    </span>
                  </div>
                  <span className="font-mono text-purple-700">
                    Deadline: {rebuttalResult.filingDeadlineDays} Days
                  </span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Key Legal Arguments
                  </h4>
                  <ul className="space-y-1.5">
                    {rebuttalResult.keyArguments.map((arg, idx) => (
                      <li key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 flex items-start gap-2">
                        <span className="font-bold text-purple-700">{idx + 1}.</span>
                        <span>{arg}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Draft Statutory Reply Letter
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleCopyText(rebuttalResult.rebuttalLetterText)}
                      className="inline-flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-semibold"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Letter</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed border border-slate-800">
                    {rebuttalResult.rebuttalLetterText}
                  </pre>
                </div>

                <div className="text-xs space-y-1 text-slate-600 pt-1">
                  <span className="font-semibold text-slate-800 block">Required Annexures:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {rebuttalResult.documentsToAnnex.map((doc, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-700">
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNoticeModal(false);
                      setRebuttalResult(null);
                    }}
                    className="px-4 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GstReturnRowActions;
