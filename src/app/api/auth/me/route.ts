import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";

import { serializeForClient } from "@/lib/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await getSessionContext();
    if (!context) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json(
      serializeForClient({
        authenticated: true,
        user: context.user,
        membership: context.membership,
        tenant: context.tenant,
      })
    );
  } catch (err: any) {
    return NextResponse.json(
      { authenticated: false, error: err?.message || "Failed to retrieve session context" },
      { status: 500 }
    );
  }
}
