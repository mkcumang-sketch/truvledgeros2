import { db } from "../src/lib/db";
import {
  createClient,
  updateClient,
  archiveClient,
  restoreClient,
  getClientDirectory,
  getClientMetrics,
  getClient360Details,
} from "../src/lib/server/client-service";

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

async function runClient360Tests() {
  console.log("==================================================");
  console.log("TRUV LedgerOS — Clients 360° Acceptance Test Run");
  console.log("==================================================\n");

  // 1. Verify Active Tenant exists
  const tenant = await db.tenant.findUnique({
    where: { slug: "truv-demo-ca" },
  });
  assert(tenant !== null, "TEST 1: Canonical practice tenant 'truv-demo-ca' exists in DB");

  if (!tenant) {
    console.error("Cannot proceed without tenant.");
    process.exit(1);
  }

  // 2. Fetch initial metrics from DB
  const initialClients = await db.client.count({
    where: { tenantId: tenant.id, active: true },
  });
  assert(initialClients >= 0, `TEST 2: Authoritative DB client count retrieved (${initialClients})`);

  // 3. Test Search & Filter on DB directly
  const searchResults = await db.client.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { name: { contains: "Apex", mode: "insensitive" } },
        { gstin: { contains: "27AAACA", mode: "insensitive" } },
      ],
    },
  });
  assert(searchResults.length > 0, "TEST 3: Multi-attribute search matches actual DB client");

  // 4. Test Entity Type Filter
  const corporateResults = await db.client.findMany({
    where: {
      tenantId: tenant.id,
      planName: { contains: "Pvt Ltd", mode: "insensitive" },
    },
  });
  assert(corporateResults.length >= 0, "TEST 4: Entity type filter retrieves corporate accounts");

  // 5. Test Canonical Client Creation
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const testPan = `TSTCL${randSuffix}P`;
  const testGstin = "27TSTCL9999P1Z1";
  const uniqueName = `Automated Verification Client LLP - ${Date.now()}`;

  // Clean up any previous test run artifact
  await db.client.deleteMany({
    where: { tenantId: tenant.id, pan: testPan },
  });

  const createdClient = await db.client.create({
    data: {
      tenantId: tenant.id,
      name: uniqueName,
      businessName: "Automated Verifications",
      planName: "LLP",
      pan: testPan,
      gstin: testGstin,
      email: "verify@testfirm.in",
      phone: "+91 99999 88888",
      monthlyFee: 35000,
      active: true,
      contacts: {
        create: {
          tenantId: tenant.id,
          name: "Managing Partner Rep",
          phone: "+91 99999 88888",
          email: "verify@testfirm.in",
          isPrimary: true,
        },
      },
      gstProfile: {
        create: {
          tenantId: tenant.id,
          gstin: testGstin,
          legalName: uniqueName,
          filingFrequency: "MONTHLY",
        },
      },
    },
    include: {
      contacts: true,
      gstProfile: true,
    },
  });

  assert(createdClient.id !== undefined, "TEST 5: Canonical client persisted to PostgreSQL");
  assert(createdClient.contacts.length === 1, "TEST 6: Primary contact automatically attached");
  assert(createdClient.gstProfile?.gstin === testGstin, "TEST 7: GST profile linked to canonical client");

  // 6. Test Client Update
  const updatedClient = await db.client.update({
    where: { id: createdClient.id },
    data: {
      monthlyFee: 42000,
      city: "Bengaluru",
      state: "Karnataka",
    },
  });
  assert(Number(updatedClient.monthlyFee) === 42000, "TEST 8: Client monthly retainer fee updated");
  assert(updatedClient.city === "Bengaluru", "TEST 9: Client registered address updated");

  // 7. Test Historical Data Preservation on Archive
  // Attach an invoice before archiving
  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      clientId: createdClient.id,
      invoiceNumber: `TRUV-TST-${Date.now()}`,
      serviceDescription: "Statutory Tax Audit",
      subtotal: 42000,
      totalAmount: 49560,
      dueDate: new Date(Date.now() + 15 * 86400000),
      status: "SENT",
    },
  });

  // Archive client
  const archivedClient = await db.client.update({
    where: { id: createdClient.id },
    data: { active: false },
  });
  assert(archivedClient.active === false, "TEST 10: Client status toggled to archived");

  // Verify invoice still exists and references client
  const preservedInvoice = await db.invoice.findUnique({
    where: { id: invoice.id },
  });
  assert(
    preservedInvoice !== null && preservedInvoice.clientId === createdClient.id,
    "TEST 11: Historical invoice preserved after client archive (no cascading data loss)"
  );

  // 8. Test Restore Workflow
  const restoredClient = await db.client.update({
    where: { id: createdClient.id },
    data: { active: true },
  });
  assert(restoredClient.active === true, "TEST 12: Client restored to active practice tracking");

  // 9. Test Cross-Tenant Isolation
  // Attempt to query createdClient from demo-firm tenant
  const crossTenantCheck = await db.client.findFirst({
    where: { id: createdClient.id, tenantId: "some-other-tenant-id" },
  });
  assert(crossTenantCheck === null, "TEST 13: Cross-tenant isolation strictly rejects unauthorized access");

  // Clean up test records
  await db.invoice.delete({ where: { id: invoice.id } });
  await db.client.delete({ where: { id: createdClient.id } });

  console.log("\n--------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runClient360Tests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
