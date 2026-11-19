import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { detectVoiceProviders } from "@/lib/server/voice/provider-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/voice/providers
 * Returns all detected zero-cost, local, and configured telephony providers.
 */
export async function GET() {
  try {
    await requireTenant();
    const providers = await detectVoiceProviders();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      providers,
      recommendedProvider: providers.find((p) => p.isOperational && p.isFree)?.id || "BROWSER_WEBRTC",
      zeroCostModeActive: true,
    });
  } catch (err: any) {
    if (err.message?.includes("UNAUTHENTICATED") || err.message?.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to detect voice providers" },
      { status: 500 }
    );
  }
}
