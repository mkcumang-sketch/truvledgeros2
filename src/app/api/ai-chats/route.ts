import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { z } from "zod";
import {
  rateLimiter,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import {
  sanitizeStringInput,
  withTimeout,
} from "@/lib/server/security/request-validator";

interface KnowledgeBaseResponse {
  keywords: string[];
  reply: string;
  citation: string;
}

const taxKnowledgeBase: KnowledgeBaseResponse[] = [
  {
    keywords: ["drc-01", "mismatch", "itc", "gstr-2b", "gstr-3b"],
    reply: `In response to the DRC-01 notice regarding ITC variance between GSTR-2B and GSTR-3B:

1. **Statutory Stand:** Under Section 16(2)(aa) read with Rule 36(4) of the CGST Act, ITC availment is contingent on supplier reporting in GSTR-1.
2. **Reconciliation Summary:** If the difference arises due to timing discrepancies or delayed supplier uploads, clarify that tax was paid by the supplier with interest under Section 50.
3. **Prayer:** Request drop of proposed demand citing lack of mala fide intention and valid tax invoices with proof of payment under Section 16(2)(c).`,
    citation: "CGST Act Sec 16(2)(aa) & Rule 36(4)",
  },
  {
    keywords: ["43b", "43b(h)", "msme", "disallowance"],
    reply: `Key Compliance Rules for Section 43B(h) of the Income Tax Act:

• **Applicability:** Payments due to Micro and Small Enterprises registered under the MSMED Act, 2006 (Trading enterprises are excluded per OM dated 02/07/2021).
• **Time Limit:** Payment must be made within the agreed timeline (max 45 days if written agreement exists; 15 days if no agreement).
• **Consequence:** Any sum unpaid by the end of the financial year is disallowed and added back to taxable business income for that year. Deductible only upon actual payment.`,
    citation: "Income Tax Act, 1961 Sec 43B(h) & MSMED Act Sec 15",
  },
  {
    keywords: ["10f", "trc", "foreign", "remittance", "treaty", "dtaa"],
    reply: `Verification Checklist for Non-Resident Foreign Remittances:

1. **Tax Residency Certificate (TRC):** Mandatory under Section 90(4) obtained from the revenue authority of the payee's resident country.
2. **Electronic Form 10F:** Mandatory online filing on the Income Tax Portal if the TRC lacks details specified in Rule 21AB.
3. **No PE Declaration:** Collect an explicit declaration confirming the non-resident does not maintain a Permanent Establishment (PE) in India under Article 5 of the relevant DTAA.`,
    citation: "Income Tax Act Sec 90(4) & Rule 21AB",
  },
];

const ChatMessageSchema = z.object({
  message: z
    .string()
    .min(1, "Query is required")
    .max(1000, "Query cannot exceed 1000 characters")
    .transform(sanitizeStringInput),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Mandatory Tenant Authentication
    let context;
    try {
      context = await requireTenant();
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Active user session required to access AI advisory." },
        { status: 401 }
      );
    }

    // 2. Per-User Rate Limiting (20 calls per minute)
    const rateStatus = await rateLimiter.check(
      `user:ai:${context.user.id}`,
      RATE_LIMIT_TIERS.AI_API
    );
    if (!rateStatus.allowed) {
      return createRateLimitResponse(rateStatus);
    }

    // 3. Schema & Character Validation
    const rawBody = await req.json().catch(() => ({}));
    const parsed = ChatMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { message } = parsed.data;
    const lowerQuery = message.toLowerCase();

    // 4. Execution with strict 5-second timeout
    const result = await withTimeout(
      (async () => {
        const matched = taxKnowledgeBase.find((item) =>
          item.keywords.some((kw) => lowerQuery.includes(kw))
        );

        if (matched) {
          return {
            reply: matched.reply,
            citation: matched.citation,
          };
        }

        return {
          reply: `Analysis for query: "${message}"\n\nBased on prevailing direct and indirect tax guidelines:\n1. Ensure the transaction is substantiated with appropriate primary documentation (invoices, e-way bills, bank payment vouchers).\n2. Cross-verify whether withholding tax (TDS under Sec 194C/194J/194Q) applies prior to final expense booking.\n3. If this pertains to a statutory notice reply, assemble a point-by-point tabular reconciliation before partner sign-off.`,
          citation: "ICAI Technical Guide & Standard Tax Procedures",
        };
      })(),
      5000,
      "AI advisory generation timed out"
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate AI advisory" },
      { status: 500 }
    );
  }
}