import crypto from "crypto";
import { db } from "@/lib/db";
import { Role, InvitationStatus } from "@prisma/client";
import { hashToken, hashPassword } from "@/lib/auth/password";
import {
  canManageMemberRole,
  isSoleActiveOwner,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/lib/server/rbac/permissions";
export { isSoleActiveOwner };
import { logSecurityEvent } from "@/lib/server/audit";
import {
  sendTeamInvitationEmail,
  sendTeamInvitationResendEmail,
  sendSecurityNoticeEmail,
} from "@/lib/server/email/email-service";
import { createSession } from "@/lib/auth/session";

export interface InviteMemberParams {
  tenantId: string;
  email: string;
  role: Role;
  permissions?: Record<string, boolean>;
  inviter: {
    id: string;
    name: string;
    role: Role;
    tenantName: string;
  };
}

export interface UpdateRoleParams {
  tenantId: string;
  memberId: string;
  newRole: Role;
  permissions?: Record<string, boolean>;
  actorRole: Role;
  actorUserId: string;
}

export interface MemberActionParams {
  tenantId: string;
  memberId: string;
  actorRole: Role;
  actorUserId: string;
  reason?: string;
}

export interface AcceptInvitationParams {
  rawToken: string;
  name: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

// 48-Hour default validity for team invitations
const INVITATION_EXPIRY_HOURS = 48;

/**
 * Creates and sends a secure, hashed team invitation.
 */
export async function inviteTeamMember(params: InviteMemberParams) {
  const email = params.email.trim().toLowerCase();

  // 1. Authorization check on role assignment
  const roleAuth = canManageMemberRole(params.inviter.role, Role.EXECUTIVE, params.role);
  if (!roleAuth.allowed) {
    throw new Error(roleAuth.reason || "Unauthorized to assign this role");
  }

  // 2. Prevent duplicate active memberships in this tenant
  const existingActiveMember = await db.membership.findFirst({
    where: {
      tenantId: params.tenantId,
      user: { email },
      status: "ACTIVE",
    },
    include: { user: true },
  });

  if (existingActiveMember) {
    throw new Error("This user is already an active member of this practice.");
  }

  // 3. Prevent duplicate active pending invitations
  const existingPending = await db.invitation.findFirst({
    where: {
      tenantId: params.tenantId,
      email,
      status: InvitationStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingPending) {
    throw new Error("A pending invitation already exists for this email. Use 'Resend' to renew it.");
  }

  // 4. Generate cryptographically random token (never stored in DB plaintext)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

  // 5. Atomic database insertion
  const invitation = await db.invitation.create({
    data: {
      tenantId: params.tenantId,
      email,
      role: params.role,
      permissions: params.permissions ? (params.permissions as any) : undefined,
      tokenHash,
      invitedById: params.inviter.id,
      status: InvitationStatus.PENDING,
      expiresAt,
    },
  });

  // 6. Log security audit event
  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.inviter.id,
    action: "INVITATION_CREATED",
    entityType: "INVITATION",
    entityId: invitation.id,
    newValue: { email, role: params.role },
  });

  // 7. Dispatch branded transactional email
  await sendTeamInvitationEmail({
    to: email,
    inviterName: params.inviter.name,
    firmName: params.inviter.tenantName,
    roleName: params.role.replace("_", " "),
    rawToken,
    tenantId: params.tenantId,
  });

  return {
    success: true,
    invitationId: invitation.id,
    email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Resends a team invitation with token rotation, expiry extension, and rate-limiting.
 */
export async function resendTeamInvitation(params: {
  tenantId: string;
  invitationId: string;
  inviter: {
    id: string;
    name: string;
    role: Role;
    tenantName: string;
  };
}) {
  const invitation = await db.invitation.findFirst({
    where: {
      id: params.invitationId,
      tenantId: params.tenantId,
    },
  });

  if (!invitation) {
    throw new Error("Invitation not found or belongs to another practice.");
  }

  if (invitation.status === InvitationStatus.ACCEPTED) {
    throw new Error("Cannot resend an invitation that has already been accepted.");
  }

  // Rate-limiting: limit resends to once every 60 seconds
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  if (invitation.updatedAt > oneMinuteAgo) {
    throw new Error("Please wait at least 60 seconds before resending this invitation.");
  }

  // Rotate token and extend expiration
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

  const updated = await db.invitation.update({
    where: { id: invitation.id },
    data: {
      tokenHash,
      status: InvitationStatus.PENDING,
      expiresAt,
    },
  });

  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.inviter.id,
    action: "INVITATION_CREATED",
    entityType: "INVITATION",
    entityId: invitation.id,
    newValue: { email: updated.email, reason: "RESEND_TOKEN_ROTATED" },
  });

  await sendTeamInvitationResendEmail({
    to: updated.email,
    inviterName: params.inviter.name,
    firmName: params.inviter.tenantName,
    roleName: updated.role.replace("_", " "),
    rawToken,
    tenantId: params.tenantId,
  });

  return { success: true, invitationId: updated.id, email: updated.email };
}

/**
 * Revokes a pending or expired invitation.
 */
export async function revokeTeamInvitation(params: {
  tenantId: string;
  invitationId: string;
  actorUserId: string;
}) {
  const invitation = await db.invitation.findFirst({
    where: {
      id: params.invitationId,
      tenantId: params.tenantId,
    },
  });

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  if (invitation.status === InvitationStatus.ACCEPTED) {
    throw new Error("Cannot revoke an accepted invitation.");
  }

  const updated = await db.invitation.update({
    where: { id: invitation.id },
    data: {
      status: InvitationStatus.REVOKED,
      revokedAt: new Date(),
    },
  });

  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "MEMBERSHIP_REVOKED",
    entityType: "INVITATION",
    entityId: invitation.id,
    oldValue: { status: invitation.status },
    newValue: { status: "REVOKED" },
  });

  return { success: true, invitationId: updated.id };
}

