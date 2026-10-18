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
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await (db as any).session
        .deleteMany({
          where: { sessionToken: token },
        })
        .catch(() => null);
    }

    const cookiesToClear = [
      SESSION_COOKIE_NAME,
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.csrf-token",
      "__Host-next-auth.csrf-token",
      "next-auth.callback-url",
    ];

    for (const name of cookiesToClear) {
      try {
        cookieStore.delete(name);
      } catch {
        // ignore cookie store errors in headless environments
      }
    }
  } catch (err) {
    console.error("[destroySession] Error clearing session:", err);
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
  }).catch(() => null);

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
  let context: SessionContext | null = null;
  try {
    context = await getSessionContext();
  } catch (err) {
    console.error("[requireAuth] Error resolving session context:", err);
  }

  if (!context) {
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("next-auth.session-token");
      cookieStore.delete("__Secure-next-auth.session-token");
    } catch {}
    redirect("/login?error=SESSION_EXPIRED&force=true");
  }
  return context;
}

export async function requireTenant(): Promise<Required<SessionContext>> {
  let context: SessionContext | null = null;
  try {
    context = await getSessionContext();
  } catch (err) {
    console.error("[requireTenant] Error resolving session context:", err);
  }

  if (!context) {
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("next-auth.session-token");
      cookieStore.delete("__Secure-next-auth.session-token");
    } catch {}
    redirect("/login?error=SESSION_EXPIRED&force=true");
  }

  if (!context.membership || !context.tenant) {
    if (context.user.isSuperAdmin) {
      // Safe fallback: automatically query first active, unsuspended tenant
      const defaultTenant = await db.tenant
        .findFirst({
          where: { active: true, isSuspended: false },
          orderBy: { createdAt: "asc" },
        })
        .catch(() => null);

      if (defaultTenant) {
        try {
          const cookieStore = cookies();
          const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
          if (token) {
            await (db as any).session
              .update({
                where: { sessionToken: token },
                data: { tenantId: defaultTenant.id },
              })
              .catch(() => null);
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

    // User lacking active membership: clear cookies and redirect cleanly
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("next-auth.session-token");
      cookieStore.delete("__Secure-next-auth.session-token");
    } catch {}
    redirect("/login?error=TENANT_MEMBERSHIP_REQUIRED&force=true");
  }

  if (context.membership.status !== "ACTIVE") {
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    } catch {}
    redirect("/login?error=MEMBERSHIP_INACTIVE&force=true");
  }

  if (!context.tenant.active || context.tenant.isSuspended) {
    try {
      const cookieStore = cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    } catch {}
    redirect("/login?error=TENANT_SUSPENDED&force=true");
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