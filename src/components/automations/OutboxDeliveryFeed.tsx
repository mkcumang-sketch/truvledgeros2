"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  MessageSquare,
  PhoneCall,
  Mail,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Inbox,
  User,
  Radio,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { getLiveOutboxFeedAction } from "@/lib/server/actions/automation-command-actions";

export interface CommunicationItem {
  id: string;
  channel: "WHATSAPP" | "EMAIL" | "VOICE" | "SMS" | "PORTAL" | "WEB";
  direction: "OUTBOUND" | "INBOUND";
  status: "QUEUED" | "INITIATED" | "SENT" | "DELIVERED" | "FAILED" | "BOUNCED" | "STANDBY";
  recipient: string;
  subject: string | null;
  content: string;
  sentiment: string | null;
  externalRef: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  dispatchedAt: string;
  client?: {
    id: string;
    name: string;
    phone: string;
    email: string;
    businessName: string | null;
  } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    totalAmount: any;
  } | null;
}

interface OutboxDeliveryFeedProps {
  initialItems?: CommunicationItem[];
  onOpenDispatchModal?: (clientId?: string, channel?: "WHATSAPP" | "EMAIL" | "VOICE") => void;
}

export function OutboxDeliveryFeed({
  initialItems = [],
  onOpenDispatchModal,
}: OutboxDeliveryFeedProps) {
  const [items, setItems] = useState<CommunicationItem[]>(initialItems);
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [selectedItem, setSelectedItem] = useState<CommunicationItem | null>(null);

  const fetchLatestFeed = () => {
    startRefreshTransition(async () => {
      try {
        const res = await getLiveOutboxFeedAction({
          channel: filterChannel !== "ALL" ? filterChannel : undefined,
          search: searchQuery.trim() || undefined,
          limit: 100,
        });

        if (res.success && res.data) {
          setItems(res.data as CommunicationItem[]);
        } else {
          const errorMsg =
            !res.success && "error" in res && typeof (res as any).error === "string"
              ? (res as any).error
              : "Failed to refresh outbox.";
          toast.error(errorMsg);
        }
      } catch {
        toast.error("Failed to fetch live outbox feed.");
      }
    });
  };

  useEffect(() => {
    fetchLatestFeed();
  }, [filterChannel]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLatestFeed();
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "WHATSAPP":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
            <MessageSquare className="w-3 h-3" />
            WhatsApp
          </span>
        );
      case "VOICE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
            <PhoneCall className="w-3 h-3" />
            Sarvam Voice
          </span>
        );
      case "EMAIL":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-950/60 text-sky-400 border border-sky-500/30">
            <Mail className="w-3 h-3" />
            Email
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {channel}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "SENT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            {status}
          </span>
        );
      case "INITIATED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            <Radio className="w-3 h-3 animate-pulse" />
            INITIATED
          </span>
        );
      case "QUEUED":
      case "STANDBY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            {status}
          </span>
        );
      case "FAILED":
      case "BOUNCED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  const getSentimentPill = (sentiment: string | null) => {
    if (!sentiment) return null;
    switch (sentiment) {
      case "PROMISED_TO_PAY":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
            🤝 Promised to Pay
          </span>
        );
      case "COOPERATIVE":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-500/30">
            👍 Cooperative
          </span>
        );
      case "DISPUTING":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-500/30">
            ⚠️ Disputing Balance
          </span>
        );
      case "UNRESPONSIVE":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            ⏳ Unresponsive
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
            {sentiment}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search outbox by client, phone, email, or content..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Channel Filter Pills */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            {["ALL", "WHATSAPP", "VOICE", "EMAIL"].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setFilterChannel(ch)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  filterChannel === ch
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {ch === "ALL" ? "All Channels" : ch === "WHATSAPP" ? "WhatsApp" : ch === "VOICE" ? "Voice" : "Email"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchLatestFeed}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh Live Outbox Feed"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Outbox Table */}
      <div className="bg-[#090D16] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3.5 px-4">Dispatched At</th>
                <th className="py-3.5 px-4">Client / Entity</th>
                <th className="py-3.5 px-4">Channel</th>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Message Preview</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Sentiment</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    No outbound practice communications recorded yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-900/50 transition-colors cursor-pointer group"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(item.dispatchedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-200">
                        {item.client?.name || "Practice Contact"}
                      </div>
                      {item.client?.businessName && (
                        <div className="text-[10px] text-slate-500">
                          {item.client.businessName}
                        </div>
                      )}
                      {item.invoice && (
                        <div className="text-[10px] text-indigo-400 font-mono">
                          Inv #{item.invoice.invoiceNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getChannelBadge(item.channel)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                      {item.recipient}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-400">
                      {item.subject ? (
                        <span className="font-medium text-slate-300 mr-1.5">
                          [{item.subject}]
                        </span>
                      ) : null}
                      {item.content}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getSentimentPill(item.sentiment)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Inspection Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-[#090D16] border border-slate-800 rounded-2xl shadow-2xl p-6 text-xs text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {getChannelBadge(selectedItem.channel)}
                <span className="font-semibold text-white">Outbox Audit Record</span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px]">Client / Recipient</span>
                <span className="font-medium text-slate-200">
                  {selectedItem.client?.name || "N/A"} ({selectedItem.recipient})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Dispatched At</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedItem.dispatchedAt).toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Delivery Status</span>
                <div className="mt-0.5">{getStatusBadge(selectedItem.status)}</div>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Client Sentiment</span>
                <div className="mt-0.5">{getSentimentPill(selectedItem.sentiment) || "Pending"}</div>
              </div>
              {selectedItem.externalRef && (
                <div className="col-span-2">
                  <span className="text-slate-500 block text-[10px]">External Telephony / Gateway SID</span>
                  <span className="font-mono text-[11px] text-indigo-400">
                    {selectedItem.externalRef}
                  </span>
                </div>
              )}
            </div>

            {selectedItem.subject && (
              <div>
                <span className="text-slate-400 font-medium block mb-1">Subject</span>
                <p className="p-2.5 bg-slate-900 rounded-lg text-slate-200 font-medium">
                  {selectedItem.subject}
                </p>
              </div>
            )}

            <div>
              <span className="text-slate-400 font-medium block mb-1">Full Dispatched Content</span>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-[11px] whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                {selectedItem.content}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (selectedItem.client?.id) {
                    onOpenDispatchModal?.(selectedItem.client.id, selectedItem.channel as any);
                    setSelectedItem(null);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-all font-medium"
              >
                Send Follow-up to Client
              </button>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

