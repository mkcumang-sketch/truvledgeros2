import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  edgeRateLimiter,
  getClientIp,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/edge-rate-limiter";
import {
  MAX_BODY_SIZE_BYTES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/server/security/request-validator";

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/healthz",
  "/readyz",
];

const UPLOAD_ROUTES = ["/api/documents/upload", "/clients/import"];

function applySecurityHeaders(response: NextResponse): void {
  // 1. HSTS (Strict-Transport-Security: 2 years, includeSubDomains, preload)
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // 2. Clickjacking Prevention
  response.headers.set("X-Frame-Options", "DENY");

  // 3. MIME-Sniffing Prevention
  response.headers.set("X-Content-Type-Options", "nosniff");

  // 4. Referrer Policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // 5. Restrict Dangerous Browser Features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()"
  );

  // 6. Cross-Origin Isolation
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // 7. Content Security Policy (CSP)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  // 8. Prevent caching of authenticated / dynamic application responses
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get("truv_session")?.value;
  const clientIp = getClientIp(request);

  // Liveness / Readiness healthchecks pass directly without overhead
  if (pathname === "/healthz" || pathname === "/readyz") {
    const res = NextResponse.next();
    applySecurityHeaders(res);
    return res;
  }

  // 1. Payload Size Validation (Enforce 1MB standard, 10MB upload max)
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const bytes = parseInt(contentLengthHeader, 10);
    const isUpload = UPLOAD_ROUTES.some((r) => pathname.startsWith(r));
    const maxAllowed = isUpload ? MAX_UPLOAD_SIZE_BYTES : MAX_BODY_SIZE_BYTES;

    if (!isNaN(bytes) && bytes > maxAllowed) {
      const res = NextResponse.json(
        {
          error: "Payload Too Large",
          message: `Request body exceeds maximum allowed limit of ${(maxAllowed / (1024 * 1024)).toFixed(1)}MB.`,
        },
        { status: 413 }
      );
      applySecurityHeaders(res);
      return res;
    }
  }

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isApiRoute = pathname.startsWith("/api/");

  // 2. Edge / App Rate Limiting
  // Tier A: Auth & Reset Routes (5 per 15 min per IP)
  if (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/api/auth/login")
  ) {
    const rateStatus = await edgeRateLimiter.check(`ip:auth:${clientIp}`, RATE_LIMIT_TIERS.AUTH);
    if (!rateStatus.allowed) {
      const res = createRateLimitResponse(rateStatus);
      applySecurityHeaders(res);
      return res;
    }
  }

  // Tier B: General API Endpoints (100 per min per IP/User)
  if (isApiRoute) {
    const rateKey = sessionToken ? `user:api:${sessionToken}` : `ip:api:${clientIp}`;
    const rateStatus = await edgeRateLimiter.check(rateKey, RATE_LIMIT_TIERS.GENERAL_API);
    if (!rateStatus.allowed) {
      const res = createRateLimitResponse(rateStatus);
      applySecurityHeaders(res);
      return res;
    }
  }

  // 3. Unauthenticated request to protected web UI routes -> redirect to /login
  if (!sessionToken && !isPublicRoute && !isApiRoute && !pathname.startsWith("/_next")) {
    const loginUrl = new URL("/login", request.url);
    const redirectRes = NextResponse.redirect(loginUrl);
    applySecurityHeaders(redirectRes);
    return redirectRes;
  }

  // 4. Authenticated user trying to access login/reset pages -> redirect to /dashboard
  if (sessionToken && isPublicRoute && (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password")) {
    const dashboardUrl = new URL("/dashboard", request.url);
    const redirectRes = NextResponse.redirect(dashboardUrl);
    applySecurityHeaders(redirectRes);
    return redirectRes;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};