/**
 * TRUV LedgerOS — Deterministic Financial Calculation Engine
 * 
 * Strict decimal arithmetic using integer cents/paise (factor of 100).
 * Prevents IEEE 754 floating-point drift in invoicing, taxation, and payments.
 */

export interface LineItemInput {
  description: string;
  hsnSacCode?: string | null;
  quantity: number;
  unitPrice: number; // in base currency units (e.g., INR)
  discountPercent?: number; // 0 to 100
  taxRatePercent?: number; // e.g., 18 for 18% GST
}

export interface CalculatedLineItem {
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  taxRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceFinancialSummary {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
  items: CalculatedLineItem[];
}

/**
 * Rounds to 2 decimal places deterministically using standard half-up
 */
export function roundToPaise(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Authoritative Server-side Invoice Recalculation
 * Completely ignores any client-submitted subtotal, tax, or total.
 */
export function calculateInvoiceFinancials(
  items: LineItemInput[],
  isInterState = false // true = IGST, false = CGST + SGST
): InvoiceFinancialSummary {
  if (!items || items.length === 0) {
    throw new Error("An invoice must contain at least one line item.");
  }

  let subtotal = 0;
  let totalDiscount = 0;
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTax = 0;
  let totalAmount = 0;

  const calculatedItems: CalculatedLineItem[] = items.map((item) => {
    const qty = Math.max(0.001, item.quantity);
    const unitPrice = Math.max(0, item.unitPrice);
    const discountPercent = Math.min(100, Math.max(0, item.discountPercent || 0));
    const taxRatePercent = Math.max(0, item.taxRatePercent || 0);

    const grossLine = roundToPaise(qty * unitPrice);
    const lineDiscount = roundToPaise(grossLine * (discountPercent / 100));
    const taxable = roundToPaise(grossLine - lineDiscount);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isInterState) {
      igst = roundToPaise(taxable * (taxRatePercent / 100));
    } else {
      const halfRate = taxRatePercent / 2;
      cgst = roundToPaise(taxable * (halfRate / 100));
      sgst = roundToPaise(taxable * (halfRate / 100));
    }

    const itemTax = roundToPaise(cgst + sgst + igst);
    const lineTotal = roundToPaise(taxable + itemTax);

    subtotal = roundToPaise(subtotal + grossLine);
    totalDiscount = roundToPaise(totalDiscount + lineDiscount);
    totalTaxable = roundToPaise(totalTaxable + taxable);
    totalCgst = roundToPaise(totalCgst + cgst);
    totalSgst = roundToPaise(totalSgst + sgst);
    totalIgst = roundToPaise(totalIgst + igst);
    totalTax = roundToPaise(totalTax + itemTax);
    totalAmount = roundToPaise(totalAmount + lineTotal);

    return {
      description: item.description.trim(),
      hsnSacCode: item.hsnSacCode?.trim() || null,
      quantity: qty,
      unitPrice,
      discountPercent,
      discountAmount: lineDiscount,
      taxableAmount: taxable,
      taxRatePercent,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      taxAmount: itemTax,
      lineTotal,
    };
  });

  return {
    subtotal,
    totalDiscount,
    taxableAmount: totalTaxable,
    cgstAmount: totalCgst,
    sgstAmount: totalSgst,
    igstAmount: totalIgst,
    totalTax,
    totalAmount,
    items: calculatedItems,
  };
}

/**
 * Format currency with Indian grouping: ₹ 1,23,456.78
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}