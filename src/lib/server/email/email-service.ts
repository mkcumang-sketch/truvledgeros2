import nodemailer from "nodemailer";
import { logSecurityEvent } from "@/lib/server/audit";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  tenantId?: string;
  userId?: string;
  category?: "INVITATION" | "PASSWORD_RESET" | "SECURITY_ALERT" | "NOTIFICATION";
}

export type EmailDeliveryStatus = 
  | "SENT" 
  | "DELIVERED" 
  | "STANDBY_MODE" 
  | "QUEUED" 
  | "DISABLED" 
  | "FAILED";

export interface EmailDeliveryResult {
  success: boolean;       // Process completed without unhandled exception
  delivered?: boolean;    // Strictly true ONLY when transmitted to live SMTP/API gateway
  status: EmailDeliveryStatus;
  deliveryOutcome?: 
    | "DELIVERED_TO_RECIPIENT" 
    | "SIMULATED_STANDBY" 
    | "QUEUED_IN_OUTBOX" 
    | "DISABLED_BY_POLICY" 
    | "DELIVERY_FAILED";
  messageId?: string;
  detail?: string;
  error?: string;
  provider?: "smtp" | "resend" | "standby";
}

/**
 * Resolves the public application base URL for invitation and reset links.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL?.trim()) {
    return process.env.APP_BASE_URL.trim().replace(/\/$/, "");
  }
  if (process.env.NEXTAUTH_URL?.trim()) {
    return process.env.NEXTAUTH_URL.trim().replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }
  return "https://truvledgeros2.vercel.app";
}

/**
 * Base layout template for TRUV LedgerOS branded transactional emails.
 * Primary Orange: #F26B38, Dark Charcoal: #263238, Warm Off-White: #F7F8FA
 */
