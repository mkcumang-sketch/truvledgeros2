"use client";

import React from "react";
import {
  CheckCircle,
  Zap,
  Shield,
  Download,
  HardDrive,
  Users,
  Sparkles,
  Inbox,
} from "lucide-react";

export interface SubscriptionData {
  planName: string;
  billingCycle: string;
  amount: string;
  status: string;
  renewalDate: string;
  usage: {
    activeClients: number;
    clientLimit: number;
    storageUsedStr: string;
    storageLimitStr: string;
    teamSeats: number;
    seatsLimit: number;
    aiQueries: number;
    aiLimit: number;
  };
  invoices: Array<{
    id: string;
    date: string;
    amount: string;
    status: string;
  }>;
}

interface Props {
  subscription: SubscriptionData;
}

export function SubscriptionClient({ subscription }: Props) {
  const usageStats = [
    {
      label: "Active Client Profiles",
      current: subscription.usage.activeClients,
      limit: subscription.usage.clientLimit,
      icon: Users,
    },
    {
      label: "Document Vault Storage",
      current: subscription.usage.storageUsedStr,
      limit: subscription.usage.storageLimitStr,
      icon: HardDrive,
    },
    {
      label: "Team Seats",
      current: subscription.usage.teamSeats,
      limit: subscription.usage.seatsLimit,
      icon: Shield,
    },
    {
      label: "AI Practice Queries",
      current: subscription.usage.aiQueries,
      limit: subscription.usage.aiLimit,
      icon: Sparkles,
    },
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
          <button
            type="button"
            onClick={() => alert("Practice license tier management.")}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 transition"
          >
            <Zap className="h-4 w-4" />
            Upgrade Tier
          </button>
        </div>
      </div>

      {/* Current Plan Overview Card */}
      <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                {subscription.planName}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <CheckCircle className="h-3.5 w-3.5" /> {subscription.status}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 pt-1">{subscription.amount}</h2>
            <p className="text-xs text-slate-500">
              {subscription.billingCycle} • Status:{" "}
              <span className="font-semibold text-slate-700">{subscription.renewalDate}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => alert("Payment method is synchronized with your billing partner.")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Billing Settings
            </button>
          </div>
        </div>
      </div>

      {/* Real Usage Quota Breakdown */}
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
          <p className="text-xs text-slate-500">Official GST input tax credit receipts for practice software subscriptions.</p>
        </div>

        {subscription.invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="rounded-full bg-slate-50 p-3 text-slate-400 mb-2 border border-slate-200">
              <Inbox className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-700">No subscription invoices generated yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Platform license tax invoices will appear here once generated for the current billing cycle.
            </p>
          </div>
        ) : (
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
                {subscription.invoices.map((inv) => (
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
        )}
      </div>
    </div>
  );
}
