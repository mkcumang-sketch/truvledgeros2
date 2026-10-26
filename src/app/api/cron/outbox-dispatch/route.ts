import { NextRequest, NextResponse } from "next/server";
import { processPendingAutomations } from "@/lib/server/automation/native-engine";
import { timingSafeEqualCompare } from "@/lib/server/m2m-auth";
import {
  rateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { withTimeout } from "@/lib/server/security/request-validator";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * Scheduled Cron Endpoint to drain the transactional outbox queue using the native in-process engine.
 * Strictly protected by CRON_SECRET via constant-time verification.
 * Fails closed in all environments if secret is missing or invalid.
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

    // 1. Fail closed if server secret is not configured
    if (!configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized: CRON_SECRET is not configured on server.", code: "UNCONFIGURED_SECRET" },
        { status: 401 }
      );
    }

    // 2. Extract provided token
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    const providedToken = bearerToken || cronSecretHeader?.trim();

    if (!providedToken) {
      return NextResponse.json(
        { error: "Unauthorized: Missing machine authorization credentials.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    // 3. Constant-time timing-safe comparison
    const isAuthorized = timingSafeEqualCompare(providedToken, configuredSecret);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid cron execution credentials.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    // 4. Execute native in-process dispatch with 15-second timeout
    const summary = await withTimeout(
      processPendingAutomations({
        batchSize: 50,
        forceDispatch: true,
      }),
      15000,
      "Cron outbox dispatch timed out after 15000ms"
    );

    try {
      revalidatePath("/automations");
      revalidatePath("/invoices");
      revalidatePath("/tasks");
    } catch {}

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: "native-in-process",
      summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Cron outbox dispatch failed", message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
