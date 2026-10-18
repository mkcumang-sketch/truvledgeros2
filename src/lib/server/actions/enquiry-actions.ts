"use server";

import { z } from "zod";
import { logSecurityEvent } from "@/lib/server/audit";
import { headers } from "next/headers";

const PracticeEnquirySchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid official work email").max(254),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+91[-\s]?)?[6-9]\d{9}$/,
      "Please enter a valid 10-digit Indian mobile number (e.g., 9876543210 or +91 9876543210)"
    ),
  firmName: z.string().trim().min(2, "Firm or organization name is required").max(150),
  role: z.string().trim().min(2, "Role or designation is required").max(100),
  practiceSize: z.enum(["1-5", "6-15", "16-50", "50+"], {
    errorMap: () => ({ message: "Please select your firm size or team count" }),
  }),
  areasOfInterest: z.string().trim().min(2, "Please select at least one area of interest").max(200),
  currentSoftware: z.string().trim().max(100).optional().default("None / Spreadsheets"),
  message: z.string().trim().min(5, "Please briefly describe your workflow requirements").max(1000),
  privacyConsent: z.boolean().refine((val) => val === true, {
    message: "You must consent to the privacy notice to proceed",
  }),
});

export type PracticeEnquiryInput = z.infer<typeof PracticeEnquirySchema>;

export type PracticeEnquiryResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
};

export async function submitEnquiryAction(
  data: PracticeEnquiryInput
): Promise<PracticeEnquiryResult> {
  try {
    const validated = PracticeEnquirySchema.safeParse(data);
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

    const {
      fullName,
      email,
      phone,
      firmName,
      role,
      practiceSize,
      areasOfInterest,
      currentSoftware,
      message,
    } = validated.data;

    let ipAddress: string | undefined;
    let userAgent: string | undefined;
    try {
      const reqHeaders = await headers();
      ipAddress = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
      userAgent = reqHeaders.get("user-agent") || undefined;
    } catch {
      // Safe fallback in test environments
    }

    // Persist verified enquiry durably in database audit logs
    await logSecurityEvent({
      action: "PRACTICE_ENQUIRY_RECEIVED",
      entityType: "PracticeEnquiry",
      ipAddress,
      userAgent,
      newValue: {
        fullName,
        email,
        phone,
        firmName,
        role,
        practiceSize,
        areasOfInterest,
        currentSoftware,
        message,
        submittedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: `Thank you, ${fullName}. Your practice enquiry for ${firmName} has been recorded. Our enterprise practice specialist will contact you within 1 business day.`,
    };
  } catch (error: any) {
    console.error("[submitEnquiryAction Error]", error);
    return {
      success: false,
      message:
        "Unable to submit enquiry at this time. Please contact onboarding@truvtech.com directly.",
    };
  }
}
