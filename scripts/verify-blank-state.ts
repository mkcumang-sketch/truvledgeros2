/**
 * TRUV LedgerOS — Zero-Data / Production Blank Slate Verification
 * Validates that all dashboard routes and data aggregators handle
 * zero clients, zero invoices, and zero transactions gracefully.
 */

import { db } from "../src/lib/db";
import { getDashboardFinancialMetrics, getPaymentRecoveryList } from "../src/lib/server/financial-analytics";
import { serializeForClient } from "../src/lib/serialization";

async function verifyBlankState() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Production Blank Slate & Zero-Data State Check");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // 1. Verify Active Tenant exists
    const tenant = await db.tenant.findFirst({
      where: { active: true },
    });
    assert(Boolean(tenant), `Active practice tenant preserved: ${tenant?.name} (${tenant?.slug})`);
    if (!tenant) return;
    const tenantId = tenant.id;

    // 2. Verify Preserved Administrative and Partner Users
    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, isSuperAdmin: true },
    });
    assert(users.length > 0, `Preserved active user accounts: ${users.length} users`);
    const superAdmin = users.find((u) => u.isSuperAdmin);
    assert(Boolean(superAdmin), `Preserved super-admin user: ${superAdmin?.email}`);

    // 3. Verify All Transactional and Demo Tables are Completely Clean (0 records)
    const counts = {
      clients: await db.client.count({ where: { tenantId } }),
      invoices: await db.invoice.count({ where: { tenantId } }),
      payments: await db.payment.count({ where: { tenantId } }),
      gstReturns: await db.gstReturn.count({ where: { tenantId } }),
      documents: await db.document.count({ where: { tenantId } }),
      tasks: await db.task.count({ where: { tenantId } }),
      communications: await db.communication.count({ where: { tenantId } }),
      conversations: await db.conversation.count({ where: { tenantId } }),
      messages: await db.message.count(),
    };

    assert(counts.clients === 0, `Clients table is blank (count: 0)`);
    assert(counts.invoices === 0, `Invoices table is blank (count: 0)`);
    assert(counts.payments === 0, `Payments table is blank (count: 0)`);
    assert(counts.gstReturns === 0, `GST Returns table is blank (count: 0)`);
    assert(counts.documents === 0, `Documents vault table is blank (count: 0)`);
    assert(counts.tasks === 0, `Tasks table is blank (count: 0)`);
    assert(counts.communications === 0, `Communications table is blank (count: 0)`);
    assert(counts.conversations === 0, `Conversations table is blank (count: 0)`);
    assert(counts.messages === 0, `Messages table is blank (count: 0)`);

    // 4. Test Financial Analytics on Zero Data
    console.log("\n--- Testing Financial Analytics on 0 Records ---");
    const finMetrics = await getDashboardFinancialMetrics(tenantId);
    assert(finMetrics.totalCollectedRevenue === 0, `totalCollectedRevenue evaluates to 0 without NaN`);
    assert(finMetrics.totalOutstanding === 0, `totalOutstanding evaluates to 0 without NaN`);
    assert(finMetrics.totalOverdue === 0, `totalOverdue evaluates to 0 without NaN`);
    assert(finMetrics.counts.paid === 0 && finMetrics.counts.pending === 0, `Count metrics evaluate to 0 cleanly`);

    const recoveryList = await getPaymentRecoveryList(tenantId);
    assert(Array.isArray(recoveryList) && recoveryList.length === 0, `Payment recovery list returns empty array cleanly`);

    // 5. Test Reports Data Aggregation on Zero Data
    console.log("\n--- Testing Reports & MIS Aggregator on 0 Records ---");
    const [invoices, payments] = await Promise.all([
      db.invoice.findMany({
        where: { tenantId },
        include: { client: true, items: true },
      }),
      db.payment.findMany({
        where: { tenantId },
        select: { amount: true },
      }),
    ]);

    const totalBilled = invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    assert(!isNaN(totalBilled) && totalBilled === 0, `Reports totalBilled: 0 (No NaN)`);
    assert(!isNaN(totalCollected) && totalCollected === 0, `Reports totalCollected: 0 (No NaN)`);
    assert(!isNaN(collectionRate) && collectionRate === 0, `Reports collectionRate: 0% without division-by-zero error`);

    // 6. Test Communications Query on Zero Data
    console.log("\n--- Testing Communications Hub on 0 Records ---");
    const comms = await db.communication.findMany({
      where: { tenantId },
      include: { client: { select: { id: true, name: true } } },
    });
    assert(Array.isArray(comms) && comms.length === 0, `Communications query returns [] cleanly`);
    const serializedComms = serializeForClient(comms);
    assert(Array.isArray(serializedComms), `Communications serializes cleanly for client component`);

    // 7. Test Subscription Quota on Zero Data
    console.log("\n--- Testing Subscription Quota on 0 Records ---");
    const [clientCount, docs, teamSeats] = await Promise.all([
      db.client.count({ where: { tenantId, active: true } }),
      db.document.findMany({ where: { tenantId }, select: { fileSize: true } }),
      db.membership.count({ where: { tenantId, status: "ACTIVE" } }),
    ]);
    const storageBytes = docs.reduce((s, d) => s + (d.fileSize || 0), 0);
    assert(clientCount === 0, `Active clients in subscription: 0`);
    assert(storageBytes === 0, `Storage bytes in vault: 0 B`);
    assert(teamSeats > 0, `Active team seats preserved: ${teamSeats}`);

    // 8. Test GST Pipeline on Zero Data
    console.log("\n--- Testing GST Pipeline on 0 Records ---");
    const [returns, gstClients] = await Promise.all([
      db.gstReturn.findMany({ where: { tenantId } }),
      db.client.findMany({ where: { tenantId, active: true, gstin: { not: null } } }),
    ]);
    assert(returns.length === 0, `GST returns returns [] cleanly`);
    assert(gstClients.length === 0, `GST clients returns [] cleanly`);

  } catch (error: any) {
    console.error("Verification Error:", error);
    assert(false, `Unexpected exception: ${error.message}`);
  }

  console.log("\n==================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

verifyBlankState().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
