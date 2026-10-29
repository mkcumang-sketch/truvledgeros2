import { NextRequest, NextResponse } from "next/server";
import { executeScheduledCallsSweep } from "@/lib/server/voice/scheduler";
import { timingSafeEqualCompare } from "@/lib/server/m2m-auth";
import {
  rateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled AI Calling Cron Endpoint
 * Drains eligible `ScheduledCall` rows where `scheduledFor <= NOW()`.
 * Protected by CRON_SECRET with constant-time equality check.
 */
export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateStatus = await rateLimiter.check(`cron:${clientIp}`, RATE_LIMIT_TIERS.GENERAL_API);
    if (!rateStatus.allowed) {
      return createRateLimitResponse(rateStatus);
    }

    const authHeader = req.headers.get("authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const configuredSecret = process.env.CRON_SECRET?.trim();

    // 1. Fail closed if CRON_SECRET is not configured
    if (!configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized: CRON_SECRET is not configured on server.", code: "UNCONFIGURED_SECRET" },
        { status: 401 }
      );
    }

    // 2. Extract and verify token
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    const providedToken = bearerToken || cronSecretHeader?.trim();

    if (!providedToken || !timingSafeEqualCompare(providedToken, configuredSecret)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid cron execution credentials.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    // 3. Execute calling sweep
    const sweepResult = await executeScheduledCallsSweep({
      batchSize: 50,
      forceIgnoreWindow: req.nextUrl.searchParams.get("force") === "true",
    });

    try {
      revalidatePath("/communications");
      revalidatePath("/communications/campaigns");
    } catch {
      // Non-blocking in background cron
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: "truv-calling-scheduler",
      sweep: sweepResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Scheduled calling execution failed", message: err.message },
      { status: 500 }
    );
  }
}
