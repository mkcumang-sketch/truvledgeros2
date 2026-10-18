"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, generateSecureToken, hashToken } from "./password";
import { createSession, destroySession } from "./session";
import { checkRateLimit, resetRateLimit } from "./rate-limit";
import { redirect } from "next/navigation";

import {
  rateLimiter,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { sendPasswordResetEmail } from "@/lib/server/email/email-service";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "Email must not exceed 254 characters").email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must not exceed 128 characters"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "Email must not exceed 254 characters").email("Invalid email format"),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required").max(256),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must not exceed 128 characters"),
});

import {
  upstashLoginLimiter,
} from "@/lib/server/security/upstash-rate-limiter";
import { verifyTurnstileToken } from "@/lib/server/security/turnstile";

const AUTH_TIMEOUT_MS = 10000;

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const captchaToken = (formData.get("turnstileToken") || formData.get("cf-turnstile-response")) as string | null;

  const parsed = LoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: "Invalid credentials" };
  }

  // 1. Upstash Redis Token-Bucket Limiting (5 attempts / 15 mins)
  const rateLimitResult = await upstashLoginLimiter.check(email);
  if (!rateLimitResult.allowed) {
    return {
      error: rateLimitResult.errorMessage,
      retryAfter: rateLimitResult.retryAfterSeconds,
      retryAfterMinutes: rateLimitResult.retryAfterMinutes,
    };
  }

  // 2. Cloudflare Turnstile Captcha: Verify before DB credentials check
  if (captchaToken) {
    const captchaResult = await verifyTurnstileToken(captchaToken);
    if (!captchaResult.success) {
      return {
        error: captchaResult.error || "Captcha verification failed. Please try again.",
      };
    }
  }

  // 3. 10s Timeout Guardrail on Database & Password Verification
  const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
    setTimeout(() => resolve({ isTimeout: true }), AUTH_TIMEOUT_MS)
  );

  const authExecutionPromise = (async () => {
    const user = await (db.user as any).findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    // Generic failure response prevents user enumeration
    if (!user || !user.passwordHash || !user.active) {
      return { authenticated: false };
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "LOGIN_FAILED",
          entityType: "USER",
          entityId: user.id,
        },
      }).catch(() => null);

      return { authenticated: false };
    }

    return { authenticated: true, user };
  })();

  const authRace = await Promise.race([authExecutionPromise, timeoutPromise]);

  if ("isTimeout" in authRace) {
    console.warn(`[AUTH_TIMEOUT_GUARD] loginAction timed out after ${AUTH_TIMEOUT_MS}ms for email: ${email}`);
    return { error: "Invalid credentials" };
  }

  if (!authRace.authenticated || !authRace.user) {
    return { error: "Invalid credentials" };
  }

  const user = authRace.user;

  await upstashLoginLimiter.reset(email);
  resetRateLimit(`login:${email}`);

  // Resolve primary tenant
  const activeMemberships = (user.memberships || []).filter(
    (m: any) => !m.status || m.status === "ACTIVE"
  );
  const defaultTenantId = activeMemberships[0]?.tenantId;

  await createSession(user.id, defaultTenantId);

  await db.auditLog.create({
    data: {
      tenantId: defaultTenantId ?? null,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
    },
  }).catch(() => null);

  // If superadmin has no specific practice tenant membership, route to Godmode console
  if (user.isSuperAdmin && !defaultTenantId) {
    redirect("/godmode");
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  const parsed = ForgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const rateLimitResult = await rateLimiter.check(`account:reset:${email}`, RATE_LIMIT_TIERS.AUTH);
  if (!rateLimitResult.allowed) {
    return {
      error: `Too many password reset requests. Please try again after ${rateLimitResult.retryAfterSeconds} seconds.`,
    };
  }

  const user = await db.user.findUnique({
    where: { email },
  });

  if (user) {
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute single-use validity

    try {
      if ((db as any).passwordResetToken) {
        await (db as any).passwordResetToken.create({
          data: {
            tokenHash,
            userId: user.id,
            expiresAt,
          },
        });
      }
    } catch (tokenErr) {
      console.warn("[AUTH] PasswordResetToken table not yet available in DB:", tokenErr);
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "USER",
        entityId: user.id,
      },
    }).catch(() => null);

    // Dispatch branded transactional email with secure reset link
    await sendPasswordResetEmail({
      to: email,
      name: user.name,
      rawToken,
    });
  }

  return {
    success: true,
    message: "If an account exists with that email, a password reset link has been dispatched.",
  };
}

export async function resetPasswordAction(formData: FormData) {
  const token = formData.get("token") as string;
  const newPassword = ((formData.get("newPassword") || formData.get("password")) as string) || "";
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (confirmPassword !== null && confirmPassword !== newPassword) {
    return { error: "Passwords do not match. Please ensure both fields are identical." };
  }

  const parsed = ResetPasswordSchema.safeParse({ token, newPassword });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const tokenHash = hashToken(token);

  // Rate Limiting (5 attempts / 15 mins)
  const rateLimitResult = await rateLimiter.check(`account:reset-attempt:${tokenHash}`, RATE_LIMIT_TIERS.AUTH);
  if (!rateLimitResult.allowed) {
    return {
      error: `Too many attempts. Please try again after ${rateLimitResult.retryAfterSeconds} seconds.`,
    };
  }

  if (!(db as any).passwordResetToken) {
    return { error: "Password reset service temporarily unavailable." };
  }

  let resetRecord: any = null;
  try {
    resetRecord = await (db as any).passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  } catch (dbErr) {
    console.error("[AUTH] Password reset query failed:", dbErr);
    return { error: "Password reset service temporarily unavailable." };
  }

  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
    return { error: "Invalid or expired password reset link." };
  }

  const hashedPassword = await hashPassword(newPassword);

  try {
    await db.$transaction(async (tx) => {
      // 1. Atomic, concurrency-safe token consumption:
      // Conditional update ensures ONLY the first concurrent request claiming this token succeeds.
      // If usedAt is already non-null or expiresAt has passed, count is 0.
      const claimResult = await (tx as any).passwordResetToken.updateMany({
        where: {
          id: resetRecord.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (claimResult.count === 0) {
        throw new Error("TOKEN_ALREADY_USED_OR_EXPIRED");
      }

      // 2. Update user's passwordHash
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: hashedPassword },
      });

      // 3. Invalidate all active sessions for this user across all devices
      await (tx as any).session.deleteMany({
        where: { userId: resetRecord.userId },
      });
    });
  } catch (txErr: any) {
    if (txErr?.message === "TOKEN_ALREADY_USED_OR_EXPIRED") {
      return { error: "Invalid or expired password reset link." };
    }
    console.error("[AUTH] Password reset transaction failed:", txErr);
    return { error: "Failed to update password. Please try again." };
  }

  await db.auditLog.create({
    data: {
      userId: resetRecord.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "USER",
      entityId: resetRecord.userId,
    },
  }).catch(() => null);

  return { success: true };
}