import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { middleware } from "../src/middleware";
import { edgeRateLimiter } from "../src/lib/server/security/edge-rate-limiter";
import { POST as testCallPost } from "../src/app/api/test/trigger-call/route";
import { POST as voiceTriggerPost } from "../src/app/api/voice/trigger/route";
import { GET as campaignsGet } from "../src/app/api/voice/campaigns/route";
import { GET as campaignGet } from "../src/app/api/voice/campaigns/[campaignId]/route";
import { PATCH as campaignPatch } from "../src/app/api/voice/campaigns/[campaignId]/route";
import { GET as scheduledCallsGet } from "../src/app/api/voice/scheduled-calls/route";
import { POST as scheduledCallsPost } from "../src/app/api/voice/scheduled-calls/route";
import { GET as followUpsGet } from "../src/app/api/voice/follow-ups/route";
import { POST as followUpsPost } from "../src/app/api/voice/follow-ups/route";
import { GET as voiceAgentsGet, POST as voiceAgentsPost } from "../src/app/api/voice/agents/route";
import { POST as liveSessionPost } from "../src/app/api/voice/live-session/route";
import { GET as voiceProvidersGet } from "../src/app/api/voice/providers/route";
import { POST as manualDispatchPost } from "../src/app/api/automations/manual-dispatch/route";
import { POST as inboundEmailPost } from "../src/app/api/webhooks/inbound-email/route";
import {
  canManageCalling,
  canManageManualDispatch,
  canViewCalling,
  resolveCallingTenantId,
} from "../src/lib/server/voice/authorization";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✔ PASS: ${name}`);
    passed++;
  } else {
    console.error(`✖ FAIL: ${name}`);
    failed++;
  }
}

async function run() {
  const originalRateCheck = edgeRateLimiter.check;
  let authRateChecks = 0;
  edgeRateLimiter.check = async (_key, config) => {
    authRateChecks++;
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetTime: Math.ceil(Date.now() / 1000) + config.windowSeconds,
      retryAfterSeconds: 0,
      backend: "in-memory",
    };
  };

  try {
    const loginPage = await middleware(new NextRequest("http://localhost:3000/login"));
    const csp = loginPage.headers.get("Content-Security-Policy") || "";
    assert(
      csp.includes("script-src") &&
        csp.includes("https://challenges.cloudflare.com") &&
        csp.includes("frame-src https://challenges.cloudflare.com") &&
        csp.includes("connect-src 'self' https://challenges.cloudflare.com"),
      "CSP permits only the Cloudflare Turnstile browser origin needed by login"
    );
    assert(
      authRateChecks === 0,
      "GET requests to auth pages do not consume authentication submission quota"
    );

    await middleware(
      new NextRequest("http://localhost:3000/login", { method: "POST" })
    );
    assert(authRateChecks === 1, "POST requests to auth pages retain the auth rate limit");
  } finally {
    edgeRateLimiter.check = originalRateCheck;
  }

  assert(
    canManageCalling(Role.MANAGER) &&
      !canManageCalling(Role.EXECUTIVE) &&
      !canManageCalling(Role.CLIENT),
    "Calling management preserves manager access while excluding executive and client roles"
  );
  assert(
    canManageManualDispatch(Role.PARTNER) && !canManageManualDispatch(Role.MANAGER),
    "Manual dispatch is limited to owner, admin, partner, and platform-admin roles"
  );
  assert(
    canViewCalling(Role.EXECUTIVE) && !canViewCalling(Role.CLIENT),
    "Calling views remain available to staff but not client-portal users"
  );
  assert(
    resolveCallingTenantId(
      {
        user: { id: "manager", email: "", name: "", isSuperAdmin: false },
        membership: {
          id: "membership",
          tenantId: "session-tenant",
          role: Role.PARTNER,
          status: "ACTIVE",
        },
      },
      "attacker-tenant"
    ) === "session-tenant",
    "Voice dispatch tenant scope comes from the authenticated membership"
  );

  const agentsReadResponse = await voiceAgentsGet();
  assert(agentsReadResponse.status === 401, "Voice agent reads reject unauthenticated callers");

  const agentsWriteResponse = await voiceAgentsPost(
    new NextRequest("http://localhost:3000/api/voice/agents", {
      method: "POST",
      body: JSON.stringify({ name: "test", systemPrompt: "test" }),
    })
  );
  assert(agentsWriteResponse.status === 401, "Voice agent writes reject unauthenticated callers");

  const liveSessionResponse = await liveSessionPost(
    new NextRequest("http://localhost:3000/api/voice/live-session", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    })
  );
  assert(liveSessionResponse.status === 401, "Live voice sessions reject unauthenticated callers");

  const missingLiveSessionResponse = await liveSessionPost(
    new NextRequest("http://localhost:3000/api/voice/live-session", {
      method: "POST",
      body: JSON.stringify({
        action: "turn",
        sessionId: "unrecognized-session",
        clientUtterance: "Hello",
      }),
    })
  );
  assert(
    missingLiveSessionResponse.status === 401,
    "Live voice turns reject unauthenticated callers before looking up sessions"
  );

  const providersResponse = await voiceProvidersGet(
    new NextRequest("http://localhost:3000/api/voice/providers?host=http://127.0.0.1")
  );
  assert(providersResponse.status === 401, "Voice provider discovery rejects unauthenticated callers");

  const campaignsReadResponse = await campaignsGet(
    new NextRequest("http://localhost:3000/api/voice/campaigns")
  );
  assert(campaignsReadResponse.status === 401, "Campaign reads reject unauthenticated callers");

  const campaignReadResponse = await campaignGet(
    new NextRequest("http://localhost:3000/api/voice/campaigns/camp-test"),
    { params: { campaignId: "camp-test" } }
  );
  assert(campaignReadResponse.status === 401, "Campaign detail reads reject unauthenticated callers");

  const scheduledReadResponse = await scheduledCallsGet(
    new NextRequest("http://localhost:3000/api/voice/scheduled-calls")
  );
  assert(scheduledReadResponse.status === 401, "Scheduled-call reads reject unauthenticated callers");

  const followUpsReadResponse = await followUpsGet(
    new NextRequest("http://localhost:3000/api/voice/follow-ups")
  );
  assert(followUpsReadResponse.status === 401, "Follow-up reads reject unauthenticated callers");

  const campaignResponse = await campaignPatch(
    new NextRequest("http://localhost:3000/api/voice/campaigns/camp-test", {
      method: "PATCH",
      body: JSON.stringify({ action: "CANCEL" }),
    }),
    { params: { campaignId: "camp-test" } }
  );
  assert(campaignResponse.status === 401, "Campaign mutations reject unauthenticated callers");

  const scheduledResponse = await scheduledCallsPost(
    new NextRequest("http://localhost:3000/api/voice/scheduled-calls", {
      method: "POST",
      body: JSON.stringify({ action: "CANCEL", callId: "call-test" }),
    })
  );
  assert(scheduledResponse.status === 401, "Scheduled-call mutations reject unauthenticated callers");

  const followUpResponse = await followUpsPost(
    new NextRequest("http://localhost:3000/api/voice/follow-ups", {
      method: "POST",
      body: JSON.stringify({ action: "RESOLVE", taskId: "task-test" }),
    })
  );
  assert(followUpResponse.status === 401, "Follow-up mutations reject unauthenticated callers");

  const dispatchResponse = await manualDispatchPost(
    new NextRequest("http://localhost:3000/api/automations/manual-dispatch", {
      method: "POST",
      body: JSON.stringify({
        targetType: "ALL_CLIENTS",
        channel: "EMAIL",
        workflowReason: "PAYMENT_RECOVERY",
        tenantId: "attacker-tenant",
      }),
    })
  );
  assert(dispatchResponse.status === 401, "Manual dispatch rejects unauthenticated callers");

  const voiceResponse = await voiceTriggerPost(
    new NextRequest("http://localhost:3000/api/voice/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "not-a-session" },
      body: JSON.stringify({
        phone: "+919555572070",
        clientName: "Test Client",
        amount: "100",
        invoiceNumber: "INV-TEST",
        tenantId: "attacker-tenant",
      }),
    })
  );
  assert(voiceResponse.status === 401, "Voice dispatch rejects API-key-only callers");

  const testCallResponse = await testCallPost(
    new NextRequest("http://localhost:3000/api/test/trigger-call", {
      method: "POST",
      body: JSON.stringify({ phone: "+919555572070" }),
    })
  );
  assert(
    testCallResponse.status === 404,
    "Live test-call endpoint is unavailable outside development"
  );

  const originalInboundEmailSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  try {
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    const unconfiguredEmailWebhook = await inboundEmailPost(
      new NextRequest("http://localhost:3000/api/webhooks/inbound-email", {
        method: "POST",
        body: JSON.stringify({ from: "client@example.test", text: "A reply" }),
      })
    );
    assert(
      unconfiguredEmailWebhook.status === 503,
      "Inbound email webhook fails closed when its dedicated secret is not configured"
    );

    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = "test-inbound-email-secret";
    const invalidEmailWebhook = await inboundEmailPost(
      new NextRequest("http://localhost:3000/api/webhooks/inbound-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-token": "invalid" },
        body: JSON.stringify({ from: "client@example.test", text: "A reply" }),
      })
    );
    assert(invalidEmailWebhook.status === 401, "Inbound email webhook rejects invalid tokens");
  } finally {
    if (originalInboundEmailSecret === undefined) {
      delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    } else {
      process.env.INBOUND_EMAIL_WEBHOOK_SECRET = originalInboundEmailSecret;
    }
  }

  console.log(`\nSecurity remediation tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error("Security remediation test runner exception:", error);
  process.exit(1);
});
