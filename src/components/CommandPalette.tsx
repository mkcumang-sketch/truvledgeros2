"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePracticeStore } from "@/lib/store";
import {
  Search,
  Users,
  FileText,
  CheckSquare,
  ArrowRight,
  X,
  Building,
} from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { clients, invoices, tasks } = usePracticeStore();
  const [query, setQuery] = useState("");

  // Listen for ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanQuery = query.toLowerCase().trim();

  // Filter clients
  const matchedClients = cleanQuery
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(cleanQuery) ||
          c.pan.toLowerCase().includes(cleanQuery) ||
          c.gstin.toLowerCase().includes(cleanQuery)
      )
    : [];

  // Filter invoices
  const matchedInvoices = cleanQuery
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(cleanQuery) ||
          inv.clientName.toLowerCase().includes(cleanQuery)
      )
    : [];

  // Filter tasks
  const matchedTasks = cleanQuery
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(cleanQuery) ||
          t.clientName.toLowerCase().includes(cleanQuery)
      )
    : [];

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
    setQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-20">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-slate-100 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, GSTIN, invoices, or tasks (Ctrl + K)..."
            className="flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {!cleanQuery && (
            <div className="text-xs text-slate-400 space-y-2">
              <p className="font-semibold uppercase text-slate-500">Quick Navigation</p>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <button
                  onClick={() => handleNavigate("/clients")}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 text-left"
                >
                  <Users className="h-4 w-4 text-teal-600" /> Client Directory
                </button>
                <button
                  onClick={() => handleNavigate("/gst")}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 text-left"
                >
                  <Building className="h-4 w-4 text-teal-600" /> GST Compliance
                </button>
                <button
                  onClick={() => handleNavigate("/invoices")}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 text-left"
                >
                  <FileText className="h-4 w-4 text-teal-600" /> Invoices & Billing
                </button>
                <button
                  onClick={() => handleNavigate("/tasks")}
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 text-left"
                >
                  <CheckSquare className="h-4 w-4 text-teal-600" /> Tasks & Approvals
                </button>
              </div>
            </div>
          )}

          {/* Matched Clients */}
          {matchedClients.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Clients ({matchedClients.length})
              </p>
              <div className="space-y-1">
                {matchedClients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => handleNavigate("/clients")}
                    className="flex cursor-pointer items-center justify-between rounded-lg p-2.5 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                      <p className="text-xs font-mono text-slate-400">
                        GSTIN: {client.gstin} • PAN: {client.pan}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Invoices */}
          {matchedInvoices.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Invoices ({matchedInvoices.length})
              </p>
              <div className="space-y-1">
                {matchedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => handleNavigate("/invoices")}
                    className="flex cursor-pointer items-center justify-between rounded-lg p-2.5 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{inv.invoiceNumber}</p>
                      <p className="text-xs text-slate-400">
                        {inv.clientName} • ₹{inv.totalAmount.toLocaleString("en-IN")} ({inv.status})
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Tasks */}
          {matchedTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Tasks ({matchedTasks.length})
              </p>
              <div className="space-y-1">
                {matchedTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleNavigate("/tasks")}
                    className="flex cursor-pointer items-center justify-between rounded-lg p-2.5 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                      <p className="text-xs text-slate-400">
                        {t.clientName} • Due: {t.dueDate} ({t.status})
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {cleanQuery &&
            matchedClients.length === 0 &&
            matchedInvoices.length === 0 &&
            matchedTasks.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                No matching records found for &quot;{query}&quot;.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}