/**
 * Updates a member's role and granular permissions with strict Owner protection.
 */
export async function updateMemberRole(params: UpdateRoleParams) {
  const member = await db.membership.findFirst({
    where: { id: params.memberId, tenantId: params.tenantId },
    include: { user: true, tenant: true },
  });

  if (!member) {
    throw new Error("Team member not found.");
  }

  // 1. Role modification authorization check
  const roleAuth = canManageMemberRole(params.actorRole, member.role, params.newRole);
  if (!roleAuth.allowed) {
    throw new Error(roleAuth.reason || "Unauthorized to change this member's role.");
  }

  // 2. Protect the last Organization Owner
  if (member.role === Role.FIRM_OWNER && params.newRole !== Role.FIRM_OWNER) {
    const isSole = await isSoleActiveOwner(params.tenantId, member.id);
    if (isSole) {
      throw new Error("Cannot demote the sole Organization Owner. Designate another active Owner before changing this account's role.");
    }
  }

  const updated = await db.membership.update({
    where: { id: member.id },
    data: {
      role: params.newRole,
      permissions: params.permissions ? (params.permissions as any) : undefined,
    },
  });

  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "MEMBERSHIP_ROLE_CHANGED",
    entityType: "MEMBERSHIP",
    entityId: member.id,
    oldValue: { role: member.role },
    newValue: { role: params.newRole, permissions: params.permissions },
  });

  // Notify member via email
  await sendSecurityNoticeEmail({
    to: member.user.email,
    name: member.user.name,
    firmName: member.tenant.name,
    noticeTitle: "Role Updated",
    noticeDetail: `Your practice role in ${member.tenant.name} has been updated to ${params.newRole.replace("_", " ")}.`,
    tenantId: params.tenantId,
  });

  return { success: true, memberId: updated.id, newRole: updated.role };
}

/**
 * Suspends an active team member and immediately revokes their active sessions.
 */
export async function suspendTeamMember(params: MemberActionParams) {
  const member = await db.membership.findFirst({
    where: { id: params.memberId, tenantId: params.tenantId },
    include: { user: true, tenant: true },
  });

  if (!member) {
    throw new Error("Team member not found.");
  }

  // Protect Owner account
  const authCheck = canManageMemberRole(params.actorRole, member.role);
  if (!authCheck.allowed) {
    throw new Error(authCheck.reason || "Unauthorized to suspend this member.");
  }

  if (member.role === Role.FIRM_OWNER) {
    const isSole = await isSoleActiveOwner(params.tenantId, member.id);
    if (isSole) {
      throw new Error("Cannot suspend the sole Organization Owner.");
    }
  }

  // Update membership status
  await db.membership.update({
    where: { id: member.id },
    data: { status: "SUSPENDED" },
  });

  // Invalidate all active sessions for this user within this tenant
  await (db as any).session.deleteMany({
    where: {
      userId: member.userId,
      tenantId: params.tenantId,
    },
  });

  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "MEMBERSHIP_SUSPENDED",
    entityType: "MEMBERSHIP",
    entityId: member.id,
    newValue: { reason: params.reason || "Administrative suspension" },
  });

  await sendSecurityNoticeEmail({
    to: member.user.email,
    name: member.user.name,
    firmName: member.tenant.name,
    noticeTitle: "Account Access Suspended",
    noticeDetail: `Your practice workspace access in ${member.tenant.name} has been suspended by an administrator. Active sessions have been terminated.`,
    tenantId: params.tenantId,
  });

  return { success: true, memberId: member.id, status: "SUSPENDED" };
}

/**
 * Reactivates a suspended team member.
 */
