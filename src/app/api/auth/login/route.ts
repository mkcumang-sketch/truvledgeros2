import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  upstashLoginLimiter,
  create429RateLimitResponse,
  getClientIp,
} from "@/lib/server/security/upstash-rate-limiter";
import { verifyTurnstileToken } from "@/lib/server/security/turnstile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "Email must not exceed 254 characters").email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must not exceed 128 characters"),
  turnstileToken: z.string().optional(),
  "cf-turnstile-response": z.string().optional(),
});

const AUTH_TIMEOUT_MS = 5000;

async function recordLoginFailure(userId?: string): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: userId ?? null,
        action: "LOGIN_FAILED",
        entityType: "USER",
        entityId: userId ?? null,
      },
    });
  } catch {
    console.warn("[AUTH] Failed-login audit event could not be recorded.");
  }
}

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  // 1. Parse request payload (JSON or FormData)
  let rawBody: Record<string, any> = {};
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      rawBody = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      formData.forEach((val, key) => {
        rawBody[key] = typeof val === "string" ? val : val.name;
      });
    } else {
      rawBody = await req.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const parsed = LoginRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const captchaToken = parsed.data.turnstileToken || parsed.data["cf-turnstile-response"];

  // 2. Apply independent IP and account limits before checking credentials.
  let rateLimitResult;
  try {
    rateLimitResult = await upstashLoginLimiter.check(clientIp, email);
  } catch {
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
  if (!rateLimitResult.allowed) {
    return create429RateLimitResponse(rateLimitResult);
  }

  // 3. Cloudflare Turnstile: a configured or required challenge cannot be omitted.
  const hasTurnstileSecret = Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim() || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim()
  );
  const hasTurnstileSiteKey = Boolean(
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  );
  const turnstileRequired =
    hasTurnstileSecret ||
    process.env.ENFORCE_TURNSTILE === "true" ||
    process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE === "true" ||
    (process.env.NODE_ENV === "production" && hasTurnstileSiteKey);

  if (turnstileRequired && !hasTurnstileSecret) {
    return NextResponse.json(
      { error: "Captcha service temporarily unavailable. Please retry." },
      { status: 503 }
    );
  }

  if (captchaToken || turnstileRequired) {
    let captchaResult;
    try {
      captchaResult = await verifyTurnstileToken(captchaToken, clientIp);
    } catch {
      return NextResponse.json(
        { error: "Captcha service temporarily unavailable. Please retry." },
        { status: 503 }
      );
    }
    if (!captchaResult.success) {
      const serviceUnavailable = captchaResult.error?.toLowerCase().includes("temporarily unreachable");
      return NextResponse.json(
        { error: captchaResult.error || "Captcha verification failed. Please try again." },
        { status: serviceUnavailable ? 503 : 400 }
      );
    }
  }

  // 4. Authentication execution: wrong passwords resolve immediately; only
  // actual database or verification failures enter the temporary-error path.
  let authenticationTimedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      authenticationTimedOut = true;
      resolve({ isTimeout: true });
    }, AUTH_TIMEOUT_MS);
  });

  const authExecutionPromise = (async () => {
    const user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (authenticationTimedOut) {
      return { authenticated: false };
    }

    if (!user || !user.passwordHash || !user.active) {
      return { authenticated: false };
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return { authenticated: false, userId: user.id };
    }

    return { authenticated: true, user };
  })();

  let authRace;
  try {
    authRace = await Promise.race([authExecutionPromise, timeoutPromise]);
  } catch {
    console.error("[AUTH] Login credential verification failed.");
    await recordLoginFailure();
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeoutHandle!);
  }

  if ("isTimeout" in authRace) {
    console.warn(`[AUTH_TIMEOUT_GUARD] Login timed out after ${AUTH_TIMEOUT_MS}ms.`);
    await recordLoginFailure();
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  if (!authRace.authenticated || !authRace.user) {
    await recordLoginFailure(authRace.userId);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = authRace.user;

  // 5. Successful Login: clear the account and IP failure counters.
  await upstashLoginLimiter.reset(clientIp, email).catch(() => {
    console.warn("[AUTH] Login rate-limit counters could not be reset.");
  });

  // Resolve primary tenant
  const activeMemberships = (user.memberships || []).filter(
    (m: any) => !m.status || m.status === "ACTIVE"
  );
  const defaultTenantId = activeMemberships[0]?.tenantId;

  try {
    await createSession(user.id, defaultTenantId, { ipAddress: clientIp });
  } catch {
    console.error("[AUTH] Login session creation failed.");
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  await db.auditLog.create({
    data: {
      tenantId: defaultTenantId ?? null,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
    },
  }).catch(() => null);

  const redirectUrl = user.isSuperAdmin && !defaultTenantId ? "/godmode" : "/dashboard";

  return NextResponse.json({
    success: true,
    redirectUrl,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
  });
}
