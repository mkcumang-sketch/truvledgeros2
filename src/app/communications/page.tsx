"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Mail,
  Send,
  Search,
  Filter,
  CheckCheck,
  Clock,
  AlertCircle,
  FileText,
  PhoneCall,
  Plus,
} from "lucide-react";

interface CommLog {
  id: string;
  client: string;
  channel: "WhatsApp" | "Email" | "Call";
  type: "GST Deadline Reminder" | "Invoice & Payment Link" | "Notice Received" | "Document Request";
  recipient: string;
  sentAt: string;
  status: "Delivered" | "Read" | "Failed" | "Queued";
}

const mockLogs: CommLog[] = [
  {
    id: "comm-1",
    client: "Apex Logistics Ltd",
    channel: "WhatsApp",
    type: "GST Deadline Reminder",
    recipient: "+91 94150 44556",
    sentAt: "Today, 10:14 AM",
    status: "Read",
  },
  {
    id: "comm-2",
    client: "Zenith Retailers LLP",
    channel: "Email",
    type: "Invoice & Payment Link",
    recipient: "rohit@zenithretail.com",
    sentAt: "Today, 09:30 AM",
    status: "Delivered",
  },
  {
    id: "comm-3",
    client: "Balaji Steels & Infra",
    channel: "WhatsApp",
    type: "Document Request",
    recipient: "+91 98391 77665",
    sentAt: "Yesterday, 04:45 PM",
    status: "Delivered",
  },
  {
    id: "comm-4",
    client: "Nova Tech Solutions",
    channel: "Email",
    type: "Notice Received",
    recipient: "accounts@novatech.co",
    sentAt: "08 Oct 2026",
    status: "Read",
  },
  {
    id: "comm-5",
    client: "Kalyan FinCorp Services",
    channel: "WhatsApp",
    type: "GST Deadline Reminder",
    recipient: "+91 99350 22119",
    sentAt: "07 Oct 2026",
    status: "Failed",
  },
];

export default function CommunicationsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");

  const filtered = mockLogs.filter((log) => {
    const matchesSearch =
      log.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesChannel =
      channelFilter === "all" || log.channel.toLowerCase() === channelFilter.toLowerCase();

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
            Automated WhatsApp reminders, filing acknowledgments, email broadcasts, and dispatch logs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            New Broadcast
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Messages Sent (Oct)</span>
            <MessageSquare className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">412</p>
          <span className="text-xs text-emerald-600">+18% vs last month</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Open Rate</span>
            <CheckCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">94.2%</p>
          <span className="text-xs text-slate-400">High engagement on dues</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Email Deliverability</span>
            <Mail className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">99.1%</p>
          <span className="text-xs text-emerald-600">Verified SPF/DKIM</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Failed Deliveries</span>
            <AlertCircle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-rose-600">1</p>
          <span className="text-xs text-rose-600">Invalid phone number</span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, contact, or message type..."
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
                  <td className="px-6 py-4 font-semibold text-slate-900">{log.client}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${
                        log.channel === "WhatsApp"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {log.channel === "WhatsApp" ? (
                        <MessageSquare className="h-3 w-3" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {log.channel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-800">{log.type}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.recipient}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">{log.sentAt}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        log.status === "Read"
                          ? "bg-emerald-50 text-emerald-700"
                          : log.status === "Delivered"
                          ? "bg-teal-50 text-teal-700"
                          : log.status === "Failed"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs font-semibold text-teal-600 hover:text-teal-700">
                      View Payload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}