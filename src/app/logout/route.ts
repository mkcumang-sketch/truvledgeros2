import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_COOKIE_NAMES = [
  "truv_session",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
];

export async function GET(request: NextRequest) {
  try {
    await destroySession();
  } catch (err) {
    console.error("[Logout Route] Error destroying session:", err);
  }

  const loginUrl = new URL("/login?logout=true&force=true", request.url);
  const response = NextResponse.redirect(loginUrl);

  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    response.cookies.delete(name);
  }

  return response;
}
