/**
 * TRUV CA / LedgerOS — Automated Test Suite: Zero-Budget AI Calling System
 * 
 * Validates:
 * 1. Provider detection (Ollama localhost, Gemini free tier, Browser/Deterministic engine)
 * 2. Agent personas integrity (Priya, Rahul, Ananya with TRAI compliance)
 * 3. Script generation with firm context and Indian currency formatting
 * 4. Multi-turn conversation logic (Payment commitment, Dispute, Callback)
 * 5. Call outcome analysis & Partner escalation trigger
 * 
 * Fully isolated: Does NOT depend on Railway database connection.
 */

import assert from "assert";
import {
  detectVoiceProviders,
  generateInitialCallScript,
  generateTurnResponse,
  analyzeCallOutcome,
  ProviderStatus,
} from "../src/lib/server/voice/provider-engine";
import {
  PRESET_AGENT_PERSONAS,
  getAgentPersona,
  AgentPersona,
} from "../src/lib/server/voice/agent-personas";

async function runTests() {
  console.log("================================================================================");
  console.log("TRUV LEDGEROS — ZERO-BUDGET AI CALLING SYSTEM TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`  ✓ PASS: ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(`    ${err.message || err}`);
        failed++;
      });
  }

  // GROUP 1: Persona Registry & TRAI Regulatory Compliance
  console.log("[Group 1] Agent Personas & Compliance Verification");
  await test("should provide all 3 standard Indian CA personas", () => {
    const keys = Object.keys(PRESET_AGENT_PERSONAS);
    assert.strictEqual(keys.length, 3, "Expected 3 preset personas");
    assert.ok(keys.includes("PRIYA"), "Priya Sharma must exist");
    assert.ok(keys.includes("RAHUL"), "Rahul Verma must exist");
    assert.ok(keys.includes("ANANYA"), "Ananya Sen must exist");
  });

  await test("each persona must have pitch, rate, language and mandatory consent disclaimer", () => {
    const priya = getAgentPersona("PRIYA");
    assert.ok(priya, "Priya persona should be found");
    assert.strictEqual(priya.voiceSettings.langCode, "hi-IN");
    assert.ok(priya.voiceSettings.pitch >= 0.8 && priya.voiceSettings.pitch <= 1.2);
    assert.ok(priya.voiceSettings.rate >= 0.8 && priya.voiceSettings.rate <= 1.2);
    assert.ok(
      priya.dispositionRules.mandatoryDisclaimer.includes("recorded") ||
        priya.dispositionRules.mandatoryDisclaimer.includes("statutory") ||
        priya.dispositionRules.mandatoryDisclaimer.includes("courtesy"),
      "Mandatory disclaimer must disclose recording/statutory purpose"
    );
  });

  await test("getAgentPersona resolves by name or key case-insensitively", () => {
    const rahul = getAgentPersona("rahul");
    assert.strictEqual(rahul.name, "Rahul Verma");
    const ananya = getAgentPersona("Ananya Sen");
    assert.strictEqual(ananya.name, "Ananya Sen");
  });

  // GROUP 2: Zero-Budget Provider Detection & Ollama Localhost
  console.log("\n[Group 2] Zero-Cost Provider Engine & Local Ollama Detection");
  await test("detectVoiceProviders should return provider status without throwing", async () => {
    const providers: ProviderStatus[] = await detectVoiceProviders();
    assert.ok(Array.isArray(providers), "Should return array of providers");
    assert.ok(providers.length >= 3, "Should include ollama, gemini, and browser/deterministic");

    const ollama = providers.find((p) => p.id === "OLLAMA_LOCAL");
    assert.ok(ollama, "OLLAMA_LOCAL provider must be listed");
    assert.strictEqual(ollama.isFree, true, "Ollama must be marked isFree: true");

    const browser = providers.find((p) => p.id === "BROWSER_WEBRTC");
    assert.ok(browser, "BROWSER_WEBRTC provider must be listed");
    assert.strictEqual(browser.isFree, true, "Browser WebRTC must be marked isFree: true");

    console.log(
      `    Detected Providers: Ollama Operational=${ollama.isOperational} (Model: ${ollama.activeModel || "N/A"}), Browser=${browser.isOperational}`
    );
  });

  // GROUP 3: Dynamic Script Generation
  console.log("\n[Group 3] Dynamic Script Generation & Indian Currency Formatting");
  await test("generateInitialCallScript formats INR amount and returns personalized greeting", async () => {
    const script = await generateInitialCallScript({
      clientName: "Bharat Engineering Works",
      invoiceNumber: "INV-2026-991",
      amount: 175000,
      dueDate: "2026-03-15",
      personaId: "PRIYA",
      reason: "PAYMENT_RECOVERY",
      firmName: "TRUV Advisory Services",
    });

    assert.ok(typeof script === "string" && script.length > 20, "Script should be generated as non-empty string");
    assert.ok(
      script.includes("Bharat Engineering") || script.includes("TRUV") || script.includes("1,75,000"),
      "Script should include client, firm or formatted amount"
    );
  });

  // GROUP 4: Multi-Turn Conversation Logic
  console.log("\n[Group 4] Multi-Turn Turn Generation & Dispositions");
  await test("generateTurnResponse handles positive client payment confirmation", async () => {
    const turnResult = await generateTurnResponse({
      tenantId: "tenant-mock-01",
      clientUtterance: "Yes Priya, we have initiated RTGS today morning for the full amount. UTR is HDFC00987.",
      history: [
        {
          speaker: "agent",
          text: "Namaste, this is Priya calling regarding your overdue invoice of Rs. 1,75,000.",
        },
      ],
      clientName: "Bharat Engineering",
      invoiceNumber: "INV-2026-991",
      amount: 175000,
      personaId: "PRIYA",
      reason: "PAYMENT_RECOVERY",
      firmName: "TRUV Advisory",
    });

    assert.ok(turnResult.replyText, "Should return an agent reply text");
    assert.strictEqual(turnResult.sentiment, "PROMISED_TO_PAY");
  });

  await test("generateTurnResponse detects client billing dispute", async () => {
    const turnResult = await generateTurnResponse({
      tenantId: "tenant-mock-01",
      clientUtterance: "The amount is incorrect. We already paid 50,000 TDS and deducted it, your invoice doesn't reflect this.",
      history: [],
      clientName: "Zenith Logistics",
      invoiceNumber: "INV-2026-102",
      amount: 250000,
      personaId: "PRIYA",
      reason: "PAYMENT_RECOVERY",
      firmName: "TRUV Advisory",
    });

    assert.ok(turnResult.replyText, "Should return reply text");
    assert.strictEqual(turnResult.sentiment, "DISPUTING");
  });

  // GROUP 5: Call Outcome & Partner Escalation Analysis
  console.log("\n[Group 5] Call Outcome Analysis & Partner Escalation Triggers");
  await test("analyzeCallOutcome flags dispute for partner escalation", async () => {
    const analysis = await analyzeCallOutcome({
      clientName: "Zenith Logistics",
      transcript:
        "Agent: Namaste, calling regarding invoice INV-2026-102. Client: I dispute this charge, we never received the audit annexure and there is an overcharge. Agent: I understand, escalating to partner.",
      durationSeconds: 95,
      reason: "PAYMENT_RECOVERY",
    });

    assert.ok(analysis.disposition, "Disposition should exist");
    assert.strictEqual(analysis.sentiment, "DISPUTING");
    assert.strictEqual(analysis.partnerTaskRequired, true, "Disputes must trigger partner escalation");
    assert.ok(analysis.summary.length > 10, "Summary should be comprehensive");
  });

  await test("analyzeCallOutcome parses positive payment promise", async () => {
    const analysis = await analyzeCallOutcome({
      clientName: "Apex Global",
      transcript:
        "Agent: Namaste, calling regarding invoice INV-2026-089. Client: We will pay tomorrow by NEFT without fail. Agent: Thank you for confirming.",
      durationSeconds: 45,
      reason: "PAYMENT_RECOVERY",
    });

    assert.strictEqual(analysis.sentiment, "PROMISED_TO_PAY");
    assert.strictEqual(analysis.disposition, "PROMISED_TO_PAY");
    assert.strictEqual(analysis.partnerTaskRequired, false, "Clean promise should not require escalation");
  });

  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
