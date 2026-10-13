"use client";

import React from "react";
import {
  CreditCard,
  CheckCircle,
  Zap,
  Shield,
  Download,
  ArrowUpRight,
  HardDrive,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";

export default function SubscriptionPage() {
  const currentPlan = {
    name: "Professional Plan",
    billingCycle: "Annual (Billed Yearly)",
    renewalDate: "14 May 2027",
    amount: "₹18,999 / year",
    status: "Active",
  };

  const usageStats = [
    { label: "Active Client Profiles", current: 148, limit: 300, icon: Users },
    { label: "Document Vault Storage", current: "24.6 GB", limit: "100 GB", icon: HardDrive },
    { label: "Team Seats", current: 5, limit: 10, icon: Shield },
    { label: "AI Practice Queries (Monthly)", current: 340, limit: 1000, icon: Sparkles },
  ];

  const invoices = [
    { id: "SUB-INV-2026-01", date: "15 May 2026", amount: "₹18,999 + GST", status: "Paid" },
    { id: "SUB-INV-2025-01", date: "15 May 2025", amount: "₹14,999 + GST", status: "Paid" },
  ];

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Subscription & Platform Usage
          </h1>
          <p className="text-sm text-slate-500">
            Manage your firm&apos;s TRUV LedgerOS tier, add team licenses, and review tax invoices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700">
            <Zap className="h-4 w-4" />
            Upgrade to Enterprise
          </button>
        </div>
      </div>

      {/* Current Plan Overview Card */}
      <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                {currentPlan.name}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <CheckCircle className="h-3.5 w-3.5" /> {currentPlan.status}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 pt-1">{currentPlan.amount}</h2>
            <p className="text-xs text-slate-500">
              {currentPlan.billingCycle} • Next auto-renewal on{" "}
              <span className="font-semibold text-slate-700">{currentPlan.renewalDate}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Manage Payment Method
            </button>
          </div>
        </div>
      </div>

      {/* Usage Quota Breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {usageStats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
                <Icon className="h-4 w-4 text-teal-600" />
              </div>
              <div className="mt-3">
                <p className="text-xl font-bold text-slate-900">
                  {item.current} <span className="text-xs font-normal text-slate-400">/ {item.limit}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Billing History Table */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-base font-semibold text-slate-900">Subscription Invoices</h2>
          <p className="text-xs text-slate-500">Official GST input tax credit tax receipts for software fees.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/75 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Invoice Ref</th>
                <th className="px-6 py-3 font-semibold">Billing Date</th>
                <th className="px-6 py-3 font-semibold">Total Paid</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Tax Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-mono font-medium text-slate-900">{inv.id}</td>
                  <td className="px-6 py-4 text-xs text-slate-600">{inv.date}</td>
                  <td className="px-6 py-4 font-mono font-medium text-slate-800">{inv.amount}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700">
                      <Download className="h-3.5 w-3.5" /> Download PDF
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