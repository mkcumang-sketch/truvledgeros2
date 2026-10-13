import { getPaymentRecoveryList } from "@/lib/server/financial-analytics";
import { formatINR } from "@/lib/financial/math";
import { AlertTriangle, Clock, PhoneCall, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default async function PaymentRecoveryPage() {
  const recoveryItems = await getPaymentRecoveryList();

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Recovery Operations</h1>
          <p className="text-sm text-slate-400">
            Automated recovery state tracking for overdue receivables (Phase 3 Foundation)
          </p>
        </div>
      </div>

      {recoveryItems.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-xl">
          <Clock className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-200">No overdue invoices.</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Great — all client invoices are fully paid or within their payment terms.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Primary Contact</th>
                <th className="py-3 px-4 text-right">Outstanding Amount</th>
                <th className="py-3 px-4 text-center">Overdue Days</th>
                <th className="py-3 px-4 text-center">Ageing Bucket</th>
                <th className="py-3 px-4 text-center">Stage</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recoveryItems.map((item) => (
                <tr key={item.invoiceId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-200">{item.clientName}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">{item.invoiceNumber}</td>
                  <td className="py-3.5 px-4 text-xs">
                    <div>{item.primaryContact}</div>
                    <div className="text-slate-500">{item.phone}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-red-400">
                    {formatINR(item.remainingBalance)}
                  </td>
                  <td className="py-3.5 px-4 text-center font-medium text-amber-400">
                    {item.daysOverdue} d
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {item.bucket}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-semibold">
                    <span className="text-amber-500">{item.lastRecoveryStage}</span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/invoices/${item.invoiceId}`}
                      className="text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                    >
                      View Invoice
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}