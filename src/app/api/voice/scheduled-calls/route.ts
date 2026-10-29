import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  rescheduleCall,
  updateScheduledCallStatus,
} from "@/lib/server/voice/campaign-service";
import { executeScheduledCallsSweep } from "@/lib/server/voice/scheduler";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = { tenantId };
    if (campaignId) where.campaignId = campaignId;
    if (status && status !== "ALL") where.status = status;
    if (search) {
      where.OR = [
        { client: { name: { contains: search, mode: "insensitive" } } },
        { client: { phone: { contains: search } } },
      ];
    }

    const calls = await db.scheduledCall.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
        campaign: { select: { id: true, name: true, purpose: true } },
        assignedOwner: { select: { id: true, name: true } },
      },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    return NextResponse.json({ success: true, calls });
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

    const body = await req.json().catch(() => ({}));
    const { action, callId } = body;

    if (action === "RESCHEDULE") {
      if (!callId || !body.scheduledFor) {
        return NextResponse.json({ error: "callId and scheduledFor are required" }, { status: 400 });
      }
      const updated = await rescheduleCall(tenantId, callId, body.scheduledFor, body.assignedOwnerId);
      return NextResponse.json({ success: true, call: updated });
    }

    if (action === "PAUSE" || action === "RESUME" || action === "CANCEL") {
      if (!callId) {
        return NextResponse.json({ error: "callId is required" }, { status: 400 });
      }
      const updated = await updateScheduledCallStatus(tenantId, callId, action);
      return NextResponse.json({ success: true, call: updated });
    }

    if (action === "TRIGGER_SWEEP") {
      // Role check: Only authorized staff can manually trigger calls
      const role = context.membership?.role;
      if (role !== "FIRM_OWNER" && role !== "FIRM_ADMIN" && role !== "PARTNER" && role !== "GODMODE_ADMIN" && role !== "MANAGER") {
        return NextResponse.json({ error: "Forbidden: Insufficient privileges to trigger calling sweep." }, { status: 403 });
      }

      const sweepResult = await executeScheduledCallsSweep({
        tenantId,
        forceIgnoreWindow: body.forceIgnoreWindow ?? true,
      });

      return NextResponse.json({ success: true, sweepResult });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
