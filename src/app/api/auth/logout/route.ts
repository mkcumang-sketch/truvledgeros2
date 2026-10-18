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

function clearAllCookies(response: NextResponse) {
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
}

export async function GET(request: NextRequest) {
  try {
    await destroySession();
  } catch (err) {
    console.error("[Logout API GET] Error destroying session:", err);
  }

  const loginUrl = new URL("/login?logout=true&force=true", request.url);
  const response = NextResponse.redirect(loginUrl);
  clearAllCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  try {
    await destroySession();
  } catch (err) {
    console.error("[Logout API POST] Error destroying session:", err);
  }

  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("application/json")) {
    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    clearAllCookies(response);
    return response;
  }

  const loginUrl = new URL("/login?logout=true&force=true", request.url);
  const response = NextResponse.redirect(loginUrl);
  clearAllCookies(response);
  return response;
}
