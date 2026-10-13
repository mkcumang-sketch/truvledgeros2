import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";

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
