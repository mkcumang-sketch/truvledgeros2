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
      case "VOICE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFF4EE] text-[#D95524] border border-[#F26B38]/30">
            <PhoneCall className="w-3 h-3 text-[#F26B38]" />
            Voice
          </span>
        );
      case "WHATSAPP":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <MessageSquare className="w-3 h-3 text-emerald-600" />
            WhatsApp
          </span>
        );
      case "EMAIL":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
            <Mail className="w-3 h-3 text-sky-600" />
            Email
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F8FAFC] text-slate-700 border border-[#E5E7EB]">
            {channel}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Delivered
          </span>
        );
      case "SENT":
      case "INITIATED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            <Clock className="w-3 h-3 text-sky-600" />
            {status}
          </span>
        );
      case "STANDBY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Standby
          </span>
        );
      case "FAILED":
      case "BOUNCED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#F8FAFC] text-slate-700 border border-[#E5E7EB]">
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
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            🤝 Promised to Pay
          </span>
        );
      case "COOPERATIVE":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            👍 Cooperative
          </span>
        );
      case "DISPUTING":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            ⚠️ Disputing Balance
          </span>
        );
      case "UNRESPONSIVE":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F8FAFC] text-slate-600 border border-[#E5E7EB]">
            ⏳ Unresponsive
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#F8FAFC] text-slate-600 border border-[#E5E7EB]">
            {sentiment}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-white border border-[#E5E7EB] rounded-xl shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search outbox by client, phone, email, or content..."
            className="w-full bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#263238] placeholder:text-slate-400 focus:outline-hidden focus:border-[#F26B38] focus:ring-2 focus:ring-[#F26B38]/20 transition-colors"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Channel Filter Pills */}
          <div className="flex items-center bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg p-0.5 text-xs">
            {["ALL", "WHATSAPP", "VOICE", "EMAIL"].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setFilterChannel(ch)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  filterChannel === ch
                    ? "bg-[#F26B38] text-white shadow-2xs"
                    : "text-slate-600 hover:text-[#263238]"
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
            className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] text-slate-600 hover:text-slate-900 hover:bg-[#FAF9F5] transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
            title="Refresh Live Outbox Feed"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#F26B38]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Outbox Table */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#263238]">
            <thead className="bg-[#FAF9F5] border-b border-[#E5E7EB] text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Dispatched At</th>
                <th className="py-3 px-4">Client / Entity</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Message Preview</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Sentiment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] font-sans">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    No outbound practice communications recorded yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-[#FAF9F5] transition-colors cursor-pointer group"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(item.dispatchedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-[#263238] group-hover:text-[#D95524] transition-colors">
                        {item.client?.name || "Practice Contact"}
                      </div>
                      {item.client?.businessName && (
                        <div className="text-[10px] text-slate-500">
                          {item.client.businessName}
                        </div>
                      )}
                      {item.invoice && (
                        <div className="text-[10px] text-[#D95524] font-mono font-semibold">
                          Inv #{item.invoice.invoiceNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getChannelBadge(item.channel)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {item.recipient}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-500">
                      {item.subject ? (
                        <span className="font-semibold text-[#263238] mr-1.5">
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
                        className="px-2.5 py-1 rounded-md bg-[#FAF9F5] hover:bg-[#FFF4EE] hover:text-[#D95524] border border-[#E5E7EB] text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-white border border-[#E2E0D8] rounded-2xl shadow-2xl p-6 text-xs text-[#263238] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                {getChannelBadge(selectedItem.channel)}
                <span className="font-bold text-[#263238] text-sm">Outbox Audit Record</span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-lg hover:bg-[#FAF9F5]"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E7EB]">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Client / Recipient</span>
                <span className="font-bold text-[#263238]">
                  {selectedItem.client?.name || "N/A"} ({selectedItem.recipient})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Dispatched At</span>
                <span className="font-mono text-slate-700">
                  {new Date(selectedItem.dispatchedAt).toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Delivery Status</span>
                <div className="mt-0.5">{getStatusBadge(selectedItem.status)}</div>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">Client Sentiment</span>
                <div className="mt-0.5">{getSentimentPill(selectedItem.sentiment) || "Pending"}</div>
              </div>
              {selectedItem.externalRef && (
                <div className="col-span-2">
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">External Telephony / Gateway SID</span>
                  <span className="font-mono text-[11px] text-[#D95524]">
                    {selectedItem.externalRef}
                  </span>
                </div>
              )}
            </div>

            {selectedItem.subject && (
              <div>
                <span className="text-slate-500 font-bold uppercase text-[10px] block mb-1">Subject</span>
                <p className="p-2.5 bg-[#FAF9F5] border border-[#E5E7EB] rounded-lg text-[#263238] font-semibold">
                  {selectedItem.subject}
                </p>
              </div>
            )}

            <div>
              <span className="text-slate-500 font-bold uppercase text-[10px] block mb-1">Full Dispatched Content</span>
              <pre className="p-3 bg-[#FAF9F5] border border-[#E5E7EB] rounded-xl text-[#263238] font-mono text-[11px] whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                {selectedItem.content}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => {
                  if (selectedItem.client?.id) {
                    onOpenDispatchModal?.(selectedItem.client.id, selectedItem.channel as any);
                    setSelectedItem(null);
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-[#FFF4EE] text-[#D95524] border border-[#F26B38]/30 hover:bg-[#FFE7DA] transition-all font-semibold cursor-pointer"
              >
                Send Follow-up to Client
              </button>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-lg bg-white border border-[#E5E7EB] text-slate-700 hover:bg-[#FAF9F5] font-semibold transition-colors cursor-pointer"
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
