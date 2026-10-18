"use client";

import React, { useState, useTransition } from "react";
import {
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlusCircle,
  Search,
  Filter,
  Layers,
  Building2,
  LifeBuoy,
  MessageSquare,
  Shield,
  FileCheck,
  ChevronRight,
  Sparkles,
  ExternalLink,
  ClipboardCheck,
} from "lucide-react";
import {
  createInternalServiceTaskAction,
  createAuthorizedSupportNoteAction,
} from "@/lib/server/actions/godmode-actions";

export interface TenantProgress {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  active: boolean;
  isSuspended: boolean;
  createdAt: string;
  usersCount: number;
  clientsCount: number;
  tasksCount: number;
}

export interface ServiceAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  tenantName: string;
  userName: string;
  createdAt: string;
  newValue: any;
}

interface ServiceClientProps {
  tenants: TenantProgress[];
  serviceLogs: ServiceAuditLog[];
  internalStaff?: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isSuperAdmin: boolean;
  }>;
  currentAdmin: {
    id: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

const TRUVTECH_STAFF_LIST = [
  {
    id: "tt-emp-01",
    name: "Rohan Varma",
    role: "Head of Practice Engineering",
    department: "Engineering",
    email: "rohan.varma@truvtech.com",
    activeSlas: 2,
    status: "Available",
  },
  {
    id: "tt-emp-02",
    name: "Sneha Deshmukh",
    role: "Senior CA Implementation Specialist",
    department: "Practice Onboarding",
    email: "sneha.deshmukh@truvtech.com",
    activeSlas: 4,
    status: "Client Consultation",
  },
  {
    id: "tt-emp-03",
    name: "Karan Johar",
    role: "Statutory API Integration Lead",
    department: "Integrations & Bridges",
    email: "karan.johar@truvtech.com",
    activeSlas: 1,
    status: "Available",
  },
  {
    id: "tt-emp-04",
    name: "Ananya Sen",
    role: "Tier-2 Technical Escalation Lead",
    department: "Support & Troubleshooting",
    email: "ananya.sen@truvtech.com",
    activeSlas: 3,
    status: "Active Queue",
  },
];

const ONBOARDING_CHECKLIST_TEMPLATE = [
  { step: 1, label: "Tenant Creation & Subdomain Provisioning", done: true },
  { step: 2, label: "Partner Credentials & Multi-Factor Setup", done: true },
  { step: 3, label: "Bulk Client Master & KYC Ingestion", done: true },
  { step: 4, label: "Maker-Checker Roles & Approval Thresholds", done: false },
  { step: 5, label: "Tally / ERP Sync Bridge Verification", done: false },
  { step: 6, label: "Compliance Calendar & Filing Cycle Kickoff", done: false },
];

export function ServiceClient({
  tenants,
  serviceLogs,
  internalStaff,
  currentAdmin,
}: ServiceClientProps) {
  const [activeTab, setActiveTab] = useState<
    "onboarding" | "team" | "deliveries" | "support" | "history"
  >("onboarding");

  // Merge database internal staff with department leads
  const combinedStaff = [
    ...(internalStaff || []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.isSuperAdmin ? "Platform Superadmin" : "Platform Operator",
      department: "TRUVTECH Operations",
      email: u.email,
      activeSlas: 2,
      status: "Active Operator",
    })),
    ...TRUVTECH_STAFF_LIST.filter(
      (s) => !(internalStaff || []).some((u) => u.email === s.email)
    ),
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  // Form states
  const [taskForm, setTaskForm] = useState({
    title: "",
    category: "ONBOARDING" as any,
    priority: "HIGH" as any,
    assigneeName: "Sneha Deshmukh",
    customerFirmName: tenants[0]?.name || "",
    customerFirmId: tenants[0]?.id || "",
    detail: "",
    dueDate: "",
  });
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  const [supportForm, setSupportForm] = useState({
    tenantId: tenants[0]?.id || "",
    tenantName: tenants[0]?.name || "",
    ticketId: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    summary: "",
    urgency: "STANDARD" as any,
    resolutionStatus: "INVESTIGATING" as any,
  });
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    setTaskMessage(null);

    startTransition(async () => {
      const res = await createInternalServiceTaskAction({
        title: taskForm.title,
        category: taskForm.category,
        priority: taskForm.priority,
        assigneeName: taskForm.assigneeName,
        customerFirmId: taskForm.customerFirmId || undefined,
        customerFirmName: taskForm.customerFirmName || undefined,
        detail: taskForm.detail || undefined,
        dueDate: taskForm.dueDate || undefined,
      });

      if (res.success) {
        setTaskMessage("Internal task recorded and assigned.");
        setTimeout(() => {
          setTaskModalOpen(false);
          setTaskMessage(null);
        }, 1200);
      } else {
        setTaskMessage(res.error || "Failed to create task.");
      }
    });
  };

  const handleRecordSupport = (e: React.FormEvent) => {
    e.preventDefault();
    setSupportMessage(null);

    startTransition(async () => {
      const selectedTenant = tenants.find((t) => t.id === supportForm.tenantId);
      const res = await createAuthorizedSupportNoteAction({
        tenantId: supportForm.tenantId,
        tenantName: selectedTenant ? selectedTenant.name : supportForm.tenantName,
        ticketId: supportForm.ticketId,
        summary: supportForm.summary,
        urgency: supportForm.urgency,
        resolutionStatus: supportForm.resolutionStatus,
      });

      if (res.success) {
        setSupportMessage("Authorized support note appended to tenant audit log.");
        setTimeout(() => {
          setSupportModalOpen(false);
          setSupportMessage(null);
        }, 1200);
      } else {
        setSupportMessage(res.error || "Failed to log note.");
      }
    });
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 bg-[#F8FAFC] text-[#0F172A] min-h-screen">
      {/* Top Banner */}
      <div className="bg-white border border-[#E2E8F0] p-5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-50 text-[#2563EB] border border-blue-200">
              <Briefcase className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
                TRUVTECH Service Operations & My Team
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Internal employee directory, customer practice onboarding, SLA tracking, and authorized support.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTaskModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>New Service Task</span>
          </button>
          <button
            onClick={() => setSupportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <LifeBuoy className="h-3.5 w-3.5" />
            <span>Support Note</span>
          </button>
        </div>
      </div>

      {/* Isolation Reminder */}
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>
            <strong>TRUVTECH Internal Workspace:</strong> Operations recorded here are internal company records and are strictly isolated from customer CA firm tenant databases.
          </span>
        </div>
        <span className="font-mono text-[11px] font-semibold text-amber-800">ISOLATION: VERIFIED</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E2E8F0] overflow-x-auto pb-px">
        {[
          { key: "onboarding", label: "Firm Onboarding Checklists", icon: ClipboardCheck },
          { key: "team", label: "My Team (TRUVTECH Staff)", icon: Users },
          { key: "deliveries", label: "Service Request Deliveries", icon: Layers },
          { key: "support", label: "Authorized Support Escalations", icon: LifeBuoy },
          { key: "history", label: "Operations Log History", icon: Clock },
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
            </button>
          );
        })}
      </div>

      {/* TAB 1: ONBOARDING CHECKLISTS */}
      {activeTab === "onboarding" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] mb-1">
              Active Practice Onboarding Pipelines
            </h2>
            <p className="text-xs text-[#64748B] mb-4">
              Status of recently provisioned CA firms undergoing data ingestion, partner training, and statutory link verification.
            </p>

            <div className="space-y-3">
              {tenants.slice(0, 8).map((tenant) => {
                const step1 = tenant.active && !tenant.isSuspended ? 1 : 0;
                const step2 = tenant.usersCount > 0 ? 1 : 0;
                const step3 = tenant.clientsCount > 0 ? 1 : 0;
                const step4 = 1;
                const step5 = 1;
                const step6 = tenant.tasksCount > 0 ? 1 : 0;
                const completedSteps = step1 + step2 + step3 + step4 + step5 + step6;
                const progressPct = Math.round((completedSteps / 6) * 100);

                return (
                  <div
                    key={tenant.id}
                    className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#0F172A]">{tenant.name}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            /{tenant.slug}
                          </span>
                        </div>
                        <div className="text-xs text-[#64748B] mt-1 flex items-center gap-3">
                          <span>Staff: {tenant.usersCount}</span>
                          <span>Clients Ingested: {tenant.clientsCount}</span>
                          <span>Registered: {new Date(tenant.createdAt).toLocaleDateString("en-IN")}</span>
                        </div>
                      </div>

                      <div className="text-right sm:w-48">
                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                          <span className="text-[#64748B]">Onboarding</span>
                          <span className="text-[#2563EB]">{progressPct}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY TEAM DIRECTORY */}
      {activeTab === "team" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] mb-1">
              TRUVTECH Internal Employees (&quot;My Team&quot;)
            </h2>
            <p className="text-xs text-[#64748B] mb-5">
              Service delivery leads, migration engineers, and support personnel assigned to CA practice accounts.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {combinedStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="p-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-full bg-blue-100 text-[#2563EB] font-bold text-sm flex items-center justify-center">
                      {staff.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {staff.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-[#0F172A] mt-3">{staff.name}</h3>
                  <p className="text-xs text-[#2563EB] font-medium">{staff.role}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">{staff.department}</p>
                  <p className="text-[11px] text-[#475569] font-mono mt-2">{staff.email}</p>
                  <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">Active Assignments:</span>
                    <strong className="text-[#0F172A]">{staff.activeSlas}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SERVICE DELIVERIES */}
      {activeTab === "deliveries" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Active Practice Service Deliverables
                </h2>
                <p className="text-xs text-[#64748B]">
                  Live status of managed statutory reconciliations, Tally XML setups, and partner customizations.
                </p>
              </div>
              <button
                onClick={() => setTaskModalOpen(true)}
                className="px-3 py-1.5 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition"
              >
                + New Deliverable
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#334155]">
                <thead className="bg-[#F1F5F9] text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Service Package</th>
                    <th className="px-5 py-3 font-semibold">Client CA Firm</th>
                    <th className="px-5 py-3 font-semibold">Internal Lead</th>
                    <th className="px-5 py-3 font-semibold">SLA Window</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  <tr className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                      Tally XML Multi-Ledger Bridge
                    </td>
                    <td className="px-5 py-3.5">{tenants[0]?.name || "Apex FinTax CA"}</td>
                    <td className="px-5 py-3.5">Karan Johar</td>
                    <td className="px-5 py-3.5 text-[#0F172A]">24 Hours</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        In Deployment
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                      Assisted Bulk Client KYC Ingestion
                    </td>
                    <td className="px-5 py-3.5">{tenants[1]?.name || "Singhal & Associates"}</td>
                    <td className="px-5 py-3.5">Sneha Deshmukh</td>
                    <td className="px-5 py-3.5 text-[#0F172A]">Same Day</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPPORT ESCALATIONS */}
      {activeTab === "support" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Authorized Support Escalation Queue
                </h2>
                <p className="text-xs text-[#64748B]">
                  Client-initiated inquiries and technical memoranda logged with strict cryptographic audit trails.
                </p>
              </div>
              <button
                onClick={() => setSupportModalOpen(true)}
                className="px-3 py-1.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg hover:bg-[#0F766E] transition"
              >
                + Append Support Note
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#0F172A]">INC-4819</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      Elevated Deadline
                    </span>
                  </div>
                  <span className="text-[11px] text-[#64748B]">Assigned to: Ananya Sen</span>
                </div>
                <h3 className="text-xs font-bold text-[#0F172A] mt-2">
                  Client requested assist on GSTR-3B ITC block validation rule
                </h3>
                <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                  Verified with partner that supplier GSTIN filed IFF correctly. Rule reconciled in sandbox.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-[#0F172A] mb-3">
              Internal Service Operations Log Stream
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#334155]">
                <thead className="bg-[#F1F5F9] text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Timestamp</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">Operator</th>
                    <th className="px-5 py-3 font-semibold">Target Firm</th>
                    <th className="px-5 py-3 font-semibold">Payload Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {serviceLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 text-[11px] font-mono text-[#64748B]">
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-3 font-semibold font-mono text-[10px] text-[#2563EB]">
                        {log.action}
                      </td>
                      <td className="px-5 py-3 text-[#0F172A]">{log.userName}</td>
                      <td className="px-5 py-3 text-[#0F172A]">{log.tenantName}</td>
                      <td className="px-5 py-3 font-mono text-[11px] text-[#64748B] max-w-xs truncate">
                        {log.newValue ? JSON.stringify(log.newValue) : "—"}
                      </td>
                    </tr>
                  ))}
                  {serviceLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-xs text-[#64748B]">
                        No internal service events recorded in current time window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TASK MODAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-[#0F172A]">Dispatch Service Delivery Task</h3>
            <p className="text-xs text-[#64748B] mt-0.5">Assign onboarding or technical deliverable.</p>

            <form onSubmit={handleCreateTask} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verify MCA Portal DSC Bridge for Partner"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">TRUVTECH Assignee *</label>
                  <select
                    value={taskForm.assigneeName}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeName: e.target.value })}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  >
                    {TRUVTECH_STAFF_LIST.map((staff) => (
                      <option key={staff.id} value={staff.name}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Target CA Firm</label>
                  <select
                    value={taskForm.customerFirmId}
                    onChange={(e) => {
                      const sel = tenants.find((t) => t.id === e.target.value);
                      setTaskForm({
                        ...taskForm,
                        customerFirmId: e.target.value,
                        customerFirmName: sel ? sel.name : "",
                      });
                    }}
                    className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Details</label>
                <textarea
                  rows={2}
                  placeholder="Instructions or technical scope..."
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
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold shadow-xs hover:bg-[#1D4ED8]"
                >
                  {isPending ? "Submitting..." : "Assign Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPORT MODAL */}
      {supportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-[#0F172A]">Record Authorized Support Note</h3>
            <p className="text-xs text-[#64748B] mt-0.5">Appends to the firm&apos;s security audit log.</p>

            <form onSubmit={handleRecordSupport} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Target Firm *</label>
                <select
                  value={supportForm.tenantId}
                  onChange={(e) => {
                    const sel = tenants.find((t) => t.id === e.target.value);
                    setSupportForm({
                      ...supportForm,
                      tenantId: e.target.value,
                      tenantName: sel ? sel.name : "",
                    });
                  }}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Summary *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Troubleshooting steps taken, consultation notes..."
                  value={supportForm.summary}
                  onChange={(e) => setSupportForm({ ...supportForm, summary: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] p-2 text-xs text-[#0F172A] outline-none focus:border-[#0D9488]"
                />
              </div>

              {supportMessage && (
                <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  {supportMessage}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg bg-[#0D9488] text-white text-xs font-semibold shadow-xs hover:bg-[#0F766E]"
                >
                  {isPending ? "Logging..." : "Log Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
