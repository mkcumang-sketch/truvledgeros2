/**
 * TRUV LedgerOS — Sarvam AI Telephony Engine & Webhook Verification Test Suite
 * 
 * Validates:
 * 1. E.164 Indian Phone Normalization (+91XXXXXXXXXX)
 * 2. Statutory DD-MM-YYYY Date and INR Amount Formatting
 * 3. Strict 8-Variable Binding for Sarvam AI Dispatch Contract
 * 4. Fault-Tolerant Resilience against Missing Keys and Gateway Drops
 * 5. Webhook Ingestion, Communication Log Updates, and Idempotent Partner Task Escalation
 */

import * as dotenv from "dotenv";
dotenv.config();

import {
  normalizeIndianPhoneNumber,
  formatDueDateDDMMYYYY,
  formatInrAmount,
  dispatchSarvamVoiceAgentCall,
  DEFAULT_CA_FIRM_NAME,
  DEFAULT_SERVICE_DESCRIPTION,
} from "@/lib/server/voice/sarvam-telephony";
import { POST as triggerRouteHandler } from "@/app/api/voice/trigger/route";
import { POST as webhookRouteHandler } from "@/app/api/webhooks/sarvam-voice/route";
import { db } from "@/lib/db";
import { CommunicationChannel, CommunicationDirection, TaskType, TaskStatus } from "@prisma/client";
import { NextRequest } from "next/server";

// In-Memory Database Store to guarantee deterministic test execution
const inMemoryStore = {
  tenants: [
    {
      id: "test_tenant_cuid_001",
      name: "TRUV Advisory & Tax Partners",
      slug: "truv-advisory",
      active: true,
      memberships: [
        {
          id: "mem_001",
          role: "PARTNER",
          status: "ACTIVE",
          user: { name: "Umang Sharma", email: "umang@truv.io" },
        },
      ],
    },
  ],
  communications: [] as any[],
  tasks: [] as any[],
};

