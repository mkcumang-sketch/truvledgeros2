import { NextRequest, NextResponse } from "next/server";
import { processVoiceCallWebhook } from "@/lib/server/voice/calling-agent";
import {
  rateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * Webhook handler for autonomous voice calling gateways (Twilio, Bland AI, Sarvam AI).
 * Receives call lifecycle updates, audio recording URLs, transcripts, and sentiment.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateStatus = await rateLimiter.check(`webhook:voice:${clientIp}`, RATE_LIMIT_TIERS.GENERAL_API);
    if (!rateStatus.allowed) {
      return createRateLimitResponse(rateStatus);
    }

    let body: any = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    }

    // Standardize across providers (Twilio vs Bland AI vs Custom)
    const callSid = body.CallSid || body.call_id || body.callSid || body.id;
    const rawStatus = (body.CallStatus || body.status || "completed").toLowerCase();

    let status: "completed" | "answered" | "no-answer" | "busy" | "failed" = "completed";
    if (rawStatus.includes("no-answer")) status = "no-answer";
    else if (rawStatus.includes("busy")) status = "busy";
    else if (rawStatus.includes("fail")) status = "failed";
    else if (rawStatus.includes("in-progress") || rawStatus.includes("answered")) status = "answered";

    const duration = parseInt(body.CallDuration || body.duration || "0", 10);
    const recordingUrl = body.RecordingUrl || body.recording_url;
    const transcript = body.transcript || body.TranscriptionText;
    const sentiment = body.sentiment;

    if (!callSid) {
      return NextResponse.json({ error: "Missing required callSid identifier" }, { status: 400 });
    }

    const result = await processVoiceCallWebhook({
      callSid,
      status,
      duration,
      recordingUrl,
      transcript,
      sentiment,
    });

    try {
      revalidatePath("/automations");
      revalidatePath("/tasks");
    } catch {}

    return NextResponse.json({
      success: true,
      processed: result.updated,
      escalated: result.escalated,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[VOICE-WEBHOOK-ERROR]", err.message);
    return NextResponse.json(
      { error: "Voice webhook processing failed", details: err.message },
      { status: 500 }
    );
  }
}
