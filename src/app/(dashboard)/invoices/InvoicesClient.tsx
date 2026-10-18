"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Filter,
  X,
  CreditCard,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/financial/math";
import { createDraftInvoiceAction } from "@/lib/server/actions/invoice-actions";

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  serviceDescription: string;
  subtotal: any;
  totalAmount: any;
  issuedDate: Date;
  dueDate: Date;
  status: string;
  client: {
    id: string;
    name: string;
    gstin: string | null;
  };
  payments: Array<{
    amount: any;
  }>;
}

interface ClientOption {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
}

interface Props {
  invoices: InvoiceRecord[];
  clients: ClientOption[];
}

export function InvoicesClient({ invoices, clients }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || "");
  const [description, setDescription] = useState("Professional Retainer & Statutory Compliance");
  const [dueDate, setDueDate] = useState("2026-10-31");
  const [amount, setAmount] = useState<number>(25000);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [isInterState, setIsInterState] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const gstAmount = Math.round((amount * taxRate) / 100);
  const totalAmount = amount + gstAmount;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedClientId) {
      setFormError("Please select a practice client.");
      return;
    }

    startTransition(async () => {
      const res = await createDraftInvoiceAction({
        clientId: selectedClientId,
        dueDate,
        isInterState,
        serviceDescription: description,
        items: [
          {
            description,
            quantity: 1,
            unitPrice: amount,
            discountPercent: 0,
            taxRatePercent: taxRate,
          },
        ],
      });

      if (res.success) {
        toast.success("Invoice generated successfully");
        setIsModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Unable to generate invoice.");
        setFormError(res.error || "Unable to generate invoice.");
      }
    });
  };

  // Metrics
  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalPending = invoices
    .filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELLED")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const overdueCount = invoices.filter(
    (inv) => inv.status === "OVERDUE" || (new Date(inv.dueDate) < new Date() && inv.status !== "PAID")
  ).length;

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const numMatch = inv.invoiceNumber.toLowerCase().includes(term);
      const clientMatch = inv.client.name.toLowerCase().includes(term);
      const descMatch = inv.serviceDescription.toLowerCase().includes(term);
      if (!numMatch && !clientMatch && !descMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Billing & Invoices
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Sequential GST-compliant fee invoices with real-time payment tracking.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Issue Fee Invoice
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Practice Billing"
          value={formatINR(totalBilled)}
          subtitle={`${invoices.length} invoices issued`}
          icon={<FileText className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Collected Revenue"
          value={formatINR(totalPaid)}
          subtitle="Realized fee payments"
          badge="Collected"
          badgeVariant="success"
          icon={<CreditCard className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Outstanding Receivables"
          value={formatINR(totalPending)}
          subtitle="Pending collection"
          badge={totalPending > 0 ? "Pending" : "Cleared"}
          badgeVariant={totalPending > 0 ? "warning" : "success"}
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Past Due Invoices"
          value={overdueCount}
          subtitle="Invoices needing follow-up"
          badge={overdueCount > 0 ? "Follow Up" : "All Clear"}
          badgeVariant={overdueCount > 0 ? "danger" : "success"}
          icon={<AlertCircle className="w-4 h-4 text-rose-600" />}
        />
      </div>

      {/* Directory Card */}
      <Card>
        <div className="p-3.5 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by invoice number, client name, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-graphite-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description="No invoices match your current search or status filter. Try clearing filters or create a new invoice."
            actionLabel="Issue New Invoice"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto border-t border-[#EBE9E1]">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5">Invoice #</th>
                  <th className="px-4 py-3.5">Client & GSTIN</th>
                  <th className="px-4 py-3.5">Service Description</th>
                  <th className="px-4 py-3.5">Due Date</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#FAF9F5] transition-colors group">
                    <td className="px-5 py-4 font-mono font-semibold text-emerald-800">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/clients/${inv.client.id}`}
                        className="font-semibold text-graphite-900 hover:text-emerald-700 transition-colors block text-xs"
                      >
                        {inv.client.name}
                      </Link>
                      <span className="text-[10px] font-mono text-graphite-400 block mt-0.5">
                        {inv.client.gstin || "Unregistered"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-graphite-600 truncate max-w-xs">
                      {inv.serviceDescription}
                    </td>
                    <td className="px-4 py-4 text-xs text-graphite-600 font-mono">
                      {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-graphite-900 text-xs">
                      {formatINR(Number(inv.totalAmount))}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "OVERDUE"
                            ? "danger"
                            : "warning"
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          if (!isPending) setIsModalOpen(false);
        }}
        title="Issue Practice Invoice"
        description="Generate sequential GST-compliant bill for an authorized client."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <Select
              label="Select Practice Client"
              requiredIndicator
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.gstin ? `(GSTIN: ${c.gstin})` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Input
              label="Service Description / Engagement"
              requiredIndicator
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Input
              label="Base Fee / Taxable (₹)"
              type="number"
              min={1}
              requiredIndicator
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
            />
            <Select
              label="GST Tax Rate"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
            >
              <option value={18}>18% GST (Standard Services)</option>
              <option value={12}>12% GST</option>
              <option value={5}>5% GST</option>
              <option value={0}>0% (Exempt)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Input
              label="Due Date"
              type="date"
              requiredIndicator
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-graphite-700">
                GST Routing
              </label>
              <div className="flex items-center gap-2 pt-2 text-xs">
                <input
                  type="checkbox"
                  id="interstate"
                  checked={isInterState}
                  onChange={(e) => setIsInterState(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="interstate" className="text-graphite-700">
                  Inter-state (IGST)
                </label>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-graphite-600">
              <span>Taxable Amount:</span>
              <span className="font-mono font-medium">{formatINR(amount)}</span>
            </div>
            <div className="flex justify-between text-graphite-600">
              <span>GST ({taxRate}%):</span>
              <span className="font-mono font-medium">{formatINR(gstAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-graphite-900 pt-1 border-t border-[#EBE9E1]">
              <span>Total Billable Amount:</span>
              <span className="font-mono text-emerald-800">{formatINR(totalAmount)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Issue Invoice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
