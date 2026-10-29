import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await db.callingCampaign.findFirst({
      where: { id: params.campaignId, tenantId },
      include: {
        assignedOwner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        scheduledCalls: {
          include: {
            client: { select: { id: true, name: true, phone: true, email: true } },
          },
          orderBy: { scheduledFor: "asc" },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action; // PAUSE, RESUME, CANCEL

    const campaign = await db.callingCampaign.findFirst({
      where: { id: params.campaignId, tenantId },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let nextStatus = campaign.status;
    let callStatus = "SCHEDULED";

    if (action === "PAUSE") {
      nextStatus = "PAUSED";
      callStatus = "PAUSED";
    } else if (action === "RESUME") {
      nextStatus = "ACTIVE";
      callStatus = "SCHEDULED";
    } else if (action === "CANCEL") {
      nextStatus = "CANCELLED";
      callStatus = "CANCELLED";
    } else {
      return NextResponse.json({ error: `Invalid campaign action: ${action}` }, { status: 400 });
    }

    const updated = await db.callingCampaign.update({
      where: { id: campaign.id },
      data: { status: nextStatus },
    });

    // Cascade update to pending scheduled calls of this campaign
    await db.scheduledCall.updateMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["SCHEDULED", "PAUSED"] },
      },
      data: { status: callStatus },
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
