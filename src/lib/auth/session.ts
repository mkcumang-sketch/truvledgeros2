import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { generateSecureToken } from "./password";
import { Role } from "@prisma/client";

export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REVOKED";
export const MembershipStatus = {
  ACTIVE: "ACTIVE",
  INVITED: "INVITED",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
} as const;

export const SESSION_COOKIE_NAME = "truv_session";
const SESSION_DURATION_DAYS = 7;

export interface SessionContext {
  user: {
    id: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
  };
  membership?: {
    id: string;
    tenantId: string;
    role: Role;
    status: MembershipStatus;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    isSuspended: boolean;
  };
}

export async function createSession(
  userId: string,
  tenantId?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const token = generateSecureToken(48);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await (db as any).session.create({
    data: {
      sessionToken: token,
      userId,
      tenantId: tenantId ?? null,
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });

  const cookieStore = cookies();
  const existingToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (existingToken) {
    // Session rotation on login: invalidate previous session
    await (db as any).session.deleteMany({ where: { sessionToken: existingToken } }).catch(() => null);
  }

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await (db as any).session.deleteMany({
      where: { sessionToken: token },
    });
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
}

export async function getSessionContext(): Promise<SessionContext | null> {
  let token: string | undefined;
  try {
    const cookieStore = cookies();
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return null;
  }

  if (!token) return null;

  const session = await (db as any).session.findUnique({
    where: { sessionToken: token },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: { tenant: true },
          },
        },
      },
      tenant: true,
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await (db as any).session.delete({ where: { id: session.id } }).catch(() => null);
    }
    return null;
  }

  if (!session.user?.active) {
    return null;
  }

  const user = session.user;
  const memberships = user.memberships || [];

  const activeMembership = session.tenantId
    ? memberships.find((m: { tenantId: string }) => m.tenantId === session.tenantId)
    : memberships[0];

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
    membership: activeMembership
      ? {
          id: activeMembership.id,
          tenantId: activeMembership.tenantId,
          role: activeMembership.role,
          status: activeMembership.status,
        }
      : undefined,
    tenant: activeMembership?.tenant
      ? {
          id: activeMembership.tenant.id,
          name: activeMembership.tenant.name,
          slug: activeMembership.tenant.slug,
          active: activeMembership.tenant.active,
          isSuspended: activeMembership.tenant.isSuspended,
        }
      : undefined,
  };
}

export async function requireAuth(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) {
    throw new Error("UNAUTHORIZED");
  }
  return context;
}

export async function requireTenant(): Promise<Required<SessionContext>> {
  const context = await requireAuth();

  if (!context.membership || !context.tenant) {
    if (context.user.isSuperAdmin) {
      // Safe fallback: automatically query first active, unsuspended tenant
      const defaultTenant = await db.tenant.findFirst({
        where: { active: true, isSuspended: false },
        orderBy: { createdAt: "asc" },
      });

      if (defaultTenant) {
        try {
          const cookieStore = cookies();
          const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
          if (token) {
            await (db as any).session.update({
              where: { sessionToken: token },
              data: { tenantId: defaultTenant.id },
            }).catch(() => null);
          }
        } catch {
          // ignore cookie error in test/headless context
        }

        context.tenant = {
          id: defaultTenant.id,
          name: defaultTenant.name,
          slug: defaultTenant.slug,
          active: defaultTenant.active,
          isSuspended: defaultTenant.isSuspended,
        };

        context.membership = {
          id: `superadmin-${defaultTenant.id}`,
          tenantId: defaultTenant.id,
          role: Role.FIRM_OWNER,
          status: "ACTIVE",
        };

        return context as Required<SessionContext>;
      }
    }

    redirect("/login?error=TENANT_MEMBERSHIP_REQUIRED");
  }

  if (context.membership.status !== "ACTIVE") {
    redirect("/login?error=MEMBERSHIP_INACTIVE");
  }

  if (!context.tenant.active || context.tenant.isSuspended) {
    redirect("/login?error=TENANT_SUSPENDED");
  }

  return context as Required<SessionContext>;
}

export async function requireRole(allowedRoles: Role[]): Promise<Required<SessionContext>> {
  const context = await requireTenant();
  if (!allowedRoles.includes(context.membership.role) && !context.user.isSuperAdmin) {
    throw new Error("FORBIDDEN_ROLE");
  }
  return context;
}