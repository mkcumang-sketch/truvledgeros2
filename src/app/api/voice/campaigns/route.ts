import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  createCallingCampaign,
  validateClientEligibility,
  getAuthoritativeCallingMetrics,
} from "@/lib/server/voice/campaign-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaigns = await db.callingCampaign.findMany({
      where: { tenantId },
      include: {
        assignedOwner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { scheduledCalls: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const metrics = await getAuthoritativeCallingMetrics(tenantId);

    return NextResponse.json({
      success: true,
      campaigns,
      metrics,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check: Only Owner, Partner, Admin, or Manager can create calling campaigns
    const role = context.membership?.role;
    if (role !== "FIRM_OWNER" && role !== "FIRM_ADMIN" && role !== "PARTNER" && role !== "GODMODE_ADMIN" && role !== "MANAGER") {
      return NextResponse.json(
        { error: "Forbidden: Executive role cannot create calling campaigns." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // If client only asked for eligibility preview
    if (body.action === "VALIDATE_ELIGIBILITY") {
      const eligibility = await validateClientEligibility(tenantId, body.clientIds || []);
      return NextResponse.json({ success: true, eligibility });
    }

    const created = await createCallingCampaign(tenantId, context.user.id, {
      name: body.name,
      purpose: body.purpose || "PAYMENT_RECOVERY",
      description: body.description,
      clientIds: body.clientIds || [],
      scheduledAt: body.scheduledAt,
      callingWindowStart: body.callingWindowStart || "10:00",
      callingWindowEnd: body.callingWindowEnd || "18:00",
      timezone: body.timezone || "Asia/Kolkata",
      frequency: body.frequency || "ONCE",
      retryLimit: body.retryLimit !== undefined ? Number(body.retryLimit) : 2,
      retryIntervalMinutes: body.retryIntervalMinutes !== undefined ? Number(body.retryIntervalMinutes) : 120,
      languagePreference: body.languagePreference || "HINGLISH",
      scriptTemplate: body.scriptTemplate,
      assignedOwnerId: body.assignedOwnerId || context.user.id,
    });

    return NextResponse.json({
      success: true,
      campaign: created.campaign,
      eligibleCount: created.eligibleCount,
      excludedCount: created.excludedCount,
      scheduledAt: created.scheduledAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
