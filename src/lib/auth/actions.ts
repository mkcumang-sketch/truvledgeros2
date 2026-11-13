"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, generateSecureToken, hashToken } from "./password";
import { createSession, destroySession } from "./session";
import { checkRateLimit, resetRateLimit } from "./rate-limit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  rateLimiter,
  RATE_LIMIT_TIERS,
  getClientIp,
} from "@/lib/server/security/rate-limiter";
import { sendEmail, getAppBaseUrl, sendPasswordResetEmail } from "@/lib/server/email/email-service";
import crypto from "crypto";
import bcrypt from "bcryptjs";

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
  const loginRateLimitKey = getPasswordResetRequestIp() + ":" + email;
  const rateLimitResult = await upstashLoginLimiter.check(loginRateLimitKey);
  if (!rateLimitResult.allowed) {
    return {
      error: rateLimitResult.errorMessage,
      retryAfter: rateLimitResult.retryAfterSeconds,
      retryAfterMinutes: rateLimitResult.retryAfterMinutes,
    };
  }

  // 2. Cloudflare Turnstile Captcha: Verify before DB credentials check
  // Development-safe bypass: only enforce verification if captcha token is provided and in production or test/staging with secret
  const isProduction = process.env.NODE_ENV === "production";
  const hasTurnstileSecret = Boolean(
    process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
  );

  if (captchaToken && (isProduction || hasTurnstileSecret)) {
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

  await upstashLoginLimiter.reset(loginRateLimitKey);
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

function getPasswordResetRequestIp(): string {
  try {
    const requestHeaders = headers();
    return getClientIp(new Request("https://localhost", { headers: new Headers(requestHeaders) }));
  } catch {
    return "unknown";
  }
}

const PASSWORD_RESET_GENERIC_RESPONSE = {
  success: true,
  message: "If an account matches that email address, password reset instructions will be sent shortly.",
};

export async function requestPasswordResetAction(
  input: FormData | { email: string } | string
) {
  let email = "";
  if (typeof input === "string") {
    email = input.trim().toLowerCase();
  } else if (input instanceof FormData || (input && typeof (input as any).get === "function")) {
    email = ((input as FormData).get("email") as string)?.trim().toLowerCase() || "";
  } else if (input && typeof (input as any).email === "string") {
    email = (input as any).email.trim().toLowerCase();
  }

  const parsed = ForgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { success: false, error: "Invalid email format" };
  }

  // Apply IP and email buckets before account lookup to prevent enumeration.
  const clientIp = getPasswordResetRequestIp();
  const [ipLimit, emailLimit] = await Promise.all([
    rateLimiter.check("account:reset-ip:" + clientIp, RATE_LIMIT_TIERS.AUTH),
    rateLimiter.check("account:reset:" + email, RATE_LIMIT_TIERS.AUTH),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return PASSWORD_RESET_GENERIC_RESPONSE;
  }

  const user = await db.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: { tenant: true },
        take: 1,
      },
    },
  });

  // Do not disclose whether an account exists or is active.
  if (!user || !user.active) {
    return PASSWORD_RESET_GENERIC_RESPONSE;
  }

  // Generate a 256-bit token; only its SHA-256 digest is persisted.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.user.update({
    where: { id: user.id },
    data: {
      resetToken: tokenHash,
      resetTokenExpires: expiresAt,
    },
  });

  // Keep the normalized token ledger in sync when the model is available.
  try {
    if ((db as any).passwordResetToken) {
      await (db as any).passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt },
      });
    }
  } catch {
    console.error("[AUTH] PasswordResetToken ledger write failed; User reset token remains authoritative.");
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "USER",
      entityId: user.id,
    },
  }).catch(() => null);

  // The raw URL is delivered only through the configured email provider.
  // It is never returned to the browser, including in standby mode or errors.
  await sendPasswordResetEmail({
    to: email,
    name: user.name || "Practitioner",
    rawToken,
  }).catch(() => {
    console.error("[AUTH] Password reset email dispatch failed; public response remains generic.");
  });

  return PASSWORD_RESET_GENERIC_RESPONSE;
}

