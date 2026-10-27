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
    return { success: false, error: parsed.error.errors[0]?.message || "Invalid email format" };
  }

  // 1. Strict Server-Side Validation: Check if submitted email strictly exists in the User table
  const user = await db.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: { tenant: true },
        take: 1,
      },
    },
  });

  // Strict non-existence check: Explicit error, do NOT send any email
  if (!user) {
    return {
      success: false,
      error: "You don't have an active account with this email. Please check your credentials or register a new practice.",
    };
  }

  // Rate Limiting (5 attempts / 15 mins)
  const rateLimitResult = await rateLimiter.check(`account:reset:${email}`, RATE_LIMIT_TIERS.AUTH);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: `Too many password reset requests. Please try again after ${rateLimitResult.retryAfterSeconds} seconds.`,
    };
  }

  // 2. Generate secure 64-character crypto token with a 1-hour expiration
  const rawToken = crypto.randomBytes(32).toString("hex"); // 64 hex characters
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1-hour validity

  // 3. Store the hash securely in database (User.resetToken and User.resetTokenExpires)
  await db.user.update({
    where: { id: user.id },
    data: {
      resetToken: tokenHash,
      resetTokenExpires: expiresAt,
    },
  });

  // Maintain PasswordResetToken table synchronization
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
    console.warn("[AUTH] PasswordResetToken table sync notice:", tokenErr);
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "USER",
      entityId: user.id,
    },
  }).catch(() => null);

  // 4. Send password reset email via Nodemailer Direct Gmail SMTP (category: "PASSWORD_RESET")
  const baseUrl = getAppBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
  const tenantName = user.memberships[0]?.tenant?.name || "TRUV LedgerOS";

  await sendEmail({
    to: email,
    subject: `Password Reset Request — ${tenantName}`,
    category: "PASSWORD_RESET",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 550px; margin: 0 auto; padding: 28px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 24px; text-align: left;">
          <span style="background: #ea580c; color: #ffffff; font-weight: 800; font-size: 13px; padding: 4px 10px; border-radius: 6px;">TRUV</span>
          <span style="font-size: 16px; font-weight: 700; color: #f8fafc; margin-left: 8px;">LedgerOS</span>
        </div>
        <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 8px;">Password Recovery Request</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          Hello ${user.name || "Practitioner"},<br/>
          A password reset was requested for your TRUV LedgerOS account (${tenantName}). Click the secure button below to choose a new password:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #ea580c; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Reset Practice Password</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-top: 24px;">
          This secure single-use recovery link is valid for <strong>1 hour</strong>. If you did not initiate this request, your account remains secure and no action is required.
        </p>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b;">
          <p style="color: #64748b; font-size: 11px; word-break: break-all;">
            Direct reset URL:<br/>
            <a href="${resetUrl}" style="color: #ea580c;">${resetUrl}</a>
          </p>
        </div>
      </div>
    `,
    text: `Password recovery requested for TRUV LedgerOS practice account. Reset your password here (valid for 1 hour): ${resetUrl}`,
    tenantId: user.memberships[0]?.tenantId,
  });

  return {
    success: true,
    message: "Password reset link has been dispatched to your registered email address.",
    resetUrl,
  };
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

  // Rate Limiting (5 attempts / 15 mins)
  const rateLimitResult = await rateLimiter.check(`account:reset-attempt:${tokenHash}`, RATE_LIMIT_TIERS.AUTH);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: `Too many attempts. Please try again after ${rateLimitResult.retryAfterSeconds} seconds.`,
    };
  }

  // 1. Validate token and expiration against User table
  let targetUser: any = null;
  if (typeof (db.user as any).findFirst === "function") {
    try {
      targetUser = await (db.user as any).findFirst({
        where: {
          ...(email ? { email } : {}),
          resetToken: tokenHash,
          resetTokenExpires: { gt: new Date() },
        },
      });
    } catch {
      targetUser = null;
    }
  }

  // Fallback to PasswordResetToken table if User.resetToken wasn't set or in test harness
  let resetRecord: any = null;
  if (!targetUser && (db as any).passwordResetToken) {
    try {
      resetRecord = await (db as any).passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (resetRecord?.user) {
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
      // Synchronize atomic PasswordResetToken consumption if record exists
      if ((tx as any).passwordResetToken && resetRecord?.id) {
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
      }

      // Clear reset tokens upon success on User table
      await tx.user.update({
        where: { id: targetUser!.id },
        data: {
          passwordHash: hashedPassword,
          resetToken: null,
          resetTokenExpires: null,
        },
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