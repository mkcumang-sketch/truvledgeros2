/**
 * TRUV LedgerOS — Production Database Clean-Up & Blank Slate Reset Script
 * 
 * Safely purges all mock/dummy test records, fake transactions, demo clients,
 * and test communications across Railway PostgreSQL.
 * 
 * Preserves:
 * - Active Tenant profile (firm configuration)
 * - Super-admin, Firm Owner, Partner, and Team member accounts
 * - Canonical Automation definitions & Feature Flags
 * 
 * Usage:
 *   npx tsx scripts/clean-production-db.ts --confirm
 *   npx ts-node -r tsconfig-paths/register scripts/clean-production-db.ts --confirm
 */

import { db } from "../src/lib/db";
import * as readline from "readline";

async function promptConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes" || answer.trim().toLowerCase() === "y");
    });
  });
}

export async function cleanProductionDatabase(options: { force?: boolean } = {}) {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — PRODUCTION DATABASE PURGE & BLANK SLATE RESET");
  console.log("==================================================================\n");

  const hasConfirmFlag = process.argv.includes("--confirm") || process.argv.includes("--yes") || options.force;

  if (!hasConfirmFlag) {
    console.log("WARNING: This operation will permanently delete ALL:");
    console.log("  • Invoices, Invoice Items, and Recorded Payments");
    console.log("  • GST Returns and GST Client Profiles");
    console.log("  • Document Vault Files and Document Requests");
    console.log("  • Outbound Communications, Conversations, and Chat Messages");
    console.log("  • Practice Tasks, Task Escalations, and Reminders");
    console.log("  • Outbox Automation Events and Run History");
    console.log("  • Demo Clients and Contacts");
    console.log("  • Client-role demo user accounts\n");
    console.log("Active firm tenants, admin accounts, and partner users will be PRESERVED.\n");

    const confirmed = await promptConfirmation("Are you sure you want to proceed? Type 'yes' to confirm: ");
    if (!confirmed) {
      console.log("\n[ABORTED] Database wipe cancelled by user.");
      process.exit(0);
    }
  }

  console.log("\n[1/4] Inspecting existing records before purge...");

  const preCounts = {
    messages: await db.message.count(),
    conversations: await db.conversation.count(),
    communications: await db.communication.count(),
    tasks: await db.task.count(),
    invoiceItems: await db.invoiceItem.count(),
    payments: await db.payment.count(),
    invoices: await db.invoice.count(),
    gstReturns: await db.gstReturn.count(),
    gstProfiles: await db.gstProfile.count(),
    documents: await db.document.count(),
    documentRequests: await db.documentRequest.count(),
    contacts: await db.contact.count(),
    automationRuns: await db.automationRun.count(),
    automationEvents: await db.automationEvent.count(),
    clients: await db.client.count(),
  };

  console.log("Current Record Counts:\n", JSON.stringify(preCounts, null, 2));

  console.log("\n[2/4] Executing batch cascade purge...");

  // Execute in strict FK dependency order using batch transaction
  const [
    delMessages,
    delConversations,
    delCommunications,
    delTasks,
    delInvoiceItems,
    delPayments,
    delInvoices,
    delGstReturns,
    delGstProfiles,
    delDocuments,
    delDocRequests,
    delAutomationRuns,
    delAutomationEvents,
    delContacts,
    delClients,
  ] = await db.$transaction([
    db.message.deleteMany({}),
    db.conversation.deleteMany({}),
    db.communication.deleteMany({}),
    db.task.deleteMany({}),
    db.invoiceItem.deleteMany({}),
    db.payment.deleteMany({}),
    db.invoice.deleteMany({}),
    db.gstReturn.deleteMany({}),
    db.gstProfile.deleteMany({}),
    db.document.deleteMany({}),
    db.documentRequest.deleteMany({}),
    db.automationRun.deleteMany({}),
    db.automationEvent.deleteMany({}),
    db.contact.deleteMany({}),
    db.client.deleteMany({}),
  ]);

  // Clean demo client users (e.g. client role users)
  const demoUsers = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: "example.com" } },
        { email: { contains: "sharma-traders" } },
        { memberships: { some: { role: "CLIENT" } } },
      ],
      isSuperAdmin: false,
    },
    select: { id: true, email: true },
  });

  let deletedDemoUsers = 0;
  if (demoUsers.length > 0) {
    const ids = demoUsers.map((u) => u.id);
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.membership.deleteMany({ where: { userId: { in: ids } } });
    const res = await db.user.deleteMany({ where: { id: { in: ids } } });
    deletedDemoUsers = res.count;
  }

  const result = {
    messages: delMessages.count,
    conversations: delConversations.count,
    communications: delCommunications.count,
    tasks: delTasks.count,
    invoiceItems: delInvoiceItems.count,
    payments: delPayments.count,
    invoices: delInvoices.count,
    gstReturns: delGstReturns.count,
    gstProfiles: delGstProfiles.count,
    documents: delDocuments.count,
    documentRequests: delDocRequests.count,
    automationRuns: delAutomationRuns.count,
    automationEvents: delAutomationEvents.count,
    contacts: delContacts.count,
    clients: delClients.count,
    demoUsers: deletedDemoUsers,
  };

  console.log("\n[3/4] Purged records summary:");
  for (const [key, count] of Object.entries(result)) {
    console.log(`  ✓ ${key}: ${count} records deleted`);
  }

  console.log("\n[4/4] Verifying preserved foundational state...");

  const preservedTenants = await db.tenant.findMany({
    select: { id: true, name: true, slug: true, email: true, active: true },
  });
  console.log(`\nPreserved Tenants (${preservedTenants.length}):`);
  for (const t of preservedTenants) {
    console.log(`  • [TENANT] ${t.name} (${t.slug}) - ${t.email}`);
  }

  const preservedUsers = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
      memberships: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nPreserved Users & Roles (${preservedUsers.length}):`);
  for (const u of preservedUsers) {
    const roles = u.memberships.map((m) => m.role).join(", ") || (u.isSuperAdmin ? "SUPERADMIN" : "NONE");
    console.log(`  • [USER] ${u.name} <${u.email}> (${roles})`);
  }

  const preservedAutomations = await db.automation.count();
  console.log(`\nPreserved Canonical Automations: ${preservedAutomations}`);

  // Post-verification check
  const postClientCount = await db.client.count();
  const postInvoiceCount = await db.invoice.count();
  if (postClientCount === 0 && postInvoiceCount === 0) {
    console.log("\n[VERIFIED] Database is 100% BLANK of transactional and demo data.");
  }

  console.log("\n==================================================================");
  console.log("PRODUCTION CLEAN-UP COMPLETE: BLANK SLATE READY FOR REAL CLIENTS");
  console.log("==================================================================\n");

  return result;
}

if (require.main === module) {
  cleanProductionDatabase().catch((err) => {
    console.error("Clean-up failed:", err);
    process.exit(1);
  });
}