export async function resetPasswordAction(
  formData: FormData | { token: string; email?: string; newPassword?: string; password?: string; confirmPassword?: string }
) {
  let token = "";
  let newPassword = "";
  let confirmPassword: string | null = null;
  let email = "";

  if (formData instanceof FormData || (formData && typeof (formData as any).get === "function")) {
    const fd = formData as FormData;
    token = (fd.get("token") as string) || "";
    newPassword = ((fd.get("newPassword") || fd.get("password")) as string) || "";
    confirmPassword = fd.get("confirmPassword") as string | null;
    email = ((fd.get("email") as string) || "").trim().toLowerCase();
  } else if (formData && typeof formData === "object") {
    token = formData.token || "";
    newPassword = formData.newPassword || formData.password || "";
    confirmPassword = formData.confirmPassword !== undefined ? formData.confirmPassword : null;
    email = (formData.email || "").trim().toLowerCase();
  }

  if (confirmPassword !== null && confirmPassword !== newPassword) {
    return { success: false, error: "Passwords do not match. Please ensure both fields are identical." };
  }

  const parsed = ResetPasswordSchema.safeParse({ token, newPassword });
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message || "Invalid password or token" };
  }

  // Enforce 8+ character password
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Rate limit both by token digest and trusted request IP.
  const resetAttemptIp = getPasswordResetRequestIp();
  const [rateLimitResult, ipAttemptLimit] = await Promise.all([
    rateLimiter.check("account:reset-attempt:" + tokenHash, RATE_LIMIT_TIERS.AUTH),
    rateLimiter.check("account:reset-attempt-ip:" + resetAttemptIp, RATE_LIMIT_TIERS.AUTH),
  ]);
  if (!rateLimitResult.allowed || !ipAttemptLimit.allowed) {
    return {
      success: false,
      error: `Too many attempts. Please try again after ${rateLimitResult.retryAfterSeconds} seconds.`,
    };
  }

  // 1. Validate token and expiration against User table
  let targetUser: any = null;
  let userTokenMatched = false;
  if (typeof (db.user as any).findFirst === "function") {
    try {
      targetUser = await (db.user as any).findFirst({
        where: {
          ...(email ? { email } : {}),
          resetToken: tokenHash,
          resetTokenExpires: { gt: new Date() },
        },
      });
      userTokenMatched = Boolean(targetUser);
    } catch {
      targetUser = null;
    }
  }

  // Always load the ledger row when available so both token stores are consumed.
  let resetRecord: any = null;
  if ((db as any).passwordResetToken) {
    try {
      resetRecord = await (db as any).passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!targetUser && resetRecord?.user) {
        targetUser = resetRecord.user;
      }
    } catch (dbErr) {
      console.error("[AUTH] PasswordResetToken table query error:", dbErr);
    }
  }

  if (!targetUser) {
    return { success: false, error: "Invalid or expired password reset link." };
  }

  if (resetRecord && (resetRecord.usedAt || resetRecord.expiresAt < new Date())) {
    return { success: false, error: "Invalid or expired password reset link." };
  }

  // 2. Hash with bcrypt (12 rounds)
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  try {
    await db.$transaction(async (tx) => {
      // Atomically claim the User-row token when that compatibility path matched.
      // This protects single-use semantics even when the ledger model is unavailable.
      if (userTokenMatched) {
        const userClaim = await tx.user.updateMany({
          where: {
            id: targetUser!.id,
            resetToken: tokenHash,
            resetTokenExpires: { gt: new Date() },
          },
          data: {
            resetToken: null,
            resetTokenExpires: null,
          },
        });

        if (userClaim.count !== 1) {
          throw new Error("TOKEN_ALREADY_USED_OR_EXPIRED");
        }
      }

      // Atomically claim the ledger token as well when a ledger row exists.
      if ((tx as any).passwordResetToken && resetRecord?.id) {
        const claimResult = await (tx as any).passwordResetToken.updateMany({
          where: {
            id: resetRecord.id,
            userId: targetUser!.id,
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });

        if (claimResult.count !== 1) {
          throw new Error("TOKEN_ALREADY_USED_OR_EXPIRED");
        }
      }

      // Password update and session revocation commit with the token claim.
      await tx.user.update({
        where: { id: targetUser!.id },
        data: { passwordHash: hashedPassword },
      });

      // Invalidate all active sessions for this user across all devices
      if ((tx as any).session) {
        await (tx as any).session.deleteMany({
          where: { userId: targetUser!.id },
        }).catch(() => null);
      }
    });
  } catch (txErr: any) {
    if (txErr?.message === "TOKEN_ALREADY_USED_OR_EXPIRED") {
      return { success: false, error: "Invalid or expired password reset link." };
    }
    console.error("[AUTH] Password reset transaction failed:", txErr);
    return { success: false, error: "Failed to update password. Please try again." };
  }

  await db.auditLog.create({
    data: {
      userId: targetUser.id,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "USER",
      entityId: targetUser.id,
    },
  }).catch(() => null);

  return {
    success: true,
    message: "Password successfully updated! You can now sign in with your new credentials.",
  };
}