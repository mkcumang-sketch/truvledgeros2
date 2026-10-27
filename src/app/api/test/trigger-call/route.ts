import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const sarvamApiKey = process.env.SARVAM_API_KEY?.trim();
  const sarvamAgentId = process.env.SARVAM_AGENT_ID?.trim();

  if (!sarvamApiKey || !sarvamAgentId) {
    return NextResponse.json({ error: "Missing Sarvam keys in environment" }, { status: 500 });
  }

  const payload = {
    agent_id: sarvamAgentId,
    phone_number: "+919555572070",
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

  try {
    const res = await fetch("https://api.sarvam.ai/voice/agent/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": sarvamApiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json({ status: res.status, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}