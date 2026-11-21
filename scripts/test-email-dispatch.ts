import dotenv from "dotenv";
dotenv.config();
import { sendEmail, getAppBaseUrl } from "../src/lib/server/email/email-service";

async function main() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Transactional Email Diagnostic & Verification CLI");
  console.log("==================================================================\n");

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const smtpPort = process.env.SMTP_PORT?.trim() || "465";
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  const appBaseUrl = getAppBaseUrl();

  console.log("Environment Diagnostic:");
  console.log(`  - APP_BASE_URL: ${appBaseUrl}`);
  console.log(`  - SMTP_HOST: ${smtpHost}:${smtpPort}`);
  console.log(`  - SMTP_USER: ${smtpUser ? `${smtpUser.slice(0, 3)}***` : "NOT CONFIGURED"}`);
  console.log(`  - SMTP_PASS: ${smtpPass ? "CONFIGURED (hidden)" : "NOT CONFIGURED"}`);
  console.log(`  - RESEND_API_KEY: ${resendApiKey ? `${resendApiKey.slice(0, 5)}***` : "NOT CONFIGURED"}`);
  console.log(`  - EMAIL_FROM: ${emailFrom || "DEFAULT"}`);

  const targetEmail = process.argv.find((a) => a.startsWith("--to="))?.split("=")[1] || "us7081569@gmail.com";
  console.log(`\nDispatching verification test to '${targetEmail}'...`);

  const result = await sendEmail({
    to: targetEmail,
    subject: "TRUV LedgerOS System Verification: Email Delivery Diagnostic",
    text: `System verification test dispatched at ${new Date().toISOString()}.\nBase URL: ${appBaseUrl}`,
    html: `<p>This is an automated system verification test from <strong>TRUV LedgerOS</strong>.</p><p>Timestamp: ${new Date().toISOString()}</p><p>App Base URL: <a href="${appBaseUrl}">${appBaseUrl}</a></p>`,
    category: "NOTIFICATION",
  });

  console.log("\nDelivery Outcome:");
  console.log(`  - Provider Used: ${result.provider}`);
  console.log(`  - Status: ${result.status}`);
  console.log(`  - Confirmed Delivered: ${result.delivered}`);
  console.log(`  - Delivery Outcome: ${result.deliveryOutcome}`);
  console.log(`  - Message ID: ${result.messageId}`);
  console.log(`  - Detail: ${result.detail}`);
  if (result.error) {
    console.log(`  - Error: ${result.error}`);
  }

  console.log("\n==================================================================");
  if (!result.delivered && result.status === "STANDBY_MODE") {
    console.log("ℹ️ RESULT: Email system is currently operating in STANDBY MODE.");
    console.log("To activate live delivery:");
    console.log("Option A (Gmail SMTP): Set SMTP_USER and SMTP_PASS (Google App Password) in your Vercel/local .env");
    console.log("Option B (Resend API): Set RESEND_API_KEY (re_...) and EMAIL_FROM in your Vercel/local .env");
  } else if (result.delivered) {
    console.log("✅ SUCCESS: Live email successfully accepted and dispatched by provider gateway.");
  } else {
    console.log("❌ FAILED: Live email delivery encountered a provider failure.");
  }
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
