"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Mail,
  Send,
  Search,
  CheckCheck,
  Clock,
  AlertCircle,
  PhoneCall,
  Plus,
  Inbox,
  X,
} from "lucide-react";
import Link from "next/link";

export interface CommunicationItem {
  id: string;
  clientId: string | null;
  clientName: string;
  channel: string;
  purpose: string;
  category: string;
  recipient: string;
  subject?: string | null;
  content: string;
  status: string;
  createdAt: string;
}

interface Props {
  communications: CommunicationItem[];
}

export function CommunicationsClient({ communications }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [activePayload, setActivePayload] = useState<CommunicationItem | null>(null);

  const totalSent = communications.length;
  const whatsappCount = communications.filter(
    (c) => c.channel.toUpperCase() === "WHATSAPP"
  ).length;
  const emailCount = communications.filter(
    (c) => c.channel.toUpperCase() === "EMAIL"
  ).length;
  const voiceCount = communications.filter(
    (c) => c.channel.toUpperCase() === "VOICE"
  ).length;
  const failedCount = communications.filter(
    (c) => c.status === "FAILED" || c.status === "NO_ANSWER"
  ).length;

  const filtered = communications.filter((log) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      log.clientName.toLowerCase().includes(term) ||
      log.recipient.toLowerCase().includes(term) ||
      log.purpose.toLowerCase().includes(term) ||
      log.category.toLowerCase().includes(term);

    const matchesChannel =
      channelFilter === "all" ||
      log.channel.toLowerCase() === channelFilter.toLowerCase();

    return matchesSearch && matchesChannel;
  });

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Client Communications Hub
          </h1>
          <p className="text-sm text-slate-500">
            Automated WhatsApp reminders, filing acknowledgments, email broadcasts, and voice call dispatch logs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/automations"
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 transition"
          >
            <Plus className="h-4 w-4" />
            Configure Automations
          </Link>
        </div>
      </div>

      {/* Real KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Dispatches</span>
            <MessageSquare className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{totalSent}</p>
          <span className="text-xs text-slate-400">Total automated dispatches</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Follow-ups</span>
            <CheckCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{whatsappCount}</p>
          <span className="text-xs text-slate-400">Payment & GST reminders</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Email Deliveries</span>
            <Mail className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{emailCount}</p>
          <span className="text-xs text-slate-400">Invoices & legal notices</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Failed Deliveries</span>
            <AlertCircle className="h-4 w-4 text-rose-600" />
          </div>
          <p className={`mt-3 text-2xl font-bold ${failedCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
            {failedCount}
          </p>
          <span className="text-xs text-slate-400">Unanswered or bounced</span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, recipient, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {[
              { id: "all", label: "All Logs" },
              { id: "whatsapp", label: "WhatsApp" },
              { id: "email", label: "Email" },
              { id: "voice", label: "Voice" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setChannelFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  channelFilter === tab.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-slate-50 p-3 text-slate-400 mb-3 border border-slate-200">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              No communications dispatched yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Trigger reminders, invoice follow-ups, or notice responses to view live activity.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/75 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Client</th>
                  <th className="px-6 py-3 font-semibold">Channel</th>
                  <th className="px-6 py-3 font-semibold">Trigger / Category</th>
                  <th className="px-6 py-3 font-semibold">Recipient</th>
                  <th className="px-6 py-3 font-semibold">Dispatched At</th>
                  <th className="px-6 py-3 font-semibold">Delivery State</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-semibold text-slate-900">{log.clientName}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${
                          log.channel.toUpperCase() === "WHATSAPP"
                            ? "bg-emerald-50 text-emerald-700"
                            : log.channel.toUpperCase() === "VOICE"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {log.channel.toUpperCase() === "WHATSAPP" ? (
                          <MessageSquare className="h-3 w-3" />
                        ) : log.channel.toUpperCase() === "VOICE" ? (
                          <PhoneCall className="h-3 w-3" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                        {log.channel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-800">
                      <div>{log.purpose}</div>
                      <div className="text-[10px] text-slate-400">{log.category}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.recipient}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          log.status === "DELIVERED" || log.status === "ANSWERED"
                            ? "bg-emerald-50 text-emerald-700"
                            : log.status === "FAILED" || log.status === "NO_ANSWER"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setActivePayload(log)}
                        className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                      >
                        View Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payload Modal */}
      {activePayload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl max-w-lg w-full space-y-4 shadow-xl text-left">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Communication Payload</h3>
                <p className="text-xs text-slate-500">
                  {activePayload.clientName} • {activePayload.channel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePayload(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {activePayload.subject && (
              <div className="text-xs font-semibold text-slate-800">
                Subject: {activePayload.subject}
              </div>
            )}
            <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed border border-slate-800">
              {activePayload.content}
            </pre>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActivePayload(null)}
                className="px-3.5 py-1.5 text-xs bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
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
