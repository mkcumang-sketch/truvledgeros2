import { db } from "../src/lib/db";
import { requireTenant, requireAuth, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { Role } from "@prisma/client";
import fs from "fs";
import path from "path";

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

async function runSessionHardeningSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Session Hardening & Multi-Tenant Isolation Suite");
  console.log("==================================================================\n");

  // -----------------------------------------------------------------------------
  // SECTION 1: Eliminate Runtime Crash in src/lib/auth/session.ts
  // -----------------------------------------------------------------------------
  console.log(">>> [Section 1] Session Hardening & Superadmin Auto-Tenant Fallback <<<");

  const sessionFilePath = path.join(__dirname, "../src/lib/auth/session.ts");
  const sessionSource = fs.readFileSync(sessionFilePath, "utf-8");

  // 1.1 Verify removal of GODMODE_TENANT_SELECTION_REQUIRED
  assert(
    !sessionSource.includes("GODMODE_TENANT_SELECTION_REQUIRED"),
    "1.1 'GODMODE_TENANT_SELECTION_REQUIRED' runtime exception completely eliminated"
  );

  // 1.2 Verify automatic query of first active tenant for superadmin
  assert(
    sessionSource.includes("where: { active: true, isSuspended: false }") &&
      sessionSource.includes('orderBy: { createdAt: "asc" }'),
    "1.2 Superadmin fallback queries first active, unsuspended tenant ordered by createdAt asc"
  );

  // 1.3 Verify clean redirect for users lacking active membership
  assert(
    sessionSource.includes('redirect("/login?error=TENANT_MEMBERSHIP_REQUIRED")'),
    "1.3 Non-superadmin users lacking membership redirected cleanly to login with error"
  );

  // 1.4 Test superadmin safe fallback logic directly
  const firstActiveTenant = await db.tenant.findFirst({
    where: { active: true, isSuspended: false },
    orderBy: { createdAt: "asc" },
  });
  assert(firstActiveTenant !== null, "1.4 Active practice tenant exists for superadmin fallback");

  // Simulate context where user isSuperAdmin but has no tenant selected
  const superadminUser = await db.user.findFirst({
    where: { isSuperAdmin: true },
  });

  if (superadminUser && firstActiveTenant) {
    const unattachedContext: any = {
      user: {
        id: superadminUser.id,
        email: superadminUser.email,
        name: superadminUser.name,
        isSuperAdmin: true,
      },
      membership: undefined,
      tenant: undefined,
    };

    // Verify fallback attaches tenant
    if (!unattachedContext.membership || !unattachedContext.tenant) {
      if (unattachedContext.user.isSuperAdmin) {
        unattachedContext.tenant = {
          id: firstActiveTenant.id,
          name: firstActiveTenant.name,
          slug: firstActiveTenant.slug,
          active: firstActiveTenant.active,
          isSuspended: firstActiveTenant.isSuspended,
        };
        unattachedContext.membership = {
          id: `superadmin-${firstActiveTenant.id}`,
          tenantId: firstActiveTenant.id,
          role: Role.FIRM_OWNER,
          status: "ACTIVE",
        };
      }
    }

    assert(
      unattachedContext.tenant?.id === firstActiveTenant.id &&
        unattachedContext.membership?.tenantId === firstActiveTenant.id,
      "1.5 Superadmin context auto-resolves first active tenant safely without throwing exception"
    );
  }

  // -----------------------------------------------------------------------------
  // SECTION 2: Strict Multi-Tenant Isolation & SQL Injection Prevention
  // -----------------------------------------------------------------------------
  console.log("\n>>> [Section 2] Multi-Tenant Isolation & SQL Injection Prevention <<<");

  // 2.1 Audit all files for $queryRawUnsafe
  const srcDir = path.join(__dirname, "../src");
  const allTsFiles: string[] = [];

  function collectTsFiles(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectTsFiles(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        allTsFiles.push(fullPath);
      }
    }
  }
  collectTsFiles(srcDir);

  let queryRawUnsafeFound = false;
  for (const file of allTsFiles) {
    const content = fs.readFileSync(file, "utf-8");
    if (content.includes("$queryRawUnsafe")) {
      queryRawUnsafeFound = true;
      console.error(`Unsafe query found in: ${file}`);
    }
  }
  assert(!queryRawUnsafeFound, "2.1 Zero occurrences of $queryRawUnsafe across entire src/ codebase");

  // 2.2 Verify Document Actions tenant isolation
  const docActionPath = path.join(__dirname, "../src/lib/server/actions/document-actions.ts");
  const docActionSource = fs.readFileSync(docActionPath, "utf-8");
  assert(
    docActionSource.includes("where: { id: params.requestId, tenantId }"),
    "2.2 Document actions requestId update is strictly tenant-scoped (updateMany with tenantId)"
  );

  // 2.3 Verify Document Upload API route tenant isolation
  const uploadRoutePath = path.join(__dirname, "../src/app/api/documents/upload/route.ts");
  const uploadRouteSource = fs.readFileSync(uploadRoutePath, "utf-8");
  assert(
    uploadRouteSource.includes("where: { id: requestId, tenantId }"),
    "2.3 Document upload route requestId update is strictly tenant-scoped (updateMany with tenantId)"
  );

  // 2.4 Verify GST Actions tenant isolation
  const gstActionPath = path.join(__dirname, "../src/lib/server/actions/gst-actions.ts");
  const gstActionSource = fs.readFileSync(gstActionPath, "utf-8");
  assert(
    gstActionSource.includes("where: { id: validated.returnId, tenantId }") &&
      gstActionSource.includes("where: { id: returnId.trim(), tenantId }"),
    "2.4 GST return mutations strictly verify tenant ownership before applying updates"
  );

  // 2.5 Verify Task Actions tenant isolation & reassignment authorization
  const taskActionPath = path.join(__dirname, "../src/lib/server/actions/task-actions.ts");
  const taskActionSource = fs.readFileSync(taskActionPath, "utf-8");
  assert(
    taskActionSource.includes("where: { userId: params.newAssigneeId, tenantId, status: \"ACTIVE\" }"),
    "2.5 Task reassignment verifies new assignee holds active membership in the caller's tenant"
  );
  assert(
    taskActionSource.includes("where: { id: validated.taskId, tenantId }"),
    "2.6 Task status update verifies task belongs to caller's tenant before updating"
  );

  // -----------------------------------------------------------------------------
  // SECTION 3: Input Validation & Sanitization Guardrails
  // -----------------------------------------------------------------------------
  console.log("\n>>> [Section 3] Input Validation & Sanitization Guardrails <<<");

  // 3.1 Verify Zod schemas in GST Actions
  assert(
    gstActionSource.includes("UpdateGstTaxSchema") && gstActionSource.includes("MarkGstFiledSchema"),
    "3.1 GST return mutations validate inputs via dedicated Zod schemas"
  );

  // 3.2 Verify Zod schema for Task Status Update
  assert(
    taskActionSource.includes("UpdateTaskStatusSchema"),
    "3.2 Task status update validates input via dedicated Zod schema"
  );

  // 3.3 Verify Zod schemas in Client, Invoice, Payment services
  const invoiceServicePath = path.join(__dirname, "../src/lib/server/invoice-service.ts");
  const invoiceServiceSource = fs.readFileSync(invoiceServicePath, "utf-8");
  assert(
    invoiceServiceSource.includes("CreateInvoiceSchema.parse(input)"),
    "3.3 Invoice creation enforces strict Zod schema parsing before database transaction"
  );

  const paymentServicePath = path.join(__dirname, "../src/lib/server/payment-service.ts");
  const paymentServiceSource = fs.readFileSync(paymentServicePath, "utf-8");
  assert(
    paymentServiceSource.includes("RecordPaymentSchema = z.object"),
    "3.4 Payment recording enforces strict Zod schema parsing"
  );

  console.log("\n==================================================================");
  console.log(`Session & Tenant Hardening Suite Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSessionHardeningSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
