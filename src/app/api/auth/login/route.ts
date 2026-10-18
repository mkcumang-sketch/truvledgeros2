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

const AUTH_TIMEOUT_MS = 10000; // Explicit 10-second guardrail

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  // 1. Upstash Redis Token-Bucket / Sliding Window Rate Limiting (5 attempts / 15 mins per IP)
  const rateLimitResult = await upstashLoginLimiter.check(clientIp);
  if (!rateLimitResult.allowed) {
    return create429RateLimitResponse(rateLimitResult);
  }

  // 2. Parse request payload (JSON or FormData)
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

  // 3. Cloudflare Turnstile Captcha: Verify token BEFORE touching database to shield against brute force
  if (captchaToken) {
    const captchaResult = await verifyTurnstileToken(captchaToken, clientIp);
    if (!captchaResult.success) {
      return NextResponse.json(
        { error: captchaResult.error || "Captcha verification failed. Please try again." },
        { status: 400 }
      );
    }
  } else if (process.env.ENFORCE_TURNSTILE === "true" && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Captcha verification is required. Please solve the captcha." },
      { status: 400 }
    );
  }

  // 4. Authentication Execution with Explicit 10s Timeout Guardrail
  const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
    setTimeout(() => resolve({ isTimeout: true }), AUTH_TIMEOUT_MS)
  );

  const authExecutionPromise = (async () => {
    const user = await (db.user as any).findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (!user || !user.passwordHash || !user.active) {
      return { authenticated: false };
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "LOGIN_FAILED",
          entityType: "USER",
          entityId: user.id,
        },
      }).catch(() => null);

      return { authenticated: false };
    }

    return { authenticated: true, user };
  })();

  const authRace = await Promise.race([authExecutionPromise, timeoutPromise]);

  // Handle timeout guardrail: Return clean JSON error instead of hanging gateway timeout
  if ("isTimeout" in authRace) {
    console.warn(`[AUTH_TIMEOUT_GUARD] Login timed out after ${AUTH_TIMEOUT_MS}ms for email: ${email}`);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!authRace.authenticated || !authRace.user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = authRace.user;

  // 5. Successful Login: Reset rate limit for this IP
  await upstashLoginLimiter.reset(clientIp);

  // Resolve primary tenant
  const activeMemberships = (user.memberships || []).filter(
    (m: any) => !m.status || m.status === "ACTIVE"
  );
  const defaultTenantId = activeMemberships[0]?.tenantId;

  await createSession(user.id, defaultTenantId, { ipAddress: clientIp });

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
