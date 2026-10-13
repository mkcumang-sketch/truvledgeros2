"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Server,
  Database,
  Activity,
  Lock,
  Unlock,
  Search,
  Radio,
  Sliders,
  CheckCircle2,
} from "lucide-react";

interface TenantFirm {
  id: string;
  firmName: string;
  managingPartner: string;
  plan: "Professional" | "Enterprise" | "Trial";
  activeUsers: number;
  dbCluster: string;
  status: "Healthy" | "Flagged" | "Maintenance";
  maintenanceMode: boolean;
}

const mockTenants: TenantFirm[] = [
  {
    id: "tenant-001",
    firmName: "TRUV Demo Chartered Accountants",
    managingPartner: "CA Priya Kulkarni",
    plan: "Professional",
    activeUsers: 5,
    dbCluster: "aws-ap-south-1a",
    status: "Healthy",
    maintenanceMode: false,
  },
  {
    id: "tenant-002",
    firmName: "Singhal & Associates CA",
    managingPartner: "CA Rajesh Singhal",
    plan: "Enterprise",
    activeUsers: 22,
    dbCluster: "aws-ap-south-1a",
    status: "Healthy",
    maintenanceMode: false,
  },
  {
    id: "tenant-003",
    firmName: "Vanguard Tax Consultants LLP",
    managingPartner: "CA Meenakshi Iyer",
    plan: "Professional",
    activeUsers: 8,
    dbCluster: "aws-ap-south-1b",
    status: "Flagged",
    maintenanceMode: true,
  },
  {
    id: "tenant-004",
    firmName: "Apex FinTax Advisory",
    managingPartner: "CA Neeraj Batra",
    plan: "Trial",
    activeUsers: 2,
    dbCluster: "aws-ap-south-1a",
    status: "Healthy",
    maintenanceMode: false,
  },
];

export function GodmodeClient() {
  const [tenants, setTenants] = useState<TenantFirm[]>(mockTenants);
  const [searchTerm, setSearchTerm] = useState("");
  const [featureFlags, setFeatureFlags] = useState({
    aiCopilotV2: true,
    gstnSandboxMock: true,
    autoWhatsAppCron: true,
    killSwitchGlobalRegistration: false,
  });

  const toggleMaintenance = (id: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, maintenanceMode: !t.maintenanceMode } : t
      )
    );
  };

  const toggleFlag = (key: keyof typeof featureFlags) => {
    setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filtered = tenants.filter(
    (t) =>
      t.firmName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.managingPartner.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-6 p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-rose-500" />
              SYSTEM GODMODE // SUPER-ADMIN
            </h1>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Global tenant orchestration, cluster latency, hot-swapping feature flags, and practice lockouts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-amber-400 flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 animate-spin" /> Live Ops: PROD-INDIA
          </span>
        </div>
      </div>

      {/* Cluster Health Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase tracking-wider">Active Practices</span>
            <Server className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{tenants.length}</p>
          <span className="text-xs text-emerald-400">All database replicas synced</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase tracking-wider">Avg API Latency</span>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-3 text-2xl font-bold text-sky-400">42ms</p>
          <span className="text-xs text-slate-400">p99 threshold &lt; 120ms</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase tracking-wider">GSTN Queue Jobs</span>
            <Database className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-400">18 Pending</p>
          <span className="text-xs text-slate-400">Worker concurrency: 8x</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase tracking-wider">Security State</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-3 text-2xl font-bold text-emerald-400">NOMINAL</p>
          <span className="text-xs text-slate-400">Zero active breaches</span>
        </div>
      </div>

      {/* Feature Flags Control Panel */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-teal-400" /> Platform Feature Toggles (Global)
          </span>
          <span className="text-[11px] text-slate-500">Live hot-reload enabled</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(featureFlags).map(([key, val]) => (
            <div
              key={key}
              onClick={() => toggleFlag(key as keyof typeof featureFlags)}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer select-none transition ${
                val
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                  : "border-slate-800 bg-slate-950 text-slate-500"
              }`}
            >
              <span className="truncate pr-2">{key}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${val ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
                {val ? "ON" : "OFF"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tenant Directory */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between font-mono">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search firm, partner, or cluster..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-rose-500"
            />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} Tenants registered</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold">Tenant ID & Practice</th>
                <th className="px-6 py-3 font-semibold">Managing Partner</th>
                <th className="px-6 py-3 font-semibold">Plan</th>
                <th className="px-6 py-3 font-semibold">Cluster</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Lock / Maintenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-800/40">
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{tenant.firmName}</p>
                    <p className="text-[11px] text-slate-500">{tenant.id}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{tenant.managingPartner}</td>
                  <td className="px-6 py-4">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                      {tenant.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{tenant.dbCluster}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${
                        tenant.status === "Healthy"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-rose-950 text-rose-400 border border-rose-800"
                      }`}
                    >
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => toggleMaintenance(tenant.id)}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-bold transition ${
                        tenant.maintenanceMode
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      {tenant.maintenanceMode ? (
                        <>
                          <Lock className="h-3 w-3" /> Locked
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3 w-3" /> Unlocked
                        </>
                      )}
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
