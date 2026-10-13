"use client";

import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Filter,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  CheckCircle2,
  Users,
} from "lucide-react";

export default function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("Q2-FY26");

  const revenueMetrics = [
    { label: "Total Billed Fees", value: "₹18,45,000", change: "+14.2%", positive: true },
    { label: "Realized Collections", value: "₹15,22,500", change: "+9.8%", positive: true },
    { label: "Average Recovery Period", value: "24 Days", change: "-4 Days", positive: true },
    { label: "Unbilled Work-in-Progress", value: "₹3,20,000", change: "+12.1%", positive: false },
  ];

  const departmentPerformance = [
    { department: "GST Compliance & Filings", billed: "₹7,80,000", tasksCount: 142, completionRate: 98 },
    { department: "Statutory & Tax Audit", billed: "₹5,90,000", tasksCount: 38, completionRate: 84 },
    { department: "Income Tax & Appeals", billed: "₹3,15,000", tasksCount: 64, completionRate: 92 },
    { department: "Advisory & Structuring", billed: "₹1,60,000", tasksCount: 16, completionRate: 100 },
  ];

  const topClientRevenue = [
    { client: "Apex Logistics Ltd", fee: "₹3,40,000", returnsFiled: 12, compliance: "98%" },
    { client: "Zenith Retailers LLP", fee: "₹2,85,000", returnsFiled: 12, compliance: "100%" },
    { client: "Nova Tech Solutions", fee: "₹2,10,000", returnsFiled: 8, compliance: "95%" },
    { client: "Horizon Meditech Pvt Ltd", fee: "₹1,95,000", returnsFiled: 6, compliance: "92%" },
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
            Financial analytics, realization ratios, team task throughput, and client profitability.
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
              <option value="Q1-FY26">Q1 (Apr - Jun 2026)</option>
              <option value="Q2-FY26">Q2 (Jul - Sep 2026)</option>
              <option value="FY25-26">FY 2025 - 2026</option>
            </select>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700">
            <FileSpreadsheet className="h-4 w-4" />
            Export MIS (Excel)
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
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <span
                className={`flex items-center text-xs font-semibold ${
                  stat.positive ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {stat.positive ? (
                  <ArrowUpRight className="mr-0.5 h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="mr-0.5 h-3.5 w-3.5" />
                )}
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Grid of Reports */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Department Revenue Breakdown */}
        <div className="col-span-2 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Practice Head Realization</h2>
              <p className="text-xs text-slate-400">Revenue split and execution completion by service line</p>
            </div>
            <button className="text-xs font-semibold text-teal-600 hover:text-teal-700">Detailed View</button>
          </div>
          <div className="divide-y divide-slate-100">
            {departmentPerformance.map((dept) => (
              <div key={dept.department} className="py-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">{dept.department}</span>
                  <span className="font-mono font-bold text-slate-900">{dept.billed}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{dept.tasksCount} total filings / tasks</span>
                  <span className="font-semibold text-slate-700">{dept.completionRate}% timely</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${dept.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Clients by Revenue */}
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Top Retainer Clients</h2>
          <p className="text-xs text-slate-400">Highest practice billing this quarter</p>
          <div className="mt-4 space-y-4">
            {topClientRevenue.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.client}</p>
                  <p className="text-xs text-slate-400">{item.returnsFiled} Returns • {item.compliance} On-time</p>
                </div>
                <span className="font-mono text-sm font-bold text-slate-900">{item.fee}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}