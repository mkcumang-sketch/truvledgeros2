"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Users,
  Award,
  UserPlus,
  Mail,
  Shield,
  Clock,
  Search,
  Filter,
  RefreshCw,
  XCircle,
  CheckCircle,
  AlertTriangle,
  MoreVertical,
  Activity,
  Key,
  Check,
  ChevronDown,
  Trash2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type Role =
  | "GODMODE_ADMIN"
  | "FIRM_OWNER"
  | "FIRM_ADMIN"
  | "PARTNER"
  | "MANAGER"
  | "EXECUTIVE"
  | "CLIENT";

export const Role = {
  GODMODE_ADMIN: "GODMODE_ADMIN",
  FIRM_OWNER: "FIRM_OWNER",
  FIRM_ADMIN: "FIRM_ADMIN",
  PARTNER: "PARTNER",
  MANAGER: "MANAGER",
  EXECUTIVE: "EXECUTIVE",
  CLIENT: "CLIENT",
} as const;

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export const InvitationStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import {
  inviteMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  suspendMemberAction,
  reactivateMemberAction,
} from "@/lib/server/actions/team-actions";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/server/rbac/permissions";

export interface TeamMemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: string;
  createdAt: string;
}

export interface InvitationItem {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  action: string;
  userName: string;
  createdAt: string;
  details: string;
}

interface TeamManagementClientProps {
  members: TeamMemberItem[];
  invitations: InvitationItem[];
  auditLogs: AuditItem[];
  currentUserId: string;
  currentUserRole: Role;
  isSuperAdmin: boolean;
  tenantName: string;
}

