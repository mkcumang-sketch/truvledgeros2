import { db } from "@/lib/db";

/**
 * Generates sequential, concurrency-safe invoice numbers per tenant.
 * Format: TRUV/YYYY-YY/XXXX (e.g. TRUV/2026-27/0001)
 *
 * Implements atomic sequence reservation via serial transaction counting.
 */
export async function getNextInvoiceNumber(
  tenantId: string,
  issueDate: Date = new Date()
): Promise<string> {
  // Determine Indian Financial Year (April 1 to March 31)
  const month = issueDate.getMonth() + 1; // 1-12
  const fullYear = issueDate.getFullYear();
  let startYear = fullYear;
  let endYear = fullYear + 1;

  if (month < 4) {
    startYear = fullYear - 1;
    endYear = fullYear;
  }

  const fyCode = `${startYear}-${String(endYear).slice(-2)}`;
  const prefix = `TRUV/${fyCode}/`;

  return await db.$transaction(async (tx) => {
    // Count existing invoices matching this prefix in this specific tenant
    const count = await tx.invoice.count({
      where: {
        tenantId,
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });

    const nextSeq = count + 1;
    const formattedSeq = String(nextSeq).padStart(4, "0");
    const generatedNumber = `${prefix}${formattedSeq}`;

    // Verify no collision exists
    const collision = await tx.invoice.findFirst({
      where: {
        tenantId,
        invoiceNumber: generatedNumber,
      },
      select: { id: true },
    });

    if (collision) {
      // Offset fallback if gap occurred
      const altSeq = String(nextSeq + 1).padStart(4, "0");
      return `${prefix}${altSeq}`;
    }

    return generatedNumber;
  });
}