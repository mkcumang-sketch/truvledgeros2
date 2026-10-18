"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { TaskStatus, TaskType, Role } from "@prisma/client";
import { logSecurityEvent } from "@/lib/server/audit";
import { getNextInvoiceNumber } from "@/lib/server/invoice-counter";
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import { z } from "zod";

const CreateTaskSchema = z.object({
  title: z.string().min(3, "Task title is required"),
  detail: z.string().optional().nullable(),
  type: z.nativeEnum(TaskType).default(TaskType.GENERAL),
  priority: z.string().default("NORMAL"),
  dueDate: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function createTaskAction(data: z.infer<typeof CreateTaskSchema>) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const validated = CreateTaskSchema.parse(data);

    const task = await db.task.create({
      data: {
        tenantId,
        title: validated.title.trim(),
        detail: validated.detail?.trim() || null,
        type: validated.type,
        priority: validated.priority,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
        clientId: validated.clientId || null,
        assignedToId: validated.assignedToId || null,
        createdById: context.user.id,
        status: TaskStatus.OPEN,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(task) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create task." };
  }
}

const UpdateTaskStatusSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  status: z.nativeEnum(TaskStatus),
});

export async function updateTaskStatusAction(taskId: string, status: TaskStatus) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const validated = UpdateTaskStatusSchema.parse({ taskId, status });

    const existing = await db.task.findFirst({
      where: { id: validated.taskId, tenantId },
    });

    if (!existing) {
      return { success: false, error: "Task not found in this practice firm." };
    }

    const task = await db.task.update({
      where: { id: existing.id },
      data: {
        status: validated.status,
        completedAt: validated.status === TaskStatus.COMPLETED ? new Date() : null,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(task) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update task status." };
  }
}

/**
 * Attempts to complete a task, strictly enforcing required workpaper evidence or resolution notes
 * for statutory review tasks (GST_REVIEW, INVOICE_APPROVAL).
 * If recurring GST task, auto-schedules the next month's return task.
 */
export async function completeTaskWithEvidenceAction(params: {
  taskId: string;
  resolutionNote?: string | null;
  isRecurringGst?: boolean;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const task = await db.task.findFirst({
      where: { id: params.taskId, tenantId },
      include: {
        client: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return { success: false, error: "Task not found." };
    }

    // Evidence requirement policy: Statutory compliance reviews require resolution/workpaper note
    const requiresEvidence =
      task.type === TaskType.GST_REVIEW ||
      task.type === TaskType.INVOICE_APPROVAL ||
      task.title.toLowerCase().includes("audit") ||
      task.title.toLowerCase().includes("gst");

    if (requiresEvidence && (!params.resolutionNote || params.resolutionNote.trim().length < 5)) {
      return {
        success: false,
        error:
          "Evidence policy violation: Statutory compliance reviews require a resolution note or workpaper reference before completion.",
      };
    }

    const completed = await db.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        resolutionNote: params.resolutionNote?.trim() || "Completed in accordance with practice checklist.",
      },
    });

    // Auto-generate next period for recurring GST tasks
    let nextRecurringTask: any = null;
    if (params.isRecurringGst || task.type === TaskType.GST_REVIEW) {
      const baseDueDate = task.dueDate ? new Date(task.dueDate) : new Date();
      // Next month 20th (standard GSTR-3B schedule)
      const nextDueDate = new Date(baseDueDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDate.setDate(20);

      const nextMonthName = nextDueDate.toLocaleString("default", { month: "short", year: "numeric" });

      nextRecurringTask = await db.task.create({
        data: {
          tenantId,
          type: TaskType.GST_REVIEW,
          title: `GSTR-3B Statutory Review — ${task.client?.name || "Client"} (${nextMonthName})`,
          detail: `Automated recurring compliance cycle generated upon completion of prior cycle.`,
          priority: "HIGH",
          dueDate: nextDueDate,
          clientId: task.clientId,
          assignedToId: task.assignedToId,
          createdById: context.user.id,
          status: TaskStatus.OPEN,
        },
      });
    }

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {
      success: true,
      data: serializeForClient({
        completedTask: completed,
        nextRecurringTask,
      }),
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to complete task." };
  }
}

/**
 * Reassigns a task after work has commenced and records an immutable audit log entry.
 */
export async function reassignTaskAction(params: {
  taskId: string;
  newAssigneeId: string;
  reason?: string;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const task = await db.task.findFirst({
      where: { id: params.taskId, tenantId },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return { success: false, error: "Task not found." };
    }

    const previousAssigneeName = task.assignedTo?.name || "Unassigned";

    const newAssigneeMembership = await db.membership.findFirst({
      where: { userId: params.newAssigneeId, tenantId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!newAssigneeMembership || !newAssigneeMembership.user) {
      return { success: false, error: "New assignee must be an active member of this practice firm." };
    }
    const newAssignee = newAssigneeMembership.user;

    const updated = await db.task.update({
      where: { id: task.id },
      data: {
        assignedToId: params.newAssigneeId,
      },
    });

    // Record audit trail of reassignment
    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "TASK_REASSIGNED" as any,
      entityType: "TASK" as any,
      entityId: task.id,
      oldValue: { assignedTo: previousAssigneeName, assigneeId: task.assignedToId },
      newValue: {
        assignedTo: newAssignee.name,
        assigneeId: newAssignee.id,
        reason: params.reason || "Reassigned by practice manager",
      },
    });

    revalidatePath("/tasks");
    return { success: true, data: serializeForClient(updated) };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reassign task." };
  }
}

/**
 * Reviewer rejects task at review stage and returns it to preparer with feedback.
 */
export async function rejectTaskReviewAction(params: {
  taskId: string;
  feedback: string;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!params.feedback.trim()) {
      return { success: false, error: "Review rejection requires actionable feedback for the preparer." };
    }

    const task = await db.task.findFirst({
      where: { id: params.taskId, tenantId },
    });

    if (!task) {
      return { success: false, error: "Task not found." };
    }

    // Role check: Only PARTNER or MANAGER can reject reviews
    const allowedRoles = [Role.PARTNER, Role.MANAGER, Role.FIRM_OWNER, Role.GODMODE_ADMIN];
    if (!allowedRoles.includes(context.membership.role as any)) {
      return { success: false, error: "Only firm Partners or Managers can perform reviewer sign-off or rejection." };
    }

    const updated = await db.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.OPEN, // Returns to open queue for correction
        assignedToId: task.createdById || task.assignedToId, // Reassigns back to preparer
        resolutionNote: `[REVIEW REJECTED by ${context.user.name}]: ${params.feedback.trim()}`,
      },
    });

    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "TASK_REVIEW_REJECTED" as any,
      entityType: "TASK" as any,
      entityId: task.id,
      newValue: { feedback: params.feedback.trim() },
    });

    revalidatePath("/tasks");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reject task review." };
  }
}