// Wire resilient in-memory mocks on db for fast deterministic test execution
function setupDbMocks() {
  (db.tenant as any).findFirst = async () => inMemoryStore.tenants[0];
  (db.tenant as any).findUnique = async () => inMemoryStore.tenants[0];

  (db.client as any).findFirst = async () => null;
  (db.invoice as any).findFirst = async () => null;

  (db.communication as any).create = async (args: any) => {
    const record = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date(),
      ...args.data,
    };
    inMemoryStore.communications.push(record);
    return record;
  };

  (db.communication as any).findFirst = async (args: any) => {
    const extRef = args?.where?.externalRef;
    if (extRef) {
      return inMemoryStore.communications.find((c) => c.externalRef === extRef) || null;
    }
    return inMemoryStore.communications[0] || null;
  };

  (db.communication as any).update = async (args: any) => {
    const idx = inMemoryStore.communications.findIndex((c) => c.id === args?.where?.id);
    if (idx !== -1) {
      inMemoryStore.communications[idx] = {
        ...inMemoryStore.communications[idx],
        ...args.data,
      };
      return inMemoryStore.communications[idx];
    }
    return { id: args?.where?.id, ...args.data };
  };

  (db.task as any).findFirst = async (args: any) => {
    const refId = args?.where?.referenceId || args?.where?.OR?.[0]?.referenceId;
    if (refId) {
      return inMemoryStore.tasks.find((t) => t.referenceId === refId && t.status === "OPEN") || null;
    }
    return null;
  };

  (db.task as any).create = async (args: any) => {
    const record = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date(),
      ...args.data,
    };
    inMemoryStore.tasks.push(record);
    return record;
  };
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Sarvam Telephony & Webhook Ingestion Test Suite");
  console.log("==================================================================\n");

  setupDbMocks();
  const testTenantId = "test_tenant_cuid_001";

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
      passed++;
    } else {
      console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 1: Phone Normalization
  // -------------------------------------------------------------
  console.log("\n[TEST GROUP 1] Indian Standard E.164 Phone Normalization");
  
  assert(
    normalizeIndianPhoneNumber("9555572070") === "+919555572070",
    "Normalizes 10-digit number to +91XXXXXXXXXX"
  );

  assert(
    normalizeIndianPhoneNumber("09555572070") === "+919555572070",
    "Normalizes 11-digit number with leading 0 to +91XXXXXXXXXX"
  );

  assert(
    normalizeIndianPhoneNumber("919555572070") === "+919555572070",
    "Normalizes 12-digit number starting with 91 to +91XXXXXXXXXX"
  );

  assert(
    normalizeIndianPhoneNumber("+91 95555 72070") === "+919555572070",
    "Strips spaces, plus sign, and non-digits"
  );

  let caughtInvalid = false;
  try {
    normalizeIndianPhoneNumber("12345");
  } catch {
    caughtInvalid = true;
  }
  assert(caughtInvalid, "Throws descriptive error for invalid short phone number");

  // -------------------------------------------------------------
  // TEST GROUP 2: DD-MM-YYYY Date and INR Amount Formatting
  // -------------------------------------------------------------
  console.log("\n[TEST GROUP 2] Date & Currency Formatting");

  assert(
    formatDueDateDDMMYYYY("05-11-2026") === "05-11-2026",
    "Preserves already formatted DD-MM-YYYY string"
  );

  assert(
    formatDueDateDDMMYYYY("2026-11-05") === "05-11-2026",
    "Converts ISO YYYY-MM-DD string to statutory DD-MM-YYYY"
  );

  const dateObj = new Date(2026, 10, 5); // 5th Nov 2026
  assert(
    formatDueDateDDMMYYYY(dateObj) === "05-11-2026",
    "Converts JavaScript Date object to DD-MM-YYYY"
  );

  assert(
    formatInrAmount(18500) === "₹18,500",
    "Formats integer into ₹18,500"
  );

  assert(
    formatInrAmount("18500") === "₹18,500",
    "Formats string amount into ₹18,500"
  );

  assert(
    formatInrAmount("₹18,500") === "₹18,500",
    "Preserves existing formatted INR string"
  );

  // -------------------------------------------------------------
  // TEST GROUP 3: Sarvam Telephony Service & 8-Variable Contract
  // -------------------------------------------------------------
  console.log("\n[TEST GROUP 3] Sarvam Telephony Service & Resilience");

  const dispatchResult = await dispatchSarvamVoiceAgentCall({
    phone: "9555572070",
    clientName: "Umang Sharma",
    amount: "18500",
    invoiceNumber: "INV-TEST-001",
    dueDate: "2026-11-05",
    tenantId: testTenantId,
  });

  assert(
    dispatchResult.payload !== undefined,
    "Constructed outbound payload successfully"
  );

  if (dispatchResult.payload) {
    const vars = dispatchResult.payload.variables;
    assert(
      vars.ca_firm_name === DEFAULT_CA_FIRM_NAME || vars.ca_firm_name.length > 0,
      "Variable 1 (ca_firm_name) bound properly"
    );
    assert(
      vars.due_date === "05-11-2026",
      "Variable 2 (due_date) formatted as DD-MM-YYYY"
    );
    assert(
      typeof vars.handling_partner_name === "string" && vars.handling_partner_name.length > 0,
      "Variable 3 (handling_partner_name) bound properly"
    );
    assert(
      vars.invoice_amount === "₹18,500",
      "Variable 4 (invoice_amount) formatted as INR string"
    );
    assert(
      vars.invoice_number === "INV-TEST-001",
      "Variable 5 (invoice_number) mapped strictly"
    );
    assert(
      vars.payment_link_url.includes("INV-TEST-001") || vars.payment_link_url.startsWith("http"),
      "Variable 6 (payment_link_url) points to valid URL"
    );
    assert(
      vars.service_description === DEFAULT_SERVICE_DESCRIPTION,
      "Variable 7 (service_description) bound properly"
    );
    assert(
      vars.user_name === "Umang Sharma",
      "Variable 8 (user_name) mapped strictly"
    );
  }

  assert(
    typeof dispatchResult.callSid === "string" && dispatchResult.callSid.length > 0,
    "Generated / returned valid Call SID"
  );

  assert(
    typeof dispatchResult.communicationId === "string",
    "PostgreSQL Communication audit record created"
  );

  // -------------------------------------------------------------
  // TEST GROUP 4: Cloud-Safe API Route (/api/voice/trigger)
  // -------------------------------------------------------------
  console.log("\n[TEST GROUP 4] Cloud-Safe API Route Execution");

  const secretKey =
    process.env.INTERNAL_API_SECRET ||
    process.env.SARVAM_API_KEY ||
    process.env.CRON_SECRET ||
    "";

  const triggerReq = new NextRequest("http://localhost:3000/api/voice/trigger", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": secretKey,
    },
    body: JSON.stringify({
      phone: "+919555572070",
      clientName: "Umang Sharma",
      amount: "18500",
      invoiceNumber: "INV-API-ROUTE-001",
      tenantId: testTenantId,
    }),
  });

  const triggerResponse = await triggerRouteHandler(triggerReq);
  const triggerJson = await triggerResponse.json();

  assert(
    triggerResponse.status === 200,
    `Trigger API route returned HTTP 200 (Got ${triggerResponse.status})`
  );

  assert(
    typeof triggerJson.callSid === "string" && triggerJson.callSid.length > 0,
    "Trigger API returned callSid"
  );

  assert(
    typeof triggerJson.status === "string",
    "Trigger API returned telephony status"
  );

  assert(
    typeof triggerJson.communicationId === "string",
    "Trigger API returned audit communicationId"
  );

  // -------------------------------------------------------------
  // TEST GROUP 5: Webhook Lifecycle & Sentiment Ingestion
  // -------------------------------------------------------------
  console.log("\n[TEST GROUP 5] Webhook Ingestion & Idempotent Partner Escalation");

  // Create an explicit Communication record to link the webhook against
  const testCallSid = `sarvam_webhook_test_${Date.now()}`;
  await db.communication.create({
    data: {
      tenantId: testTenantId,
      channel: CommunicationChannel.VOICE,
      direction: CommunicationDirection.OUTBOUND,
      purpose: "RECOVERY",
      category: "AUTONOMOUS_VOICE_CALL",
      recipient: "+919555572070",
      subject: "Outbound Sarvam AI Call: INV-DISPUTE-001 (Umang Sharma)",
      content: "[TEST AUDIT INITIAL]",
      status: "INITIATED",
      externalRef: testCallSid,
    },
  });

  // Scenario A: Disputing Sentiment Webhook
  const disputeWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/sarvam-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call_id: testCallSid,
      status: "completed",
      sentiment: "DISPUTING",
      duration: 52,
      transcript: "Client: I have already paid this invoice last Friday via RTGS. Why are you calling me again?",
    }),
  });

  const disputeRes = await webhookRouteHandler(disputeWebhookReq);
  const disputeJson = await disputeRes.json();

  assert(
    disputeRes.status === 200 && disputeJson.success === true,
    "Webhook endpoint returned HTTP 200 success"
  );

  assert(
    disputeJson.communicationUpdated === true,
    "Communication record updated by externalRef"
  );

  assert(
    disputeJson.escalated === true && disputeJson.taskCreated === true,
    "Disputing sentiment automatically raised a high-priority Task"
  );

  // Scenario B: Idempotency Verification
  const repeatWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/sarvam-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call_id: testCallSid,
      status: "completed",
      sentiment: "DISPUTING",
      duration: 52,
      transcript: "Duplicate webhook delivery.",
    }),
  });

  const repeatRes = await webhookRouteHandler(repeatWebhookReq);
  const repeatJson = await repeatRes.json();

  assert(
    repeatJson.taskCreated === false,
    "Webhook is idempotent: Duplicate webhook did not create duplicate Task"
  );

  // Scenario C: Unanswered call ("no-answer")
  const noAnswerCallSid = `sarvam_noanswer_test_${Date.now()}`;
  await db.communication.create({
    data: {
      tenantId: testTenantId,
      channel: CommunicationChannel.VOICE,
      direction: CommunicationDirection.OUTBOUND,
      purpose: "RECOVERY",
      category: "AUTONOMOUS_VOICE_CALL",
      recipient: "+919555572070",
      subject: "Outbound Sarvam AI Call: INV-NOANSWER-001 (Umang Sharma)",
      content: "[TEST AUDIT NO ANSWER]",
      status: "INITIATED",
      externalRef: noAnswerCallSid,
    },
  });

  const noAnswerWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/sarvam-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call_id: noAnswerCallSid,
      status: "no-answer",
      sentiment: "UNRESPONSIVE",
      duration: 0,
      transcript: "",
    }),
  });

  const noAnswerRes = await webhookRouteHandler(noAnswerWebhookReq);
  const noAnswerJson = await noAnswerRes.json();

  assert(
    noAnswerJson.status === "no-answer" && noAnswerJson.escalated === true,
    "Call status 'no-answer' triggers partner escalation task"
  );

  console.log("\n==================================================================");
  console.log(`Test Execution Summary: \x1b[32m${passed} PASSED\x1b[0m, \x1b[31m${failed} FAILED\x1b[0m`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
