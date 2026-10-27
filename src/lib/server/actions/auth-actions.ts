"use server";

import { db } from "@/lib/db";
import { sendEmail, getAppBaseUrl } from "@/lib/server/email/email-service";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// 1. Password Reset Request
export async function requestPasswordResetAction(email: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: cleanEmail },
      include: { memberships: { include: { tenant: true }, take: 1 } },
    });

    // Strict validation: Explicit error when email does NOT exist
    if (!user) {
      return {
        success: false,
        error: "You don't have an active account with this email. Please check your credentials or register a new practice.",
      };
    }

    // Generate secure 64-character crypto token with a 1-hour expiration
    const rawToken = crypto.randomBytes(32).toString("hex"); // 64 hex characters
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    // Store hash securely in User table (User.resetToken and User.resetTokenExpires)
    await db.user.update({
      where: { id: user.id },
      data: {
        resetToken: tokenHash,
        resetTokenExpires: expiresAt,
      },
    });

    // Also sync PasswordResetToken record for database table parity
    try {
      if ((db as any).passwordResetToken) {
        await (db as any).passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      }
    } catch (tokErr) {
      console.warn("[AUTH] PasswordResetToken table sync notice:", tokErr);
    }

    const baseUrl = getAppBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(cleanEmail)}`;
    const tenantName = user.memberships[0]?.tenant?.name || "TRUV LedgerOS";

    // Send email via Nodemailer Direct Gmail SMTP (category: "PASSWORD_RESET")
    await sendEmail({
      to: cleanEmail,
      subject: `Password Reset Request — ${tenantName}`,
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
      text: `Reset your TRUV LedgerOS password (valid for 1 hour): ${resetUrl}`,
      tenantId: user.memberships[0]?.tenantId,
      category: "PASSWORD_RESET",
    });

    return {
      success: true,
      message: "Password reset link has been dispatched to your registered email address.",
      resetUrl,
    };
  } catch (error: any) {
    console.error("Password reset request error:", error);
    return { success: false, error: error.message || "Failed to process request." };
  }
}

// 2. Set New Password
export async function resetPasswordAction(token: string, email: string, newPassword: string) {
  try {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    let user = await db.user.findFirst({
      where: {
        ...(cleanEmail ? { email: cleanEmail } : {}),
        resetToken: tokenHash,
        resetTokenExpires: { gt: new Date() },
      },
    });

    // Fallback to PasswordResetToken table if User.resetToken wasn't set
    if (!user && (db as any).passwordResetToken) {
      const resetRecord = await (db as any).passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (resetRecord?.user) {
        user = resetRecord.user;
      }
    }

    if (!user) {
      return { success: false, error: "Invalid or expired password reset link." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user!.id },
        data: {
          passwordHash: hashedPassword,
          resetToken: null,
          resetTokenExpires: null,
        },
      });

      if ((tx as any).passwordResetToken) {
        await (tx as any).passwordResetToken.updateMany({
          where: {
            userId: user!.id,
            tokenHash,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        }).catch(() => null);
      }

      if ((tx as any).session) {
        await (tx as any).session.deleteMany({
          where: { userId: user!.id },
        }).catch(() => null);
      }
    });

    return {
      success: true,
      message: "Password successfully updated! You can now sign in with your new credentials.",
    };
  } catch (error: any) {
    console.error("Reset password execution error:", error);
    return { success: false, error: error.message || "Failed to update password. Please try again." };
  }
}