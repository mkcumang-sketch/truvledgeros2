import { requireTenant } from "@/lib/auth/session";
import { getClient360Details } from "@/lib/server/client-service";
import { formatINR } from "@/lib/financial/math";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  AlertCircle,
  Clock,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Landmark,
  FolderDown,
  Shield,
  Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";

export default async function ClientDetailPage({
  params,
}: {
  params: { clientId: string };
}) {
  await requireTenant();

  if (params.clientId === "new") {
    redirect("/clients");
  }

  let clientData;
  try {
    clientData = await getClient360Details(params.clientId);
  } catch (error) {
    redirect("/clients");
  }

  const { client, summary } = clientData;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Link
            href="/clients"
            className="p-2 rounded-lg bg-white border border-[#E2E0D8] text-graphite-600 hover:text-graphite-900 hover:bg-[#FAF9F5] transition-colors shadow-2xs"
            title="Back to Clients Directory"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-graphite-900 tracking-tight">
                {client.name}
              </h1>
              <Badge variant="neutral" size="sm">
                {client.planName || "PRIVATE_LIMITED"}
              </Badge>
              {client.active ? (
                <Badge variant="success" size="sm">
                  Active
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  Archived
                </Badge>
              )}
            </div>
            <p className="text-xs text-graphite-500 mt-0.5">
              {client.businessName ? `Trade Name: ${client.businessName}` : "Official Client Profile"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href={`/invoices/new?clientId=${client.id}`}>
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4 mr-1" />
              Create Fee Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Financial 360 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Billed"
          value={formatINR(Number(summary.totalInvoiced))}
          subtitle={`${summary.invoiceCount} invoices issued`}
          icon={<FileText className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Total Collected"
          value={formatINR(Number(summary.totalPaid))}
          subtitle="Realized fee payments"
          badge="Collected"
          badgeVariant="success"
          icon={<CreditCard className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Outstanding Balance"
          value={formatINR(Number(summary.totalOutstanding))}
          subtitle="Pending collection"
          badge={summary.totalOutstanding > 0 ? "Pending" : "Cleared"}
          badgeVariant={summary.totalOutstanding > 0 ? "warning" : "success"}
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Past Due Overdue"
          value={formatINR(Number(summary.overdueAmount))}
          subtitle={`${summary.overdueInvoiceCount} invoices past due`}
          badge={summary.overdueAmount > 0 ? "Overdue" : "On Track"}
          badgeVariant={summary.overdueAmount > 0 ? "danger" : "success"}
          icon={<AlertCircle className="w-4 h-4 text-rose-600" />}
        />
      </div>

      {/* Main Grid: Organization Profile & Authorized Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Organization Profile */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#EBE9E1]">
            <h2 className="text-sm font-bold text-graphite-900">Tax & Entity Identity</h2>
            <Building2 className="w-4 h-4 text-graphite-400" />
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 text-graphite-700">
              <Mail className="w-4 h-4 text-graphite-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-semibold text-graphite-400 block">Primary Email</span>
                <a href={`mailto:${client.email}`} className="font-medium hover:text-emerald-700">
                  {client.email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-graphite-700">
              <Phone className="w-4 h-4 text-graphite-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-semibold text-graphite-400 block">Phone / WhatsApp</span>
                <span className="font-mono font-medium">{client.phone}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-graphite-700">
              <MapPin className="w-4 h-4 text-graphite-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-semibold text-graphite-400 block">Registered Address</span>
                <span>
                  {[client.city, client.state, client.pincode].filter(Boolean).join(", ") || "No address on file"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#EBE9E1] space-y-2 text-xs">
            <div className="flex justify-between items-center py-1">
              <span className="text-graphite-500">PAN</span>
              <span className="font-mono font-bold text-graphite-900">{client.pan || "—"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-graphite-500">GSTIN</span>
              <span className="font-mono font-bold text-graphite-900">{client.gstin || "Unregistered"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-graphite-500">Monthly Practice Retainer</span>
              <span className="font-semibold text-emerald-800">{formatINR(Number(client.monthlyFee))}</span>
            </div>
          </div>

          {client.notes && (
            <div className="pt-3 border-t border-[#EBE9E1]">
              <span className="text-[10px] uppercase font-semibold text-graphite-400 block mb-1">
                Internal Practice Notes
              </span>
              <p className="text-xs text-graphite-600 bg-[#FAF9F5] p-2.5 rounded-lg border border-[#EBE9E1] leading-relaxed">
                {client.notes}
              </p>
            </div>
          )}
        </Card>

        {/* Right Column: Authorized Contacts */}
        <Card className="lg:col-span-2 p-5 sm:p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-[#EBE9E1]">
            <div>
              <h2 className="text-sm font-bold text-graphite-900">Authorized Contacts</h2>
              <p className="text-xs text-graphite-500">Key signatories, directors, and accounts managers</p>
            </div>
            <span className="text-xs text-graphite-400 font-medium">
              {client.contacts.length} registered
            </span>
          </div>

          {client.contacts.length === 0 ? (
            <div className="text-center py-8 text-xs text-graphite-500">
              No additional contact persons registered. Primary inquiries route to {client.email}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {client.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-graphite-900">{contact.name}</span>
                    {contact.isPrimary && (
                      <Badge variant="success" size="sm">
                        Primary Contact
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-graphite-500 font-medium">
                    {contact.designation || "Executive"}
                  </div>
                  <div className="text-[11px] text-graphite-600 font-mono flex items-center gap-1.5 pt-1">
                    <Phone className="w-3 h-3 text-graphite-400" />
                    <span>{contact.phone}</span>
                  </div>
                  {contact.email && (
                    <div className="text-[11px] text-graphite-600 flex items-center gap-1.5 truncate">
                      <Mail className="w-3 h-3 text-graphite-400" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Invoices History Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invoicing & Billing History</CardTitle>
            <p className="text-xs text-graphite-500 mt-0.5">Sequential GST tax invoices issued to this client</p>
          </div>
          <Link href="/invoices">
            <Button variant="ghost" size="sm">
              All Invoices →
            </Button>
          </Link>
        </CardHeader>

        {client.invoices.length === 0 ? (
          <div className="text-center py-10 text-xs text-graphite-500">
            No invoices issued yet for this client. Click &quot;Create Fee Invoice&quot; above to generate the first bill.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[10px] uppercase font-semibold text-graphite-500 border-b border-[#E2E0D8]">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {client.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-800">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 text-graphite-600">
                      {new Date(inv.issuedDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-graphite-600">
                      {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-graphite-900">
                      {formatINR(Number(inv.totalAmount))}
                    </td>
                    <td className="py-3 px-4 text-center">
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
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Compliance & Operations Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GST Profile Card */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#EBE9E1]">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-graphite-900">GST Compliance Tracking</h3>
            </div>
            <Link href="/gst" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">
              GST Return Desk →
            </Link>
          </div>
          <div className="text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-graphite-500">GSTIN Registration</span>
              <span className="font-mono font-medium text-graphite-800">{client.gstin || "Unregistered"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite-500">Return Frequency</span>
              <span className="font-medium text-graphite-800">
                {client.gstProfile?.filingFrequency || "MONTHLY (Regular)"}
              </span>
            </div>
          </div>
        </Card>

        {/* Documents Vault Card */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#EBE9E1]">
            <div className="flex items-center gap-2">
              <FolderDown className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-graphite-900">Document Dossier & Vault</h3>
            </div>
            <Link href="/documents" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">
              Document Vault →
            </Link>
          </div>
          <div className="text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-graphite-500">Vault Documents</span>
              <span className="font-medium text-graphite-800">{client.documents.length} files attached</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite-500">Pending Requests</span>
              <span className="font-medium text-graphite-800">0 pending client uploads</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}