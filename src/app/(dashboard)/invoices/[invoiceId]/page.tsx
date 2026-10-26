import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/financial/math";
import { recordPayment } from "@/lib/server/payment-service";
import { issueInvoice, voidInvoice } from "@/lib/server/invoice-service";
import { ArrowLeft, CheckCircle2, XCircle, FileDown } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { invoiceId: string };
}) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const invoice = await db.invoice.findFirst({
    where: { id: params.invoiceId, tenantId },
    include: {
      client: true,
      items: true,
      payments: { orderBy: { receivedAt: "desc" } },
    },
  });

  if (!invoice) {
    return (
      <div className="p-8 text-center text-slate-400">
        Invoice not found or unauthorized.
      </div>
    );
  }

  const totalPaid = invoice.payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const remaining = Math.max(0, Number(invoice.totalAmount) - totalPaid);

  async function handleIssue() {
    "use server";
    try {
      await issueInvoice(params.invoiceId);
      revalidatePath(`/invoices/${params.invoiceId}`);
    } catch (err) {
      console.error("[handleIssue Error]", err);
      throw err;
    }
  }

  async function handleVoid(formData: FormData) {
    "use server";
    try {
      const reason = (formData.get("reason") as string) || "Administrative void";
      await voidInvoice(params.invoiceId, reason);
      revalidatePath(`/invoices/${params.invoiceId}`);
    } catch (err) {
      console.error("[handleVoid Error]", err);
      throw err;
    }
  }

  async function handleRecordPayment(formData: FormData) {
    "use server";
    try {
      const amount = parseFloat(formData.get("amount") as string);
      const paymentMode = (formData.get("paymentMode") as any) || "UPI";
      const referenceNo = (formData.get("referenceNo") as string) || undefined;

      await recordPayment({
        invoiceId: params.invoiceId,
        amount,
        paymentMode,
        referenceNo,
      });
      revalidatePath(`/invoices/${params.invoiceId}`);
    } catch (err) {
      console.error("[handleRecordPayment Error]", err);
      throw err;
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/invoices"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white font-mono">{invoice.invoiceNumber}</h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {invoice.status}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">Billed to {invoice.client.name}</p>
          </div>
        </div>

        {/* State Machine Action Controls */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/invoices/${params.invoiceId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-colors border border-slate-700 shadow-sm"
          >
            <FileDown className="w-4 h-4 text-sky-400" /> Download Tax Invoice (PDF)
          </a>
          {invoice.status === "DRAFT" && (
            <form action={handleIssue}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Issue Invoice
              </button>
            </form>
          )}

          {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && invoice.payments.length === 0 && (
            <form action={handleVoid}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 text-xs font-medium rounded-lg transition-colors border border-slate-700"
              >
                <XCircle className="w-4 h-4" /> Void
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Invoice Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Issue Date</span>
            <span className="text-slate-200 font-medium">
              {new Date(invoice.issuedDate).toLocaleDateString("en-IN")}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Due Date</span>
            <span className="text-slate-200 font-medium">
              {new Date(invoice.dueDate).toLocaleDateString("en-IN")}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Total Amount</span>
            <span className="text-slate-200 font-medium">{formatINR(Number(invoice.totalAmount))}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Remaining Due</span>
            <span className={`font-semibold ${remaining > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {formatINR(remaining)}
            </span>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3">HSN/SAC</th>
              <th className="py-2.5 px-3 text-center">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Price</th>
              <th className="py-2.5 px-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {invoice.items.map((it) => (
              <tr key={it.id}>
                <td className="py-3 px-3">{it.description}</td>
                <td className="py-3 px-3 font-mono text-xs text-slate-400">{it.hsnSacCode || "—"}</td>
                <td className="py-3 px-3 text-center">{Number(it.quantity)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatINR(Number(it.unitPrice))}</td>
                <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                  {formatINR(Number(it.total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Breakdown */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <div className="w-full max-w-xs space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono text-slate-200">{formatINR(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.cgstAmount) > 0 && (
              <div className="flex justify-between">
                <span>CGST:</span>
                <span className="font-mono text-slate-200">{formatINR(Number(invoice.cgstAmount))}</span>
              </div>
            )}
            {Number(invoice.sgstAmount) > 0 && (
              <div className="flex justify-between">
                <span>SGST:</span>
                <span className="font-mono text-slate-200">{formatINR(Number(invoice.sgstAmount))}</span>
              </div>
            )}
            {Number(invoice.igstAmount) > 0 && (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span className="font-mono text-slate-200">{formatINR(Number(invoice.igstAmount))}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
              <span>Total Invoice Amount:</span>
              <span className="font-mono text-indigo-400">{formatINR(Number(invoice.totalAmount))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Settlement Card */}
      {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && remaining > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Record Payment Settlement
          </h2>
          <form action={handleRecordPayment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Amount (₹)
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                max={remaining}
                defaultValue={remaining}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Payment Mode
              </label>
              <select
                name="paymentMode"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none"
              >
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT</option>
                <option value="RTGS">RTGS</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Reference / UTR #
              </label>
              <input
                name="referenceNo"
                type="text"
                placeholder="UTR / Cheque #"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Verify & Record
            </button>
          </form>
        </div>
      )}
    </div>
  );
}