"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  rateLimiter,
  RATE_LIMIT_TIERS,
  getClientIp,
} from "@/lib/server/security/rate-limiter";
import { sendPasswordResetEmail } from "@/lib/server/email/email-service";
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

const AUTH_TIMEOUT_MS = 5000;
const LOGIN_TEMPORARY_ERROR = "Authentication is temporarily unavailable. Please try again shortly.";

export async function loginAction(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const captchaValue = formData.get("turnstileToken") || formData.get("cf-turnstile-response");

  const parsed = LoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: "Invalid credentials" };
  }
  const { email: normalizedEmail, password: validatedPassword } = parsed.data;
  const turnstileToken = typeof captchaValue === "string" ? captchaValue : null;

  // 1. Enforce independent IP and account limits before checking credentials.
  const loginIp = getPasswordResetRequestIp();
  let rateLimitResult;
  try {
    rateLimitResult = await upstashLoginLimiter.check(loginIp, normalizedEmail);
  } catch {
    return { error: LOGIN_TEMPORARY_ERROR };
  }
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.serviceUnavailable) {
      return { error: rateLimitResult.errorMessage || LOGIN_TEMPORARY_ERROR };
    }
    return {
      error: rateLimitResult.errorMessage || LOGIN_TEMPORARY_ERROR,
      retryAfter: rateLimitResult.retryAfterSeconds,
      retryAfterMinutes: rateLimitResult.retryAfterMinutes,
    };
  }

  // 2. Cloudflare Turnstile Captcha: Verify before DB credentials check
  const hasTurnstileSecret = Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim() || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim()
  );
  const hasTurnstileSiteKey = Boolean(
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  );
  const turnstileRequired =
    hasTurnstileSecret ||
    process.env.ENFORCE_TURNSTILE === "true" ||
    process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE === "true" ||
    (process.env.NODE_ENV === "production" && hasTurnstileSiteKey);

  if (turnstileRequired) {
    if (!hasTurnstileSecret) {
      return { error: "Captcha service temporarily unavailable. Please retry." };
    }
    let captchaResult;
    try {
      captchaResult = await verifyTurnstileToken(turnstileToken, getPasswordResetRequestIp());
    } catch {
      return { error: "Captcha service temporarily unavailable. Please retry." };
    }
    if (!captchaResult.success) {
      return {
        error: captchaResult.error || "Captcha verification failed. Please try again.",
      };
    }
  }

  // 3. Bound database lookup and password verification time.
  let authenticationTimedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      authenticationTimedOut = true;
      resolve({ isTimeout: true });
    }, AUTH_TIMEOUT_MS);
  });

  const authExecutionPromise = (async () => {
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (authenticationTimedOut) {
      return { authenticated: false };
    }

    // Generic failure response prevents user enumeration
    if (!user || !user.passwordHash || !user.active) {
      return { authenticated: false, userId: user?.id };
    }

    const isValidPassword = await verifyPassword(validatedPassword, user.passwordHash);
    if (!isValidPassword) {
      return { authenticated: false, userId: user.id };
    }

    return { authenticated: true, user };
  })();

  let authRace;
  try {
    authRace = await Promise.race([authExecutionPromise, timeoutPromise]);
  } catch {
    console.error("[AUTH] Login credential verification failed.");
    await recordLoginFailure();
    return { error: LOGIN_TEMPORARY_ERROR };
  } finally {
    clearTimeout(timeoutHandle!);
  }

  if ("isTimeout" in authRace) {
    console.warn(`[AUTH_TIMEOUT_GUARD] loginAction timed out after ${AUTH_TIMEOUT_MS}ms.`);
    await recordLoginFailure();
    return { error: LOGIN_TEMPORARY_ERROR };
  }

  if (!authRace.authenticated || !authRace.user) {
    await recordLoginFailure(authRace.userId);
    return { error: "Invalid credentials" };
  }

  const user = authRace.user;

  try {
    await upstashLoginLimiter.reset(loginIp, normalizedEmail);
  } catch {
    console.warn("[AUTH] Login rate-limit counter could not be reset.");
  }
  // Resolve primary tenant
  const activeMemberships = (user.memberships || []).filter(
    (m: any) => !m.status || m.status === "ACTIVE"
  );
  const defaultTenantId = activeMemberships[0]?.tenantId;

  try {
    await createSession(user.id, defaultTenantId);
  } catch {
    console.error("[AUTH] Login session creation failed.");
    return { error: LOGIN_TEMPORARY_ERROR };
  }

  await db.auditLog.create({
    data: {
      tenantId: defaultTenantId ?? null,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
    },
  }).catch(() => null);

  // Resolve destination route: Super Admin without specific practice tenant membership routes to Godmode console
  const redirectUrl = user.isSuperAdmin && !defaultTenantId ? "/godmode" : "/dashboard";

  return {
    success: true,
    redirectUrl,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
  };
}

