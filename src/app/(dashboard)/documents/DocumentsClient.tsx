"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Folder,
  FileText,
  UploadCloud,
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  Building,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";

interface DocumentItem {
  id: string;
  name: string;
  category: string;
  status: string;
  fileSize: number | null;
  createdAt: Date;
  client: {
    id: string;
    name: string;
  };
}

interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  documents: DocumentItem[];
  clients: ClientOption[];
}

export function DocumentsClient({ documents, clients }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedClientId, setSelectedClientId] = useState("ALL");

  const verifiedCount = documents.filter((d) => d.status === "VERIFIED").length;
  const pendingCount = documents.filter((d) => d.status === "PENDING").length;

  const filteredDocs = documents.filter((doc) => {
    if (categoryFilter !== "ALL" && doc.category !== categoryFilter) return false;
    if (selectedClientId !== "ALL" && doc.client.id !== selectedClientId) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const nameMatch = doc.name.toLowerCase().includes(term);
      const clientMatch = doc.client.name.toLowerCase().includes(term);
      if (!nameMatch && !clientMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Document Vault & Dossiers
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Encrypted client records, bank statements, sales registers, and incorporation dossiers.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Vault Documents"
          value={documents.length}
          subtitle="Total stored client files"
          badge="Encrypted"
          badgeVariant="success"
          icon={<Folder className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Verified Documents"
          value={verifiedCount}
          subtitle="Signed-off by audit team"
          badge="Verified"
          badgeVariant="success"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Pending Verification"
          value={pendingCount}
          subtitle="Awaiting staff review"
          badge="Review Queue"
          badgeVariant="warning"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Linked Clients"
          value={clients.length}
          subtitle="Active document vaults"
          badge="Active"
          badgeVariant="neutral"
          icon={<Building className="w-4 h-4 text-graphite-500" />}
        />
      </div>

      {/* Vault Directory */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search file name, client entity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="ALL">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        {filteredDocs.length === 0 ? (
          <EmptyState
            title="No documents found in vault"
            description="Client file dossiers will appear here when uploaded or requested through the Document Chasing suite."
          />
        ) : (
          <div className="overflow-x-auto border-t border-[#EBE9E1]">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5">Document Title</th>
                  <th className="px-4 py-3.5">Client Organization</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Date Added</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                        <span className="font-semibold text-xs text-graphite-900">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-graphite-800">
                      <Link href={`/clients/${doc.client.id}`} className="hover:text-emerald-700">
                        {doc.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-xs text-graphite-600">{doc.category}</td>
                    <td className="px-4 py-4 text-xs font-mono text-graphite-600">
                      {new Date(doc.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant={doc.status === "VERIFIED" ? "success" : "warning"}
                        size="sm"
                      >
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/clients/${doc.client.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        Client Dossier →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
