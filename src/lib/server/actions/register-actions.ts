"use server";

import { z } from "zod";

export const RegisterSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid official practice email").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[0-9]/, "Password must include at least one number"),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+91[-\s]?)?[6-9]\d{9}$/,
      "Please enter a valid 10-digit Indian mobile number (e.g., 9876543210)"
    ),
  firmName: z.string().trim().min(3, "CA firm name must be at least 3 characters").max(150),
  city: z.string().trim().min(2, "Practice city / location is required").max(100),
  termsConsent: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms of service and privacy policy to register",
  }),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export type RegisterResult = {
  success: boolean;
  message: string;
  redirectUrl?: string;
  errors?: Record<string, string>;
};

/**
 * Public registration is permanently disabled across TRUV LedgerOS.
 * All accounts must be provisioned or invited by the Super Admin / Firm Admin.
 */
export async function registerAction(_data?: RegisterInput): Promise<RegisterResult> {
  return {
    success: false,
    message: "Public registration is permanently disabled. Access to TRUV LedgerOS is strictly by administrator invitation.",
  };
}
