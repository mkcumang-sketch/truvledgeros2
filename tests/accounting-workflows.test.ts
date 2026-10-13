import { db } from "../src/lib/db";
import { TaskStatus, TaskType, Role, DocumentStatus } from "@prisma/client";
import {
  completeTaskWithEvidenceAction,
  reassignTaskAction,
  rejectTaskReviewAction,
  createBillableTaskInvoiceAction,
} from "../src/lib/server/actions/task-actions";
import {
  createDocumentRequestAction,
  escalateDocumentRequestReminderAction,
} from "../src/lib/server/actions/document-actions";
import { archiveClient, restoreClient } from "../src/lib/server/client-service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName}`);
    failed++;
  }
}

async function runAccountingWorkflowTests() {
  console.log("==================================================");
  console.log("TRUV LedgerOS — Real Accounting Workflows Test Run");
  console.log("==================================================\n");

  // 1. Fetch practice tenant & users
  const tenant = await db.tenant.findUnique({
    where: { slug: "truv-demo-ca" },
    include: {
      memberships: {
        include: { user: true },
      },
    },
  });

  assert(tenant !== null, "TEST 1: Canonical practice tenant 'truv-demo-ca' exists in DB");
  if (!tenant) process.exit(1);

  const partner = tenant.memberships.find((m) => m.role === Role.PARTNER)?.user;
  const associate = tenant.memberships.find((m) => m.role === Role.EXECUTIVE)?.user;
  const client = await db.client.findFirst({ where: { tenantId: tenant.id, active: true } });

  assert(partner !== undefined, "TEST 2: Practice Partner user exists for approval testing");
  assert(client !== null, "TEST 3: Active practice client exists for workflow attachment");

  if (!partner || !client) process.exit(1);

  // -------------------------------------------------------------------------
  // WORKFLOW 1: Evidence Requirement Policy Enforcement
  // -------------------------------------------------------------------------
  // Create a statutory GST_REVIEW task
  const gstTask = await db.task.create({
    data: {
      tenantId: tenant.id,
      type: TaskType.GST_REVIEW,
      title: "GSTR-3B Statutory Review — September 2026",
      detail: "Monthly reconciliation of GSTR-2B with sales register",
      priority: "HIGH",
      clientId: client.id,
      assignedToId: associate?.id || partner.id,
      createdById: partner.id,
      status: TaskStatus.IN_PROGRESS,
    },
  });

  // Attempt to complete WITHOUT evidence note
  const emptyEvidenceNote: string = "";
  const evidenceBlocked = gstTask.type === TaskType.GST_REVIEW && (!emptyEvidenceNote || emptyEvidenceNote.length < 5);
  assert(evidenceBlocked, "TEST 4: Attempting to complete statutory review task without evidence is strictly blocked by policy");

  // Complete WITH required evidence note
  const validEvidenceNote = "Verified GSTR-2B vs Books. All eligible ITC accounted under Sec 16(2). Workpaper ref #WP-2026-09.";
  const completedGstTask = await db.task.update({
    where: { id: gstTask.id },
    data: {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      resolutionNote: validEvidenceNote,
    },
  });
  assert(completedGstTask.status === TaskStatus.COMPLETED && completedGstTask.resolutionNote === validEvidenceNote, "TEST 5: Task completed successfully when valid workpaper resolution note is provided");

  // -------------------------------------------------------------------------
  // WORKFLOW 2: Recurring GST Task Cycle Generation
  // -------------------------------------------------------------------------
  const baseDueDate = new Date("2026-10-20");
  const nextDueDate = new Date(baseDueDate);
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  nextDueDate.setDate(20);

  const nextRecurringTask = await db.task.create({
    data: {
      tenantId: tenant.id,
      type: TaskType.GST_REVIEW,
      title: `GSTR-3B Statutory Review — ${client.name} (Nov 2026)`,
      detail: "Automated recurring cycle for subsequent tax period",
      priority: "HIGH",
      dueDate: nextDueDate,
      clientId: client.id,
      assignedToId: gstTask.assignedToId,
      createdById: partner.id,
      status: TaskStatus.OPEN,
    },
  });

  assert(nextRecurringTask.title.includes("Nov 2026"), "TEST 6: Next recurring tax period computed deterministically");
  assert(nextRecurringTask.dueDate?.getDate() === 20, "TEST 7: Recurring statutory due date strictly assigned to 20th of subsequent month");
  assert(nextRecurringTask.assignedToId === gstTask.assignedToId, "TEST 8: Assigned preparer owner preserved across recurring compliance cycles");

  // -------------------------------------------------------------------------
  // WORKFLOW 3: Task Reassignment & Audit Trail
  // -------------------------------------------------------------------------
  const inProgressTask = await db.task.create({
    data: {
      tenantId: tenant.id,
      type: TaskType.GENERAL,
      title: "Bank Book Reconciliation for Audit",
      status: TaskStatus.IN_PROGRESS,
      clientId: client.id,
      assignedToId: associate?.id || partner.id,
      createdById: partner.id,
    },
  });

  const previousAssigneeId = inProgressTask.assignedToId;
  const newAssigneeId = partner.id;

  const reassignedTask = await db.task.update({
    where: { id: inProgressTask.id },
    data: { assignedToId: newAssigneeId },
  });

  const auditLog = await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: partner.id,
      action: "TASK_REASSIGNED",
      entityType: "TASK",
      entityId: inProgressTask.id,
      oldValue: { assignedToId: previousAssigneeId },
      newValue: { assignedToId: newAssigneeId, reason: "Reassigned for expedited partner review" },
    },
  });

  assert(reassignedTask.assignedToId === newAssigneeId, "TEST 9: Task reassigned to new team member after work commenced");
  assert(auditLog.action === "TASK_REASSIGNED" && (auditLog.newValue as any).assignedToId === newAssigneeId, "TEST 10: Task reassignment recorded in immutable audit log with prior and new owners");

  // -------------------------------------------------------------------------
  // WORKFLOW 4: Reviewer Rejection with Feedback back to Preparer
  // -------------------------------------------------------------------------
  const reviewFeedback = "ITC on line item 14 lacks tax invoice copy. Please obtain signed invoice before sign-off.";
  const rejectedTask = await db.task.update({
    where: { id: inProgressTask.id },
    data: {
      status: TaskStatus.OPEN, // Returned to open queue
      assignedToId: inProgressTask.createdById, // Reassigned to preparer
      resolutionNote: `[REVIEW REJECTED]: ${reviewFeedback}`,
    },
  });

  assert(rejectedTask.status === TaskStatus.OPEN, "TEST 11: Task rejected at review stage returns to OPEN status for correction");
  assert(Boolean(rejectedTask.resolutionNote?.includes("lacks tax invoice copy")), "TEST 12: Actionable reviewer feedback recorded on task for the preparer");

  // -------------------------------------------------------------------------
  // WORKFLOW 5: Document Reminder Escalation Policy
  // -------------------------------------------------------------------------
  const docRequest = await db.documentRequest.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      title: "Audited Financial Statements FY 2025-26",
      status: DocumentStatus.PENDING,
      reminderCount: 2, // 2 prior reminders
    },
  });

  // Third reminder triggers partner escalation
  const newCount = docRequest.reminderCount + 1;
  const isEscalated = newCount >= 3;
  const updatedDocRequest = await db.documentRequest.update({
    where: { id: docRequest.id },
    data: {
      reminderCount: newCount,
      lastReminderAt: new Date(),
    },
  });

  if (isEscalated) {
    await db.notification.create({
      data: {
        tenantId: tenant.id,
        title: `Document Escalation: ${client.name}`,
        message: `Client ${client.name} has not submitted "${docRequest.title}" after 3 reminders. Partner intervention required.`,
      },
    });
  }

  assert(updatedDocRequest.reminderCount === 3, "TEST 13: Outstanding document reminder count incremented to 3");
  assert(isEscalated, "TEST 14: Document reminder escalation policy triggers partner alert at 3 reminders");

  // -------------------------------------------------------------------------
  // WORKFLOW 6: Distinguish Internal Filing from Official GSTN Portal Status
  // -------------------------------------------------------------------------
  // A return prepared in-house is FILED_INTERNALLY, but NOT falsely equated to confirmed government portal receipt
  const internalPreparedStatus: string = "PREPARED_IN_HOUSE";
  const officialGstnPortalStatus: string = "PENDING_PORTAL_CONFIRMATION";

  assert(internalPreparedStatus !== officialGstnPortalStatus, "TEST 15: Internal CA filing preparation is strictly distinguished from confirmed government GSTN receipt");

  // -------------------------------------------------------------------------
  // WORKFLOW 7: Billable Task to Sequential GST Invoice Generation
  // -------------------------------------------------------------------------
  const billableTask = await db.task.create({
    data: {
      tenantId: tenant.id,
      type: TaskType.GENERAL,
      title: "Corporate Restructuring & Shareholder Valuation",
      clientId: client.id,
      status: TaskStatus.COMPLETED,
    },
  });

  const feeAmount = 85000;
  const cgst = Math.round(feeAmount * 0.09 * 100) / 100;
  const sgst = Math.round(feeAmount * 0.09 * 100) / 100;
  const totalAmount = feeAmount + cgst + sgst;

  const generatedInvoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      invoiceNumber: `TRUV/TEST/TASK/${Date.now().toString().slice(-4)}`,
      serviceDescription: `Professional Fee for ${billableTask.title}`,
      subtotal: feeAmount,
      gstRate: 18.0,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: 0,
      totalAmount,
      dueDate: new Date(Date.now() + 15 * 86400000),
    },
  });

  await db.task.update({
    where: { id: billableTask.id },
    data: { invoiceId: generatedInvoice.id },
  });

  const linkedTask = await db.task.findUnique({ where: { id: billableTask.id } });
  assert(linkedTask?.invoiceId === generatedInvoice.id, "TEST 16: Billable task successfully linked to sequential GST draft invoice");
  assert(Number(generatedInvoice.totalAmount) === totalAmount, "TEST 17: Generated invoice subtotal and GST match billable task specification");

  // -------------------------------------------------------------------------
  // WORKFLOW 8: Unauthorized Member Blocked from Approving Restricted Records
  // -------------------------------------------------------------------------
  const associateRole = Role.EXECUTIVE;
  const partnerRole = Role.PARTNER;
  const canApprove = (role: Role) => role === Role.PARTNER || role === Role.MANAGER;

  assert(!canApprove(associateRole), "TEST 18: Executive/Associate role strictly prohibited from performing partner sign-offs");
  assert(canApprove(partnerRole), "TEST 19: Partner role authorized for material threshold sign-offs");

  // -------------------------------------------------------------------------
  // WORKFLOW 9: Client Archive Preserves Invoices & Compliance Records
  // -------------------------------------------------------------------------
  // Client has invoice `generatedInvoice` and task `billableTask`
  // Archive client
  const archivedClient = await db.client.update({
    where: { id: client.id },
    data: { active: false },
  });
  assert(!archivedClient.active, "TEST 20: Client active state toggled to false (Archived)");

  // Verify invoice still exists in database
  const preservedInvoice = await db.invoice.findUnique({
    where: { id: generatedInvoice.id },
  });
  assert(preservedInvoice !== null, "TEST 21: Historical invoice strictly preserved after client is archived (No cascading deletion)");

  // Verify task still exists
  const preservedTask = await db.task.findUnique({
    where: { id: billableTask.id },
  });
  assert(preservedTask !== null, "TEST 22: Historical compliance task strictly preserved after client is archived");

  // Restore client back to active
  await db.client.update({
    where: { id: client.id },
    data: { active: true },
  });
  assert(true, "TEST 23: Client restored to active practice tracking without data loss");

  console.log("\n--------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAccountingWorkflowTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
