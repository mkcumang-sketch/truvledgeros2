"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  Send,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Search,
  Filter,
  Calendar,
  MessageSquare,
  Clock,
  Plus,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/financial/math";
import { recordPaymentAction } from "@/lib/server/actions/payment-actions";

interface RecoveryItem {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  primaryContact: string;
  phone: string;
  totalAmount: any;
  remainingBalance: number;
  dueDate: Date;
  daysOverdue: number;
  bucket: string;
  lastRecoveryStage: string;
}

interface PaymentHistoryItem {
  id: string;
  amount: any;
  paymentMode: string;
  referenceNo: string | null;
  receivedAt: Date;
  invoice: {
    invoiceNumber: string;
    client: {
      name: string;
    };
  };
}

interface Props {
  recoveryList: RecoveryItem[];
  recentPayments: PaymentHistoryItem[];
  totalCollected: number;
  totalOutstanding: number;
}

export function PaymentsClient({
  recoveryList,
  recentPayments,
  totalCollected,
  totalOutstanding,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  const [selectedInvoice, setSelectedInvoice] = useState<RecoveryItem | null>(null);

  // Payment dialog form
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<"UPI" | "NEFT" | "RTGS" | "CHEQUE" | "CASH" | "GATEWAY">("UPI");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const openPaymentModal = (item: RecoveryItem) => {
    setSelectedInvoice(item);
    setPayAmount(item.remainingBalance);
    setPayMode("UPI");
    setPayRef("");
    setPayNotes("");
    setPayError(null);
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setPayError(null);

    if (payAmount <= 0) {
      setPayError("Payment amount must be greater than zero.");
      return;
    }

    if (payAmount > selectedInvoice.remainingBalance) {
      setPayError(
        `Overpayment rejected: payment of ₹${payAmount} exceeds remaining balance of ₹${selectedInvoice.remainingBalance}.`
      );
      return;
    }

    startTransition(async () => {
      const res = await recordPaymentAction({
        invoiceId: selectedInvoice.invoiceId,
        amount: Number(payAmount),
        paymentMode: payMode,
        referenceNo: payRef || null,
        notes: payNotes || null,
      });

      if (res.success) {
        toast.success(`Payment of ₹${payAmount} recorded for ${selectedInvoice.clientName}.`);
        setSelectedInvoice(null);
        setSuccessBanner(`Payment of ₹${payAmount} recorded for ${selectedInvoice.clientName}.`);
        setTimeout(() => setSuccessBanner(null), 4000);
        router.refresh();
      } else {
        toast.error(res.error || "Unable to record payment.");
        setPayError(res.error || "Unable to record payment.");
      }
    });
  };

  const filteredRecovery = recoveryList.filter((item) => {
    if (selectedBucket !== "ALL" && item.bucket !== selectedBucket) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const clientMatch = item.clientName.toLowerCase().includes(term);
      const invMatch = item.invoiceNumber.toLowerCase().includes(term);
      if (!clientMatch && !invMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {successBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Payments & Collections Recovery
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Operational aging ledger, receipt logging, and automated recovery ladders.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Realized Revenue"
          value={formatINR(totalCollected)}
          subtitle="Directly logged receipts"
          badge="Collected"
          badgeVariant="success"
          icon={<CreditCard className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Outstanding Receivables"
          value={formatINR(totalOutstanding)}
          subtitle="Pending collection across firm"
          badge={totalOutstanding > 0 ? "Pending" : "Cleared"}
          badgeVariant={totalOutstanding > 0 ? "warning" : "success"}
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Past Due Overdue"
          value={recoveryList.length}
          subtitle="Invoices beyond payment terms"
          badge={recoveryList.length > 0 ? "Escalation" : "On Track"}
          badgeVariant={recoveryList.length > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
        />
        <MetricCard
          title="Receipts Logged"
          value={recentPayments.length}
          subtitle="Verified payment records"
          badge="Audit Trail"
          badgeVariant="neutral"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
        />
      </div>

      {/* Recovery Aging Ladder Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Overdue Receivables Aging Ladder</CardTitle>
            <p className="text-xs text-graphite-500 mt-0.5">
              Categorized by overdue duration for disciplined practice recovery
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-graphite-500">Aging Bucket:</span>
            <select
              value={selectedBucket}
              onChange={(e) => setSelectedBucket(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="ALL">All Aging Buckets</option>
              <option value="1-7 days">1-7 Days (Gentle)</option>
              <option value="8-15 days">8-15 Days (Firm Notice)</option>
              <option value="16-30 days">16-30 Days (Final Notice)</option>
              <option value="30+ days">30+ Days (Partner Escalation)</option>
            </select>
          </div>
        </CardHeader>

        {filteredRecovery.length === 0 ? (
          <EmptyState
            title="No overdue accounts in this view"
            description="All active clients are up to date on payment terms or no invoices match this aging filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5">Client & Contact</th>
                  <th className="px-4 py-3.5">Invoice #</th>
                  <th className="px-4 py-3.5">Due Date</th>
                  <th className="px-4 py-3.5">Aging Category</th>
                  <th className="px-4 py-3.5 text-right">Balance Due</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {filteredRecovery.map((item) => (
                  <tr key={item.invoiceId} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-graphite-900 text-xs">{item.clientName}</div>
                      <div className="text-[11px] text-graphite-500 font-mono mt-0.5">
                        {item.phone} • {item.primaryContact}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono font-medium text-xs text-emerald-800">
                      <Link href={`/invoices/${item.invoiceId}`} className="hover:underline">
                        {item.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-graphite-600">
                      {new Date(item.dueDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        variant={
                          item.bucket === "30+ days"
                            ? "danger"
                            : item.bucket === "16-30 days"
                            ? "warning"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {item.bucket} ({item.daysOverdue}d)
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-rose-700 text-xs">
                      {formatINR(item.remainingBalance)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openPaymentModal(item)}
                      >
                        Log Receipt
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Collections Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Verified Receipts</CardTitle>
          <p className="text-xs text-graphite-500 mt-0.5">
            Immutable log of recorded client payments and bank reference numbers
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {recentPayments.length === 0 ? (
            <div className="py-8 text-center text-xs text-graphite-500">
              No payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-[#EBE9E1]">
              <table className="w-full text-left text-xs text-graphite-700">
                <thead className="bg-[#FAF9F5] text-[10px] uppercase font-semibold text-graphite-500 border-b border-[#E2E0D8]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Mode & Ref</th>
                    <th className="py-3 px-4 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE9E1]">
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-[#FAF9F5]">
                      <td className="py-3 px-4 text-graphite-600 font-mono">
                        {new Date(p.receivedAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3 px-4 font-semibold text-graphite-900">
                        {p.invoice.client.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-800">
                        {p.invoice.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 text-graphite-600 font-mono">
                        <Badge variant="neutral" size="sm" className="mr-1.5">
                          {p.paymentMode}
                        </Badge>
                        {p.referenceNo || "Direct Receipt"}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-800">
                        {formatINR(Number(p.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Modal */}
      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => {
          if (!isPending) setSelectedInvoice(null);
        }}
        title={`Log Payment for ${selectedInvoice?.clientName || ""}`}
        description={`Record receipt against ${selectedInvoice?.invoiceNumber}. Max payable balance: ₹${selectedInvoice?.remainingBalance}.`}
        maxWidth="md"
      >
        <form onSubmit={handleRecordSubmit} className="space-y-4">
          {payError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {payError}
            </div>
          )}

          <div>
            <Input
              label="Payment Amount (₹ INR)"
              type="number"
              min={1}
              max={selectedInvoice?.remainingBalance || undefined}
              requiredIndicator
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
              helperText={`Remaining balance: ₹${selectedInvoice?.remainingBalance}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Select
              label="Payment Channel"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value as any)}
            >
              <option value="UPI">UPI / QR Code</option>
              <option value="NEFT">NEFT Transfer</option>
              <option value="RTGS">RTGS Transfer</option>
              <option value="CHEQUE">Bank Cheque</option>
              <option value="CASH">Cash Receipt</option>
              <option value="GATEWAY">Online Gateway</option>
            </Select>
            <Input
              label="UTR / Cheque Ref #"
              placeholder="e.g. UTR12345678"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Payment Remarks"
              placeholder="e.g. HDFC Bank direct credit"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedInvoice(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Confirm & Post Receipt
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
