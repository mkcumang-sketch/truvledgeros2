"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  Building,
  User,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Edit2,
  Archive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Filter,
  X,
  CreditCard,
  Briefcase,
  Users,
  Clock,
  MoreVertical,
  Upload,
} from "lucide-react";
import { BulkImportModal } from "./BulkImportModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createClientAction,
  updateClientAction,
  archiveClientAction,
  restoreClientAction,
} from "@/lib/server/actions/client-actions";
import { formatINR } from "@/lib/financial/math";
import { CLIENT_TYPES, PAN_REGEX, GSTIN_REGEX } from "@/lib/constants/clients";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Chandigarh",
  "Puducherry",
  "Goa",
];

interface ClientRecord {
  id: string;
  name: string;
  businessName: string | null;
  gstin: string | null;
  pan: string | null;
  email: string;
  phone: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  planName: string | null;
  monthlyFee: any;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  contacts: Array<{
    id: string;
    name: string;
    designation: string | null;
    email: string | null;
    phone: string;
    isPrimary: boolean;
  }>;
  gstProfile: {
    gstin: string;
    filingFrequency: string;
  } | null;
  _count: {
    invoices: number;
    tasks: number;
    documents: number;
  };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Metrics {
  totalClients: number;
  activeClients: number;
  corporateClients: number;
  totalMonthlyRetainer: number;
  actionNeededCount: number;
}

interface Props {
  initialClients: ClientRecord[];
  metrics: Metrics;
  teamMembers: TeamMember[];
  initialStatus: "ACTIVE" | "ARCHIVED";
}

export function ClientsDirectoryClient({
  initialClients,
  metrics,
  teamMembers,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED">(initialStatus);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [clientToArchive, setClientToArchive] = useState<ClientRecord | null>(null);
  const [clientToRestore, setClientToRestore] = useState<ClientRecord | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formBusinessName, setFormBusinessName] = useState("");
  const [formClientType, setFormClientType] = useState("Pvt Ltd");
  const [formPan, setFormPan] = useState("");
  const [formGstin, setFormGstin] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formPincode, setFormPincode] = useState("");
  const [formMonthlyFee, setFormMonthlyFee] = useState<number>(0);
  const [formAssignedLeadId, setFormAssignedLeadId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);

  // Reset form
  const resetForm = () => {
    setFormName("");
    setFormBusinessName("");
    setFormClientType("Pvt Ltd");
    setFormPan("");
    setFormGstin("");
    setFormEmail("");
    setFormPhone("");
    setFormCity("");
    setFormState("");
    setFormPincode("");
    setFormMonthlyFee(0);
    setFormAssignedLeadId(teamMembers[0]?.id || "");
    setFormNotes("");
    setFormErrors({});
    setFormGeneralError(null);
  };

