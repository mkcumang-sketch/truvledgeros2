import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const context = await getSessionContext();
  if (!context) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: context.user,
    membership: context.membership,
    tenant: context.tenant,
  });
}
