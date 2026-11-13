import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateTaxInvoicePdf } from "@/lib/server/pdf/tax-invoice-generator";
import { getDownloadPresignedUrl } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/[invoiceId]/pdf
 * Generates and streams an authoritative, Rule-46 compliant Tax Invoice PDF.
 * Protected by multi-tenant session authentication.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;
    const { invoiceId } = params;

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, invoiceNumber: true, pdfUrl: true },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found or unauthorized access" },
        { status: 404 }
      );
    }

    const filename = `Invoice-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    const storedKey = invoice.pdfUrl;

    // Stored S3 object keys are private and are signed only for this authenticated tenant.
    if (storedKey && storedKey.startsWith(`${tenantId}/invoices/`)) {
      const signedUrl = await getDownloadPresignedUrl({
        key: storedKey,
        tenantId,
        originalFileName: filename,
      });
      return NextResponse.redirect(signedUrl, { status: 302 });
    }

    // Backward compatibility for invoices created before private object-key storage.
    const pdfBuffer = await generateTaxInvoicePdf(invoiceId, tenantId);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: any) {
    console.error("[INVOICE-PDF-ROUTE-ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate tax invoice PDF" },
      { status: 500 }
    );
  }
}
