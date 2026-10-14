"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import { requireTenant, requireRole } from "@/lib/auth/session";
import {
  inviteTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  updateMemberRole,
  suspendTeamMember,
  reactivateTeamMember,
  acceptInvitation,
  getInvitationDetails,
} from "@/lib/server/team/team-service";
import { rateLimiter, RATE_LIMIT_TIERS } from "@/lib/server/security/rate-limiter";

const InviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid work email is required"),
  role: z.nativeEnum(Role),
  permissions: z.record(z.boolean()).optional(),
});

const ResendInvitationSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
});

const RevokeInvitationSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
});

const UpdateRoleSchema = z.object({
  memberId: z.string().min(1, "Member ID is required"),
  role: z.nativeEnum(Role),
  permissions: z.record(z.boolean()).optional(),
});

const MemberStatusSchema = z.object({
  memberId: z.string().min(1, "Member ID is required"),
  reason: z.string().max(250).optional(),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(16, "Invalid invitation token"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

/**
 * Server Action: Invite a new team member
 */
export async function inviteMemberAction(data: {
  email: string;
  role: Role;
  permissions?: Record<string, boolean>;
}) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = InviteMemberSchema.parse(data);

    // Rate-limiting check: max 20 invites per hour per tenant
    const rlKey = `tenant:invite:${tenantId}`;
    const rlStatus = await rateLimiter.check(rlKey, { limit: 20, windowSeconds: 3600 });
    if (!rlStatus.allowed) {
      return { success: false, error: "Invitation rate limit reached. Please wait before inviting more members." };
    }

    const result = await inviteTeamMember({
      tenantId,
      email: validated.email,
      role: validated.role,
      permissions: validated.permissions,
      inviter: {
        id: context.user.id,
        name: context.user.name,
        role: context.membership.role,
        tenantName: context.tenant.name,
      },
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to send invitation." };
  }
}

/**
 * Server Action: Resend an existing invitation
 */
export async function resendInvitationAction(data: { invitationId: string }) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = ResendInvitationSchema.parse(data);

    const result = await resendTeamInvitation({
      tenantId,
      invitationId: validated.invitationId,
      inviter: {
        id: context.user.id,
        name: context.user.name,
        role: context.membership.role,
        tenantName: context.tenant.name,
      },
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to resend invitation." };
  }
}

/**
 * Server Action: Revoke an invitation
 */
export async function revokeInvitationAction(data: { invitationId: string }) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = RevokeInvitationSchema.parse(data);

    const result = await revokeTeamInvitation({
      tenantId,
      invitationId: validated.invitationId,
      actorUserId: context.user.id,
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to revoke invitation." };
  }
}

/**
 * Server Action: Update member role & permissions
 */
export async function updateMemberRoleAction(data: {
  memberId: string;
  role: Role;
  permissions?: Record<string, boolean>;
}) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = UpdateRoleSchema.parse(data);

    const result = await updateMemberRole({
      tenantId,
      memberId: validated.memberId,
      newRole: validated.role,
      permissions: validated.permissions,
      actorRole: context.membership.role,
      actorUserId: context.user.id,
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update role." };
  }
}

/**
 * Server Action: Suspend team member
 */
export async function suspendMemberAction(data: { memberId: string; reason?: string }) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = MemberStatusSchema.parse(data);

    const result = await suspendTeamMember({
      tenantId,
      memberId: validated.memberId,
      actorRole: context.membership.role,
      actorUserId: context.user.id,
      reason: validated.reason,
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to suspend member." };
  }
}

/**
 * Server Action: Reactivate suspended member
 */
export async function reactivateMemberAction(data: { memberId: string }) {
  try {
    const context = await requireRole([Role.FIRM_OWNER, Role.FIRM_ADMIN]);
    const tenantId = context.membership.tenantId;

    const validated = MemberStatusSchema.parse(data);

    const result = await reactivateTeamMember({
      tenantId,
      memberId: validated.memberId,
      actorRole: context.membership.role,
      actorUserId: context.user.id,
    });

    revalidatePath("/team");
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reactivate member." };
  }
}

/**
 * Server Action: Get public safe invitation preview details
 */
export async function getInvitationDetailsAction(token: string) {
  try {
    return await getInvitationDetails(token);
  } catch (error: any) {
    return { valid: false, error: error.message || "Failed to load invitation." };
  }
}

/**
 * Server Action: Accept team invitation & activate account
 */
export async function acceptInvitationAction(data: {
  token: string;
  name: string;
  password: string;
}) {
  try {
    const validated = AcceptInviteSchema.parse(data);

    const headerList = headers();
    const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = headerList.get("user-agent") || undefined;

    // Rate-limiting check: 5 attempts per 15 minutes per IP
    const rlStatus = await rateLimiter.check(`ip:accept_invite:${ipAddress}`, RATE_LIMIT_TIERS.AUTH);
    if (!rlStatus.allowed) {
      return {
        success: false,
        error: `Too many attempts. Please try again in ${rlStatus.retryAfterSeconds} seconds.`,
      };
    }

    const result = await acceptInvitation({
      rawToken: validated.token,
      name: validated.name,
      password: validated.password,
      ipAddress,
      userAgent,
    });

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to accept invitation." };
  }
}