/**
 * Creates a sequential GST fee invoice from a billable task.
 */
export async function createBillableTaskInvoiceAction(params: {
  taskId: string;
  feeAmount: number;
  serviceDescription?: string;
}) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const task = await db.task.findFirst({
      where: { id: params.taskId, tenantId },
      include: {
        client: true,
      },
    });

    if (!task || !task.client) {
      return { success: false, error: "Task or associated client not found." };
    }

    if (params.feeAmount <= 0) {
      return { success: false, error: "Fee amount must be greater than zero." };
    }

    const subtotal = params.feeAmount;
    const isOutsideUP =
      Boolean(task.client.state && !task.client.state.toLowerCase().includes("uttar pradesh")) ||
      Boolean(task.client.gstin && !task.client.gstin.startsWith("09"));

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isOutsideUP) {
      igst = Math.round(subtotal * 0.18 * 100) / 100;
    } else {
      cgst = Math.round(subtotal * 0.09 * 100) / 100;
      sgst = Math.round(subtotal * 0.09 * 100) / 100;
    }

    const total = subtotal + cgst + sgst + igst;
    const invoiceNumber = await getNextInvoiceNumber(tenantId);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);

    const invoice = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          tenantId,
          clientId: task.client!.id,
          invoiceNumber,
          serviceDescription: params.serviceDescription || `Professional Fee for ${task.title}`,
          subtotal,
          gstRate: 18.0,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: igst,
          totalAmount: total,
          dueDate,
          createdById: context.user.id,
        },
      });

      // Link task to the generated invoice
      await tx.task.update({
        where: { id: task.id },
        data: { invoiceId: inv.id },
      });

      return inv;
    });

    revalidatePath("/tasks");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    return { success: true, data: invoice };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to generate billable invoice." };
  }
}
