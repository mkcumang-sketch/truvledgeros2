import { NextResponse } from "next/server";

const bootTime = Date.now();

/**
 * Liveness Probe (/healthz)
 * Informs load balancers and container orchestrators that the application process is running.
 */
export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - bootTime) / 1000);
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      service: "truv-ledgeros",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
