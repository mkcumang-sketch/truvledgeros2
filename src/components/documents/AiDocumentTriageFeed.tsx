"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  MessageSquare,
  Check,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Building,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  approveAndPostToLedgerAction,
  sendClientTriageReplyAction,
} from "@/lib/server/actions/document-actions";
import { DocumentTriageResult } from "@/lib/server/ai/document-triage-scanner";

export interface TriagedDocumentFeedItem {
  id: string;
  name: string;
  category: string;
  status: string;
  createdAt: Date | string;
  fileUrl?: string | null;
  client: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  metadata?: DocumentTriageResult | null;
}

interface Props {
  items: TriagedDocumentFeedItem[];
  title?: string;
  description?: string;
  compact?: boolean;
}

export function AiDocumentTriageFeed({
  items,
  title = "AI Document Ingestion & Statutory Error Triage Feed",
  description = "Real-time omnichannel intake (WhatsApp/Email) with automated multi-modal arithmetic and GST statutory verification.",
  compact = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // WhatsApp Reply Modal State
  const [activeReplyDoc, setActiveReplyDoc] = useState<TriagedDocumentFeedItem | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [replyChannel, setReplyChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");

  const handleOpenReplyModal = (doc: TriagedDocumentFeedItem) => {
    setActiveReplyDoc(doc);
    const meta = doc.metadata as DocumentTriageResult | undefined;
    const defaultText =
      meta?.suggestedClientReply ||
      `Namaste ${doc.client.name} ji, we received your document (${doc.name}) for accounting. Please let us know if there are any specific notes. Thank you.`;
    setReplyText(defaultText);
    setReplyChannel(doc.client.phone ? "WHATSAPP" : "EMAIL");
  };

  const handleSendReply = () => {
    if (!activeReplyDoc || !replyText.trim()) return;

    startTransition(async () => {
      const res = await sendClientTriageReplyAction({
        documentId: activeReplyDoc.id,
        message: replyText.trim(),
        channel: replyChannel,
      });

      if (res.success) {
        toast.success(`Follow-up dispatched to ${activeReplyDoc.client.name} via ${replyChannel}`);
        // If WhatsApp, also offer direct WhatsApp Web link opening
        if (replyChannel === "WHATSAPP" && activeReplyDoc.client.phone) {
          const cleanPhone = activeReplyDoc.client.phone.replace(/[^0-9]/g, "");
          window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(replyText.trim())}`, "_blank");
        }
        setActiveReplyDoc(null);
      } else {
        toast.error(res.error || "Failed to dispatch client reply.");
      }
    });
  };

  const handleApproveAndPost = (doc: TriagedDocumentFeedItem) => {
    startTransition(async () => {
      const res = await approveAndPostToLedgerAction(doc.id);
      if (res.success) {
        toast.success(`Document #${doc.name} approved and posted to client ledger.`);
      } else {
        toast.error(res.error || "Failed to approve document.");
      }
    });
  };

  if (!items || items.length === 0) {
    return (
      <div className="bg-white border border-[#EBE9E1] rounded-2xl p-6 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
          <Sparkles className="w-5 h-5 text-indigo-500" />
        </div>
        <h3 className="text-sm font-semibold text-graphite-900">No Ingested Documents Yet</h3>
        <p className="text-xs text-graphite-500 max-w-md mx-auto">
          Client files submitted via WhatsApp or Email will appear here automatically with real-time AI triage and arithmetic error scanning.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Sparkles className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-graphite-900">
                {title}
              </h2>
            </div>
            <p className="text-xs text-graphite-500">{description}</p>
          </div>
          <span className="text-xs font-semibold text-graphite-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            {items.length} Ingested
          </span>
        </div>
      )}

      {/* Feed Cards Grid */}
      <div className="grid gap-3.5 sm:grid-cols-1 lg:grid-cols-2">
        {items.map((doc) => {
          const meta = (doc.metadata as DocumentTriageResult) || null;
          const detectedType = meta?.documentType || doc.category || "UNKNOWN";
          const confidence = meta?.confidenceScore ?? 85;
          const overallRisk = meta?.overallRisk || (doc.status === "REJECTED" ? "CRITICAL_ERROR" : "CLEAN");
          const errors = meta?.auditErrorsAndWarnings || [];
          const isExpanded = expandedDocId === doc.id;

          const isCritical = overallRisk === "CRITICAL_ERROR";
          const isWarning = overallRisk === "WARNING";
          const isClean = overallRisk === "CLEAN";

          return (
            <div
              key={doc.id}
              className={`rounded-2xl border transition-all duration-200 bg-white overflow-hidden ${
                isCritical
                  ? "border-rose-200 shadow-sm shadow-rose-100/50"
                  : isWarning
                  ? "border-amber-200 shadow-sm shadow-amber-100/50"
                  : "border-[#EBE9E1] hover:border-slate-300"
              }`}
            >
              <div className="p-4 sm:p-5 space-y-3.5">
                {/* Top Badge Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Auto-detected classification badge */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      {detectedType.replace(/_/g, " ")} [{confidence}% Confidence]
                    </span>

                    {/* Status Badge */}
                    {doc.status === "VERIFIED" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-3 h-3" /> Posted to Ledger
                      </span>
                    )}
                  </div>

                  {/* Risk Badge */}
                  {isCritical && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                      <AlertOctagon className="w-3.5 h-3.5" /> CRITICAL DISCREPANCY DETECTED
                    </span>
                  )}
                  {isWarning && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" /> STATUTORY WARNING
                    </span>
                  )}
                  {isClean && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> CLEAN
                    </span>
                  )}
                </div>

                {/* Document & Client Info */}
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-graphite-900 truncate" title={doc.name}>
                      {doc.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-graphite-500 mt-1">
                    <span className="inline-flex items-center gap-1 font-medium text-graphite-700">
                      <Building className="w-3 h-3 text-slate-400" /> {doc.client.name}
                    </span>
                    <span>•</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>

                {/* Detected Issues Callout */}
                {errors.length > 0 && (
                  <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                    isCritical ? "bg-rose-50/70 border-rose-200 text-rose-900" : "bg-amber-50/70 border-amber-200 text-amber-900"
                  }`}>
                    <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Detected Compliance & Arithmetic Issues ({errors.length})
                    </div>
                    <div className="space-y-1.5">
                      {errors.slice(0, isExpanded ? undefined : 2).map((err, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="font-bold">•</span>
                          <div>
                            <span className="font-semibold">{err.title}: </span>
                            <span className="opacity-90">{err.description}</span>
                            {err.estimatedExposureInr > 0 && (
                              <span className="font-mono font-bold text-[11px] ml-1">
                                [Exposure: ₹{err.estimatedExposureInr.toLocaleString("en-IN")}]
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {errors.length > 2 && (
                      <button
                        onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                        className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-0.5 pt-0.5"
                      >
                        {isExpanded ? (
                          <>Show less <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>+ {errors.length - 2} more issues <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Partner Executive Summary (if clean) */}
                {errors.length === 0 && meta?.partnerSummary && (
                  <p className="text-xs text-graphite-600 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 italic">
                    "{meta.partnerSummary}"
                  </p>
                )}

                {/* Extracted Metadata Pills */}
                {meta?.extractedMetadata && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono text-graphite-600 bg-[#FAF9F5] p-2.5 rounded-xl border border-[#E2E0D8]">
                    <div>
                      <span className="text-[10px] text-graphite-400 block font-sans uppercase">Doc #</span>
                      <span className="font-semibold text-graphite-800">{meta.extractedMetadata.invoiceNumber || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-graphite-400 block font-sans uppercase">Taxable</span>
                      <span className="font-semibold text-graphite-800">
                        {meta.extractedMetadata.taxableValue ? `₹${meta.extractedMetadata.taxableValue.toLocaleString("en-IN")}` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-graphite-400 block font-sans uppercase">GST Total</span>
                      <span className="font-semibold text-graphite-800">
                        {meta.extractedMetadata.totalAmount && meta.extractedMetadata.taxableValue
                          ? `₹${Math.round(meta.extractedMetadata.totalAmount - meta.extractedMetadata.taxableValue).toLocaleString("en-IN")}`
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-graphite-400 block font-sans uppercase">Invoice Total</span>
                      <span className="font-bold text-graphite-900">
                        {meta.extractedMetadata.totalAmount ? `₹${meta.extractedMetadata.totalAmount.toLocaleString("en-IN")}` : "—"}
                      </span>
                    </div>
                  </div>
                )}

                {/* 1-Click Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EBE9E1]">
                  {/* WhatsApp Quick Reply */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300"
                    onClick={() => handleOpenReplyModal(doc)}
                    disabled={isPending}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
                    Reply to Client via WhatsApp
                  </Button>

                  {/* Approve & Post to Ledger */}
                  {doc.status !== "VERIFIED" ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white"
                      onClick={() => handleApproveAndPost(doc)}
                      disabled={isPending}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Approve & Post to Ledger
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ledger Synchronized
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* WhatsApp / Email Quick Reply Modal */}
      {activeReplyDoc && (
        <Modal
          isOpen={Boolean(activeReplyDoc)}
          onClose={() => setActiveReplyDoc(null)}
          title={`Reply to Client — ${activeReplyDoc.client.name}`}
          description={`Pre-drafted statutory discrepancy notification based on AI audit scan.`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs font-semibold">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="replyChannel"
                  checked={replyChannel === "WHATSAPP"}
                  onChange={() => setReplyChannel("WHATSAPP")}
                />
                <span>WhatsApp ({activeReplyDoc.client.phone || "No phone configured"})</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="replyChannel"
                  checked={replyChannel === "EMAIL"}
                  onChange={() => setReplyChannel("EMAIL")}
                />
                <span>Email ({activeReplyDoc.client.email || "No email configured"})</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-graphite-700">
                Message to Client
              </label>
              <textarea
                rows={5}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full text-xs font-sans p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                placeholder="Type your message to the client..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveReplyDoc(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-600 text-white"
                onClick={handleSendReply}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />
                )}
                Send via {replyChannel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