  // Pre-fill form for edit
  const openEditModal = (client: ClientRecord) => {
    setEditingClient(client);
    setFormName(client.name);
    setFormBusinessName(client.businessName || "");
    setFormClientType(client.planName || "Pvt Ltd");
    setFormPan(client.pan || "");
    setFormGstin(client.gstin || "");
    setFormEmail(client.email);
    setFormPhone(client.phone);
    setFormCity(client.city || "");
    setFormState(client.state || "");
    setFormPincode(client.pincode || "");
    setFormMonthlyFee(Number(client.monthlyFee) || 0);
    setFormAssignedLeadId(teamMembers[0]?.id || "");
    setFormNotes(client.notes || "");
    setFormErrors({});
    setFormGeneralError(null);
  };

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Client-side validation
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim() || formName.trim().length < 2) {
      errors.name = "Legal entity name must be at least 2 characters";
    }
    if (!formEmail.trim() || !formEmail.includes("@")) {
      errors.email = "Please provide a valid primary email address";
    }
    if (!formPhone.trim() || formPhone.trim().length < 10) {
      errors.phone = "Please provide a valid 10-digit mobile number";
    }
    if (formPan.trim()) {
      const cleanPan = formPan.trim().toUpperCase();
      if (!PAN_REGEX.test(cleanPan)) {
        errors.pan = "Invalid PAN format. Standard Indian PAN: 5 letters, 4 digits, 1 letter (e.g. AAACZ1234F)";
      }
    }
    if (formGstin.trim()) {
      const cleanGstin = formGstin.trim().toUpperCase();
      if (!GSTIN_REGEX.test(cleanGstin)) {
        errors.gstin = "Invalid GSTIN format. Expected 15 characters (e.g. 09AAACZ1234F1Z5)";
      }
    }
    if (formPincode.trim() && formPincode.trim().length !== 6) {
      errors.pincode = "Indian postal PIN code must be exactly 6 digits";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormGeneralError(null);
    if (!validateForm()) return;

    startTransition(async () => {
      const res = await createClientAction({
        name: formName.trim(),
        businessName: formBusinessName.trim() || null,
        clientType: formClientType,
        pan: formPan.trim().toUpperCase() || null,
        gstin: formGstin.trim().toUpperCase() || null,
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim(),
        city: formCity.trim() || null,
        state: formState.trim() || null,
        pincode: formPincode.trim() || null,
        monthlyFee: Number(formMonthlyFee) || 0,
        assignedLeadId: formAssignedLeadId || null,
        notes: formNotes.trim() || null,
      });

      if (res.success) {
        setIsAddModalOpen(false);
        resetForm();
        setFormSuccessMessage(`"${res.data.name}" has been successfully added to your practice.`);
        setTimeout(() => setFormSuccessMessage(null), 4000);
        router.refresh();
      } else {
        setFormGeneralError(res.error || "We couldn't save this client. Please check the information and try again.");
      }
    });
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setFormGeneralError(null);
    if (!validateForm()) return;

    startTransition(async () => {
      const res = await updateClientAction(editingClient.id, {
        name: formName.trim(),
        businessName: formBusinessName.trim() || null,
        clientType: formClientType,
        pan: formPan.trim().toUpperCase() || null,
        gstin: formGstin.trim().toUpperCase() || null,
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim(),
        city: formCity.trim() || null,
        state: formState.trim() || null,
        pincode: formPincode.trim() || null,
        monthlyFee: Number(formMonthlyFee) || 0,
        notes: formNotes.trim() || null,
      });

      if (res.success) {
        setEditingClient(null);
        resetForm();
        setFormSuccessMessage(`Client record for "${res.data.name}" has been updated.`);
        setTimeout(() => setFormSuccessMessage(null), 4000);
        router.refresh();
      } else {
        setFormGeneralError(res.error || "We couldn't update this client. Please try again.");
      }
    });
  };

  // Handle Archive Confirm
  const handleArchiveConfirm = async () => {
    if (!clientToArchive) return;
    startTransition(async () => {
      const res = await archiveClientAction(clientToArchive.id);
      if (res.success) {
        setFormSuccessMessage(`"${clientToArchive.name}" archived. Historical records remain preserved.`);
        setClientToArchive(null);
        setTimeout(() => setFormSuccessMessage(null), 4000);
        router.refresh();
      } else {
        alert(res.error || "Unable to archive client.");
      }
    });
  };

  // Handle Restore Confirm
  const handleRestoreConfirm = async () => {
    if (!clientToRestore) return;
    startTransition(async () => {
      const res = await restoreClientAction(clientToRestore.id);
      if (res.success) {
        setFormSuccessMessage(`"${clientToRestore.name}" restored to active practice.`);
        setClientToRestore(null);
        setTimeout(() => setFormSuccessMessage(null), 4000);
        router.refresh();
      } else {
        alert(res.error || "Unable to restore client.");
      }
    });
  };

  // Filtering clients
  const filteredClients = initialClients.filter((c) => {
    const matchesStatus = statusFilter === "ACTIVE" ? c.active : !c.active;
    if (!matchesStatus) return false;

    if (entityFilter !== "ALL") {
      const type = c.planName || "";
      if (!type.toLowerCase().includes(entityFilter.toLowerCase())) return false;
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const nameMatch = c.name.toLowerCase().includes(term);
      const aliasMatch = (c.businessName || "").toLowerCase().includes(term);
      const panMatch = (c.pan || "").toLowerCase().includes(term);
      const gstinMatch = (c.gstin || "").toLowerCase().includes(term);
      const emailMatch = c.email.toLowerCase().includes(term);
      const phoneMatch = c.phone.toLowerCase().includes(term);
      if (!nameMatch && !aliasMatch && !panMatch && !gstinMatch && !emailMatch && !phoneMatch) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Banner Message */}
      {formSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{formSuccessMessage}</span>
          </div>
          <button
            onClick={() => setFormSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
              Clients 360° Directory
            </h1>
            <Badge variant="neutral" size="sm">
              {metrics.activeClients} Active
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Manage practice tax entities, PAN/GSTIN profiles, and assigned client partners.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status Tabs */}
          <div className="flex items-center p-0.5 bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg text-xs">
            <button
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                statusFilter === "ACTIVE"
                  ? "bg-white text-graphite-900 shadow-2xs font-semibold"
                  : "text-graphite-500 hover:text-graphite-800"
              }`}
            >
              Active ({metrics.activeClients})
            </button>
            <button
              onClick={() => setStatusFilter("ARCHIVED")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                statusFilter === "ARCHIVED"
                  ? "bg-white text-graphite-900 shadow-2xs font-semibold"
                  : "text-graphite-500 hover:text-graphite-800"
              }`}
            >
              Archived ({Math.max(0, metrics.totalClients - metrics.activeClients)})
            </button>
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsImportModalOpen(true)}
            className="flex-shrink-0"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Import Clients
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex-shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add New Client
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Practice Clients"
          value={metrics.totalClients}
          subtitle="All onboarded client accounts"
          icon={<Building2 className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Corporate Accounts"
          value={metrics.corporateClients}
          subtitle="Pvt Ltd & LLP tax entities"
          badge="Corporate"
          badgeVariant="neutral"
          icon={<Briefcase className="w-4 h-4 text-graphite-500" />}
        />
        <MetricCard
          title="Monthly Retainer"
          value={formatINR(metrics.totalMonthlyRetainer)}
          subtitle="Contracted practice billing"
          badge="Active Retainer"
          badgeVariant="success"
          icon={<CreditCard className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="Follow-ups Required"
          value={metrics.actionNeededCount}
          subtitle="Overdue invoices or notices"
          badge={metrics.actionNeededCount > 0 ? "Review Needed" : "All Clear"}
          badgeVariant={metrics.actionNeededCount > 0 ? "warning" : "success"}
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="p-3.5 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by legal name, PAN, GSTIN, email, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite-400 hover:text-graphite-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 text-xs text-graphite-500 flex-shrink-0">
              <Filter className="w-3.5 h-3.5" />
              <span>Entity:</span>
            </div>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
            >
              <option value="ALL">All Entity Types</option>
              <option value="Pvt Ltd">Pvt Ltd / Private Limited</option>
              <option value="LLP">Limited Liability Partnership (LLP)</option>
              <option value="Proprietorship">Proprietorship</option>
              <option value="Individual">Individual</option>
              <option value="Partnership">Partnership</option>
            </select>

            {(searchTerm || entityFilter !== "ALL") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setEntityFilter("ALL");
                }}
                className="text-graphite-500 text-xs"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>

        {/* Directory Table / Cards Container */}
        {filteredClients.length === 0 ? (
          <EmptyState
            title="No clients match this search"
            description="Try a different legal name, PAN, or GSTIN, or clear your current filters to view all records."
            actionLabel="Reset Search & Filters"
            onAction={() => {
              setSearchTerm("");
              setEntityFilter("ALL");
            }}
          />
        ) : (
          <>
            {/* Desktop / Tablet Table (visible >= 768px) */}
            <div className="hidden md:block overflow-x-auto border-t border-[#EBE9E1]">
              <table className="w-full text-left text-sm text-graphite-700">
                <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                  <tr>
                    <th className="px-5 py-3.5">Client & Legal Entity</th>
                    <th className="px-4 py-3.5">Tax Identifiers</th>
                    <th className="px-4 py-3.5">Primary Contact</th>
                    <th className="px-4 py-3.5">Monthly Retainer</th>
                    <th className="px-4 py-3.5">Activity</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE9E1]">
                  {filteredClients.map((client) => {
                    const primaryContact = client.contacts.find((c) => c.isPrimary) || client.contacts[0];
                    return (
                      <tr
                        key={client.id}
                        className="hover:bg-[#FAF9F5]/70 transition-colors group"
                      >
                        {/* Client Name & Type */}
                        <td className="px-5 py-4">
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-semibold text-graphite-900 group-hover:text-emerald-700 transition-colors block leading-tight"
                          >
                            {client.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="neutral" size="sm">
                              {client.planName || "Entity"}
                            </Badge>
                            {client.businessName && client.businessName !== client.name && (
                              <span className="text-[11px] text-graphite-400 truncate max-w-[160px]">
                                T/A {client.businessName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Tax IDs (PAN & GSTIN) */}
                        <td className="px-4 py-4 text-xs font-mono space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-graphite-400 text-[10px] uppercase font-sans">PAN:</span>
                            <span className="font-semibold text-graphite-800">
                              {client.pan || "—"}
                            </span>
                            {client.pan && (
                              <button
                                onClick={() => copyToClipboard(client.pan!, `pan-${client.id}`)}
                                className="text-graphite-400 hover:text-emerald-700 transition-colors p-0.5"
                                title="Copy PAN"
                              >
                                {copiedId === `pan-${client.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-graphite-400 text-[10px] uppercase font-sans">GSTIN:</span>
                            <span className="text-graphite-600">
                              {client.gstin || "Unregistered"}
                            </span>
                            {client.gstin && (
                              <button
                                onClick={() => copyToClipboard(client.gstin!, `gst-${client.id}`)}
                                className="text-graphite-400 hover:text-emerald-700 transition-colors p-0.5"
                                title="Copy GSTIN"
                              >
                                {copiedId === `gst-${client.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Contact Info */}
                        <td className="px-4 py-4 text-xs space-y-0.5">
                          <div className="font-medium text-graphite-800 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-graphite-400 flex-shrink-0" />
                            <a
                              href={`mailto:${client.email}`}
                              className="hover:text-emerald-700 transition-colors truncate max-w-[180px]"
                            >
                              {client.email}
                            </a>
                          </div>
                          <div className="text-graphite-500 font-mono flex items-center gap-1 text-[11px]">
                            <Phone className="w-3 h-3 text-graphite-400 flex-shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                          {(client.city || client.state) && (
                            <div className="text-[10px] text-graphite-400 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-graphite-400 flex-shrink-0" />
                              <span>{[client.city, client.state].filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                        </td>

                        {/* Retainer Fee */}
                        <td className="px-4 py-4 text-xs">
                          <div className="font-semibold text-graphite-900">
                            {formatINR(Number(client.monthlyFee || 0))}
                          </div>
                          <div className="text-[10px] text-graphite-400">per month</div>
                        </td>

                        {/* Invoices & Tasks Activity */}
                        <td className="px-4 py-4 text-xs text-graphite-600 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-semibold text-graphite-800">{client._count.invoices}</span>
                            <span className="text-graphite-400">invoices</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-semibold text-graphite-800">{client._count.tasks}</span>
                            <span className="text-graphite-400">active tasks</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          {client.active ? (
                            <Badge variant="success" size="sm">
                              Active Practice
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Archived
                            </Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/clients/${client.id}`}
                              className="p-1.5 text-graphite-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="View Client 360° Profile"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>

                            <button
                              onClick={() => openEditModal(client)}
                              className="p-1.5 text-graphite-500 hover:text-graphite-800 hover:bg-ivory-200 rounded-lg transition-colors"
                              title="Edit Client Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {client.active ? (
                              <button
                                onClick={() => setClientToArchive(client)}
                                className="p-1.5 text-graphite-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Archive Client"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setClientToRestore(client)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Restore Client"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards (visible < 768px) */}
            <div className="md:hidden divide-y divide-[#EBE9E1] border-t border-[#EBE9E1]">
              {filteredClients.map((client) => (
                <div key={client.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-bold text-graphite-900 text-sm hover:text-emerald-700 transition-colors block"
                      >
                        {client.name}
                      </Link>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="neutral" size="sm">
                          {client.planName || "Pvt Ltd"}
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
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        href={`/clients/${client.id}`}
                        className="p-2 text-emerald-700 bg-emerald-50 rounded-lg"
                        title="Open Profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => openEditModal(client)}
                        className="p-2 text-graphite-600 bg-ivory-100 rounded-lg"
                        title="Edit Client"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#FAF9F5] p-2.5 rounded-lg border border-[#EBE9E1]">
                    <div>
                      <span className="text-[10px] uppercase text-graphite-400 block font-sans">PAN:</span>
                      <span className="font-mono font-semibold text-graphite-800">
                        {client.pan || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-graphite-400 block font-sans">Retainer:</span>
                      <span className="font-semibold text-graphite-900">
                        {formatINR(Number(client.monthlyFee || 0))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${client.phone}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-[#E2E0D8] text-graphite-700 font-medium hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                      >
                        <Phone className="w-3 h-3 text-emerald-600" />
                        Call
                      </a>
                      <a
                        href={`mailto:${client.email}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-[#E2E0D8] text-graphite-700 font-medium hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                      >
                        <Mail className="w-3 h-3 text-emerald-600" />
                        Email
                      </a>
                    </div>

                    {client.active ? (
                      <button
                        onClick={() => setClientToArchive(client)}
                        className="text-xs text-rose-600 hover:text-rose-700 p-1 font-medium"
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        onClick={() => setClientToRestore(client)}
                        className="text-xs text-emerald-700 hover:text-emerald-800 p-1 font-medium"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Add New Client Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          if (!isPending) setIsAddModalOpen(false);
        }}
        title="Onboard New Practice Client"
        description="Register legal entity, GSTIN, PAN, and primary accounting contacts."
        maxWidth="xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formGeneralError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formGeneralError}
            </div>
          )}

          <div>
            <Input
              label="Entity Legal Name"
              requiredIndicator
              placeholder="e.g. Apex Industrial Solutions Private Limited"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              error={formErrors.name}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Trade Alias / Business Name"
              placeholder="e.g. Apex Industries"
              value={formBusinessName}
              onChange={(e) => setFormBusinessName(e.target.value)}
            />
            <Select
              label="Entity Constitution"
              value={formClientType}
              onChange={(e) => setFormClientType(e.target.value)}
            >
              {CLIENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Permanent Account Number (PAN)"
              placeholder="AAACZ1234F"
              maxLength={10}
              value={formPan}
              onChange={(e) => setFormPan(e.target.value.toUpperCase())}
              error={formErrors.pan}
              className="font-mono uppercase"
              helperText="10 characters (5 letters, 4 digits, 1 letter)"
            />
            <Input
              label="GST Identification Number (GSTIN)"
              placeholder="09AAACZ1234F1Z5"
              maxLength={15}
              value={formGstin}
              onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
              error={formErrors.gstin}
              className="font-mono uppercase"
              helperText="15 characters (State code + PAN + entity details)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Primary Contact Email"
              requiredIndicator
              type="email"
              placeholder="accounts@apexindustries.in"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              error={formErrors.email}
            />
            <Input
              label="Primary Phone / WhatsApp"
              requiredIndicator
              placeholder="+91 98390 12345"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              error={formErrors.phone}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Input
              label="City"
              placeholder="e.g. Mumbai"
              value={formCity}
              onChange={(e) => setFormCity(e.target.value)}
            />
            <Select
              label="State / Union Territory"
              value={formState}
              onChange={(e) => setFormState(e.target.value)}
            >
              <option value="">Select State / UT</option>
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
            <Input
              label="Postal PIN Code"
              placeholder="400001"
              maxLength={6}
              value={formPincode}
              onChange={(e) => setFormPincode(e.target.value)}
              error={formErrors.pincode}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Monthly Practice Retainer (₹ INR)"
              type="number"
              min={0}
              placeholder="25000"
              value={formMonthlyFee}
              onChange={(e) => setFormMonthlyFee(Number(e.target.value) || 0)}
              helperText="Authoritative retainer fee for billing cycles"
            />
            <Select
              label="Assigned Lead Partner"
              value={formAssignedLeadId}
              onChange={(e) => setFormAssignedLeadId(e.target.value)}
            >
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name} ({tm.role})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Save & Onboard Client
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        isOpen={!!editingClient}
        onClose={() => {
          if (!isPending) setEditingClient(null);
        }}
        title={`Edit Client: ${editingClient?.name || ""}`}
        description="Update registered address, PAN, GSTIN, or billing retainer."
        maxWidth="xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formGeneralError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formGeneralError}
            </div>
          )}

          <div>
            <Input
              label="Entity Legal Name"
              requiredIndicator
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              error={formErrors.name}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Trade Alias / Business Name"
              value={formBusinessName}
              onChange={(e) => setFormBusinessName(e.target.value)}
            />
            <Select
              label="Entity Constitution"
              value={formClientType}
              onChange={(e) => setFormClientType(e.target.value)}
            >
              {CLIENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="PAN"
              maxLength={10}
              value={formPan}
              onChange={(e) => setFormPan(e.target.value.toUpperCase())}
              error={formErrors.pan}
              className="font-mono uppercase"
            />
            <Input
              label="GSTIN"
              maxLength={15}
              value={formGstin}
              onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
              error={formErrors.gstin}
              className="font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Primary Email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              error={formErrors.email}
            />
            <Input
              label="Primary Phone"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              error={formErrors.phone}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Input
              label="City"
              value={formCity}
              onChange={(e) => setFormCity(e.target.value)}
            />
            <Select
              label="State / UT"
              value={formState}
              onChange={(e) => setFormState(e.target.value)}
            >
              <option value="">Select State / UT</option>
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
            <Input
              label="PIN Code"
              maxLength={6}
              value={formPincode}
              onChange={(e) => setFormPincode(e.target.value)}
              error={formErrors.pincode}
            />
          </div>

          <div>
            <Input
              label="Monthly Practice Retainer (₹ INR)"
              type="number"
              min={0}
              value={formMonthlyFee}
              onChange={(e) => setFormMonthlyFee(Number(e.target.value) || 0)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingClient(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!clientToArchive}
        onClose={() => setClientToArchive(null)}
        onConfirm={handleArchiveConfirm}
        title={`Archive ${clientToArchive?.name}?`}
        description={`Archive ${clientToArchive?.name}? Its invoices, historical GST returns, and compliance records will remain available according to your access permissions.`}
        confirmLabel="Archive Client"
        cancelLabel="Keep Active"
        variant="warning"
        isLoading={isPending}
      />

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!clientToRestore}
        onClose={() => setClientToRestore(null)}
        onConfirm={handleRestoreConfirm}
        title={`Restore ${clientToRestore?.name}?`}
        description={`Restore ${clientToRestore?.name} back to active practice status? It will resume inclusion in live billing schedules and daily compliance notifications.`}
        confirmLabel="Restore to Active"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isPending}
      />

      {/* Bulk Client Import Modal */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />
    </div>
  );
}
