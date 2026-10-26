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
 * Native In-Process Automation Cron Endpoint
 * Drains pending AutomationEvents and runs scheduled checks directly in Node.js.
 * Strictly protected by CRON_SECRET via constant-time comparison.
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
        {
          error: "Unauthorized: CRON_SECRET is not configured on server.",
          code: "UNCONFIGURED_SECRET",
        },
        { status: 401 }
      );
    }

    // 2. Extract provided token
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    const providedToken = bearerToken || cronSecretHeader?.trim();

    if (!providedToken) {
      return NextResponse.json(
        {
          error: "Unauthorized: Missing cron machine authorization token.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // 3. Constant-time timing-safe comparison
    const isAuthorized = timingSafeEqualCompare(providedToken, configuredSecret);
    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: "Unauthorized: Invalid cron execution credentials.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // 4. Execute native in-process processing (with 15-second timeout safeguard)
    const summary = await withTimeout(
      processPendingAutomations({
        batchSize: 50,
        forceDispatch: true,
      }),
      15000,
      "Native automation processing timed out after 15000ms"
    );

    // 5. Revalidate relevant practice dashboard pages
    try {
      revalidatePath("/automations");
      revalidatePath("/invoices");
      revalidatePath("/tasks");
      revalidatePath("/clients");
      revalidatePath("/gst");
    } catch (revalidateErr) {
      // Non-blocking in background cron
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: "native-in-process",
      summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Native automation execution failed",
        message: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
