"use client";

import React, { useState, useTransition } from "react";
import {
  ShieldAlert,
  Server,
  Database,
  Activity,
  Lock,
  Unlock,
  Search,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  Briefcase,
  Layers,
  FileText,
  Clock,
  Sparkles,
  ExternalLink,
  PlusCircle,
  HelpCircle,
  Cpu,
  RefreshCw,
  Eye,
  Filter,
  CheckCircle,
  XCircle,
  ChevronRight,
  Send,
  MessageSquare,
  Shield,
  LifeBuoy,
  ClipboardList,
  Trash2,
} from "lucide-react";
import {
  toggleTenantSuspensionAction,
  createInternalServiceTaskAction,
  createAuthorizedSupportNoteAction,
  togglePlatformFeatureFlagAction,
  resetPracticeDataAction,
} from "@/lib/server/actions/godmode-actions";
import { FeatureFlagState } from "@/lib/server/feature-flags";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  gstin: string | null;
  pan: string | null;
  active: boolean;
  isSuspended: boolean;
  approvalThreshold: number;
  accountingSoftware: string;
  createdAt: string;
  usersCount: number;
  clientsCount: number;
  invoicesCount: number;
  tasksCount: number;
  keyPartners: Array<{ name: string; email: string; role: string }>;
}

export interface AuditLogSummary {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  tenantName: string;
  userName: string;
  userEmail: string;
  ipAddress: string;
  createdAt: string;
  newValue: any;
}

export interface PlatformUserSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isSuperAdmin: boolean;
  active: boolean;
  createdAt: string;
  memberships: Array<{
    tenantName: string;
    tenantSlug: string;
    role: string;
    status: string;
  }>;
}

export interface GodmodeStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalInvoices: number;
  totalAuditLogs: number;
  currentAdmin: {
    id: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

interface GodmodeClientProps {
  stats: GodmodeStats;
  tenants: TenantSummary[];
  auditLogs: AuditLogSummary[];
  platformUsers: PlatformUserSummary[];
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    tenantName: string;
    lastTestedAt: string | null;
  }>;
  subscriptions: Array<{
    id: string;
    tier: string;
    status: string;
    tenantName: string;
    maxUsers: number;
    maxClients: number;
    currentPeriodEnd: string;
  }>;
  initialFeatureFlags?: FeatureFlagState;
  internalStaff?: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isSuperAdmin: boolean;
  }>;
}

// Pre-configured TRUVTECH Internal Service Catalogue
const TRUVTECH_SERVICE_CATALOGUE = [
  {
    id: "srv-01",
    code: "GST_FILING_AUTOMATION",
    title: "Managed GST Automation Engine",
    description: "Multi-client automated 2B reconciliation, CMP-08, GSTR-1, and 3B preparation pipelines.",
    sla: "4 Business Hours",
    status: "Active Delivery",
    targetAudience: "Mid-to-Large CA Firms",
  },
  {
    id: "srv-02",
    code: "KYC_FAST_TRACK",
    title: "Assisted Client KYC & Onboarding",
    description: "Bulk PAN, GSTIN, and MCA director master register ingestion with validation rules.",
    sla: "Same Day Turnaround",
    status: "Active Delivery",
    targetAudience: "New Practice Migrations",
  },
  {
    id: "srv-03",
    code: "TALLY_BRIDGE",
    title: "Custom Tally XML Sync Bridge",
    description: "Two-way ledger export and voucher synchronization between LedgerOS and local Tally Prime.",
    sla: "24-Hour Deployment",
    status: "Active Delivery",
    targetAudience: "All Tally Practices",
  },
  {
    id: "srv-04",
    code: "AUDIT_TRAIL_CERT",
    title: "MCA Audit Trail Compliance Package",
    description: "Continuous edit log preservation, tamper detection, and annual compliance certification.",
    sla: "Continuous",
    status: "Production Ready",
    targetAudience: "Corporate Audits",
  },
];

