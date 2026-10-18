"use server";

import { z } from "zod";
import { logSecurityEvent } from "@/lib/server/audit";
import { headers } from "next/headers";

const DemoRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  email: z.string().trim().email("Please enter a valid official practice email"),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)"),
  firmName: z.string().trim().min(3, "Firm or practice name must be at least 3 characters"),
  city: z.string().trim().min(2, "City / location is required"),
  practiceSize: z.enum(["1-5", "6-15", "16-50", "50+"], {
    errorMap: () => ({ message: "Please select your practice team size" }),
  }),
  primaryFocus: z.enum([
    "GST & Statutory Compliance",
    "Statutory Audit & Tax Filing",
    "Client Invoicing & Fee Recovery",
    "Document Vault & Client Collaboration",
    "All-In-One Practice Management",
  ]).default("All-In-One Practice Management"),
  notes: z.string().trim().max(500, "Notes must not exceed 500 characters").optional(),
});

export type DemoRequestInput = z.infer<typeof DemoRequestSchema>;

export type DemoActionResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
};

export async function submitDemoRequestAction(
  data: DemoRequestInput
): Promise<DemoActionResult> {
  try {
    const validated = DemoRequestSchema.safeParse(data);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      return {
        success: false,
        message: "Please correct the errors in the form before submitting.",
        errors: fieldErrors,
      };
    }

    const { fullName, email, phone, firmName, city, practiceSize, primaryFocus, notes } =
      validated.data;

    let ipAddress: string | undefined;
    let userAgent: string | undefined;
    try {
      const reqHeaders = await headers();
      ipAddress = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
      userAgent = reqHeaders.get("user-agent") || undefined;
    } catch {
      // Header inspection safe fallback in test environments
    }

    // Persist verified lead via server audit event
    await logSecurityEvent({
      action: "DEMO_REQUEST_RECEIVED",
      entityType: "PracticeDemoRequest",
      ipAddress,
      userAgent,
      newValue: {
        fullName,
        email,
        phone,
        firmName,
        city,
        practiceSize,
        primaryFocus,
        notes: notes || null,
        submittedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: `Thank you, ${fullName}. Your demo request for ${firmName} has been received. Our senior onboarding specialist will contact you within 1 business day.`,
    };
  } catch (error: any) {
    console.error("[submitDemoRequestAction Error]", error);
    return {
      success: false,
      message:
        "Unable to submit demo request at this moment. Please email onboarding@truvtech.com directly.",
    };
  }
}
