// Definition of the 6 canonical TRUV LedgerOS Workflows
export const CORE_WORKFLOWS = [
  {
    code: "ONBOARDING",
    name: "Workflow A — Client Onboarding",
    description: "Triggers on client creation or bulk import to initialize statutory KYC verification, portal credential auditing, and prior period tasks.",
    trigger: "client.created / clients.bulk_imported",
    category: "Client 360°",
  },
  {
    code: "GST_COMPLIANCE",
    name: "Workflow B — GST & Statutory Reminders",
    description: "Scheduled check against live compliance obligations in Asia/Kolkata timezone. Evaluates real filing statuses without false statutory assumptions.",
    trigger: "Scheduled Cron (0 9 * * *)",
    category: "GST & Tax",
  },
  {
    code: "DOC_COLLECTION",
    name: "Workflow C — Document Collection & Escalation",
    description: "Monitors outstanding document requests. Automatically increments reminder count and escalates to partners upon reaching the 3-reminder threshold.",
    trigger: "Scheduled / Event: doc.request.pending",
    category: "Document Vault",
  },
  {
    code: "TASK_APPROVALS",
    name: "Workflow D — Task Assignment & Approvals",
    description: "Dispatches assignment notifications to responsible staff and routes review rejections back to preparers while maintaining full audit logs.",
    trigger: "task.assigned / task.rejected",
    category: "Practice Operations",
  },
  {
    code: "INVOICE_REMINDERS",
    name: "Workflow E — Invoice & Payment Reminders",
    description: "Evaluates due and overdue invoices. Rechecks authoritative PostgreSQL balance to suppress reminders for settled or voided invoices.",
    trigger: "invoice.issued / invoice.overdue",
    category: "Financial Engine",
  },
  {
    code: "FAILURE_ALERTS",
    name: "Workflow F — Automation Failure & Dead-Letter Alerts",
    description: "Captures terminal workflow errors with safe diagnostics and correlation IDs for partner investigation without exposing raw credentials.",
    trigger: "automation.dead_letter",
    category: "System Reliability",
  },
];
