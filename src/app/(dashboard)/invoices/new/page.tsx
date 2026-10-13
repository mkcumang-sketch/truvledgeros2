"use client";

import { useState, useEffect, Suspense } from "react";
import { createDraftInvoiceAction } from "@/lib/server/actions/invoice-actions";
import { calculateInvoiceFinancials, formatINR } from "@/lib/financial/math";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";

interface ItemRow {
  description: string;
  hsnSacCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatePercent: number;
}

interface ClientSummary {
  id: string;
  name: string;
  businessName?: string | null;
  gstin?: string | null;
  state?: string | null;
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") || "";

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [serviceDescription, setServiceDescription] = useState("Professional Retainer Services");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  });
  const [isInterState, setIsInterState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemRow[]>([
    {
      description: "Accounting & Compliance Advisory",
      hsnSacCode: "998222",
      quantity: 1,
      unitPrice: 15000,
      discountPercent: 0,
      taxRatePercent: 18,
    },
  ]);

  useEffect(() => {
    async function loadClients() {
      try {
        const res = await fetch("/api/clients");
        if (res.ok) {
          const data = await res.json();
          const clientList: ClientSummary[] = Array.isArray(data)
            ? data
            : data.clients || [];
          setClients(clientList);

          setClientId((prev) => prev || preselectedClientId || (clientList.length > 0 ? clientList[0].id : ""));
        }
      } catch (err) {
        console.error("Failed to load clients list:", err);
      } finally {
        setLoadingClients(false);
      }
    }
    loadClients();
  }, [preselectedClientId]);

  // Auto-detect inter-state tax (IGST vs CGST/SGST) on client switch
  function handleClientSelect(selectedId: string) {
    setClientId(selectedId);
    const selected = clients.find((c) => c.id === selectedId);
    if (selected) {
      // Auto-toggle IGST if client state is outside Uttar Pradesh (09)
      const isOutsideState =
        Boolean(selected.state && !selected.state.toLowerCase().includes("uttar pradesh")) ||
        Boolean(selected.gstin && !selected.gstin.startsWith("09"));
      setIsInterState(isOutsideState);
    }
  }

  const preview = calculateInvoiceFinancials(items, isInterState);

  function addItem() {
    setItems([
      ...items,
      {
        description: "",
        hsnSacCode: "998222",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        taxRatePercent: 18,
      },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemRow, value: string | number) {
    const copy = [...items];
    copy[index] = { ...copy[index], [field]: value };
    setItems(copy);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim()) {
      setError("Please select a client from the dropdown.");
      return;
    }
    setError(null);
    setLoading(true);

    const res = await createDraftInvoiceAction({
      clientId: clientId.trim(),
      dueDate,
      isInterState,
      serviceDescription,
      items,
    });

    if (!res.success || !res.invoiceId) {
      setError(res.error || "Failed to create invoice.");
      setLoading(false);
      return;
    }

    router.push(`/invoices/${res.invoiceId}`);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/invoices"
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Tax Invoice</h1>
          <p className="text-sm text-slate-400">Deterministic GST calculation with server-authoritative seals</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
          {/* CLIENT SELECT DROPDOWN */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Client
            </label>
            <div className="relative">
              <select
                required
                value={clientId}
                disabled={loadingClients}
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full appearance-none px-3.5 py-2.5 pr-9 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
              >
                {loadingClients ? (
                  <option value="" disabled>Loading registered clients...</option>
                ) : clients.length === 0 ? (
                  <option value="" disabled>No registered clients available</option>
                ) : (
                  <>
                    <option value="" disabled>-- Select Client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                        {c.name} {c.businessName ? `(${c.businessName})` : ""} {c.gstin ? `[${c.gstin}]` : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="isInterState"
              checked={isInterState}
              onChange={(e) => setIsInterState(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="isInterState" className="text-sm text-slate-300 cursor-pointer">
              Inter-State Supply (IGST)
            </label>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Line Items
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2.5 items-center p-3 rounded-lg bg-slate-950/60 border border-slate-800"
              >
                <div className="col-span-12 md:col-span-4">
                  <input
                    type="text"
                    required
                    placeholder="Description"
                    value={row.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input
                    type="text"
                    placeholder="HSN/SAC"
                    value={row.hsnSacCode}
                    onChange={(e) => updateItem(idx, "hsnSacCode", e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 text-xs text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={row.unitPrice}
                    onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 text-xs text-right focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <select
                    value={row.taxRatePercent}
                    onChange={(e) => updateItem(idx, "taxRatePercent", parseFloat(e.target.value))}
                    className="w-full px-1.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 text-xs focus:outline-none"
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div className="col-span-6 md:col-span-1 text-right text-xs font-mono font-medium text-slate-200">
                  {formatINR(preview.items[idx]?.lineTotal || 0)}
                </div>
                <div className="col-span-2 md:col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-200">{formatINR(preview.subtotal)}</span>
              </div>
              {preview.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount:</span>
                  <span className="font-mono">-{formatINR(preview.totalDiscount)}</span>
                </div>
              )}
              {isInterState ? (
                <div className="flex justify-between">
                  <span>IGST:</span>
                  <span className="font-mono text-slate-200">{formatINR(preview.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>CGST:</span>
                    <span className="font-mono text-slate-200">{formatINR(preview.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST:</span>
                    <span className="font-mono text-slate-200">{formatINR(preview.sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                <span>Total Amount:</span>
                <span className="font-mono text-indigo-400">{formatINR(preview.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || loadingClients}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg shadow-md transition-colors text-sm"
        >
          {loading ? "Generating Draft Invoice..." : "Create Draft Invoice"}
        </button>
      </form>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Loading invoice creator...</div>}>
      <NewInvoiceForm />
    </Suspense>
  );
}