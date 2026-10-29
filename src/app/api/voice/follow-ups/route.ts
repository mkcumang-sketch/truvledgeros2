import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { TaskType, TaskStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const context = await getSessionContext();
    const tenantId = context.membership?.tenantId || context.tenant?.id;

    if (!tenantId || !context.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queue = searchParams.get("queue") || "ALL"; // CALLBACK_REQUESTED, RESCHEDULE_REQUESTED, NO_ANSWER, FAILED_ATTEMPTS, AWAITING_CLIENT_RESPONSE, OVERDUE, RESOLVED

    const now = new Date();
    const where: any = {
      tenantId,
      type: { in: [TaskType.PAYMENT_ESCALATION, TaskType.DOCUMENT_CALL, TaskType.GENERAL] },
      title: { contains: "Call" },
    };

    if (queue === "RESOLVED") {
      where.status = TaskStatus.COMPLETED;
    } else {
      where.status = { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] };

      if (queue === "OVERDUE") {
        where.dueDate = { lt: now };
      } else if (queue === "CALLBACK_REQUESTED") {
        where.title = { contains: "Callback" };
      } else if (queue === "NO_ANSWER" || queue === "FAILED_ATTEMPTS") {
        where.title = { contains: "Unanswered" };
      }
    }

    const tasks = await db.task.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 100,
    });

    return NextResponse.json({ success: true, tasks });
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
    const { taskId, action } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const task = await db.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!task) {
      return NextResponse.json({ error: "Follow-up task not found" }, { status: 404 });
    }

    if (action === "RESOLVE") {
      const updated = await db.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          resolutionNote: body.resolutionNote?.trim() || "Resolved by practice staff.",
        },
      });
      return NextResponse.json({ success: true, task: updated });
    }

    if (action === "UPDATE_DETAILS") {
      const updateData: any = {};
      if (body.assignedOwnerId !== undefined) updateData.assignedToId = body.assignedOwnerId;
      if (body.dueDate) updateData.dueDate = new Date(body.dueDate);
      if (body.priority) updateData.priority = body.priority;
      if (body.internalNotes) {
        updateData.detail = `${task.detail || ""}\n[NOTE ${new Date().toISOString().slice(0, 10)}]: ${body.internalNotes.trim()}`;
      }

      const updated = await db.task.update({
        where: { id: taskId },
        data: updateData,
      });
      return NextResponse.json({ success: true, task: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
