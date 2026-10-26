"use client";

import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  FileSpreadsheet,
  ArrowUpRight,
  Inbox,
  Users,
  CheckCircle2,
} from "lucide-react";
import { formatINR } from "@/lib/financial/math";

export interface ReportMetrics {
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  invoicesCount: number;
  topClients: Array<{
    name: string;
    billed: number;
    invoicesCount: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
}

interface Props {
  metrics: ReportMetrics;
}

export function ReportsClient({ metrics }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState("FY26");

  const revenueMetrics = [
    {
      label: "Total Billed Fees",
      value: formatINR(metrics.totalBilled),
      subtitle: `${metrics.invoicesCount} total invoices issued`,
      positive: metrics.totalBilled > 0,
    },
    {
      label: "Realized Collections",
      value: formatINR(metrics.totalCollected),
      subtitle: "Verified payments received",
      positive: metrics.totalCollected > 0,
    },
    {
      label: "Outstanding Receivables",
      value: formatINR(metrics.totalOutstanding),
      subtitle: "Pending client settlements",
      positive: metrics.totalOutstanding === 0,
    },
    {
      label: "Realization Rate",
      value: `${metrics.collectionRate.toFixed(1)}%`,
      subtitle: "Collection vs billings ratio",
      positive: metrics.collectionRate >= 80,
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Practice Reports & Performance
          </h1>
          <p className="text-sm text-slate-500">
            Financial analytics, realization ratios, client billing metrics, and practice performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            <Calendar className="mr-2 h-4 w-4 text-slate-400" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="FY26">FY 2026 - 2027</option>
              <option value="Q1">Q1 (Apr - Jun 2026)</option>
              <option value="Q2">Q2 (Jul - Sep 2026)</option>
              <option value="Q3">Q3 (Oct - Dec 2026)</option>
              <option value="Q4">Q4 (Jan - Mar 2027)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => alert("Practice MIS report export queued.")}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export MIS
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {revenueMetrics.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">{stat.label}</span>
              <BarChart3 className="h-4 w-4 text-teal-600" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <span className="text-xs text-slate-400 mt-0.5 block">{stat.subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      {metrics.invoicesCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="rounded-full bg-slate-50 p-4 text-slate-400 mb-3 border border-slate-200">
            <Inbox className="h-8 w-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            No practice billing data recorded
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            As invoices and client receipts are recorded, your realization charts and revenue breakdowns will automatically populate here.
          </p>
        </div>
      ) : (
        /* Grid of Real Reports */
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Practice Category Breakdown */}
          <div className="col-span-2 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Service Line Realization</h2>
                <p className="text-xs text-slate-400">Revenue split by invoice items and services</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {metrics.categoryBreakdown.map((cat) => {
                const percent =
                  metrics.totalBilled > 0
                    ? Math.round((cat.amount / metrics.totalBilled) * 100)
                    : 0;
                return (
                  <div key={cat.category} className="py-3.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-800">{cat.category}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatINR(cat.amount)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{cat.count} billings recorded</span>
                      <span className="font-semibold text-slate-700">{percent}% of total fees</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-600"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Clients by Revenue */}
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Top Retainer Clients</h2>
            <p className="text-xs text-slate-400">Highest practice billing to date</p>
            <div className="mt-4 space-y-4">
              {metrics.topClients.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.invoicesCount} Invoices</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {formatINR(item.billed)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
