import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CommunicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRUV LedgerOS — Telephony TwiML & Audio Stream Webhook Handler
 * 
 * Serves carrier-grade dynamic TwiML XML instructions to Twilio PSTN calls.
 * Synthesizes Hindi/Hinglish speech via Amazon Polly Aditi or audio stream
 * and captures dial-pad digit interactions (IVR: 1 for paid, 2 for callback).
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      formData.forEach((val, key) => {
        body[key] = typeof val === "string" ? val : val.name;
      });
    } else {
      body = await req.json().catch(() => ({}));
    }

    const searchParams = req.nextUrl.searchParams;
    const callSid = body.CallSid || searchParams.get("callSid") || "";
    const digits = body.Digits || "";
    const reason = searchParams.get("reason") || "PAYMENT_RECOVERY";

    // If digit captured (IVR feedback)
    if (digits) {
      let ivrMessage = "";
      if (digits === "1") {
        ivrMessage = "Dhanyawad! Aapka payment confirmation note practice portal par log kar diya gaya hai. Hamari team verify karegi.";
        if (callSid) {
          await db.communication.updateMany({
            where: { externalRef: callSid },
            data: {
              status: CommunicationStatus.DELIVERED,
            },
          }).catch(() => null);
        }
      } else if (digits === "2") {
        ivrMessage = "Shukriya! Humne designated CA partner ko callback request notify kar di hai. Aapse jald sampark kiya jayega.";
      } else {
        ivrMessage = "Dhanyawad. Aapka response record kar liya gaya hai.";
      }

      const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">${ivrMessage}</Say>
  <Hangup/>
</Response>`;

      return new NextResponse(responseXml, {
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Default Call Greeting & TwiML prompt
    const defaultSpeech =
      reason === "PAYMENT_RECOVERY"
        ? "Namaste. Main TRUV Chartered Accountants ki automated AI accounts desk se bol rahi hoon. Kripya apne pending tax invoice ko settle karne mein sahayata karein. Agar aap payment kar chuke hain toh 1 dabayein, ya partner callback ke liye 2 dabayein."
        : "Namaste. Main TRUV Chartered Accountants se bol rahi hoon. Statutory compliance deadline nazdeek hai. Kripya portal par pending documents turant upload karein. Dhanyawad.";

    const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">${defaultSpeech}</Say>
  <Pause length="1"/>
  <Gather numDigits="1" timeout="5" action="/api/telephony/twiml-stream" method="POST">
    <Say voice="Polly.Aditi" language="hi-IN">Agar aapne payment kar diya hai toh 1 dabayein, ya callback ke liye 2 dabayein.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="hi-IN">Samay dene ke liye dhanyawad. Alvida.</Say>
</Response>`;

    return new NextResponse(responseXml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("[TWIML-STREAM-ERROR]", err.message);
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">Namaste. TRUV LedgerOS automated telephony connected.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallbackXml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
