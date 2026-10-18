"use client";

import React, { useState } from "react";
import {
  sendClientGstSummaryAction,
  markGstReturnFiledAction,
} from "@/lib/server/actions/gst-actions";
import { toast } from "sonner";
import { Send, CheckCircle2, Loader2, X, FileText } from "lucide-react";

export interface GstReturnRowActionsProps {
  returnId: string;
  status: string;
  arnNumber?: string | null;
}

export function GstReturnRowActions({
  returnId,
  status,
  arnNumber,
}: GstReturnRowActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showArnModal, setShowArnModal] = useState(false);
  const [arnInput, setArnInput] = useState(arnNumber || "");
  const [feedback, setFeedback] = useState<string | null>(null);

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

  if (status === "FILED") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        ARN: {arnNumber ? arnNumber.slice(0, 14) : "VERIFIED"}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {feedback && (
        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 animate-in fade-in">
          {feedback}
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
    </div>
  );
}

export default GstReturnRowActions;