// TRUVTECH Internal Service Team ("My Team")
const TRUVTECH_INTERNAL_TEAM = [
  {
    id: "tt-user-1",
    name: "Rohan Varma",
    role: "Head of Practice Engineering",
    email: "rohan.varma@truvtech.com",
    department: "Platform Engineering",
    activeTasks: 3,
    status: "Online",
  },
  {
    id: "tt-user-2",
    name: "Sneha Deshmukh",
    role: "Senior CA Implementation Lead",
    email: "sneha.deshmukh@truvtech.com",
    department: "Service Delivery",
    activeTasks: 5,
    status: "In Consultation",
  },
  {
    id: "tt-user-3",
    name: "Karan Johar",
    role: "Statutory Integration Specialist",
    email: "karan.johar@truvtech.com",
    department: "Integrations & APIs",
    activeTasks: 2,
    status: "Online",
  },
  {
    id: "tt-user-4",
    name: "Ananya Sen",
    role: "Tier-2 Technical Support Lead",
    email: "ananya.sen@truvtech.com",
    department: "Support & Escalations",
    activeTasks: 4,
    status: "Reviewing Tickets",
  },
];

export function GodmodeClient({
  stats,
  tenants: initialTenants,
  auditLogs,
  platformUsers,
  integrations,
  subscriptions,
  initialFeatureFlags,
  internalStaff,
}: GodmodeClientProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "tenants" | "services" | "my-team" | "audit" | "config"
  >("overview");

  const [tenants, setTenants] = useState<TenantSummary[]>(initialTenants);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const handleExecutePracticeReset = async () => {
    try {
      setIsResetting(true);
      setResetFeedback(null);
      const res = await resetPracticeDataAction();
      if (!res.success) {
        setResetFeedback(res.error || "Failed to reset practice data");
        return;
      }
      setResetFeedback("Practice data reset to blank state successfully.");
      setTimeout(() => {
        setShowResetConfirmModal(false);
        setResetFeedback(null);
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      setResetFeedback(e?.message || "Failed to reset practice data");
    } finally {
      setIsResetting(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null);

  // Suspension Modal State
  const [suspensionModal, setSuspensionModal] = useState<{
    open: boolean;
    tenant: TenantSummary | null;
    suspend: boolean;
    reason: string;
    error: string | null;
  }>({
    open: false,
    tenant: null,
    suspend: true,
    reason: "",
    error: null,
  });

  // Feature Flags initialized from server-persisted state
  const [featureFlags, setFeatureFlags] = useState({
    aiCopilotV2: initialFeatureFlags?.aiCopilotV2 ?? true,
    gstnSandboxMock: initialFeatureFlags?.gstnSandboxMock ?? true,
    autoWhatsAppCron: initialFeatureFlags?.autoWhatsAppCron ?? true,
    killSwitchGlobalRegistration: initialFeatureFlags?.killSwitchGlobalRegistration ?? false,
    enforceM2MSignatureAuth: initialFeatureFlags?.enforceM2MSignatureAuth ?? true,
    bulkCsvImportStrictSanitization: initialFeatureFlags?.bulkCsvImportStrictSanitization ?? true,
  });

  // Merge database internal staff with department leads
  const combinedInternalStaff = [
    ...(internalStaff || []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.isSuperAdmin ? "Platform Superadmin" : "Platform Operator",
      department: "Platform Engineering",
      email: u.email,
      activeTasks: 2,
      status: "Online",
    })),
    ...TRUVTECH_INTERNAL_TEAM.filter(
      (s) => !(internalStaff || []).some((u) => u.email === s.email)
    ),
  ];

  // Internal Task Form Modal State
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    category: "ONBOARDING" as any,
    priority: "HIGH" as any,
    assigneeName: "Sneha Deshmukh",
    customerFirmName: "",
    detail: "",
    dueDate: "",
  });
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  // Support Note Form State
  const [supportNoteModalOpen, setSupportNoteModalOpen] = useState(false);
  const [supportNoteForm, setSupportNoteForm] = useState({
    tenantId: initialTenants[0]?.id || "",
    tenantName: initialTenants[0]?.name || "",
    ticketId: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    summary: "",
    urgency: "STANDARD" as any,
    resolutionStatus: "INVESTIGATING" as any,
  });
  const [supportNoteMessage, setSupportNoteMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Filter tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.gstin && t.gstin.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      tenantFilter === "ALL" ||
      (tenantFilter === "ACTIVE" && t.active && !t.isSuspended) ||
      (tenantFilter === "SUSPENDED" && (t.isSuspended || !t.active));

    return matchesSearch && matchesStatus;
  });

  // Handle Suspension Mutation
  const handleConfirmSuspension = () => {
    if (!suspensionModal.tenant) return;
    if (suspensionModal.reason.trim().length < 5) {
      setSuspensionModal((prev) => ({
        ...prev,
        error: "A valid operational reason of at least 5 characters is required.",
      }));
      return;
    }

    startTransition(async () => {
      const res = await toggleTenantSuspensionAction({
        tenantId: suspensionModal.tenant!.id,
        suspend: suspensionModal.suspend,
        reason: suspensionModal.reason,
      });

      if (res.success) {
        setTenants((prev) =>
          prev.map((t) =>
            t.id === suspensionModal.tenant!.id
              ? { ...t, isSuspended: suspensionModal.suspend, active: !suspensionModal.suspend }
              : t
          )
        );
        setSuspensionModal({ open: false, tenant: null, suspend: true, reason: "", error: null });
      } else {
        setSuspensionModal((prev) => ({ ...prev, error: res.error || "Failed to alter status." }));
      }
    });
  };

  // Handle Feature Flag Toggle
  const handleToggleFlag = (key: keyof typeof featureFlags) => {
    const nextVal = !featureFlags[key];
    setFeatureFlags((prev) => ({ ...prev, [key]: nextVal }));

    startTransition(async () => {
      await togglePlatformFeatureFlagAction({
        flagKey: key,
        enabled: nextVal,
      });
    });
  };

  // Handle Internal Service Task Submission
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    setTaskMessage(null);

    startTransition(async () => {
      const res = await createInternalServiceTaskAction({
        title: taskForm.title,
        category: taskForm.category,
        priority: taskForm.priority,
        assigneeName: taskForm.assigneeName,
        customerFirmName: taskForm.customerFirmName || undefined,
        detail: taskForm.detail || undefined,
        dueDate: taskForm.dueDate || undefined,
      });

      if (res.success) {
        setTaskMessage("Internal service delivery task dispatched and logged.");
        setTimeout(() => {
          setTaskModalOpen(false);
          setTaskMessage(null);
          setTaskForm({
            title: "",
            category: "ONBOARDING",
            priority: "HIGH",
            assigneeName: "Sneha Deshmukh",
            customerFirmName: "",
            detail: "",
            dueDate: "",
          });
        }, 1200);
      } else {
        setTaskMessage(res.error || "Failed to dispatch task.");
      }
    });
  };

  // Handle Authorized Support Note Submission
  const handleCreateSupportNote = (e: React.FormEvent) => {
    e.preventDefault();
    setSupportNoteMessage(null);

    startTransition(async () => {
      const targetTenant = tenants.find((t) => t.id === supportNoteForm.tenantId);
      const res = await createAuthorizedSupportNoteAction({
        tenantId: supportNoteForm.tenantId,
        tenantName: targetTenant ? targetTenant.name : supportNoteForm.tenantName,
        ticketId: supportNoteForm.ticketId,
        summary: supportNoteForm.summary,
        urgency: supportNoteForm.urgency,
        resolutionStatus: supportNoteForm.resolutionStatus,
      });

      if (res.success) {
        setSupportNoteMessage("Authorized support note appended to tenant audit log.");
        setTimeout(() => {
          setSupportNoteModalOpen(false);
          setSupportNoteMessage(null);
          setSupportNoteForm({
            tenantId: initialTenants[0]?.id || "",
            tenantName: initialTenants[0]?.name || "",
            ticketId: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
            summary: "",
            urgency: "STANDARD",
            resolutionStatus: "INVESTIGATING",
          });
        }, 1200);
      } else {
        setSupportNoteMessage(res.error || "Failed to log note.");
      }
    });
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 bg-[#F8FAFC] text-[#0F172A] min-h-screen">
      {/* Top Enterprise Control Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white border border-[#E2E8F0] p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-200">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
                  TRUVTECH God Mode // Platform Command Center
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Cluster: IN-MUM-1
                </span>
              </div>
              <p className="text-xs text-[#475569] mt-0.5">
                Multi-tenant isolation enforcement, practice orchestration, TRUVTECH service delivery, and privileged audit stream.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="block text-xs font-semibold text-[#0F172A]">
              {stats.currentAdmin.name}
            </span>
            <span className="text-[10px] text-[#64748B] font-mono">
              {stats.currentAdmin.isSuperAdmin ? "SUPERADMIN PLATFORM OWNER" : "GODMODE OPERATOR"}
            </span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] transition"
            title="Refresh Cluster State"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E2E8F0] overflow-x-auto pb-px">
        {[
          { key: "overview", label: "Platform Overview", icon: Activity, count: null },
          { key: "tenants", label: "Practice Firms", icon: Building2, count: tenants.length },
          { key: "services", label: "Service Catalogue", icon: Layers, count: TRUVTECH_SERVICE_CATALOGUE.length },
          { key: "my-team", label: "TRUVTECH My Team", icon: Briefcase, count: TRUVTECH_INTERNAL_TEAM.length },
          { key: "audit", label: "Security & Audit Stream", icon: Shield, count: auditLogs.length },
          { key: "config", label: "Platform Settings & Flags", icon: Sliders, count: null },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-[#2563EB] text-[#2563EB] bg-white shadow-2xs font-bold"
                  : "border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100/60"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isActive ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          TAB 1: OVERVIEW & CLUSTER HEALTH
      ========================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold uppercase tracking-wider">Registered Practices</span>
                <Building2 className="h-4 w-4 text-[#2563EB]" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{stats.totalTenants}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-emerald-600 font-medium">
                  {stats.activeTenants} Active Firms
                </span>
                {stats.suspendedTenants > 0 && (
                  <span className="text-xs text-rose-600 font-medium">
                    • {stats.suspendedTenants} Suspended
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold uppercase tracking-wider">Authorized CA Staff</span>
                <Users className="h-4 w-4 text-[#0D9488]" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{stats.totalUsers}</p>
              <span className="text-xs text-[#64748B]">Across all tenant boundaries</span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold uppercase tracking-wider">Practice Invoices</span>
                <FileText className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{stats.totalInvoices}</p>
              <span className="text-xs text-[#64748B]">Zero cross-tenant leaks</span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold uppercase tracking-wider">Audit Trail Records</span>
                <Shield className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{stats.totalAuditLogs}</p>
              <span className="text-xs text-emerald-600 font-medium">Tamper-evident log active</span>
            </div>
          </div>

          {/* Infrastructure Health Status */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2 mb-4">
              <Server className="h-4 w-4 text-[#2563EB]" />
              Multi-Region Infrastructure & Compliance State
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#475569]">PostgreSQL Multi-Tenant DB</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-lg font-bold text-[#0F172A] mt-2">Nominal • 100% Synced</div>
                <p className="text-[11px] text-[#64748B] mt-1">Tenant ID constraints enforced on all read/write queries</p>
              </div>

              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#475569]">Session & Auth Protection</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-lg font-bold text-[#0F172A] mt-2">HTTP-Only Rotated</div>
                <p className="text-[11px] text-[#64748B] mt-1">7-Day TTL, CSRF token validation, SameSite lax cookies</p>
              </div>

              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#475569]">M2M Vault & Cryptography</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-lg font-bold text-[#0F172A] mt-2">AES-256-GCM Active</div>
                <p className="text-[11px] text-[#64748B] mt-1">DSC pins & government secrets never stored in plaintext</p>
              </div>
            </div>
          </div>

          {/* Quick Platform Actions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[#2563EB]" />
                  Dispatch Internal Service Task
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Assign technical onboarding, data migration, or SLA tasks to TRUVTECH engineers.
                </p>
              </div>
              <button
                onClick={() => setTaskModalOpen(true)}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Create Service Task</span>
              </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-[#0D9488]" />
                  Record Authorized Support Memorandum
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Document client-consented troubleshooting sessions with an audit-backed paper trail.
                </p>
              </div>
              <button
                onClick={() => setSupportNoteModalOpen(true)}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Append Support Note</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: PRACTICE FIRM DIRECTORY & TENANT CONTROLS
      ========================================================================== */}
      {activeTab === "tenants" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search firm name, slug, email, or GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] py-2 pl-9 pr-4 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 text-xs">
                {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTenantFilter(filter)}
                    className={`px-3 py-1.5 rounded-md font-semibold text-[11px] transition ${
                      tenantFilter === filter
                        ? "bg-white text-[#2563EB] shadow-xs"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#64748B] font-medium whitespace-nowrap">
                {filteredTenants.length} Practices
              </span>
            </div>
          </div>

          {/* Tenants Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#334155]">
                <thead className="bg-[#F1F5F9] text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">CA Practice & Slug</th>
                    <th className="px-5 py-3 font-semibold">Contact & GSTIN</th>
                    <th className="px-5 py-3 font-semibold text-center">Staff</th>
                    <th className="px-5 py-3 font-semibold text-center">Clients</th>
                    <th className="px-5 py-3 font-semibold text-center">Invoices</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-[#F8FAFC] transition">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-[#0F172A]">{t.name}</div>
                        <div className="font-mono text-[11px] text-[#64748B] mt-0.5">
                          slug: /{t.slug}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-[#0F172A]">{t.email}</div>
                        <div className="font-mono text-[11px] text-[#64748B]">
                          {t.gstin || "Unregistered GSTIN"}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-[#0F172A]">
                        {t.usersCount}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-[#0F172A]">
                        {t.clientsCount}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-[#0F172A]">
                        {t.invoicesCount}
                      </td>
                      <td className="px-5 py-3.5">
                        {t.isSuspended || !t.active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Lock className="h-3 w-3" /> Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => setSelectedTenant(t)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 rounded-md transition"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() =>
                            setSuspensionModal({
                              open: true,
                              tenant: t,
                              suspend: !t.isSuspended,
                              reason: "",
                              error: null,
                            })
                          }
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition inline-flex items-center gap-1 ${
                            t.isSuspended
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                          }`}
                        >
                          {t.isSuspended ? (
                            <>
                              <Unlock className="h-3 w-3" /> Unlock
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3" /> Suspend
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTenants.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-[#64748B]">
                        No practice firms match the specified filter query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: TRUVTECH SERVICE CATALOGUE & SERVICE MANAGEMENT
      ========================================================================== */}
      {activeTab === "services" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-xl shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <Layers className="h-5 w-5 text-[#2563EB]" />
                  TRUVTECH Professional Practice Services
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  Managed workflow automation, bulk statutory ingestion, and technical delivery services provided to CA firms.
                </p>
              </div>
              <button
                onClick={() => setTaskModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Assign Service to Firm</span>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 mt-6">
              {TRUVTECH_SERVICE_CATALOGUE.map((srv) => (
                <div
                  key={srv.id}
                  className="p-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white hover:border-[#2563EB]/40 hover:shadow-xs transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {srv.code}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> {srv.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] mt-2.5">{srv.title}</h3>
                  <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">{srv.description}</p>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E2E8F0] text-[11px]">
                    <span className="text-[#64748B]">
                      SLA Target: <strong className="text-[#0F172A]">{srv.sla}</strong>
                    </span>
                    <span className="text-[#64748B]">{srv.targetAudience}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: TRUVTECH INTERNAL TEAM ("MY TEAM")
      ========================================================================== */}
      {activeTab === "my-team" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-xl shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#2563EB]" />
                  TRUVTECH Service Delivery Personnel (&quot;My Team&quot;)
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  Internal company employees managing onboarding, technical support escalations, and system integrity.
                </p>
              </div>
              <button
                onClick={() => setTaskModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Dispatch Workload Item</span>
              </button>
            </div>

            {/* Internal Staff Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
              {combinedInternalStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="p-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-[#2563EB] font-bold text-xs flex items-center justify-center">
                      {staff.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {staff.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <h3 className="text-sm font-bold text-[#0F172A]">{staff.name}</h3>
                    <p className="text-xs text-[#2563EB] font-medium mt-0.5">{staff.role}</p>
                    <p className="text-[11px] text-[#64748B]">{staff.department}</p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">Active Deliverables:</span>
                    <span className="font-bold text-[#0F172A]">{staff.activeTasks}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: PRIVILEGED AUDIT & SECURITY STREAM
      ========================================================================== */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#2563EB]" />
                Tamper-Evident Security & Administrative Audit Log
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Cryptographically recorded platform mutations, role changes, tenant status alterations, and security breaches.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#334155]">
                <thead className="bg-[#F1F5F9] text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Timestamp</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">Actor</th>
                    <th className="px-5 py-3 font-semibold">Target Practice</th>
                    <th className="px-5 py-3 font-semibold">IP Address</th>
                    <th className="px-5 py-3 font-semibold">Details / Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F8FAFC] transition">
                      <td className="px-5 py-3 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="px-5 py-3 font-semibold">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            log.action.includes("UNAUTHORIZED") || log.action.includes("SUSPENDED")
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : log.action.includes("ACTIVATED") || log.action.includes("SUCCESS")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-[#0F172A]">{log.userName}</div>
                        <div className="text-[10px] text-[#64748B]">{log.userEmail}</div>
                      </td>
                      <td className="px-5 py-3 text-[#0F172A]">{log.tenantName}</td>
                      <td className="px-5 py-3 font-mono text-[11px] text-[#64748B]">
                        {log.ipAddress}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-[#64748B] max-w-xs truncate">
                        {log.newValue ? JSON.stringify(log.newValue) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: PLATFORM SETTINGS & GLOBAL FLAGS
      ========================================================================== */}
      {activeTab === "config" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] p-6 rounded-xl shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2 mb-2">
              <Sliders className="h-4 w-4 text-[#2563EB]" />
              Platform-Wide Feature Hot-Swapping (Global State)
            </h2>
            <p className="text-xs text-[#64748B] mb-5">
              Toggling these values affects global routing and server checks immediately. Changes are logged to the security audit trail.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(featureFlags).map(([flagKey, enabled]) => (
                <div
                  key={flagKey}
                  onClick={() => handleToggleFlag(flagKey as keyof typeof featureFlags)}
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer select-none transition ${
                    enabled
                      ? "border-emerald-300 bg-emerald-50/40 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <div>
                    <span className="font-mono text-xs font-semibold block">{flagKey}</span>
                    <span className="text-[10px] text-[#64748B]">
                      {enabled ? "Active across all tenants" : "Disabled platform-wide"}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                      enabled ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"
                    }`}
                  >
                    {enabled ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Practice Data Management & Production Reset */}
          <div className="bg-white border border-rose-200 p-6 rounded-xl shadow-xs mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-rose-900 uppercase tracking-wider flex items-center gap-2 mb-1">
                  <Trash2 className="h-4 w-4 text-rose-600" />
                  Production Practice Reset & Data Clean-Up
                </h2>
                <p className="text-xs text-slate-500 max-w-xl">
                  Eradicate all mock/dummy test records, fake transactions, demo clients, and sample communications across the database. Firm tenant configurations, superadmin accounts, and active partner profiles are strictly preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="px-4 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                <AlertTriangle className="h-4 w-4" />
                Reset Practice Data to Blank State
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] p-6 rounded-xl shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider mb-2">
              Platform vs Customer Setting Boundaries
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <h3 className="font-bold text-[#0F172A]">Platform-Wide Controls (God Mode Exclusive)</h3>
                <ul className="mt-2 space-y-1.5 text-[#475569]">
                  <li>• Tenant lifecycle (Creation, Suspension, Termination)</li>
                  <li>• Global rate limit tiers (Tier A/B/C enforcement)</li>
                  <li>• Machine-to-machine shared cryptographic keys</li>
                  <li>• Global statutory compliance definitions (GSTN schemas)</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <h3 className="font-bold text-[#0F172A]">Tenant Practice Policies (Firm Owner Exclusive)</h3>
                <ul className="mt-2 space-y-1.5 text-[#475569]">
                  <li>• Partner approval threshold (e.g. ₹50,000)</li>
                  <li>• Practice credit term days (e.g. 15 Days)</li>
                  <li>• Client-specific billing packages & retainers</li>
                  <li>• Internal firm employee invitations & role assignments</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TENANT SUSPENSION / UNLOCK CONFIRMATION
      ========================================================================== */}
      {suspensionModal.open && suspensionModal.tenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  suspensionModal.suspend ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {suspensionModal.suspend ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  {suspensionModal.suspend ? "Suspend CA Practice Firm" : "Unlock CA Practice Firm"}
                </h3>
                <p className="text-xs text-[#64748B]">{suspensionModal.tenant.name}</p>
              </div>
            </div>

            <p className="text-xs text-[#475569] mt-3 leading-relaxed">
              {suspensionModal.suspend
                ? "Suspending this firm will immediately block all staff from logging in, terminate active sessions, and freeze automated filings."
                : "Unlocking this firm will restore operational access for all active practice members."}
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Operational Reason (Recorded in Security Audit Log) <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g., Requested by managing partner, subscription lapse, or security review..."
                value={suspensionModal.reason}
                onChange={(e) =>
                  setSuspensionModal((prev) => ({ ...prev, reason: e.target.value, error: null }))
                }
                className="w-full rounded-lg border border-[#CBD5E1] p-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
              />
              {suspensionModal.error && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{suspensionModal.error}</p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setSuspensionModal({ open: false, tenant: null, suspend: true, reason: "", error: null })
                }
                className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmSuspension}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs transition ${
                  suspensionModal.suspend
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isPending ? "Processing..." : suspensionModal.suspend ? "Confirm Suspension" : "Confirm Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INSPECT TENANT CONFIGURATION DRAWER
      ========================================================================== */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">
                  Tenant Inspection
                </span>
                <h3 className="text-lg font-bold text-[#0F172A]">{selectedTenant.name}</h3>
              </div>
              <button
                onClick={() => setSelectedTenant(null)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                <span className="text-[#64748B] block font-mono text-[10px]">TENANT ID</span>
                <span className="font-mono font-bold text-[#0F172A]">{selectedTenant.id}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                  <span className="text-[#64748B] block text-[11px]">GSTIN</span>
                  <span className="font-mono font-semibold text-[#0F172A]">
                    {selectedTenant.gstin || "Unregistered"}
                  </span>
                </div>
                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                  <span className="text-[#64748B] block text-[11px]">PAN</span>
                  <span className="font-mono font-semibold text-[#0F172A]">
                    {selectedTenant.pan || "N/A"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                  <span className="text-[#64748B] block text-[11px]">Approval Limit</span>
                  <span className="font-bold text-[#0F172A]">
                    ₹{selectedTenant.approvalThreshold.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                  <span className="text-[#64748B] block text-[11px]">Accounting Bridge</span>
                  <span className="font-mono font-semibold text-[#0D9488]">
                    {selectedTenant.accountingSoftware}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-bold text-[#0F172A] block mb-2">Practice Volume & Records:</span>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="block text-base font-bold text-[#0F172A]">
                      {selectedTenant.usersCount}
                    </span>
                    <span className="text-[10px] text-[#64748B]">Staff</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="block text-base font-bold text-[#0F172A]">
                      {selectedTenant.clientsCount}
                    </span>
                    <span className="text-[10px] text-[#64748B]">Clients</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="block text-base font-bold text-[#0F172A]">
                      {selectedTenant.invoicesCount}
                    </span>
                    <span className="text-[10px] text-[#64748B]">Invoices</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="block text-base font-bold text-[#0F172A]">
                      {selectedTenant.tasksCount}
                    </span>
                    <span className="text-[10px] text-[#64748B]">Tasks</span>
                  </div>
                </div>
              </div>

              {selectedTenant.keyPartners.length > 0 && (
                <div>
                  <span className="font-bold text-[#0F172A] block mb-2">Registered Partners:</span>
                  <div className="space-y-2">
                    {selectedTenant.keyPartners.map((partner, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-[#0F172A]">{partner.name}</div>
                          <div className="text-[10px] text-[#64748B]">{partner.email}</div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          {partner.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] mt-auto">
              <button
                onClick={() => setSelectedTenant(null)}
                className="w-full py-2 bg-[#F1F5F9] text-[#334155] font-semibold text-xs rounded-lg hover:bg-[#E2E8F0] transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE INTERNAL SERVICE TASK
      ========================================================================== */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#2563EB]" />
              Dispatch TRUVTECH Service Task
            </h3>
            <p className="text-xs text-[#64748B] mt-1">
              Internal task assignment for onboarding, data migration, and practice SLA support.
            </p>

            <form onSubmit={handleCreateTask} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Ingest 150 Client Master Records from Tally XML"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Category *</label>
                  <select
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value as any })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  >
                    <option value="ONBOARDING">Client Onboarding</option>
                    <option value="MIGRATION">Data Migration</option>
                    <option value="INTEGRATION">Custom Integration</option>
                    <option value="SUPPORT_ESCALATION">Support Escalation</option>
                    <option value="COMPLIANCE_DELIVERY">Compliance Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Priority *</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as any })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High SLA</option>
                    <option value="CRITICAL">Critical Emergency</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">TRUVTECH Assignee *</label>
                  <select
                    value={taskForm.assigneeName}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeName: e.target.value })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  >
                    {TRUVTECH_INTERNAL_TEAM.map((staff) => (
                      <option key={staff.id} value={staff.name}>
                        {staff.name} ({staff.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Customer Practice</label>
                  <input
                    type="text"
                    placeholder="e.g. Singhal & Associates CA"
                    value={taskForm.customerFirmName}
                    onChange={(e) => setTaskForm({ ...taskForm, customerFirmName: e.target.value })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Deliverable Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Specific requirements, migration notes, or partner contact info..."
                  value={taskForm.detail}
                  onChange={(e) => setTaskForm({ ...taskForm, detail: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>

              {taskMessage && (
                <p className="text-xs text-[#2563EB] font-semibold bg-blue-50 p-2 rounded-lg border border-blue-200">
                  {taskMessage}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition"
                >
                  {isPending ? "Dispatching..." : "Dispatch Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RECORD AUTHORIZED SUPPORT NOTE
      ========================================================================== */}
      {supportNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#0D9488]" />
              Record Authorized Support Memorandum
            </h3>
            <p className="text-xs text-[#64748B] mt-1">
              Privileged support session summary appended to the practice tenant audit trail. Never record client passwords or DSC pins.
            </p>

            <form onSubmit={handleCreateSupportNote} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Target CA Practice *</label>
                <select
                  value={supportNoteForm.tenantId}
                  onChange={(e) => {
                    const sel = tenants.find((t) => t.id === e.target.value);
                    setSupportNoteForm({
                      ...supportNoteForm,
                      tenantId: e.target.value,
                      tenantName: sel ? sel.name : "",
                    });
                  }}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (/{t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Incident Ref ID *</label>
                  <input
                    type="text"
                    required
                    value={supportNoteForm.ticketId}
                    onChange={(e) => setSupportNoteForm({ ...supportNoteForm, ticketId: e.target.value })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 font-mono text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Severity / Urgency *</label>
                  <select
                    value={supportNoteForm.urgency}
                    onChange={(e) => setSupportNoteForm({ ...supportNoteForm, urgency: e.target.value as any })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                  >
                    <option value="STANDARD">Standard Assistance</option>
                    <option value="ELEVATED">Elevated Filing Deadline</option>
                    <option value="CRITICAL">Critical Practice Lockout</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Support Memorandum Summary *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Summary of partner inquiry, actions taken by TRUVTECH technician, and resolution outcome..."
                  value={supportNoteForm.summary}
                  onChange={(e) => setSupportNoteForm({ ...supportNoteForm, summary: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                />
              </div>

              {supportNoteMessage && (
                <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  {supportNoteMessage}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setSupportNoteModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold shadow-xs transition"
                >
                  {isPending ? "Recording..." : "Record Memorandum"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
      {/* =========================================================================
          MODAL: RESET PRACTICE DATA TO BLANK STATE CONFIRMATION
      ========================================================================== */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-rose-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Reset Practice Data to Blank State
                </h3>
                <p className="text-xs text-slate-500">Authorized Partner Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              This will permanently delete all mock/test invoices, payments, clients, tasks, documents, and communication logs. Your firm tenant and partner login credentials will remain intact.
            </p>

            {resetFeedback && (
              <div className="mt-3 p-2.5 rounded bg-slate-100 text-xs font-medium text-slate-800">
                {resetFeedback}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePracticeReset}
                disabled={isResetting}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded font-bold transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isResetting ? "Purging Data..." : "Confirm & Wipe Practice Data"}
              </button>
            </div>
          </div>
        </div>
      )}
</div>
  );
}
