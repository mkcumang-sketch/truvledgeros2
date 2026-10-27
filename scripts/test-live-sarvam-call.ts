import * as dotenv from "dotenv";
dotenv.config();
import https from "https";

async function testDirectSarvamCall() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Sarvam AI Diagnostics & Outbound Dispatch");
  console.log("==================================================================\n");

  const sarvamApiKey = process.env.SARVAM_API_KEY?.trim();
  const sarvamAgentId = process.env.SARVAM_AGENT_ID?.trim();

  if (!sarvamApiKey || !sarvamAgentId) {
    console.error("ERROR: SARVAM_API_KEY ya SARVAM_AGENT_ID .env me missing hai!");
    process.exit(1);
  }

  let rawPhone = process.env.TEST_CALL_PHONE || "919555572070";
  let cleanedPhone = rawPhone.replace(/\D/g, "");
  if (cleanedPhone.length === 10) cleanedPhone = `91${cleanedPhone}`;
  const targetPhone = `+${cleanedPhone}`;

  console.log(`[AUTH] Agent ID: ${sarvamAgentId}`);
  console.log(`[TARGET] Calling Phone: ${targetPhone}`);

  const payload = {
    agent_id: sarvamAgentId,
    phone_number: targetPhone,
    variables: {
      ca_firm_name: "TRUV Advisory & Tax Partners",
      due_date: "05-11-2026",
      handling_partner_name: "Umang Sharma",
      invoice_amount: "₹18,500",
      invoice_number: "INV-2026-LIVE-001",
      payment_link_url: "https://truvledgeros2.vercel.app/pay/test-001",
      service_description: "Quarterly CA Retainer & GST Tax Compliance",
      user_name: "Umang Sharma",
    },
  };

  const candidateEndpoints = [
    "https://api.sarvam.ai/voice/agent/calls",
    "https://api.sarvam.ai/voice-agent/call",
    "https://api.sarvam.ai/v1/voice/agent/calls",
  ];

  for (const endpoint of candidateEndpoints) {
    console.log(`\n>>> Testing Endpoint: ${endpoint}`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": sarvamApiKey,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log(`HTTP Status: ${res.status}`);
      console.log(`Response: ${text.slice(0, 300)}`);

      if (res.ok) {
        console.log("\n CALL DISPATCHED SUCCESSFULLY!");
        return;
      }
    } catch (err: any) {
      console.log(`Fetch error on ${endpoint}: ${err?.cause?.message || err.message}`);
    }
  }
}

testDirectSarvamCall().catch(console.error);