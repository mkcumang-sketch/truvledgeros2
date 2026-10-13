"use client";

import { useState } from "react";
import { sendClientGstSummaryAction, markGstReturnFiledAction } from "@/lib/server/actions/gst-actions";
import { Send, CheckCircle2, Loader2 } from "lucide-react";

export default function GstReturnRowActions({
  returnId,
  status,
  arnNumber,
}: {
  returnId: string;
  status: string;
  arnNumber: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showArnModal, setShowArnModal] = useState(false);
  const [arnInput, setArnInput] = useState(arnNumber);

  async function handleSendSummary() {
    try {
      setLoading(true);
      await sendClientGstSummaryAction(returnId);
    } catch (e) {
      alert("Error sending summary: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkFiled(e: React.FormEvent) {
    e.preventDefault();
    if (!arnInput.trim()) return;
    try {
      setLoading(true);
      await markGstReturnFiledAction({ returnId, arnNumber: arnInput.trim() });
      setShowArnModal(false);
    } catch (e) {
      alert("Error marking filed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (status === "FILED") {
    return (
      <span className="text-xs text-slate-400 font-mono">
        ARN: {arnNumber.slice(0, 10)}...
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "READY_FOR_REVIEW" && (
        <button
          onClick={handleSendSummary}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send Sign-Off
        </button>
      )}

      {status === "AWAITING_CLIENT_APPROVAL" && (
        <button
          onClick={() => setShowArnModal(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Mark Filed
        </button>
      )}

      {showArnModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleMarkFiled} className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-white">Record Filing Sign-Off</h3>
            <p className="text-xs text-slate-400">
              Enter the government GST portal Acknowledgement Reference Number (ARN):
            </p>
            <input
              type="text"
              required
              placeholder="e.g. AA0909260123456"
              value={arnInput}
              onChange={(e) => setArnInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowArnModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
              >
                {loading ? "Recording..." : "Confirm Filing"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}