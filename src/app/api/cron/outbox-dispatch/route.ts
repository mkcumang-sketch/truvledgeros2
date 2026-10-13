import { NextRequest, NextResponse } from "next/server";
import { processOutboxQueue } from "@/lib/server/automation/outbox-dispatcher";
import { timingSafeEqualCompare } from "@/lib/server/m2m-auth";
import {
  rateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { withTimeout } from "@/lib/server/security/request-validator";

/**
 * Scheduled Cron Endpoint to drain the transactional outbox queue.
 * Strictly protected by CRON_SECRET or N8N_WEBHOOK_SECRET via constant-time verification.
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
    const configuredSecret = (process.env.CRON_SECRET || process.env.N8N_WEBHOOK_SECRET)?.trim();

    // 1. Fail closed if server secret is not configured
    if (!configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized: Cron execution secret is not configured on server.", code: "UNCONFIGURED_SECRET" },
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

    // 4. Execute outbox dispatch with 10-second timeout
    const summary = await withTimeout(
      processOutboxQueue({
        batchSize: 50,
        forceDispatch: true,
      }),
      10000,
      "Cron outbox dispatch timed out after 10000ms"
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
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