function wrapEmailTemplate(contentHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F8FA; color: #263238; margin: 0; padding: 0; }
    .container { max-width: 580px; margin: 30px auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #FFFFFF; padding: 28px 32px 20px; border-bottom: 2px solid #F26B38; text-align: left; }
    .logo-badge { display: inline-block; background: #F26B38; color: #FFFFFF; font-weight: 800; font-size: 13px; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px; }
    .brand-name { font-size: 18px; font-weight: 700; color: #263238; margin-left: 8px; vertical-align: middle; }
    .body { padding: 32px; font-size: 14px; line-height: 1.6; color: #334155; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #F26B38; color: #FFFFFF !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; transition: background-color 0.2s; }
    .btn:hover { background-color: #D95524; }
    .card { background: #FAF9F7; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 13px; }
    .footer { padding: 20px 32px; background: #F8FAFC; border-top: 1px solid #E5E7EB; font-size: 11px; color: #64748B; text-align: center; line-height: 1.5; }
    .break-url { word-break: break-all; color: #F26B38; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="logo-badge">TRUV</span>
      <span class="brand-name">LedgerOS</span>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>This is a secure system notification from <strong>TRUV LedgerOS</strong> — Indian CA Practice Operating System.</p>
      <p>If you were not expecting this message, please contact practice security or safely discard this communication.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Direct Gmail SMTP / Resend / Standby Email Dispatcher
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailDeliveryResult> {
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const fromEmail = process.env.EMAIL_FROM?.trim() || (smtpUser ? `TRUV LedgerOS <${smtpUser}>` : "TRUV LedgerOS <onboarding@resend.dev>");

  // 1. Primary: Direct Gmail SMTP via Nodemailer
  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (process.env.SMTP_PORT || "465") === "465",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      console.log(">>> [SMTP-DISPATCH] Sent email to:", params.to);

      return {
        success: true,
        delivered: true,
        status: "SENT",
        deliveryOutcome: "DELIVERED_TO_RECIPIENT",
        messageId: info.messageId,
        provider: "smtp",
        detail: "Confirmed dispatched via direct Gmail SMTP.",
      };
    } catch (smtpErr: any) {
      console.error("[SMTP-DELIVERY-ERROR]", smtpErr?.message || smtpErr);
      // Fall through to Resend / Standby fallback below
    }
  }

  // 2. Fallback: Resend API
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[RESEND-API-ERROR]", data);
        return {
          success: false,
          delivered: false,
          status: "FAILED",
          deliveryOutcome: "DELIVERY_FAILED",
          provider: "resend",
          error: data.message || `Resend responded with HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        delivered: true,
        status: "SENT",
        deliveryOutcome: "DELIVERED_TO_RECIPIENT",
        messageId: data.id,
        provider: "resend",
        detail: "Confirmed dispatched to Resend mail gateway.",
      };
    } catch (err: any) {
      console.error("[RESEND-SEND-EXCEPTION]", err);
      return {
        success: false,
        delivered: false,
        status: "FAILED",
        deliveryOutcome: "DELIVERY_FAILED",
        provider: "resend",
        error: err.message || "Failed to transmit email through Resend provider",
      };
    }
  }

  // 3. Fallback: Standby Mode (Neither SMTP nor Resend configured)
  console.log(`[EMAIL-STANDBY] To: ${params.to} | Subject: ${params.subject} (RESEND_API_KEY unconfigured; standby recorded)`);
  return {
    success: true,
    delivered: false,
    status: "STANDBY_MODE",
    deliveryOutcome: "SIMULATED_STANDBY",
    messageId: `standby_${Date.now()}`,
    provider: "standby",
    detail: "No active email provider configured; delivery intent simulated and logged to standby audit without live network transmission.",
  };
}

/**
 * Backward compatibility alias for sendEmail
 */
export async function sendTransactionalEmail(params: SendEmailParams): Promise<EmailDeliveryResult> {
  return sendEmail(params);
}

// ============================================================================
// Branded Email Templates
// ============================================================================

export async function sendTeamInvitationEmail(params: {
  to: string;
  inviterName: string;
  firmName: string;
  roleName: string;
  rawToken: string;
  tenantId: string;
}): Promise<EmailDeliveryResult> {
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(params.rawToken)}`;

  const contentHtml = `
    <h2 style="font-size: 18px; color: #263238; margin-top: 0;">You've been invited to join ${params.firmName}</h2>
    <p><strong>${params.inviterName}</strong> has invited you to collaborate as an active team member on <strong>TRUV LedgerOS</strong>.</p>
    
    <div class="card">
      <div style="margin-bottom: 6px;"><strong>Firm:</strong> ${params.firmName}</div>
      <div style="margin-bottom: 6px;"><strong>Assigned Role:</strong> <span style="background: #FFF4EE; color: #D95524; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${params.roleName}</span></div>
      <div><strong>Access Window:</strong> Active for 48 hours</div>
    </div>

    <p>Please click the button below to accept your invitation, set your account password, and access your workspace.</p>

    <div class="btn-container">
      <a href="${acceptUrl}" class="btn" target="_blank">Accept Invitation & Set Password</a>
    </div>

    <p style="font-size: 12px; color: #64748B; margin-top: 24px;">
      If the button does not work, copy and paste this link into your browser:<br />
      <a href="${acceptUrl}" class="break-url">${acceptUrl}</a>
    </p>
  `;

  const text = `You've been invited to join ${params.firmName} on TRUV LedgerOS as ${params.roleName} by ${params.inviterName}.
Accept your invitation and set your password here (valid for 48 hours):
${acceptUrl}

If you did not expect this invitation, please ignore this email.`;

  return sendTransactionalEmail({
    to: params.to,
    subject: `Invitation to join ${params.firmName} on TRUV LedgerOS`,
    html: wrapEmailTemplate(contentHtml, `Invitation to join ${params.firmName}`),
    text,
    tenantId: params.tenantId,
    category: "INVITATION",
  });
}

export async function sendTeamInvitationResendEmail(params: {
  to: string;
  inviterName: string;
  firmName: string;
  roleName: string;
  rawToken: string;
  tenantId: string;
}): Promise<EmailDeliveryResult> {
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(params.rawToken)}`;

  const contentHtml = `
    <h2 style="font-size: 18px; color: #263238; margin-top: 0;">Updated Invitation: Join ${params.firmName}</h2>
    <p>Your team invitation for <strong>${params.firmName}</strong> has been refreshed by <strong>${params.inviterName}</strong>.</p>
    
    <div class="card">
      <div style="margin-bottom: 6px;"><strong>Firm:</strong> ${params.firmName}</div>
      <div style="margin-bottom: 6px;"><strong>Assigned Role:</strong> <span style="background: #FFF4EE; color: #D95524; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${params.roleName}</span></div>
      <div><strong>Token Security:</strong> Prior tokens rotated; link valid for 48 hours</div>
    </div>

    <div class="btn-container">
      <a href="${acceptUrl}" class="btn" target="_blank">Accept Invitation & Activate Account</a>
    </div>

    <p style="font-size: 12px; color: #64748B; margin-top: 24px;">
      Direct link:<br />
      <a href="${acceptUrl}" class="break-url">${acceptUrl}</a>
    </p>
  `;

  const text = `Your invitation to join ${params.firmName} on TRUV LedgerOS as ${params.roleName} has been refreshed.
Activate your account here:
${acceptUrl}`;

  return sendTransactionalEmail({
    to: params.to,
    subject: `Reminder: Join ${params.firmName} on TRUV LedgerOS`,
    html: wrapEmailTemplate(contentHtml, `Updated Invitation — ${params.firmName}`),
    text,
    tenantId: params.tenantId,
    category: "INVITATION",
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<EmailDeliveryResult> {
  const baseUrl = getAppBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(params.rawToken)}`;

  const contentHtml = `
    <h2 style="font-size: 18px; color: #263238; margin-top: 0;">Password Recovery Request</h2>
    <p>Hello ${params.name || "Practitioner"},</p>
    <p>We received a request to reset your practice account password for TRUV LedgerOS.</p>

    <div class="btn-container">
      <a href="${resetUrl}" class="btn" target="_blank">Reset Practice Password</a>
    </div>

    <p style="font-size: 12px; color: #64748B;">
      This single-use recovery link is valid for <strong>15 minutes</strong>. If you did not request a password reset, you can safely disregard this message; your account credentials remain unchanged.
    </p>

    <p style="font-size: 12px; color: #64748B; margin-top: 20px;">
      Direct link:<br />
      <a href="${resetUrl}" class="break-url">${resetUrl}</a>
    </p>
  `;

  const text = `Password recovery requested for TRUV LedgerOS.
Reset your password here (valid for 15 minutes):
${resetUrl}

If you did not request this, please ignore this email.`;

  return sendTransactionalEmail({
    to: params.to,
    subject: "Reset your TRUV LedgerOS practice password",
    html: wrapEmailTemplate(contentHtml, "Password Reset"),
    text,
    category: "PASSWORD_RESET",
  });
}

export async function sendSecurityNoticeEmail(params: {
  to: string;
  name: string;
  firmName: string;
  noticeTitle: string;
  noticeDetail: string;
  tenantId?: string;
}): Promise<EmailDeliveryResult> {
  const contentHtml = `
    <h2 style="font-size: 18px; color: #263238; margin-top: 0;">Security Notification: ${params.noticeTitle}</h2>
    <p>Hello ${params.name || "Team Member"},</p>
    <p>This is an automated security advisory concerning your membership in <strong>${params.firmName}</strong> on TRUV LedgerOS.</p>

    <div class="card" style="border-left: 4px solid #F26B38;">
      <p style="margin: 0; color: #263238;">${params.noticeDetail}</p>
    </div>

    <p style="font-size: 12px; color: #64748B;">If you have questions regarding this change, please contact your practice administrator directly.</p>
  `;

  const text = `Security notice from ${params.firmName} on TRUV LedgerOS:
${params.noticeTitle}
${params.noticeDetail}`;

  return sendTransactionalEmail({
    to: params.to,
    subject: `Security Notice: ${params.noticeTitle} (${params.firmName})`,
    html: wrapEmailTemplate(contentHtml, params.noticeTitle),
    text,
    tenantId: params.tenantId,
    category: "SECURITY_ALERT",
  });
}
