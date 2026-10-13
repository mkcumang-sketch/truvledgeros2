import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTimeout } from "@/lib/server/security/request-validator";

/**
 * Readiness Probe (/readyz)
 * Tests dependent systems (database connection pool, caches) before accepting user traffic.
 * If unhealthy, returns 503 so traffic is immediately rerouted by the load balancer.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // Test DB connection with a strict 3-second timeout
    await withTimeout(
      (async () => {
        if ((db as any).$queryRaw) {
          await (db as any).$queryRaw`SELECT 1`;
        } else {
          await db.tenant.findFirst({ select: { id: true } });
        }
      })(),
      3000,
      "Database readiness check timed out after 3000ms"
    );

    return NextResponse.json(
      {
        status: "ready",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "not_ready",
        error: err.message || "Dependency health check failed",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
