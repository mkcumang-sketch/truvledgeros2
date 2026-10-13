import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getClientDirectory,
  createClient,
  CreateClientSchema,
} from "@/lib/server/client-service";
import {
  rateLimiter,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import {
  checkPayloadSize,
  withTimeout,
} from "@/lib/server/security/request-validator";

export async function GET(req: NextRequest) {
  const context = await getSessionContext();
  if (!context?.membership) {
    return NextResponse.json(
      { error: "Authentication required to access client records." },
      { status: 401 }
    );
  }

  // Rate Limiting (60 requests per minute per user)
  const rateStatus = await rateLimiter.check(
    `user:clients:list:${context.user.id}`,
    RATE_LIMIT_TIERS.SEARCH_LIST
  );
  if (!rateStatus.allowed) {
    return createRateLimitResponse(rateStatus);
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const entityType = searchParams.get("entityType") || "ALL";
  const status = (searchParams.get("status") as any) || "ACTIVE";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const rawPageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const pageSize = Math.min(100, Math.max(1, isNaN(rawPageSize) ? 20 : rawPageSize));

  try {
    const result = await withTimeout(
      getClientDirectory({
        search,
        entityType,
        status,
        page,
        pageSize,
      }),
      10000,
      "Client directory query timed out"
    );
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const context = await getSessionContext();
  if (!context?.membership) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  // Enforce role permissions: CLIENT role cannot create clients
  if (context.membership.role === "CLIENT") {
    return NextResponse.json(
      { error: "Client portal users cannot onboard practice clients." },
      { status: 403 }
    );
  }

  // Rate Limiting (100 per minute)
  const rateStatus = await rateLimiter.check(
    `user:clients:create:${context.user.id}`,
    RATE_LIMIT_TIERS.GENERAL_API
  );
  if (!rateStatus.allowed) {
    return createRateLimitResponse(rateStatus);
  }

  // Size limit check (1MB)
  const sizeCheck = checkPayloadSize(req);
  if (!sizeCheck.valid) {
    return sizeCheck.response!;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const validated = CreateClientSchema.parse(body);
    const client = await withTimeout(
      createClient(validated),
      10000,
      "Client creation timed out"
    );
    return NextResponse.json({ client }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Validation failed" },
      { status: 400 }
    );
  }
}