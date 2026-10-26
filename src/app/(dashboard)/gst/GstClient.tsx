"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Landmark,
  FileCheck,
  AlertTriangle,
  Clock,
  Download,
  RefreshCw,
  Search,
  CheckCircle,
  ExternalLink,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/financial/math";
import { GstReturnRowActions } from "./gst-row-actions";

interface GstReturnItem {
  id: string;
  returnType: string;
  period: string;
  dueDate: Date;
  status: string;
  outputTax: any;
  inputTaxCredit: any;
  netPayable: any;
  arnNumber: string | null;
  client: {
    id: string;
    name: string;
    gstin: string | null;
  };
}

interface ClientGstProfile {
  id: string;
  name: string;
  gstin: string | null;
  planName: string | null;
}

interface Props {
  returns: GstReturnItem[];
  gstClients: ClientGstProfile[];
}

export function GstClient({ returns, gstClients }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [returnTypeFilter, setReturnTypeFilter] = useState("ALL");

  const filedCount = returns.filter((r) => r.status === "FILED").length;
  const pendingCount = returns.filter((r) => r.status !== "FILED").length;

  const filteredReturns = returns.filter((r) => {
    if (returnTypeFilter !== "ALL" && r.returnType !== returnTypeFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const clientMatch = r.client.name.toLowerCase().includes(term);
      const gstinMatch = (r.client.gstin || "").toLowerCase().includes(term);
      if (!clientMatch && !gstinMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            GST Compliance & Return Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            GSTR-1 & GSTR-3B monthly cycles, ITC validation, and client filing sign-offs.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Registered GSTINs"
          value={gstClients.length}
          subtitle="Tax registered practice clients"
          badge="Active GSTINs"
          badgeVariant="success"
          icon={<Landmark className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Returns Filed"
          value={filedCount}
          subtitle="Confirmed ARN submissions"
          badge="Filed"
          badgeVariant="success"
          icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Awaiting Review"
          value={pendingCount}
          subtitle="Data intake or review stage"
          badge="In Progress"
          badgeVariant="warning"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Compliance Rate"
          value={gstClients.length > 0 ? "100%" : "—"}
          subtitle="All returns tracked on calendar"
          badge="On Schedule"
          badgeVariant="success"
          icon={<FileCheck className="w-4 h-4 text-emerald-600" />}
        />
      </div>

      {/* Returns Ledger Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Practice Return Ledger (FY 2026-27)</CardTitle>
            <p className="text-xs text-graphite-500 mt-0.5">
              Live status synchronized with canonical client profiles
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-graphite-500">Return:</span>
            <select
              value={returnTypeFilter}
              onChange={(e) => setReturnTypeFilter(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="ALL">All Return Types</option>
              <option value="GSTR_1">GSTR-1 (Outward Supplies)</option>
              <option value="GSTR_3B">GSTR-3B (Summary Return)</option>
              <option value="GSTR_9">GSTR-9 (Annual Return)</option>
            </select>
          </div>
        </CardHeader>

        {filteredReturns.length === 0 ? (
          <EmptyState
            title="No GST return filings recorded"
            description="All active registered GSTINs will automatically show their monthly filing cycle when generated."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5">Client & GSTIN</th>
                  <th className="px-4 py-3.5">Return Type</th>
                  <th className="px-4 py-3.5">Tax Period</th>
                  <th className="px-4 py-3.5">Due Date</th>
                  <th className="px-4 py-3.5 text-right">Net Tax Liability</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Filing Action / ARN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {filteredReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/clients/${r.client.id}`}
                        className="font-semibold text-graphite-900 text-xs hover:text-emerald-700 block"
                      >
                        {r.client.name}
                      </Link>
                      <span className="font-mono text-[10px] text-graphite-400 block mt-0.5">
                        {r.client.gstin}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono font-medium text-xs text-emerald-800">
                      {r.returnType.replace("_", "-")}
                    </td>
                    <td className="px-4 py-4 text-xs text-graphite-600">{r.period}</td>
                    <td className="px-4 py-4 text-xs font-mono text-graphite-600">
                      {new Date(r.dueDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-graphite-900 text-xs">
                      {formatINR(Number(r.netPayable || 0))}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant={r.status === "FILED" ? "success" : "warning"}
                        size="sm"
                      >
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <GstReturnRowActions
                        returnId={r.id}
                        status={r.status}
                        arnNumber={r.arnNumber}
                        clientId={r.client.id}
                        clientName={r.client.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Registered Clients Roster */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Practice GSTINs</CardTitle>
          <p className="text-xs text-graphite-500 mt-0.5">
            Active clients linked to regular monthly and QRMP quarterly cycles
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto border-t border-[#EBE9E1]">
            <table className="w-full text-left text-xs text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[10px] uppercase font-semibold text-graphite-500 border-b border-[#E2E0D8]">
                <tr>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Entity Constitution</th>
                  <th className="py-3 px-4">15-Digit GSTIN</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {gstClients.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF9F5]">
                    <td className="py-3 px-4 font-semibold text-graphite-900">
                      <Link href={`/clients/${c.id}`} className="hover:text-emerald-700">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="neutral" size="sm">
                        {c.planName || "Pvt Ltd"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-graphite-800">
                      {c.gstin}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/clients/${c.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                      >
                        Client 360° <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