export async function reactivateTeamMember(params: MemberActionParams) {
  const member = await db.membership.findFirst({
    where: { id: params.memberId, tenantId: params.tenantId },
    include: { user: true, tenant: true },
  });

  if (!member) {
    throw new Error("Team member not found.");
  }

  const authCheck = canManageMemberRole(params.actorRole, member.role);
  if (!authCheck.allowed) {
    throw new Error(authCheck.reason || "Unauthorized to reactivate this member.");
  }

  await db.membership.update({
    where: { id: member.id },
    data: { status: "ACTIVE" },
  });

  await logSecurityEvent({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "MEMBERSHIP_CREATED",
    entityType: "MEMBERSHIP",
    entityId: member.id,
    newValue: { reason: "Reactivated from suspension" },
  });

  await sendSecurityNoticeEmail({
    to: member.user.email,
    name: member.user.name,
    firmName: member.tenant.name,
    noticeTitle: "Account Reactivated",
    noticeDetail: `Your access to ${member.tenant.name} on TRUV LedgerOS has been restored. You may now sign in to your workspace.`,
    tenantId: params.tenantId,
  });

  return { success: true, memberId: member.id, status: "ACTIVE" };
}

/**
 * Validates an invitation token safely without exposing secrets.
 */
export async function getInvitationDetails(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length < 16) {
    return { valid: false, error: "Invalid invitation link." };
  }

  const tokenHash = hashToken(rawToken.trim());
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { name: true } },
    },
  });

  if (!invitation) {
    return { valid: false, error: "Invitation not found or has been replaced." };
  }

  if (invitation.status === InvitationStatus.ACCEPTED) {
    return { valid: false, error: "This invitation has already been accepted. Please sign in." };
  }

  if (invitation.status === InvitationStatus.REVOKED) {
    return { valid: false, error: "This invitation has been revoked by practice administrators." };
  }

  if (invitation.expiresAt < new Date()) {
    return { valid: false, error: "This invitation has expired (validity is 48 hours). Please request a new invite." };
  }

  return {
    valid: true,
    email: invitation.email,
    firmName: invitation.tenant.name,
    inviterName: invitation.invitedBy.name,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Atomically accepts an invitation, registers/activates the user, creates membership,
 * and establishes a secure session.
 */
export async function acceptInvitation(params: AcceptInvitationParams) {
  const { rawToken, name, password, ipAddress, userAgent } = params;

  if (!rawToken || rawToken.trim().length < 16) {
    throw new Error("Invalid or missing invitation token.");
  }

  if (!name || name.trim().length < 2) {
    throw new Error("Please provide your full legal or practice name.");
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters in length.");
  }

  const tokenHash = hashToken(rawToken.trim());

  // 1. Validate invitation freshness
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    include: { tenant: true },
  });

  if (!invitation) {
    throw new Error("Invitation not found or link has expired.");
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error(`This invitation cannot be used (status: ${invitation.status}).`);
  }

  if (invitation.expiresAt < new Date()) {
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    throw new Error("This invitation has expired. Please ask your administrator to resend it.");
  }

  const passwordHash = await hashPassword(password);
  const email = invitation.email.toLowerCase();

  // 2. Atomic transaction: create/update user, create membership, consume invite
  const result = await db.$transaction(async (tx) => {
    // Check if user exists already
    let user = await tx.user.findUnique({ where: { email } });

    if (user) {
      if (!user.active) {
        throw new Error("This user account has been disabled by an administrator. Please contact practice support.");
      }
      // User exists: update password & name, preserve active status
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          name: name.trim(),
          passwordHash,
          active: true,
        },
      });
    } else {
      // Create new user
      user = await tx.user.create({
        data: {
          email,
          name: name.trim(),
          passwordHash,
          active: true,
        },
      });
    }

    // Upsert membership for this organization
    const membership = await tx.membership.upsert({
      where: {
        tenantId_userId: {
          tenantId: invitation.tenantId,
          userId: user.id,
        },
      },
      update: {
        role: invitation.role,
        permissions: invitation.permissions as any,
        status: "ACTIVE",
      },
      create: {
        tenantId: invitation.tenantId,
        userId: user.id,
        role: invitation.role,
        permissions: invitation.permissions as any,
        status: "ACTIVE",
      },
    });

    // Mark invitation ACCEPTED atomically
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    return { user, membership };
  });

  // 3. Log security audit event (resilient - non-blocking on audit log)
  try {
    await logSecurityEvent({
      tenantId: invitation.tenantId,
      userId: result.user.id,
      action: "INVITATION_ACCEPTED",
      entityType: "USER",
      entityId: result.user.id,
      newValue: { email, role: invitation.role },
      ipAddress,
      userAgent,
    });
  } catch (auditErr) {
    console.warn("Audit logging non-fatal error during invitation acceptance:", auditErr);
  }

  // 4. Create an authenticated session cookie for immediate access
  let sessionCreated = false;
  try {
    await createSession(result.user.id, invitation.tenantId, { ipAddress, userAgent });
    sessionCreated = true;
  } catch (sessionErr) {
    // In environments where cookies() is not available (e.g. CLI/tests), log warning
    console.warn("Session creation was bypassed or unavailable in current execution context:", sessionErr);
  }

  return {
    success: true,
    sessionCreated,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
    tenant: {
      id: invitation.tenant.id,
      name: invitation.tenant.name,
    },
  };
}
