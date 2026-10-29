"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  FileText,
  CheckSquare,
  ArrowRight,
  X,
  FolderDown,
  Landmark,
  Loader2,
  Sparkles,
} from "lucide-react";

interface SearchResults {
  clients: Array<{
    id: string;
    name: string;
    pan: string | null;
    gstin: string | null;
    planName: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    client: { name: string } | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    type: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
  }>;
  compliance: Array<{
    id: string;
    returnType: string;
    period: string;
    status: string;
    arnNumber: string | null;
  }>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    clients: [],
    invoices: [],
    tasks: [],
    documents: [],
    compliance: [],
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard navigation & ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search fetching from /api/search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults({
        clients: [],
        invoices: [],
        tasks: [],
        documents: [],
        compliance: [],
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error("[CommandPalette Search Error]", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  if (!isOpen) return null;

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
    setQuery("");
  };

  const totalResults =
    results.clients.length +
    results.invoices.length +
    results.tasks.length +
    results.documents.length +
    results.compliance.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-xs p-4 pt-16 sm:pt-24 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E2E0D8] bg-white shadow-2xl flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-[#E5E7EB] px-4 py-3 bg-[#FAF9F5]">
          <Search className="h-4 w-4 text-[#F26B38] flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, GSTIN, invoices, tasks, or documents... (Esc to close)"
            className="flex-1 bg-transparent px-3 text-sm text-[#263238] font-medium outline-hidden placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-[#F26B38] animate-spin flex-shrink-0 mr-2" />}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#F8FAFC] hover:text-slate-700 transition-colors"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!query.trim() && (
            <div className="text-xs text-slate-500 space-y-3">
              <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Quick Navigation</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleNavigate("/clients")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <Building2 className="h-4 w-4 text-[#F26B38]" /> Clients 360
                </button>
                <button
                  onClick={() => handleNavigate("/invoices")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <FileText className="h-4 w-4 text-[#F26B38]" /> Invoices & Billing
                </button>
                <button
                  onClick={() => handleNavigate("/gst")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <Landmark className="h-4 w-4 text-[#F26B38]" /> GST Compliance
                </button>
                <button
                  onClick={() => handleNavigate("/tasks")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <CheckSquare className="h-4 w-4 text-[#F26B38]" /> Tasks & Approvals
                </button>
                <button
                  onClick={() => handleNavigate("/documents")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <FolderDown className="h-4 w-4 text-[#F26B38]" /> Document Vault
                </button>
                <button
                  onClick={() => handleNavigate("/support")}
                  className="flex items-center gap-2.5 rounded-xl p-2.5 bg-[#FAF9F5] hover:bg-[#FFF4EE] text-[#263238] hover:text-[#D95524] transition-colors border border-[#E5E7EB] text-left text-xs font-semibold"
                >
                  <Sparkles className="h-4 w-4 text-[#F26B38]" /> AI Practice Bot
                </button>
              </div>
            </div>
          )}

          {/* Matched Clients */}
          {results.clients.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Clients ({results.clients.length})</span>
                <span className="text-[9px] lowercase font-normal">click to open Client 360</span>
              </p>
              <div className="space-y-1">
                {results.clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => handleNavigate(`/clients/${client.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-xl p-2.5 hover:bg-[#FFF4EE] border border-transparent hover:border-[#F26B38]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold text-[#263238] group-hover:text-[#D95524] truncate">
                        {client.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">
                        {client.gstin ? `GSTIN: ${client.gstin}` : client.pan ? `PAN: ${client.pan}` : "Active Practice Client"}
                        {client.planName ? ` • ${client.planName}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#F26B38] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Invoices */}
          {results.invoices.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Invoices ({results.invoices.length})</span>
                <span className="text-[9px] lowercase font-normal">click to open invoice voucher</span>
              </p>
              <div className="space-y-1">
                {results.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => handleNavigate(`/invoices/${inv.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-xl p-2.5 hover:bg-[#FFF4EE] border border-transparent hover:border-[#F26B38]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold font-mono text-[#263238] group-hover:text-[#D95524]">
                          #{inv.invoiceNumber}
                        </p>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {inv.client?.name || "Client"} • ₹{Number(inv.totalAmount).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#F26B38] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Tasks */}
          {results.tasks.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Tasks & Approvals ({results.tasks.length})
              </p>
              <div className="space-y-1">
                {results.tasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleNavigate("/tasks")}
                    className="flex cursor-pointer items-center justify-between rounded-xl p-2.5 hover:bg-[#FFF4EE] border border-transparent hover:border-[#F26B38]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold text-[#263238] group-hover:text-[#D95524] truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t.type} • Priority: {t.priority} • Status: {t.status}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#F26B38] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Documents */}
          {results.documents.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Documents ({results.documents.length})
              </p>
              <div className="space-y-1">
                {results.documents.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => handleNavigate("/documents")}
                    className="flex cursor-pointer items-center justify-between rounded-xl p-2.5 hover:bg-[#FFF4EE] border border-transparent hover:border-[#F26B38]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold text-[#263238] group-hover:text-[#D95524] truncate">
                        {d.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Category: {d.category} • Status: {d.status}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#F26B38] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Compliance Returns */}
          {results.compliance.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                GST Compliance ({results.compliance.length})
              </p>
              <div className="space-y-1">
                {results.compliance.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleNavigate("/gst")}
                    className="flex cursor-pointer items-center justify-between rounded-xl p-2.5 hover:bg-[#FFF4EE] border border-transparent hover:border-[#F26B38]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold text-[#263238] group-hover:text-[#D95524]">
                        {c.returnType} — Period: {c.period}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">
                        Status: {c.status} {c.arnNumber ? `• ARN: ${c.arnNumber}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#F26B38] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {query.trim().length >= 2 && !loading && totalResults === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">
              <p className="font-semibold text-slate-600">No practice records found</p>
              <p className="mt-1">No matching clients, invoices, tasks, or compliance filings for &quot;{query}&quot;.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#E5E7EB] bg-[#FAF9F5] px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E5E7EB] text-[10px] font-mono">Esc</kbd> to close</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E5E7EB] text-[10px] font-mono">Enter</kbd> to select</span>
          </div>
          <span className="font-medium text-slate-500">TRUV CA Global Search</span>
        </div>
      </div>
    </div>
  );
}
