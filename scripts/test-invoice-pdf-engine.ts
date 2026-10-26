/**
 * TRUV LedgerOS — Rule 46 CGST Tax Invoice PDF Generation Engine Verification
 * Tests:
 * 1. Indian Currency Number-to-Words Conversion (Crores, Lakhs, Thousands, Paise)
 * 2. Statutory State Code Resolution
 * 3. End-to-End PDF Generation conforming to Rule 46 of CGST Rules, 2017
 * 4. Magic Byte (%PDF) & Buffer Validation
 * 5. Persistence Pipeline (S3 / Local Storage & Database update)
 * 6. Multi-Tenant Isolation Enforcement
 * 7. Transactional Teardown
 */

import { db } from "../src/lib/db";
import {
  generateTaxInvoicePdf,
  saveAndAttachInvoicePdf,
  amountToWordsINR,
  resolveStateCode,
} from "../src/lib/server/pdf/tax-invoice-generator";
import { verifyMagicBytes } from "../src/lib/server/s3";
import { InvoiceStatus } from "@prisma/client";

async function runInvoicePdfTestSuite() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Statutory Invoice PDF Generation Engine (Rule 46)");
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

  const runId = Date.now();
  let testClientId: string | null = null;
  let testInvoiceId: string | null = null;

  try {
    // 1. Test Indian Currency Number-to-Words Conversion
    console.log("--- 1. Testing Indian Currency Words Converter ---");
    assert(
      amountToWordsINR(53100) === "Fifty Three Thousand One Hundred Rupees Only",
      `₹53,100 -> "${amountToWordsINR(53100)}"`
    );
    assert(
      amountToWordsINR(141600) === "One Lakh Forty One Thousand Six Hundred Rupees Only",
      `₹1,41,600 -> "${amountToWordsINR(141600)}"`
    );
    assert(
      amountToWordsINR(2500000) === "Twenty Five Lakh Rupees Only",
      `₹25,00,000 -> "${amountToWordsINR(2500000)}"`
    );
    assert(
      amountToWordsINR(12345.50) === "Twelve Thousand Three Hundred and Forty Five Rupees and Fifty Paise Only",
      `₹12,345.50 -> "${amountToWordsINR(12345.50)}"`
    );
    assert(
      amountToWordsINR(0) === "Zero Rupees Only",
      `₹0 -> "${amountToWordsINR(0)}"`
    );

    // 2. Test Statutory GST State Code Resolution
    console.log("\n--- 2. Testing GST State Code Resolution ---");
    assert(resolveStateCode("Maharashtra") === "27", "Maharashtra resolves to State Code 27");
    assert(resolveStateCode("Delhi") === "07", "Delhi resolves to State Code 07");
    assert(resolveStateCode("Karnataka") === "29", "Karnataka resolves to State Code 29");
    assert(resolveStateCode(null, "24AAACA1234F1Z5") === "24", "Gujarat GSTIN resolves to State Code 24");
    assert(resolveStateCode(null, null) === "27", "Default fallback resolves to State Code 27");

    // 3. Setup Test Client & Invoice Fixture
    console.log("\n--- 3. Setting Up Test Client & Invoice Fixture ---");
    const tenant = await db.tenant.findFirst({
      where: { active: true, isSuspended: false },
      orderBy: { createdAt: "asc" },
    });
    if (!tenant) throw new Error("No active practice tenant found.");

    const testClient = await db.client.create({
      data: {
        tenantId: tenant.id,
        name: `Bharat Heavy Logistics [PDF-TEST-${runId}]`,
        businessName: "Bharat Heavy Logistics Ltd",
        email: `billing.${runId}@bharatlogistics.in`,
        phone: "+919876543210",
        pan: "AABCB1234C",
        gstin: "27AABCB1234C1Z9",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400051",
        contacts: {
          create: {
            tenantId: tenant.id,
            name: "Anand Verma",
            email: `anand.${runId}@bharatlogistics.in`,
            phone: "+919876543210",
            designation: "VP Finance",
            isPrimary: true,
          },
        },
      },
    });
    testClientId = testClient.id;

    const testInvoice = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        clientId: testClient.id,
        invoiceNumber: `INV-RULE46-${runId}`,
        serviceDescription: "Statutory Tax Audit, Transfer Pricing & MCA Filings",
        subtotal: 100000.0,
        gstRate: 18.0,
        cgstAmount: 9000.0,
        sgstAmount: 9000.0,
        igstAmount: 0.0,
        totalAmount: 118000.0,
        status: InvoiceStatus.SENT,
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        items: {
          create: [
            {
              description: "Statutory Audit under Section 44AB of Income Tax Act",
              hsnSacCode: "998222",
              quantity: 1,
              unitPrice: 60000.0,
              total: 60000.0,
            },
            {
              description: "Transfer Pricing Documentation & Form 3CEB Certification",
              hsnSacCode: "998231",
              quantity: 1,
              unitPrice: 40000.0,
              total: 40000.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    testInvoiceId = testInvoice.id;
    assert(Boolean(testInvoice.id), `Created Test Invoice: ${testInvoice.invoiceNumber}`);

    // 4. Generate Rule 46 Compliant PDF Buffer
    console.log("\n--- 4. Generating Statutory Tax Invoice PDF (Buffer Mode) ---");
    const pdfBuffer = await generateTaxInvoicePdf(testInvoice.id, tenant.id);

    assert(Buffer.isBuffer(pdfBuffer), "generateTaxInvoicePdf returned a valid Buffer");
    assert(pdfBuffer.length > 2000, `PDF size is valid and populated (${pdfBuffer.length} bytes)`);

    // 5. Verify PDF Magic Bytes (%PDF / 0x25 0x50 0x44 0x46)
    const isMagicValid = verifyMagicBytes(pdfBuffer, "application/pdf");
    assert(isMagicValid === true, "Magic byte validation confirmed (%PDF header intact)");

    const pdfAsciiHeader = pdfBuffer.slice(0, 5).toString("ascii");
    assert(pdfAsciiHeader === "%PDF-", `Header signature verified: "${pdfAsciiHeader}"`);

    // 6. Test PDF Storage & Persistence Pipeline
    console.log("\n--- 5. Testing PDF Persistence Pipeline ---");
    const attachResult = await saveAndAttachInvoicePdf({
      invoiceId: testInvoice.id,
      tenantId: tenant.id,
    });

    assert(Boolean(attachResult.pdfUrl), `PDF persisted with URL/path: ${attachResult.pdfUrl}`);

    const updatedInvoice = await db.invoice.findUnique({
      where: { id: testInvoice.id },
      select: { pdfUrl: true },
    });
    assert(updatedInvoice?.pdfUrl === attachResult.pdfUrl, "Invoice.pdfUrl updated in PostgreSQL database");

    // 7. Test Multi-Tenant Isolation Enforcement
    console.log("\n--- 6. Testing Multi-Tenant Data Boundaries ---");
    let unauthorizedCaught = false;
    try {
      await generateTaxInvoicePdf(testInvoice.id, "unauthorized_tenant_xyz");
    } catch (err: any) {
      unauthorizedCaught = true;
    }
    assert(unauthorizedCaught === true, "Cross-tenant access rejected: Invoice denied for foreign tenant");

  } catch (err: any) {
    console.error("\n[TEST ERROR]:", err);
    failed++;
  } finally {
    // 8. Transactional Teardown of Test Fixtures
    console.log("\n--- Cleaning Up Test Fixtures ---");
    if (testClientId) {
      try {
        await db.$transaction([
          db.invoiceItem.deleteMany({ where: { invoiceId: testInvoiceId || undefined } }),
          db.invoice.deleteMany({ where: { clientId: testClientId } }),
          db.contact.deleteMany({ where: { clientId: testClientId } }),
          db.client.deleteMany({ where: { id: testClientId } }),
        ]);
        console.log(`[CLEANUP] Successfully purged test client and invoices for ${testClientId}`);
      } catch (cleanErr: any) {
        console.warn("[CLEANUP WARNING]", cleanErr.message);
      }
    }

    console.log("\n==================================================================");
    console.log(`INVOICE PDF ENGINE TEST SUITE FINISHED`);
    console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runInvoicePdfTestSuite();