export function TeamManagementClient({
  members,
  invitations,
  auditLogs,
  currentUserId,
  currentUserRole,
  isSuperAdmin,
  tenantName,
}: TeamManagementClientProps) {
  const [activeTab, setActiveTab] = useState<"members" | "invites" | "roles" | "audit">("members");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMemberItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>(Role.EXECUTIVE);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    description: string;
    actionType: "suspend" | "reactivate" | "revoke_invite";
    targetId: string;
  } | null>(null);

  // Form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>(Role.EXECUTIVE);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const isOwnerOrAdmin = currentUserRole === Role.FIRM_OWNER || currentUserRole === Role.FIRM_ADMIN || isSuperAdmin;
  const isOwner = currentUserRole === Role.FIRM_OWNER || isSuperAdmin;

  // Filter members
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
    const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const pendingInvitesCount = invitations.filter((i) => i.status === "PENDING").length;
  const activeMembersCount = members.filter((m) => m.status === "ACTIVE").length;
  const partnersCount = members.filter((m) => m.role === "FIRM_OWNER" || m.role === "PARTNER").length;

  // Handlers
  function handleOpenInvite() {
    setInviteEmail("");
    setInviteRole(Role.EXECUTIVE);
    setFormError(null);
    setFormSuccess(null);
    setInviteModalOpen(true);
  }

  function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    startTransition(async () => {
      const res = await inviteMemberAction({
        email: inviteEmail,
        role: inviteRole,
      });

      if (res.success) {
        setFormSuccess(`Invitation dispatched to ${inviteEmail}.`);
        setTimeout(() => {
          setInviteModalOpen(false);
          setFormSuccess(null);
        }, 1200);
      } else {
        setFormError(res.error || "Failed to dispatch invitation.");
      }
    });
  }

  function handleResendInvite(invitationId: string) {
    startTransition(async () => {
      const res = await resendInvitationAction({ invitationId });
      if (res.success) {
        toast.success("Invitation resent with renewed 48-hour cryptographic token.");
      } else {
        toast.error(res.error || "Failed to resend invitation.");
      }
    });
  }

  function handleOpenConfirm(type: "suspend" | "reactivate" | "revoke_invite", id: string, nameOrEmail: string) {
    if (type === "suspend") {
      setConfirmConfig({
        title: "Suspend Team Member",
        description: `Are you sure you want to suspend ${nameOrEmail}? Their active sessions will be terminated immediately.`,
        actionType: "suspend",
        targetId: id,
      });
    } else if (type === "reactivate") {
      setConfirmConfig({
        title: "Reactivate Team Member",
        description: `Restore workspace access for ${nameOrEmail}?`,
        actionType: "reactivate",
        targetId: id,
      });
    } else if (type === "revoke_invite") {
      setConfirmConfig({
        title: "Revoke Team Invitation",
        description: `Cancel the pending invitation sent to ${nameOrEmail}? The link will become immediately invalid.`,
        actionType: "revoke_invite",
        targetId: id,
      });
    }
    setConfirmOpen(true);
  }

  function executeConfirmedAction() {
    if (!confirmConfig) return;
    setConfirmOpen(false);

    startTransition(async () => {
      if (confirmConfig.actionType === "suspend") {
        const res = await suspendMemberAction({ memberId: confirmConfig.targetId });
        if (res.success) {
          toast.success("Team member suspended.");
        } else {
          toast.error(res.error || "Failed to suspend member.");
        }
      } else if (confirmConfig.actionType === "reactivate") {
        const res = await reactivateMemberAction({ memberId: confirmConfig.targetId });
        if (res.success) {
          toast.success("Team member reactivated.");
        } else {
          toast.error(res.error || "Failed to reactivate member.");
        }
      } else if (confirmConfig.actionType === "revoke_invite") {
        const res = await revokeInvitationAction({ invitationId: confirmConfig.targetId });
        if (res.success) {
          toast.success("Invitation revoked.");
        } else {
          toast.error(res.error || "Failed to revoke invitation.");
        }
      }
    });
  }

  function handleOpenEditRole(member: TeamMemberItem) {
    setSelectedMember(member);
    setSelectedRole(member.role);
    setFormError(null);
    setEditRoleModalOpen(true);
  }

  function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember) return;
    setFormError(null);

    startTransition(async () => {
      const res = await updateMemberRoleAction({
        memberId: selectedMember.id,
        role: selectedRole,
      });

      if (res.success) {
        setEditRoleModalOpen(false);
      } else {
        setFormError(res.error || "Failed to update member role.");
      }
    });
  }

  return (
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E5E7EB] rounded-xl p-4 sm:p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[#263238] break-words">
              Team & Access Management
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 bg-[#FFF4EE] text-[#D95524] rounded-md border border-[#F26B38]/20 shrink-0">
              {tenantName}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1 break-words">
            Invite practice employees, configure role-based access control, and audit security events.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <Button
            onClick={handleOpenInvite}
            className="bg-[#F26B38] hover:bg-[#D95524] text-white shadow-xs font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Invite Team Member</span>
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B]">Active Members</span>
            <Users className="w-4 h-4 text-[#F26B38]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#263238] mt-2 tabular-nums break-words">
            {activeMembersCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5">Authorized staff accounts</p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B]">Signing Partners</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#263238] mt-2 tabular-nums break-words">
            {partnersCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5">Owners & FCA authority</p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B]">Pending Invitations</span>
            <Mail className="w-4 h-4 text-[#F26B38]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#263238] mt-2 tabular-nums break-words">
            {pendingInvitesCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5">Awaiting activation</p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B]">Security Model</span>
            <Shield className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-sm font-bold text-[#263238] mt-2 break-words">
            Server-Enforced RBAC
          </div>
          <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">Deny-by-default active</p>
        </div>
      </div>

      {/* Navigation Tabs - 2-col Grid on mobile, flex on sm */}
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 border-b border-[#E5E7EB] pb-2 w-full">
        <button
          onClick={() => setActiveTab("members")}
          className={`w-full sm:w-auto p-2 sm:pb-3 sm:px-4 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-none border sm:border-0 sm:border-b-2 transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === "members"
              ? "border-[#F26B38] text-[#F26B38] bg-orange-50/50 sm:bg-transparent"
              : "border-slate-200 sm:border-transparent text-[#64748B] hover:text-[#263238]"
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">Roster ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("invites")}
          className={`w-full sm:w-auto p-2 sm:pb-3 sm:px-4 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-none border sm:border-0 sm:border-b-2 transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === "invites"
              ? "border-[#F26B38] text-[#F26B38] bg-orange-50/50 sm:bg-transparent"
              : "border-slate-200 sm:border-transparent text-[#64748B] hover:text-[#263238]"
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span className="truncate">Invites ({invitations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("roles")}
          className={`w-full sm:w-auto p-2 sm:pb-3 sm:px-4 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-none border sm:border-0 sm:border-b-2 transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === "roles"
              ? "border-[#F26B38] text-[#F26B38] bg-orange-50/50 sm:bg-transparent"
              : "border-slate-200 sm:border-transparent text-[#64748B] hover:text-[#263238]"
          }`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          <span className="truncate">Roles Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`w-full sm:w-auto p-2 sm:pb-3 sm:px-4 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-none border sm:border-0 sm:border-b-2 transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === "audit"
              ? "border-[#F26B38] text-[#F26B38] bg-orange-50/50 sm:bg-transparent"
              : "border-slate-200 sm:border-transparent text-[#64748B] hover:text-[#263238]"
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span className="truncate">Audit Log</span>
        </button>
      </div>

      {/* TAB 1: TEAM MEMBERS ROSTER */}
      {activeTab === "members" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-[#E5E7EB] rounded-xl p-3 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search team member by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#263238] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20"
              >
                <option value="ALL">All Roles</option>
                <option value={Role.FIRM_OWNER}>Firm Owner</option>
                <option value={Role.FIRM_ADMIN}>Firm Admin</option>
                <option value={Role.PARTNER}>Partner</option>
                <option value={Role.MANAGER}>Manager</option>
                <option value={Role.EXECUTIVE}>Executive</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          {/* Mobile Members Cards */}
          <div className="sm:hidden space-y-3">
            {filteredMembers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white border border-[#E5E7EB] rounded-xl">
                No team members match the search query.
              </div>
            ) : (
              filteredMembers.map((m) => {
                const isTargetOwner = m.role === Role.FIRM_OWNER;
                const isSelf = m.userId === currentUserId;

                return (
                  <div key={m.id} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-[#263238] flex items-center gap-1.5 flex-wrap">
                          <span>{m.name}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5 font-mono">
                          ID: {m.userId.substring(0, 10)}...
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            m.role === Role.FIRM_OWNER
                              ? "orange"
                              : m.role === Role.PARTNER
                              ? "gold"
                              : "neutral"
                          }
                          size="sm"
                        >
                          {m.role.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant={m.status === "ACTIVE" ? "success" : "danger"}
                          size="sm"
                        >
                          {m.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-xs text-[#64748B] break-words">
                      <div>{m.email}</div>
                      {m.phone && <div className="text-[11px] mt-0.5">{m.phone}</div>}
                    </div>

                    {isOwnerOrAdmin && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEditRole(m)}
                          disabled={isPending || isTargetOwner}
                          className="text-xs flex-1"
                        >
                          Change Role
                        </Button>
                        {m.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenConfirm("suspend", m.id, m.name)}
                            disabled={isPending || isTargetOwner || isSelf}
                            className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 flex-1"
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenConfirm("reactivate", m.id, m.name)}
                            disabled={isPending}
                            className="text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex-1"
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Members Table */}
          <div className="hidden sm:block bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-xs w-full max-w-full min-w-0">
            <div className="w-full overflow-x-auto touch-pan-x">
              <table className="w-full min-w-[640px] text-left text-xs text-[#263238]">
                <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B] font-bold border-b border-[#E5E7EB]">
                  <tr>
                    <th className="px-5 py-3.5">Member Name</th>
                    <th className="px-4 py-3.5">Assigned Role</th>
                    <th className="px-4 py-3.5">Contact Details</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No team members match the search query.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const isTargetOwner = m.role === Role.FIRM_OWNER;
                      const isSelf = m.userId === currentUserId;

                      return (
                        <tr key={m.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-sm text-[#263238] flex items-center gap-1.5">
                              {m.name}
                              {isSelf && (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-0.5 font-mono">
                              ID: {m.userId.substring(0, 10)}...
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <Badge
                              variant={
                                m.role === Role.FIRM_OWNER
                                  ? "orange"
                                  : m.role === Role.PARTNER
                                  ? "gold"
                                  : "neutral"
                              }
                              size="sm"
                            >
                              {m.role.replace("_", " ")}
                            </Badge>
                          </td>

                          <td className="px-4 py-4">
                            <div className="text-[#263238] font-medium">{m.email}</div>
                            <div className="text-[11px] text-[#64748B]">{m.phone || "No phone listed"}</div>
                          </td>

                          <td className="px-4 py-4">
                            <Badge
                              variant={m.status === "ACTIVE" ? "success" : "danger"}
                              size="sm"
                            >
                              {m.status}
                            </Badge>
                          </td>

                          <td className="px-5 py-4 text-right">
                            {isOwnerOrAdmin && (
                              <div className="inline-flex items-center gap-1.5">
                                {/* Role Change Button */}
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenEditRole(m)}
                                  disabled={isPending || (!isOwner && isTargetOwner)}
                                  className="text-xs font-medium"
                                >
                                  Change Role
                                </Button>

                                {/* Suspend / Reactivate */}
                                {m.status === "ACTIVE" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenConfirm("suspend", m.id, m.name)}
                                    disabled={isPending || isSelf || (!isOwner && isTargetOwner)}
                                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                                  >
                                    Suspend
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenConfirm("reactivate", m.id, m.name)}
                                    disabled={isPending}
                                    className="text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  >
                                    Reactivate
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING INVITATIONS */}
      {activeTab === "invites" && (
        <div className="space-y-3">
          {/* Mobile Invites Cards */}
          <div className="sm:hidden space-y-3">
            {invitations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white border border-[#E5E7EB] rounded-xl">
                No invitations found. Use the &quot;Invite Team Member&quot; button to invite colleagues.
              </div>
            ) : (
              invitations.map((inv) => {
                const isPendingInvite = inv.status === InvitationStatus.PENDING;
                return (
                  <div key={inv.id} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-[#263238] break-words">{inv.email}</span>
                      <Badge variant="orange" size="sm">{inv.role.replace("_", " ")}</Badge>
                    </div>
                    <div className="text-[11px] text-[#64748B] flex items-center justify-between">
                      <span>By: {inv.invitedByName}</span>
                      <Badge
                        variant={
                          inv.status === "ACCEPTED"
                            ? "success"
                            : inv.status === "PENDING"
                            ? "warning"
                            : "danger"
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    {isOwnerOrAdmin && isPendingInvite && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResendInvite(inv.id)}
                          disabled={isPending}
                          className="text-xs flex-1"
                        >
                          Resend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenConfirm("revoke_invite", inv.id, inv.email)}
                          disabled={isPending}
                          className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 flex-1"
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Invites Table */}
          <div className="hidden sm:block bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-xs w-full max-w-full min-w-0">
            <div className="w-full overflow-x-auto touch-pan-x">
              <table className="w-full min-w-[640px] text-left text-xs text-[#263238]">
              <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B] font-bold border-b border-[#E5E7EB]">
                <tr>
                  <th className="px-5 py-3.5">Invitee Email</th>
                  <th className="px-4 py-3.5">Assigned Role</th>
                  <th className="px-4 py-3.5">Invited By</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Expires</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No invitations found. Use the &quot;Invite Team Member&quot; button to invite colleagues.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => {
                    const isPendingInvite = inv.status === InvitationStatus.PENDING;

                    return (
                      <tr key={inv.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-5 py-4 font-semibold text-[#263238]">
                          {inv.email}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="orange" size="sm">
                            {inv.role.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-[#64748B]">
                          {inv.invitedByName}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant={
                              inv.status === "ACCEPTED"
                                ? "success"
                                : inv.status === "PENDING"
                                ? "warning"
                                : "danger"
                            }
                            size="sm"
                          >
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-[11px] text-[#64748B]">
                          {new Date(inv.expiresAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isOwnerOrAdmin && isPendingInvite && (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleResendInvite(inv.id)}
                                disabled={isPending}
                                className="text-xs"
                              >
                                Resend
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenConfirm("revoke_invite", inv.id, inv.email)}
                                disabled={isPending}
                                className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                              >
                                Revoke
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

      {/* TAB 3: ROLES & PERMISSIONS MATRIX */}
      {activeTab === "roles" && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-[#263238]">Role Access Hierarchy</h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Permissions are strictly validated on every server action and API mutation (deny by default).
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="border border-[#F26B38]/30 rounded-lg p-4 bg-[#FFF4EE]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#D95524] text-sm">FIRM_OWNER</span>
                <Badge variant="orange" size="sm">Primary Admin</Badge>
              </div>
              <p className="text-xs text-[#263238] leading-relaxed">
                Complete authority over practice settings, billing, subscriptions, team invitations, ownership management, and all financial ledgers.
              </p>
            </div>

            <div className="border border-[#E5E7EB] rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#263238] text-sm">FIRM_ADMIN</span>
                <Badge variant="gold" size="sm">Administrator</Badge>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Manages team operations, client portfolios, invoices, and settings. Protected from demoting or altering Organization Owners.
              </p>
            </div>

            <div className="border border-[#E5E7EB] rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#263238] text-sm">PARTNER</span>
                <Badge variant="neutral" size="sm">FCA Partner</Badge>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Statutory signing authority, invoice approvals, payment disbursements, GST return filing reviews, and comprehensive analytics.
              </p>
            </div>

            <div className="border border-[#E5E7EB] rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#263238] text-sm">MANAGER</span>
                <Badge variant="neutral" size="sm">Practice Manager</Badge>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Client onboarding, workflow oversight, task delegation, document verification, and draft invoice creation.
              </p>
            </div>

            <div className="border border-[#E5E7EB] rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#263238] text-sm">EXECUTIVE</span>
                <Badge variant="neutral" size="sm">Staff Accountant</Badge>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Restricted to assigned clients, draft invoice entry, document collection, and assigned compliance tasks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACTIVITY AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="space-y-3">
          {/* Mobile Audit Cards */}
          <div className="sm:hidden space-y-2.5">
            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white border border-[#E5E7EB] rounded-xl">
                No security audit events recorded yet.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="bg-white border border-[#E5E7EB] rounded-xl p-3.5 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#D95524]">{log.action}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(log.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <div className="text-xs text-[#263238] font-medium">{log.userName}</div>
                  <div className="text-[11px] text-[#64748B] break-words">{log.details}</div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Audit Table */}
          <div className="hidden sm:block bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-xs w-full max-w-full min-w-0">
            <div className="p-4 border-b border-[#E5E7EB] bg-[#F8FAFC]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Team Security & Authorization Trail
              </h3>
            </div>
            <div className="w-full overflow-x-auto touch-pan-x">
              <table className="w-full min-w-[600px] text-left text-xs text-[#263238]">
              <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B] font-bold border-b border-[#E5E7EB]">
                <tr>
                  <th className="px-5 py-3.5">Action Event</th>
                  <th className="px-4 py-3.5">Actor</th>
                  <th className="px-4 py-3.5">Details</th>
                  <th className="px-5 py-3.5 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-[#D95524]">
                        {log.action}
                      </td>
                      <td className="px-4 py-3.5 text-[#263238]">
                        {log.userName}
                      </td>
                      <td className="px-4 py-3.5 text-[#64748B]">
                        {log.details}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[11px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

      {/* MODAL 1: INVITE TEAM MEMBER */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Team Member"
        description="Send an email invitation with a secure 48-hour activation link."
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          {formError && <Alert variant="danger">{formError}</Alert>}
          {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

          <div>
            <label className="block text-xs font-semibold text-[#263238] mb-1.5">
              Work Email Address
            </label>
            <input
              type="email"
              required
              disabled={isPending}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="practitioner@firm.in"
              className="w-full bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs text-[#263238] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#263238] mb-1.5">
              Practice Role Assignment
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              disabled={isPending}
              className="w-full bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38]"
            >
              {isOwner && <option value={Role.FIRM_OWNER}>Firm Owner (Full Access)</option>}
              <option value={Role.FIRM_ADMIN}>Firm Admin (Practice Management)</option>
              <option value={Role.PARTNER}>Partner (Approvals & Signatures)</option>
              <option value={Role.MANAGER}>Manager (Reviews & Tasks)</option>
              <option value={Role.EXECUTIVE}>Executive (Staff Preparer)</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setInviteModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#F26B38] hover:bg-[#D95524] text-white"
            >
              {isPending ? "Sending Invitation..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: CHANGE ROLE */}
      <Modal
        isOpen={editRoleModalOpen}
        onClose={() => setEditRoleModalOpen(false)}
        title="Update Role Assignment"
        description={`Modify access level for ${selectedMember?.name}`}
      >
        <form onSubmit={handleSaveRole} className="space-y-4">
          {formError && <Alert variant="danger">{formError}</Alert>}

          <div>
            <label className="block text-xs font-semibold text-[#263238] mb-1.5">
              Select New Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              disabled={isPending}
              className="w-full bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38]"
            >
              {isOwner && <option value={Role.FIRM_OWNER}>Firm Owner</option>}
              <option value={Role.FIRM_ADMIN}>Firm Admin</option>
              <option value={Role.PARTNER}>Partner</option>
              <option value={Role.MANAGER}>Manager</option>
              <option value={Role.EXECUTIVE}>Executive</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditRoleModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#F26B38] hover:bg-[#D95524] text-white"
            >
              {isPending ? "Updating..." : "Save Role"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executeConfirmedAction}
        title={confirmConfig?.title || "Confirm Action"}
        description={confirmConfig?.description || "Are you sure you wish to proceed?"}
        confirmLabel="Confirm"
        variant="danger"
        isLoading={isPending}
      />
    </div>
  );
}
