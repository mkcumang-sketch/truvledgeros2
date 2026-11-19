import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import {
  detectVoiceProviders,
  getInstalledOllamaModels,
  DEFAULT_OLLAMA_HOST,
} from "@/lib/server/voice/provider-engine";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/voice/providers
 * Returns all detected zero-cost, local, and configured telephony providers.
 */
export async function GET(req: NextRequest) {
  try {
    await requireTenant();

    const { searchParams } = new URL(req.url);
    const customHost = searchParams.get("host") || DEFAULT_OLLAMA_HOST;

    const [providers, ollamaInfo] = await Promise.all([
      detectVoiceProviders(customHost),
      getInstalledOllamaModels(customHost),
    ]);

    // Check database health (safe probe with 1.5s timeout)
    let databaseAvailable = false;
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB Timeout")), 1500)),
      ]);
      databaseAvailable = true;
    } catch {
      databaseAvailable = false;
    }

    const isCloudEnv = Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.RAILWAY_ENVIRONMENT);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      serverEnvironment: isCloudEnv ? "cloud" : "local",
      databaseAvailable,
      ollama: {
        isAvailable: ollamaInfo.available,
        host: ollamaInfo.host,
        installedModels: ollamaInfo.models,
        latencyMs: ollamaInfo.latencyMs,
      },
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
