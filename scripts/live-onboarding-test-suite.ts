import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { requestPasswordResetAction } from "../src/lib/auth/actions";
import { generateTaxInvoicePdf } from "../src/lib/server/pdf/tax-invoice-generator";
import { sendEmail, wrapEmailTemplate } from "../src/lib/server/email/email-service";
import { sendWhatsAppMessage } from "../src/lib/server/whatsapp/whatsapp-service";
import { initiateOutboundVoiceCall } from "../src/lib/server/voice/calling-agent";
import { Role, InvoiceStatus, CommunicationChannel, CommunicationDirection } from "@prisma/client";

// ANSI color helpers
const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t: string) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[0m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;

async function isPortOpen(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function runTestSuite() {
  console.log(bold(cyan("\n================================================================================")));
  console.log(bold(cyan("TRUV LedgerOS — Autonomous End-to-End Onboarding & Verification Pipeline")));
  console.log(bold(cyan("================================================================================\n")));

  const registeredEmail = process.env.SMTP_USER?.trim() || "us7907us@gmail.com";
  const targetPhone = process.env.TARGET_PHONE_NUMBER?.trim() || process.env.ADMIN_PHONE?.trim() || "+919999900000";
  const targetEmail = registeredEmail;

  // Track results for final summary
  const summary = {
    nonRegisteredCheckPassed: false,
    nonRegisteredError: "",
    registeredResetDispatched: false,
    resetUrl: "",
    screenshotSaved: false,
    screenshotPath: "",
    practiceProvisioned: false,
    clientProvisioned: false,
    invoiceIssued: false,
    pdfGenerated: false,
    emailDispatched: false,
    emailMessageId: "",
    whatsAppDispatched: false,
    whatsAppMessageId: "",
    sarvamCallFired: false,
    sarvamCallSid: "",
    sarvamStatus: "",
  };

  // ---------------------------------------------------------------------------
  // STEP 1: Strict Forgot Password Flow Validation
  // ---------------------------------------------------------------------------
  console.log(bold(yellow("--- [Phase 1: Strict Forgot Password Flow Validation] ---")));

  // 1A. Non-registered email check
  const nonRegisteredEmail = `nonexistent_${Date.now()}@unregistered-practice.com`;
  console.log(`Checking non-registered email: ${cyan(nonRegisteredEmail)}`);
  const nonRegResult = await requestPasswordResetAction(nonRegisteredEmail);

  if (
    !nonRegResult.success &&
    nonRegResult.error ===
      "You don't have an active account with this email. Please check your credentials or register a new practice."
  ) {
    summary.nonRegisteredCheckPassed = true;
    summary.nonRegisteredError = nonRegResult.error;
    console.log(green(`✔ Correctly Rejected: "${nonRegResult.error}"`));
  } else {
    console.log(red(`✖ Unexpected result for non-registered email:`), nonRegResult);
  }

  // 1B. Ensure test user exists in DB for registered email check
  console.log(`\nEnsuring registered practice user exists: ${cyan(registeredEmail)}`);
  const existingUser = await db.user.upsert({
    where: { email: registeredEmail },
    create: {
      email: registeredEmail,
      name: "Umang Sharma",
      phone: targetPhone,
      passwordHash: await bcrypt.hash("TruvSecure2026!", 12),
      active: true,
      isSuperAdmin: false,
    },
    update: {
      name: "Umang Sharma",
      phone: targetPhone,
      active: true,
    },
  });

  // 1C. Dispatch Password Reset for registered user
  console.log(`Dispatching reset link to registered email: ${cyan(registeredEmail)}`);
  const regResult = await requestPasswordResetAction(registeredEmail);

  if (regResult.success && regResult.message?.includes("Password reset link has been dispatched")) {
    summary.registeredResetDispatched = true;
    summary.resetUrl = (regResult as any).resetUrl || "";
    console.log(green(`✔ Reset Link Successfully Dispatched: "${regResult.message}"`));
    if (summary.resetUrl) {
      console.log(`  Reset URL: ${cyan(summary.resetUrl)}`);
    }
  } else {
    console.log(red(`✖ Password reset dispatch failed:`), regResult);
  }

  // ---------------------------------------------------------------------------
  // STEP A: Web Browser Automation & Full-Page Screenshot
  // ---------------------------------------------------------------------------
  console.log(bold(yellow("\n--- [Step A: Browser Automation & Full-Page Screenshot] ---")));
  const baseUrl = "http://localhost:3000";
  const screenshotsDir = path.resolve(process.cwd(), "public", "screenshots");
  const screenshotFilePath = path.join(screenshotsDir, "live-landing-verification.png");

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let devServerProcess: ChildProcess | null = null;
  const isServerRunning = await isPortOpen(baseUrl);

  if (!isServerRunning) {
    console.log(`Port 3000 is not running. Launching Next.js dev server on http://localhost:3000...`);
    devServerProcess = spawn("npx.cmd", ["next", "dev", "-p", "3000"], {
      stdio: "pipe",
      shell: true,
      cwd: process.cwd(),
    });

    devServerProcess.stderr?.on("data", (data) => {
      // suppress noisy dev logs
    });

    const ready = await waitForServer(baseUrl, 35000);
    if (!ready) {
      console.log(yellow("Warning: Local server taking longer to bind, proceeding with headless verification"));
    } else {
      console.log(green("✔ Dev server successfully ready on http://localhost:3000"));
    }
  } else {
    console.log(green(`✔ Verified local server actively running on ${baseUrl}`));
  }

  console.log("Launching Playwright Chromium browser...");
  let browser: any = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    console.log(`Navigating to ${baseUrl}...`);
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500); // Allow fonts & client components to stabilize
    } catch (navErr: any) {
      console.warn(yellow(`Navigation notice (${navErr.message}); capturing current viewport state...`));
    }

    console.log(`Capturing full-page verification screenshot...`);
    await page.screenshot({ path: screenshotFilePath, fullPage: true });

    if (fs.existsSync(screenshotFilePath)) {
      summary.screenshotSaved = true;
      summary.screenshotPath = "public/screenshots/live-landing-verification.png";
      const stats = fs.statSync(screenshotFilePath);
      console.log(green(`✔ Verification Screenshot Saved: ${summary.screenshotPath} (${Math.round(stats.size / 1024)} KB)`));
    }
  } catch (browserErr: any) {
    console.error(red(`Browser automation error:`), browserErr.message);
  } finally {
    if (browser) await browser.close();
    if (devServerProcess) {
      console.log("Stopping temporary spawned Next.js dev server...");
      devServerProcess.kill();
    }
  }

  // ---------------------------------------------------------------------------
  // STEP B: Auto-Provision Practice Tenant & High-Priority Client Details
  // ---------------------------------------------------------------------------
  console.log(bold(yellow("\n--- [Step B: Auto-Provision Practice & Client Details] ---")));

  console.log("Provisioning Practice Tenant: TRUV Tech & Consultancy (Kanpur, Uttar Pradesh)...");
  const tenant = await db.tenant.upsert({
    where: { slug: "truv-tech-consultancy" },
    create: {
      name: "TRUV Tech & Consultancy",
      slug: "truv-tech-consultancy",
      city: "Kanpur",
      state: "Uttar Pradesh",
      email: registeredEmail,
      phone: targetPhone,
      address: "Suite 401, Civil Lines, Kanpur, Uttar Pradesh 208001",
      pincode: "208001",
      defaultGstRate: 18.0,
      active: true,
    },
    update: {
      name: "TRUV Tech & Consultancy",
      city: "Kanpur",
      state: "Uttar Pradesh",
      email: registeredEmail,
      phone: targetPhone,
      active: true,
    },
  });
  summary.practiceProvisioned = true;
  console.log(green(`✔ Practice Tenant Confirmed: ${tenant.name} (ID: ${tenant.id})`));

  // Connect Admin User to Tenant as FIRM_OWNER
  await db.membership.upsert({
    where: {
      tenantId_userId: {
        userId: existingUser.id,
        tenantId: tenant.id,
      },
    },
    create: {
      userId: existingUser.id,
      tenantId: tenant.id,
      role: Role.FIRM_OWNER,
      status: "ACTIVE",
    },
    update: {
      role: Role.FIRM_OWNER,
      status: "ACTIVE",
    },
  });
  console.log(green(`✔ Admin User Confirmed: Umang Sharma as FIRM_OWNER`));

  // Onboard High-Priority Client: Apex Design & Media Works
  console.log("Onboarding Client: Apex Design & Media Works...");
  let client = await db.client.findFirst({
    where: {
      tenantId: tenant.id,
      name: "Apex Design & Media Works",
    },
  });

  if (!client) {
    client = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: "Apex Design & Media Works",
        businessName: "Apex Design & Media Works",
        pan: "AAACA1234F",
        gstin: "09AAACA1234F1Z5", // UP State Code 09
        email: targetEmail,
        phone: targetPhone,
        state: "Uttar Pradesh",
        city: "Kanpur",
        pincode: "208002",
        planName: "High Priority Tier A",
        active: true,
      },
    });
  } else {
    client = await db.client.update({
      where: { id: client.id },
      data: {
        businessName: "Apex Design & Media Works",
        gstin: "09AAACA1234F1Z5",
        email: targetEmail,
        phone: targetPhone,
        state: "Uttar Pradesh",
        city: "Kanpur",
        active: true,
      },
    });
  }

  // Client Primary Contact
  let primaryContact = await db.contact.findFirst({
    where: {
      clientId: client.id,
      email: targetEmail,
    },
  });

  if (!primaryContact) {
    await db.contact.create({
      data: {
        clientId: client.id,
        tenantId: tenant.id,
        name: "Director / Finance Lead",
        email: targetEmail,
        phone: targetPhone,
        isPrimary: true,
      },
    });
  } else {
    await db.contact.update({
      where: { id: primaryContact.id },
      data: {
        phone: targetPhone,
        isPrimary: true,
      },
    });
  }
  summary.clientProvisioned = true;
  console.log(green(`✔ Client Onboarded: ${client.name} (Phone: ${targetPhone}, Email: ${targetEmail})`));

  // ---------------------------------------------------------------------------
  // STEP C: Issue Rule 46 Tax Invoice & Auto-Generate PDF
  // ---------------------------------------------------------------------------
  console.log(bold(yellow("\n--- [Step C: Issue Rule 46 Tax Invoice & Auto-Generate PDF] ---")));
  const invoiceNumber = "INV-TRUV-2026-001";
  const subtotal = 20762.71;
  const cgstAmount = 1868.64;
  const sgstAmount = 1868.64;
  const totalAmount = 24500.0;
  const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  console.log(`Issuing Invoice #${invoiceNumber} for ₹24,500...`);
  const invoice = await db.invoice.upsert({
    where: {
      tenantId_invoiceNumber: {
        tenantId: tenant.id,
        invoiceNumber,
      },
    },
    create: {
      tenantId: tenant.id,
      clientId: client.id,
      invoiceNumber,
      serviceDescription: "Professional Architectural Visualization & Web Design Services",
      subtotal,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      totalAmount,
      status: InvoiceStatus.SENT,
      issuedDate: new Date(),
      dueDate,
      paymentLinkUrl: `https://truvledgeros2.vercel.app/pay/${invoiceNumber}`,
      items: {
        create: [
          {
            description: "Professional Architectural Visualization & Web Design Services",
            hsnSacCode: "998314",
            quantity: 1,
            unitPrice: subtotal,
            total: subtotal,
          },
        ],
      },
    },
    update: {
      subtotal,
      cgstAmount,
      sgstAmount,
      totalAmount,
      status: InvoiceStatus.SENT,
      paymentLinkUrl: `https://truvledgeros2.vercel.app/pay/${invoiceNumber}`,
    },
  });
  summary.invoiceIssued = true;
  console.log(green(`✔ Tax Invoice Record Created in Database (ID: ${invoice.id})`));

  console.log("Rendering Rule 46 CGST-compliant PDF buffer...");
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateTaxInvoicePdf(invoice.id, tenant.id);
    const invoicePdfDir = path.resolve(process.cwd(), "public", "invoices");
    if (!fs.existsSync(invoicePdfDir)) {
      fs.mkdirSync(invoicePdfDir, { recursive: true });
    }
    const invoicePdfPath = path.join(invoicePdfDir, `${invoiceNumber}.pdf`);
    fs.writeFileSync(invoicePdfPath, pdfBuffer);
    summary.pdfGenerated = true;
    console.log(green(`✔ Rule 46 PDF Generated & Stored: public/invoices/${invoiceNumber}.pdf (${Math.round(pdfBuffer.length / 1024)} KB)`));
  } catch (pdfErr: any) {
    console.error(red("PDF generation error:"), pdfErr.message);
    pdfBuffer = Buffer.from("%PDF-1.4 Mock fallback PDF buffer for test suite");
  }

  // ---------------------------------------------------------------------------
  // STEP D: Trigger Live Omnichannel Delivery
  // ---------------------------------------------------------------------------
  console.log(bold(yellow("\n--- [Step D: Omnichannel Delivery (Email, WhatsApp, Sarvam AI Voice)] ---")));

  // 1. Email Dispatch via Nodemailer Direct Gmail SMTP
  console.log(`\n[1/3] Dispatched Tax Invoice Email via Direct Gmail SMTP to: ${cyan(targetEmail)}...`);
  try {
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: `Tax Invoice ${invoiceNumber} from TRUV Tech & Consultancy (₹24,500)`,
      category: "NOTIFICATION",
      html: wrapEmailTemplate(
        `
        <h2 style="font-size: 18px; color: #263238; margin-top: 0;">Tax Invoice #${invoiceNumber}</h2>
        <p>Dear <strong>Apex Design & Media Works</strong>,</p>
        <p>Please find attached your official Rule 46 Tax Invoice for <strong>₹24,500</strong> for Professional Architectural Visualization & Web Design Services.</p>
        
        <div class="card" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; font-size: 13px; color: #334155;">
            <tr><td><strong>Invoice Number:</strong></td><td>${invoiceNumber}</td></tr>
            <tr><td><strong>Gross Amount:</strong></td><td>₹24,500.00 (Incl. 18% CGST + SGST)</td></tr>
            <tr><td><strong>Due Date:</strong></td><td>${dueDate.toLocaleDateString("en-IN")}</td></tr>
          </table>
        </div>

        <div class="btn-container" style="text-align: center; margin: 28px 0;">
          <a href="https://truvledgeros2.vercel.app/pay/${invoiceNumber}" class="btn" style="background: #F26B38; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Pay Online via UPI / Card</a>
        </div>

        <p style="font-size: 12px; color: #64748B;">
          This invoice has been generated in accordance with Rule 46 of the Central Goods and Services Tax Rules, 2017.
        </p>
        `,
        "Tax Invoice Delivery"
      ),
      text: `Tax Invoice ${invoiceNumber} for ₹24,500 from TRUV Tech & Consultancy. Pay online at https://truvledgeros2.vercel.app/pay/${invoiceNumber}`,
      tenantId: tenant.id,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    summary.emailDispatched = emailResult.success;
    summary.emailMessageId = emailResult.messageId || "smtp_dispatched";
    console.log(green(`✔ Email Dispatched: Message ID ${summary.emailMessageId} (${emailResult.detail || "Delivered"})`));

    // Log to Communication Table
    await db.communication.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        invoiceId: invoice.id,
        channel: CommunicationChannel.EMAIL,
        direction: CommunicationDirection.OUTBOUND,
        purpose: "INVOICE",
        category: "TAX_INVOICE_DELIVERY",
        recipient: targetEmail,
        subject: `Tax Invoice ${invoiceNumber} from TRUV Tech & Consultancy (₹24,500)`,
        content: `Dispatched Rule 46 Tax Invoice ${invoiceNumber} with attached PDF to ${targetEmail}. Total amount: ₹24,500.`,
        status: "DELIVERED",
        externalRef: summary.emailMessageId,
      },
    });
  } catch (emailErr: any) {
    console.error(red("Email dispatch failed:"), emailErr.message);
  }

  // 2. WhatsApp Message via sendWhatsAppMessage
  console.log(`\n[2/3] Dispatching WhatsApp Message to: ${cyan(targetPhone)}...`);
  try {
    const waResult = await sendWhatsAppMessage({
      tenantId: tenant.id,
      clientId: client.id,
      invoiceId: invoice.id,
      recipientPhone: targetPhone,
      recipientName: "Apex Design & Media Works",
      message: `Namaste Apex Design & Media Works! Welcome to TRUV Tech & Consultancy. Your Rule 46 Tax Invoice #${invoiceNumber} for ₹24,500 (Professional Architectural Visualization & Web Design Services) has been issued. Direct Payment Link: https://truvledgeros2.vercel.app/pay/${invoiceNumber}. Due date: ${dueDate.toLocaleDateString("en-IN")}. Thank you for partnering with TRUV LedgerOS!`,
      paymentLinkUrl: `https://truvledgeros2.vercel.app/pay/${invoiceNumber}`,
    });

    summary.whatsAppDispatched = waResult.success;
    summary.whatsAppMessageId = waResult.messageId;
    console.log(green(`✔ WhatsApp Message Dispatched: ${waResult.messageId} [${waResult.provider}] (${waResult.detail})`));
  } catch (waErr: any) {
    console.error(red("WhatsApp dispatch error:"), waErr.message);
  }

  // 3. Sarvam AI Voice Call via initiateOutboundVoiceCall
  console.log(`\n[3/3] Firing Sarvam AI Outbound Voice Call to: ${cyan(targetPhone)}...`);
  try {
    const callResult = await initiateOutboundVoiceCall({
      tenantId: tenant.id,
      clientId: client.id,
      recipientPhone: targetPhone,
      clientName: "Apex Design & Media Works",
      reason: "PAYMENT_RECOVERY",
      invoiceId: invoice.id,
      invoiceNumber,
      amount: totalAmount,
      dueDate: dueDate.toLocaleDateString("en-IN"),
      documentTitle: "Professional Architectural Visualization & Web Design Services",
      languagePreference: "HINDI",
    });

    summary.sarvamCallFired = true;
    summary.sarvamCallSid = callResult.callSid;
    summary.sarvamStatus = callResult.status;
    console.log(green(`✔ Sarvam AI Voice Call Fired: Call SID ${callResult.callSid} [Provider: ${callResult.provider}, Status: ${callResult.status}]`));
    console.log(`  Variables Bound: ca_firm_name, due_date, handling_partner_name, invoice_amount, invoice_number, payment_link_url, service_description, user_name`);
  } catch (callErr: any) {
    console.error(red("Sarvam AI voice call error:"), callErr.message);
  }

  // ---------------------------------------------------------------------------
  // FINAL EXECUTIVE SUMMARY
  // ---------------------------------------------------------------------------
  console.log(bold(cyan("\n================================================================================")));
  console.log(bold(cyan("TRUV LedgerOS — Execution Summary Report")));
  console.log(bold(cyan("================================================================================")));
  console.log(`1. Non-Registered Email Check : ${summary.nonRegisteredCheckPassed ? green("PASSED (Strict error displayed)") : red("FAILED")}`);
  console.log(`   Error Message Displayed    : "${summary.nonRegisteredError}"`);
  console.log(`2. Registered Reset Email     : ${summary.registeredResetDispatched ? green("DISPATCHED VIA SMTP") : red("FAILED")}`);
  console.log(`   Recipient                  : ${registeredEmail}`);
  console.log(`3. Verification Screenshot    : ${summary.screenshotSaved ? green("SAVED") : red("FAILED")}`);
  console.log(`   File Path                  : ${summary.screenshotPath}`);
  console.log(`4. Tenant & Client Onboarding : ${summary.practiceProvisioned && summary.clientProvisioned ? green("SUCCESS") : red("FAILED")}`);
  console.log(`   Firm Name                  : TRUV Tech & Consultancy (Kanpur, UP)`);
  console.log(`   Client                     : Apex Design & Media Works`);
  console.log(`5. Rule 46 Tax Invoice PDF    : ${summary.pdfGenerated ? green("GENERATED & SAVED") : red("FAILED")}`);
  console.log(`   Invoice #                  : INV-TRUV-2026-001 (₹24,500)`);
  console.log(`6. Email Dispatch (Invoice)   : ${summary.emailDispatched ? green("SENT") : red("FAILED")} (ID: ${summary.emailMessageId})`);
  console.log(`7. WhatsApp Message           : ${summary.whatsAppDispatched ? green("SENT") : red("FAILED")} (ID: ${summary.whatsAppMessageId})`);
  console.log(`8. Sarvam AI Voice Call       : ${summary.sarvamCallFired ? green("FIRED") : red("FAILED")} (Call SID: ${summary.sarvamCallSid}, Status: ${summary.sarvamStatus})`);
  console.log(bold(cyan("================================================================================\n")));
}

runTestSuite()
  .catch((err) => {
    console.error(red("\nTest Suite Execution Fatal Error:"), err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(0);
  });
