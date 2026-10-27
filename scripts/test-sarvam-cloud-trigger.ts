/**
 * TRUV LedgerOS — Standalone Network-Agnostic Sarvam Telephony Test Script
 * 
 * Provides a dual-mode CLI test runner for autonomous voice calling:
 * - Mode A: Direct HTTPS dispatch to official Sarvam AI API Gateway (for mobile hotspot/cloud runs)
 * - Mode B: Dispatches via TRUV LedgerOS cloud-safe route (/api/voice/trigger)
 * 
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/test-sarvam-cloud-trigger.ts --mode=A
 *   npx ts-node -r tsconfig-paths/register scripts/test-sarvam-cloud-trigger.ts --mode=B
 *   $env:TEST_CALL_PHONE="+919555572070"; npx ts-node -r tsconfig-paths/register scripts/test-sarvam-cloud-trigger.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

// ANSI Terminal Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

interface CommandLineArgs {
  mode: "A" | "B";
  phone: string;
  clientName: string;
  amount: string;
  invoiceNumber: string;
  baseUrl: string;
}

function parseCommandLine(): CommandLineArgs {
  const args = process.argv.slice(2);
  let mode: "A" | "B" = "A";
  let phone = process.env.TEST_CALL_PHONE || "919555572070";
  let clientName = "Umang Sharma";
  let amount = "₹18,500";
  let invoiceNumber = "INV-2026-LIVE-001";
  let baseUrl = process.env.TEST_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1]?.toUpperCase();
      if (val === "B" || val === "ROUTE" || val === "CLOUD") {
        mode = "B";
      } else {
        mode = "A";
      }
    } else if (arg.startsWith("--phone=")) {
      phone = arg.split("=")[1];
    } else if (arg.startsWith("--client=")) {
      clientName = arg.split("=")[1];
    } else if (arg.startsWith("--amount=")) {
      amount = arg.split("=")[1];
    } else if (arg.startsWith("--invoice=")) {
      invoiceNumber = arg.split("=")[1];
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.split("=")[1];
    } else if (arg === "-b" || arg === "-B") {
      mode = "B";
    } else if (arg === "-a" || arg === "-A") {
      mode = "A";
    }
  }

  // Check env variable for mode if not explicitly set in args
  if (!args.some((a) => a.startsWith("--mode=") || a === "-a" || a === "-b")) {
    const envMode = process.env.SARVAM_TEST_MODE?.toUpperCase();
    if (envMode === "B" || envMode === "ROUTE") {
      mode = "B";
    }
  }

  return { mode, phone, clientName, amount, invoiceNumber, baseUrl };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length > 10 && digits.endsWith(digits.slice(-10))) {
    return `+91${digits.slice(-10)}`;
  }
  return `+${digits}`;
}

async function runTest() {
  const config = parseCommandLine();
  const targetPhone = normalizePhone(config.phone);

  const sarvamApiKey = process.env.SARVAM_API_KEY?.trim() || process.env.VOICE_PROVIDER_API_KEY?.trim();
  const sarvamAgentId = process.env.SARVAM_AGENT_ID?.trim() || process.env.VOICE_AGENT_ID?.trim();

  console.log(`\n${CYAN}====================================================================${RESET}`);
  console.log(`${BOLD}${MAGENTA} TRUV LedgerOS — Sarvam AI Autonomous Telephony Test Harness ${RESET}`);
  console.log(`${CYAN}====================================================================${RESET}\n`);

  console.log(`${BOLD}Configuration & Runtime Parameters:${RESET}`);
  console.log(`  ${DIM}Execution Mode:${RESET}   ${BOLD}${config.mode === "A" ? `${GREEN}Mode A (Direct Sarvam AI HTTPS Gateway)` : `${YELLOW}Mode B (Cloud-Safe Route /api/voice/trigger)`}${RESET}`);
  console.log(`  ${DIM}Target Phone:${RESET}     ${CYAN}${targetPhone}${RESET}`);
  console.log(`  ${DIM}Client Name:${RESET}      ${config.clientName}`);
  console.log(`  ${DIM}Invoice Number:${RESET}   ${config.invoiceNumber}`);
  console.log(`  ${DIM}Amount:${RESET}           ${config.amount}`);
  console.log(`  ${DIM}Sarvam Agent ID:${RESET}  ${sarvamAgentId || `${RED}Missing${RESET}`}`);
  console.log(`  ${DIM}Sarvam API Key:${RESET}   ${sarvamApiKey ? `${sarvamApiKey.slice(0, 10)}...` : `${RED}Missing${RESET}`}`);
  if (config.mode === "B") {
    console.log(`  ${DIM}Target Endpoint:${RESET}  ${config.baseUrl}/api/voice/trigger`);
  }

  // 8-variable strict contract
  const variables = {
    ca_firm_name: "TRUV Advisory & Tax Partners",
    due_date: "05-11-2026",
    handling_partner_name: "Umang Sharma",
    invoice_amount: config.amount.startsWith("₹") ? config.amount : `₹${config.amount}`,
    invoice_number: config.invoiceNumber,
    payment_link_url: "https://truvledgeros2.vercel.app/pay/test-001",
    service_description: "Quarterly CA Retainer & GST Tax Compliance",
    user_name: config.clientName,
  };

  console.log(`\n${BOLD}Strict 8-Variable Payload Binding Confirmation:${RESET}`);
  console.log(`${DIM}${JSON.stringify(variables, null, 2)}${RESET}\n`);

  if (config.mode === "A") {
    // -------------------------------------------------------------
    // MODE A: DIRECT HTTPS DISPATCH TO SARVAM AI
    // -------------------------------------------------------------
    console.log(`${YELLOW}>>> Launching Mode A: Direct HTTPS fetch to Sarvam AI...${RESET}`);

    if (!sarvamApiKey || !sarvamAgentId) {
      console.error(`${RED}[ERROR] SARVAM_API_KEY or SARVAM_AGENT_ID is not configured in .env${RESET}`);
      process.exit(1);
    }

    const payload = {
      agent_id: sarvamAgentId,
      phone_number: targetPhone,
      variables,
    };

    const endpoint = "https://api.sarvam.ai/voice/agent/calls";
    console.log(`  ${DIM}POST URL:${RESET} ${endpoint}`);

    try {
      const startTime = Date.now();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": sarvamApiKey,
        },
        body: JSON.stringify(payload),
      });

      const elapsed = Date.now() - startTime;
      const responseText = await res.text();
      let responseJson: any = {};
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { raw: responseText };
      }

      console.log(`\n${BOLD}Server Response:${RESET}`);
      console.log(`  ${DIM}HTTP Status:${RESET}     ${res.ok ? `${GREEN}${res.status} OK` : `${RED}${res.status} ${res.statusText}`}${RESET} (${elapsed}ms)`);

      const callSid = responseJson.call_id || responseJson.callSid || responseJson.id;
      if (callSid) {
        console.log(`  ${DIM}Call SID:${RESET}        ${BOLD}${GREEN}${callSid}${RESET}`);
      }

      console.log(`  ${DIM}Raw Body:${RESET}        ${responseText.slice(0, 400)}`);

      if (res.ok) {
        console.log(`\n${BOLD}${GREEN}✔ SARVAM AI CALL DISPATCHED SUCCESSFULLY!${RESET}`);
        console.log(`${GREEN}Client ${targetPhone} should receive an automated phone call shortly.${RESET}\n`);
      } else {
        console.log(`\n${BOLD}${YELLOW}⚠ Sarvam AI returned a non-200 status code.${RESET}`);
        console.log(`${YELLOW}Check agent id, variable schema or remaining credit balance.${RESET}\n`);
      }
    } catch (err: any) {
      console.log(`\n${BOLD}${RED}✖ Direct Fetch Network Exception:${RESET}`);
      console.log(`  ${RED}${err.message}${RESET}`);
      console.log(`  ${DIM}Detail:${RESET} ${err?.cause?.message || "No cause info"}`);
      console.log(`\n${YELLOW}Note: If your local ISP is blocking outbound telephony requests, use Mode B against deployed cloud route:${RESET}`);
      console.log(`${CYAN}  npx ts-node -r tsconfig-paths/register scripts/test-sarvam-cloud-trigger.ts --mode=B --url=https://truvledgeros2.vercel.app${RESET}\n`);
    }
  } else {
    // -------------------------------------------------------------
    // MODE B: TRIGGER VIA CLOUD-SAFE API ROUTE
    // -------------------------------------------------------------
    const targetUrl = `${config.baseUrl}/api/voice/trigger`;
    console.log(`${YELLOW}>>> Launching Mode B: Calling Cloud Route ${targetUrl}...${RESET}`);

    const payload = {
      phone: targetPhone,
      clientName: config.clientName,
      amount: config.amount,
      invoiceNumber: config.invoiceNumber,
      dueDate: variables.due_date,
      serviceDescription: variables.service_description,
      paymentLinkUrl: variables.payment_link_url,
      handlingPartnerName: variables.handling_partner_name,
      caFirmName: variables.ca_firm_name,
    };

    const secretKey =
      process.env.INTERNAL_API_SECRET ||
      process.env.CRON_SECRET ||
      sarvamApiKey ||
      process.env.ENCRYPTION_KEY ||
      "";

    try {
      const startTime = Date.now();
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": secretKey,
          ...(sarvamApiKey ? { "api-subscription-key": sarvamApiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      const elapsed = Date.now() - startTime;
      const responseText = await res.text();
      let responseJson: any = {};
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { raw: responseText };
      }

      console.log(`\n${BOLD}Server Response:${RESET}`);
      console.log(`  ${DIM}HTTP Status:${RESET}     ${res.ok ? `${GREEN}${res.status} OK` : `${RED}${res.status} ${res.statusText}`}${RESET} (${elapsed}ms)`);
      console.log(`  ${DIM}Success Flag:${RESET}    ${responseJson.success ? `${GREEN}true` : `${RED}false`}${RESET}`);
      console.log(`  ${DIM}Call SID:${RESET}        ${BOLD}${CYAN}${responseJson.callSid || "N/A"}${RESET}`);
      console.log(`  ${DIM}Status:${RESET}          ${responseJson.status || "N/A"}`);
      console.log(`  ${DIM}Communication ID:${RESET} ${responseJson.communicationId || "N/A"}`);
      if (responseJson.diagnostics) {
        console.log(`  ${DIM}Diagnostics:${RESET}     ${responseJson.diagnostics}`);
      }
      if (responseJson.error) {
        console.log(`  ${DIM}Error Message:${RESET}   ${RED}${responseJson.error}${RESET}`);
      }

      if (responseJson.success) {
        console.log(`\n${BOLD}${GREEN}✔ CLOUD-SAFE ROUTE SUCCESSFULLY EXECUTED CALL!${RESET}\n`);
      } else {
        console.log(`\n${BOLD}${YELLOW}⚠ Cloud-safe route returned status: ${responseJson.status || "UNKNOWN"}${RESET}`);
        console.log(`${YELLOW}Diagnostics: ${responseJson.diagnostics || responseJson.error || "Check server logs"}${RESET}\n`);
      }
    } catch (err: any) {
      console.log(`\n${BOLD}${RED}✖ Mode B HTTP Fetch Exception:${RESET}`);
      console.log(`  ${RED}${err.message}${RESET}`);
      console.log(`\n${YELLOW}Make sure your local dev server or cloud endpoint is active at ${config.baseUrl}.${RESET}\n`);
    }
  }

  console.log(`${CYAN}====================================================================${RESET}\n`);
}

runTest().catch((err) => {
  console.error(`${RED}Fatal Execution Error:${RESET}`, err);
  process.exit(1);
});
