"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Folder,
  FileText,
  UploadCloud,
  Search,
  CheckCircle2,
  Clock,
  Building,
  Plus,
  Send,
  XCircle,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createDocumentAction,
  createDocumentRequestAction,
  updateDocumentStatusAction,
} from "@/lib/server/actions/document-actions";
import { DocumentStatus } from "@prisma/client";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedClientId, setSelectedClientId] = useState("ALL");

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadClientId, setUploadClientId] = useState(clients[0]?.id || "");
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Bank Statement");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestClientId, setRequestClientId] = useState(clients[0]?.id || "");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDesc, setRequestDesc] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);

  // Status Action Message
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const verifiedCount = documents.filter((d) => d.status === "VERIFIED").length;
  const pendingCount = documents.filter((d) => d.status === "PENDING" || d.status === "UPLOADED").length;

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!uploadDocName.trim()) {
      setUploadError("Please enter a document title or description.");
      return;
    }
    if (!uploadClientId) {
      setUploadError("Please select a target client organization.");
      return;
    }

    startTransition(async () => {
      const res = await createDocumentAction({
        clientId: uploadClientId,
        name: uploadDocName.trim(),
        category: uploadCategory,
        fileSize: Math.floor(Math.random() * 800000) + 120000,
        mimeType: "application/pdf",
      });

      if (res.success) {
        setIsUploadModalOpen(false);
        setUploadDocName("");
        setActionFeedback("Document successfully deposited into client vault.");
        setTimeout(() => setActionFeedback(null), 4000);
        router.refresh();
      } else {
        setUploadError(res.error || "Failed to upload document.");
      }
    });
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);

    if (!requestTitle.trim()) {
      setRequestError("Please enter a request title.");
      return;
    }
    if (!requestClientId) {
      setRequestError("Please select a target client organization.");
      return;
    }

    startTransition(async () => {
      const res = await createDocumentRequestAction({
        clientId: requestClientId,
        title: requestTitle.trim(),
        description: requestDesc.trim() || null,
      });

      if (res.success) {
        setIsRequestModalOpen(false);
        setRequestTitle("");
        setRequestDesc("");
        setActionFeedback("Formal document request dispatched to client contact.");
        setTimeout(() => setActionFeedback(null), 4000);
        router.refresh();
      } else {
        setRequestError(res.error || "Failed to create document request.");
      }
    });
  };

  const handleVerifyStatus = async (documentId: string, status: DocumentStatus) => {
    startTransition(async () => {
      const res = await updateDocumentStatusAction({
        documentId,
        status,
        rejectionReason: status === DocumentStatus.REJECTED ? "Document mismatch or incomplete schedule." : undefined,
      });

      if (res.success) {
        setActionFeedback(
          status === DocumentStatus.VERIFIED
            ? "Document verified and locked."
            : "Document flagged as rejected."
        );
        setTimeout(() => setActionFeedback(null), 4000);
        router.refresh();
      }
    });
  };

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

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setRequestError(null);
              setIsRequestModalOpen(true);
            }}
          >
            <Send className="w-4 h-4 mr-1 text-[#C89B3C]" />
            Request Document
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setUploadError(null);
              setIsUploadModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Upload to Vault
          </Button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

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
                        variant={
                          doc.status === "VERIFIED"
                            ? "success"
                            : doc.status === "REJECTED"
                            ? "danger"
                            : "warning"
                        }
                        size="sm"
                      >
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {doc.status !== "VERIFIED" && (
                          <button
                            type="button"
                            onClick={() => handleVerifyStatus(doc.id, DocumentStatus.VERIFIED)}
                            title="Verify and lock document"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-medium shadow-xs transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Verify</span>
                          </button>
                        )}
                        {doc.status !== "REJECTED" && (
                          <button
                            type="button"
                            onClick={() => handleVerifyStatus(doc.id, DocumentStatus.REJECTED)}
                            title="Reject document"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-[#D3DBD6] hover:bg-rose-50 text-rose-700 rounded-md font-medium shadow-xs transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                        )}
                        <Link
                          href={`/clients/${doc.client.id}`}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 ml-1"
                        >
                          Dossier →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 1. Upload to Vault Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          if (!isPending) setIsUploadModalOpen(false);
        }}
        title="Deposit Document to Client Vault"
        description="Attach client files, incorporation documents, or compliance records with practice encryption."
        maxWidth="md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {uploadError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div>
            <Select
              label="Target Client Account"
              requiredIndicator
              value={uploadClientId}
              onChange={(e) => setUploadClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Input
              label="Document Title / Name"
              requiredIndicator
              placeholder="e.g. Bank Statement - HDFC Current A/c (Q2)"
              value={uploadDocName}
              onChange={(e) => setUploadDocName(e.target.value)}
            />
          </div>

          <div>
            <Select
              label="Document Category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
            >
              <option value="Bank Statement">Bank Statement</option>
              <option value="Sales Register">Sales Register</option>
              <option value="Purchase Register">Purchase Register</option>
              <option value="TDS & Challans">TDS & Challans</option>
              <option value="Incorporation & KYC">Incorporation & KYC</option>
              <option value="Audit Workpapers">Audit Workpapers</option>
              <option value="General">General Practice Record</option>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Deposit Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Formal Client Document Request Modal */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => {
          if (!isPending) setIsRequestModalOpen(false);
        }}
        title="Dispatch Client Document Request"
        description="Send a formal trackable request to client signatories with automated reminder tracking."
        maxWidth="md"
      >
        <form onSubmit={handleRequestSubmit} className="space-y-4">
          {requestError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{requestError}</span>
            </div>
          )}

          <div>
            <Select
              label="Client Organization"
              requiredIndicator
              value={requestClientId}
              onChange={(e) => setRequestClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Input
              label="Requested Document Title"
              requiredIndicator
              placeholder="e.g. Audited Balance Sheet & Profit/Loss (FY 2025-26)"
              value={requestTitle}
              onChange={(e) => setRequestTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-graphite-900 mb-1">
              Instructions for Client (Optional)
            </label>
            <textarea
              rows={3}
              value={requestDesc}
              onChange={(e) => setRequestDesc(e.target.value)}
              placeholder="e.g. Please provide PDF with director signatures and auditor report."
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#D3DBD6] bg-white text-graphite-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsRequestModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Dispatch Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
