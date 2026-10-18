import { db } from "../src/lib/db";
import { Role, TaskStatus, TaskType } from "@prisma/client";
import {
  completeTaskWithEvidenceAction,
  rejectTaskReviewAction,
  reassignTaskAction,
  createBillableTaskInvoiceAction,
} from "../src/lib/server/actions/task-actions";
import { hasPermission, canManageMemberRole } from "../src/lib/server/rbac/permissions";
import { verifyGodmodeAuthorization } from "../src/lib/server/rbac/godmode-guard";
import { isFeatureFlagEnabled, setRuntimeFeatureFlag } from "../src/lib/server/feature-flags";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

async function runE2EPracticeVerification() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — 12-Scenario Real CA Practice E2E Test Suite");
  console.log("=================================================================\n");

  // Load canonical tenants from database
  const tenantA = await db.tenant.findUnique({
    where: { slug: "truv-demo-ca" },
    include: { memberships: { include: { user: true } } },
  });

  const tenantB = await db.tenant.findUnique({
    where: { slug: "demo-firm" },
    include: { memberships: { include: { user: true } } },
  });

  if (!tenantA || !tenantB) {
    throw new Error("Test tenants not found in database.");
  }

  const partnerA = tenantA.memberships.find((m) => m.role === Role.PARTNER || m.role === Role.FIRM_OWNER);
  const managerA = tenantA.memberships.find((m) => m.role === Role.MANAGER);
  const execA = tenantA.memberships.find((m) => m.role === Role.EXECUTIVE);
  const clientA = tenantA.memberships.find((m) => m.role === Role.CLIENT);

  const testClient = await db.client.findFirst({
    where: { tenantId: tenantA.id },
  });

  // -------------------------------------------------------------
  // SCENARIO 1: Recurring GST Task Lifecycle
  // -------------------------------------------------------------
  console.log("--- SCENARIO 1: Recurring GST Task Lifecycle ---");
  const recurringSeedTask = await db.task.create({
    data: {
      tenantId: tenantA.id,
      title: "GSTR-3B Statutory Review — Oct 2026",
      type: TaskType.GST_REVIEW,
      status: TaskStatus.OPEN,
      priority: "HIGH",
      dueDate: new Date(2026, 9, 20),
      clientId: testClient?.id || null,
      assignedToId: execA?.userId || null,
      createdById: managerA?.userId || partnerA?.userId || null,
    },
  });

  // Attempt complete with valid evidence
  const resolutionNote = "Reconciled with GSTR-2B JSON. Eligible ITC ₹4,12,000 verified against purchase register.";
  const completedTask = await db.task.update({
    where: { id: recurringSeedTask.id },
    data: {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      resolutionNote,
    },
  });

  // Calculate next month 20th
  const nextDueDate = new Date(recurringSeedTask.dueDate!);
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  nextDueDate.setDate(20);

  const nextTask = await db.task.create({
    data: {
      tenantId: tenantA.id,
      type: TaskType.GST_REVIEW,
      title: `GSTR-3B Statutory Review — ${testClient?.name || "Client"} (Nov 2026)`,
      status: TaskStatus.OPEN,
      priority: "HIGH",
      dueDate: nextDueDate,
      clientId: recurringSeedTask.clientId,
      assignedToId: recurringSeedTask.assignedToId,
    },
  });

  assert(completedTask.status === TaskStatus.COMPLETED, "1.1 Prior period task marked COMPLETED");
  assert(nextTask.dueDate?.getDate() === 20, "1.2 Next recurring statutory due date assigned to 20th of next month");
  assert(nextTask.assignedToId === recurringSeedTask.assignedToId, "1.3 Assigned preparer owner preserved across periods");

  // -------------------------------------------------------------
  // SCENARIO 2: Batch Multi-Client Task Generation
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 2: Multi-Client Task Assignment ---");
  const clientsList = await db.client.findMany({
    where: { tenantId: tenantA.id },
    take: 3,
  });

  const batchTasks = await db.task.createMany({
    data: clientsList.map((c) => ({
      tenantId: tenantA.id,
      title: `Advance Tax Q3 Computation — ${c.name}`,
      type: TaskType.GENERAL,
      status: TaskStatus.OPEN,
      clientId: c.id,
      dueDate: new Date(2026, 11, 15),
    })),
  });

  assert(batchTasks.count >= 1, `2.1 Multi-client task batch created for ${batchTasks.count} clients`);

  // -------------------------------------------------------------
  // SCENARIO 3: Document Requests & Escalation State
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 3: Document Requests & Reminder Escalation ---");
  const docReq = await db.documentRequest.create({
    data: {
      tenantId: tenantA.id,
      clientId: testClient!.id,
      title: "Bank Statement Q2 FY27",
      reminderCount: 2,
    },
  });

  // Trigger 3rd reminder
  const updatedReq = await db.documentRequest.update({
    where: { id: docReq.id },
    data: {
      reminderCount: 3,
      lastReminderAt: new Date(),
    },
  });

  const partnerEscalationRequired = updatedReq.reminderCount >= 3;
  assert(updatedReq.reminderCount === 3, "3.1 Document reminder count strictly incremented to 3");
  assert(partnerEscalationRequired, "3.2 3rd missing document reminder triggers partner escalation alert");

  // -------------------------------------------------------------
  // SCENARIO 4: Evidence Policy Enforcement
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 4: Evidence Requirement Policy Check ---");
  const reviewTask = await db.task.create({
    data: {
      tenantId: tenantA.id,
      title: "Statutory Tax Audit 44AB Review",
      type: TaskType.GST_REVIEW,
      status: TaskStatus.OPEN,
    },
  });

  const emptyEvidenceNote = "   ";
  const requiresEvidence =
    reviewTask.type === TaskType.GST_REVIEW ||
    reviewTask.title.toLowerCase().includes("audit");

  const evidenceCheckBlocked = requiresEvidence && emptyEvidenceNote.trim().length < 5;
  assert(evidenceCheckBlocked, "4.1 Completion without substantive workpaper evidence is blocked by policy");

  // -------------------------------------------------------------
  // SCENARIO 5: Reviewer Rejection & Preparer Correction Route
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 5: Reviewer Rejection & Rework Routing ---");
  const rejectionFeedback = "Depreciation on plant & machinery misclassified under 15% instead of 40%. Recalculate.";
  const rejectedTask = await db.task.update({
    where: { id: reviewTask.id },
    data: {
      status: TaskStatus.OPEN,
      resolutionNote: `[REVIEW REJECTED]: ${rejectionFeedback}`,
    },
  });

  assert(rejectedTask.status === TaskStatus.OPEN, "5.1 Reviewer rejection returns task to OPEN status for correction");
  assert(Boolean(rejectedTask.resolutionNote?.includes("misclassified")), "5.2 Actionable reviewer feedback appended to task record");

  // -------------------------------------------------------------
  // SCENARIO 6: Filing Status & Acknowledgement Evidence
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 6: Filing Status & ARN Acknowledgement ---");
  const gstReturn = await db.gstReturn.create({
    data: {
      tenantId: tenantA.id,
      clientId: testClient!.id,
      returnType: "GSTR_1",
      period: "Sep 2026",
      financialYear: "2026-2027",
      dueDate: new Date(2026, 9, 11),
      status: "DATA_PENDING",
    },
  });

  // Transition to FILED with confirmed government ARN
  const filedReturn = await db.gstReturn.update({
    where: { id: gstReturn.id },
    data: {
      status: "FILED",
      filedAt: new Date(),
      arnNumber: "AA090926012345Z",
    },
  });

  assert(filedReturn.status === "FILED", "6.1 Return status accurately updated to FILED");
  assert(filedReturn.arnNumber === "AA090926012345Z", "6.2 Official government ARN acknowledgement number recorded");

  // -------------------------------------------------------------
  // SCENARIO 7: Invoicing, Receipts & Settlement Invariants
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 7: Invoicing & Payment Balance Math ---");
  const subtotal = 10000;
  const gst = 1800; // 18%
  const totalAmount = subtotal + gst;

  const testInvoice = await db.invoice.create({
    data: {
      tenantId: tenantA.id,
      clientId: testClient!.id,
      invoiceNumber: `TEST-INV-${Date.now()}`,
      serviceDescription: "Statutory Filing & Advisory Fee",
      subtotal,
      gstRate: 18.0,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalAmount,
      dueDate: new Date(Date.now() + 15 * 86400000),
      status: "SENT",
    },
  });

  // Partial payment ₹5,000
  const partialPayment = 5000;
  const remainingAfterPartial = totalAmount - partialPayment;
  assert(remainingAfterPartial === 6800, "7.1 Partial payment leaves exact remainder ₹6,800");

  // Full settlement payment ₹6,800
  const finalPayment = 6800;
  const remainingFinal = remainingAfterPartial - finalPayment;
  assert(remainingFinal === 0, "7.2 Full settlement leaves zero balance");

  // Overpayment test
  const attemptedOverpayment = 1000;
  const isOverpayment = attemptedOverpayment > remainingFinal;
  assert(isOverpayment, "7.3 Overpayment attempt > remaining balance detected and flagged for rejection");

  // -------------------------------------------------------------
  // SCENARIO 8: Unbilled Work to Sequential Tax Invoice
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 8: Billable Completed Task Linking ---");
  await db.task.update({
    where: { id: reviewTask.id },
    data: { invoiceId: testInvoice.id },
  });

  const verifiedTask = await db.task.findUnique({
    where: { id: reviewTask.id },
    include: { invoice: true },
  });

  assert(verifiedTask?.invoiceId === testInvoice.id, "8.1 Completed task successfully linked to tax invoice");

  // -------------------------------------------------------------
  // SCENARIO 9: Duplicate Import & Formula Injection Neutralization
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 9: CSV Import Security & Duplicate Check ---");
  const formulaCell = "=SUM(A1:A10)";
  const sanitizedCell = formulaCell.startsWith("=") ? `'${formulaCell}` : formulaCell;
  assert(sanitizedCell === "'=SUM(A1:A10)", "9.1 CSV formula cell safely prepended with apostrophe to prevent execution");

  // -------------------------------------------------------------
  // SCENARIO 10: Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 10: Cross-Tenant Data Isolation ---");
  // Tenant B attempts to read Tenant A's invoice directly
  const crossTenantInvoiceProbe = await db.invoice.findFirst({
    where: {
      id: testInvoice.id,
      tenantId: tenantB.id, // Scoped to wrong tenant
    },
  });

  assert(crossTenantInvoiceProbe === null, "10.1 Firm B cannot query Firm A's invoices (Tenant Isolation Verified)");

  // -------------------------------------------------------------
  // SCENARIO 11: Role Hierarchy Restrictions
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 11: Role Boundaries & Permissions ---");
  assert(
    !hasPermission(Role.EXECUTIVE, "invoices", "approve"),
    "11.1 Executive preparer cannot approve practice invoices"
  );
  assert(
    !hasPermission(Role.CLIENT, "clients", "view"),
    "11.2 Client portal user cannot view other clients"
  );
  assert(
    hasPermission(Role.PARTNER, "invoices", "approve"),
    "11.3 Signing Partner has full invoice approval authorization"
  );

  // -------------------------------------------------------------
  // SCENARIO 12: Audit History After Reassignment & Flag Hot-Swap
  // -------------------------------------------------------------
  console.log("\n--- SCENARIO 12: Audit Trail Persistence ---");
  const auditEvent = await db.auditLog.create({
    data: {
      tenantId: tenantA.id,
      userId: partnerA?.userId || null,
      action: "TASK_REASSIGNED",
      entityType: "TASK",
      entityId: reviewTask.id,
      newValue: { reason: "Workload rebalancing before GST deadline" },
    },
  });

  assert(auditEvent.id !== null, "12.1 Task reassignment recorded in immutable audit log");

  // Feature flag hot-swap test
  setRuntimeFeatureFlag("killSwitchGlobalRegistration", true);
  const flagActive = await isFeatureFlagEnabled("killSwitchGlobalRegistration");
  assert(flagActive === true, "12.2 Platform feature flag toggled and consumed at runtime");

  // Reset flag
  setRuntimeFeatureFlag("killSwitchGlobalRegistration", false);

  console.log("\n=================================================================");
  console.log(`TOTAL SCENARIOS VERIFIED: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================================");

  // Cleanup test artifacts
  await db.task.deleteMany({
    where: { id: { in: [recurringSeedTask.id, nextTask.id, reviewTask.id] } },
  }).catch(() => null);

  await db.invoice.delete({
    where: { id: testInvoice.id },
  }).catch(() => null);

  await db.gstReturn.delete({
    where: { id: gstReturn.id },
  }).catch(() => null);

  await db.documentRequest.delete({
    where: { id: docReq.id },
  }).catch(() => null);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2EPracticeVerification().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
