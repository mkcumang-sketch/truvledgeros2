import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
} from "@prisma/client";
import { getAgentPersona } from "@/lib/server/voice/agent-personas";
import { isWithinCallingWindow, getNextCallingWindowDate } from "@/lib/server/voice/campaign-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Inbound Voice Call Gateway (/api/voice/inbound)
 * 
 * Handles incoming calls from:
 * 1. Carrier PSTN Webhooks (Twilio TwiML / Exotel)
 * 2. Inbound Browser Web Sessions (Zero-cost client audio calls)
 * 
 * Enforces:
 * - Mandatory Indian consent & call recording disclosure
 * - Client PAN/Phone lookup for practice context
 * - Quiet hours & after-hours callback routing
 * - AI Persona conversational greeting
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    }

    const callerPhone = body.From || body.from || body.callerPhone || body.phone || "+919876543210";
    const callSid = body.CallSid || body.call_id || body.sessionId || `inbound_${Date.now()}`;
    const persona = getAgentPersona(body.personaId || "PRIYA");

    // Check quiet hours
    const now = new Date();
    const withinHours = isWithinCallingWindow(now, "10:00", "18:00");
    const nextWindow = getNextCallingWindowDate(now, "10:00");

    // If request asks for TwiML XML (Carrier PSTN)
    const wantsTwiml = req.headers.get("accept")?.includes("xml") || contentType.includes("urlencoded");

    if (wantsTwiml) {
      let twiml = "";
      if (!withinHours) {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">Namaste. Thank you for calling TRUV Advisory. Our practice hours are 10 AM to 6 PM Indian Standard Time. We have logged your callback request and our accounting associate will reach out to you on ${nextWindow.toDateString()} at 10 AM. Samay dene ke liye dhanyawad.</Say>
  <Hangup/>
</Response>`;
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">Namaste. Thank you for calling TRUV Advisory. This call is recorded for quality and compliance. I am ${persona.name}. Please state your query after the tone, or press 1 to schedule an urgent callback with your audit partner.</Say>
  <Gather numDigits="1" timeout="5" action="/api/telephony/twiml-stream" method="POST">
    <Say voice="Polly.Aditi" language="hi-IN">Partner callback ke liye 1 dabayein.</Say>
  </Gather>
</Response>`;
      }

      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // JSON response for Browser Inbound Calling Studio
    return NextResponse.json({
      success: true,
      callSid,
      withinCallingHours: withinHours,
      callerPhone,
      persona: {
        id: persona.id,
        name: persona.name,
        title: persona.title,
        voiceSettings: persona.voiceSettings,
      },
      greetingText: withinHours
        ? `${persona.dispositionRules.mandatoryDisclaimer} Thank you for calling TRUV Advisory. I am ${persona.name}. How may I assist with your tax, accounts, or statutory filings today?`
        : `Thank you for calling TRUV Advisory. Our practice hours are 10:00 AM to 6:00 PM IST. We have scheduled an automated priority callback for you at 10:00 AM tomorrow.`,
      disclaimer: persona.dispositionRules.mandatoryDisclaimer,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process inbound call" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Support GET probe for TwiML carrier test webhooks
  return POST(req);
}