async function recordLoginFailure(userId?: string): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: userId ?? null,
        action: "LOGIN_FAILED",
        entityType: "USER",
        entityId: userId ?? null,
      },
    });
  } catch {
    console.warn("[AUTH] Failed-login audit event could not be recorded.");
  }
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

function hashRateLimitIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const PASSWORD_RESET_GENERIC_RESPONSE = {
  success: true,
  message: "If an account matches that email address, password reset instructions will be sent shortly.",
};

export async function requestPasswordResetAction(
  input: FormData | { email: string } | string
) {
  try {
    let submittedEmail: unknown = input;
    if (typeof input !== "string") {
      const formLike = input as { get?: (key: string) => unknown; email?: unknown };
      submittedEmail = typeof formLike.get === "function" ? formLike.get("email") : formLike.email;
    }

    const parsed = ForgotPasswordSchema.safeParse({ email: submittedEmail });
    if (!parsed.success) {
      return { success: false, error: "Invalid email format" };
    }
    const { email } = parsed.data;

    // Apply IP and email buckets before account lookup to prevent enumeration.
    const clientIp = getPasswordResetRequestIp();
    let limits;
    try {
      limits = await Promise.all([
        clientIp === "unknown"
          ? Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
          : rateLimiter.check(`account:reset-ip:${hashRateLimitIdentifier(clientIp)}`, RATE_LIMIT_TIERS.AUTH),
        rateLimiter.check(`account:reset:${hashRateLimitIdentifier(email)}`, RATE_LIMIT_TIERS.AUTH),
      ]);
    } catch {
      console.error("[AUTH] Password reset rate-limit check failed.");
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }
    if (!limits[0].allowed || !limits[1].allowed) {
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }

    let user;
    try {
      user = await db.user.findUnique({
        where: { email },
        include: {
          memberships: {
            include: { tenant: true },
            take: 1,
          },
        },
      });
    } catch {
      console.error("[AUTH] Password reset account lookup failed.");
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }

    // Do not disclose whether an account exists or is active.
    if (!user || !user.active) {
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }

    // Generate a 256-bit token; only its SHA-256 digest is persisted.
    let rawToken: string;
    let tokenHash: string;
    try {
      rawToken = crypto.randomBytes(32).toString("hex");
      tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    } catch {
      console.error("[AUTH] Password reset token generation failed.");
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Rotate outstanding reset links atomically. A newly issued link invalidates
    // every older unused ledger token for this account.
    try {
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            resetToken: tokenHash,
            resetTokenExpires: expiresAt,
          },
        });
        if ((tx as any).passwordResetToken) {
          await (tx as any).passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          await (tx as any).passwordResetToken.create({
            data: { tokenHash, userId: user.id, expiresAt },
          });
        }
      });
    } catch {
      console.error("[AUTH] Password reset token rotation failed; no reset email was sent.");
      return PASSWORD_RESET_GENERIC_RESPONSE;
    }

    try {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "USER",
          entityId: user.id,
        },
      });
    } catch {
      console.warn("[AUTH] Password reset audit event could not be recorded.");
    }

    // The raw URL is delivered only through the configured email provider.
    // It is never returned to the browser, including in standby mode or errors.
    try {
      await sendPasswordResetEmail({
        to: email,
        name: user.name || "Practitioner",
        rawToken,
      });
    } catch {
      console.error("[AUTH] Password reset email dispatch failed; public response remains generic.");
    }

    return PASSWORD_RESET_GENERIC_RESPONSE;
  } catch {
    console.error("[AUTH] Password reset request could not be processed.");
    return PASSWORD_RESET_GENERIC_RESPONSE;
  }
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
    rateLimiter.check(`account:reset-attempt:${hashRateLimitIdentifier(tokenHash)}`, RATE_LIMIT_TIERS.AUTH),
    resetAttemptIp === "unknown"
      ? Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
      : rateLimiter.check(`account:reset-attempt-ip:${hashRateLimitIdentifier(resetAttemptIp)}`, RATE_LIMIT_TIERS.AUTH),
  ]);
  if (!rateLimitResult.allowed || !ipAttemptLimit.allowed) {
    const blockedLimit = !rateLimitResult.allowed ? rateLimitResult : ipAttemptLimit;
    return {
      success: false,
      error: `Too many attempts. Please try again after ${blockedLimit.retryAfterSeconds} seconds.`,
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
    } catch {
      console.error("[AUTH] Password reset token lookup failed.");
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
        });
      }
    });
  } catch (txErr: any) {
    if (txErr?.message === "TOKEN_ALREADY_USED_OR_EXPIRED") {
      return { success: false, error: "Invalid or expired password reset link." };
    }
    console.error("[AUTH] Password reset transaction failed.");
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