import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as authSession from "@/lib/auth/session";
import { Prisma } from "@prisma/client";
import { authorizeM2MRequest } from "@/lib/server/m2m-auth";
import { serializeForClient } from "@/lib/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const m2mAuth = await authorizeM2MRequest(req);

    const whereClause: Prisma.DocumentRequestWhereInput = {
      status: "PENDING",
    };

    if (m2mAuth.isM2MRequest) {
      if (!m2mAuth.authorized) {
        return NextResponse.json(
          {
            error: m2mAuth.errorMessage || "Unauthorized machine request",
            code: m2mAuth.errorCode || "UNAUTHORIZED",
          },
          { status: m2mAuth.statusCode || 401 }
        );
      }
      whereClause.tenantId = m2mAuth.tenantId!;
    } else {
      // User Session Authentication: must have valid session cookie and active membership
      const sessionContext = await authSession.getSessionContext().catch(() => null);
      if (!sessionContext?.membership || !sessionContext.tenant) {
        return NextResponse.json(
          {
            error: "Unauthorized: Valid user session or machine authentication required.",
            code: "UNAUTHORIZED_ACCESS",
          },
          { status: 401 }
        );
      }

      // Role check: CLIENT role cannot access practice pending doc queues
      if (sessionContext.membership.role === "CLIENT") {
        return NextResponse.json(
          {
            error: "Forbidden: Client portal users cannot access practice pending document queues.",
            code: "FORBIDDEN_ROLE",
          },
          { status: 403 }
        );
      }

      // Tenant active & suspension check for session user
      if (!sessionContext.tenant.active || sessionContext.tenant.isSuspended) {
        return NextResponse.json(
          {
            error: "Forbidden: Tenant account is suspended or inactive.",
            code: "TENANT_UNAUTHORIZED",
          },
          { status: 403 }
        );
      }

      // STRICT TENANT ISOLATION: Always use server-resolved tenantId. Untrusted client input ignored.
      whereClause.tenantId = sessionContext.membership.tenantId;
    }

    // Defense-in-depth safety assertion: unscoped queries are strictly impossible
    if (!whereClause.tenantId) {
      return NextResponse.json(
        {
          error: "Tenant scope violation: Unscoped queries are strictly forbidden.",
          code: "UNSCOPED_QUERY_FORBIDDEN",
        },
        { status: 400 }
      );
    }

    const requests = await db.documentRequest.findMany({
      where: whereClause,
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        title: true,
        description: true,
        reminderCount: true,
        lastReminderAt: true,
        status: true,
        createdAt: true,
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      requests: serializeForClient(requests),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch pending requests", message: err.message },
      { status: 500 }
    );
  }
}

