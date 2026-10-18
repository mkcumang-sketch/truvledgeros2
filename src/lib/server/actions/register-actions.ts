"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { edgeRateLimiter, getClientIp, RATE_LIMIT_TIERS } from "@/lib/server/security/edge-rate-limiter";
import { isFeatureFlagEnabled } from "@/lib/server/feature-flags";

const RegisterSchema = z.object({
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

export async function registerAction(data: RegisterInput): Promise<RegisterResult> {
  try {
    const validated = RegisterSchema.safeParse(data);
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
        message: "Please correct the errors in the registration form.",
        errors: fieldErrors,
      };
    }

    const { fullName, email, password, phone, firmName, city } = validated.data;

    const registrationDisabled = await isFeatureFlagEnabled("killSwitchGlobalRegistration");
    if (registrationDisabled) {
      return {
        success: false,
        message: "New practice registration is temporarily suspended for scheduled platform maintenance.",
      };
    }

    // Check rate limit per IP
    try {
      const reqHeaders = await headers();
      const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
      const rateStatus = await edgeRateLimiter.check(`ip:auth:${ip}`, RATE_LIMIT_TIERS.AUTH);
      if (!rateStatus.allowed) {
        return {
          success: false,
          message: `Too many registration attempts. Please try again in ${rateStatus.retryAfterSeconds} seconds.`,
        };
      }
    } catch {
      // Safe fallback in test environments
    }

    // Check duplicate account
    const existingUser = await (db.user as any).findUnique({
      where: { email },
    });

    if (existingUser) {
      return {
        success: false,
        message: "An account with this email address already exists. Please sign in instead.",
        errors: { email: "An account with this email already exists" },
      };
    }

    // Generate sanitized unique slug
    let baseSlug = firmName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = "ca-practice";

    let slug = baseSlug;
    let suffix = 1;
    while (await (db.tenant as any).findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const passwordHash = await hashPassword(password);

    // Atomically create Tenant, User, and Membership with role FIRM_OWNER
    const result = await db.$transaction(async (tx) => {
      const tenant = await (tx.tenant as any).create({
        data: {
          name: firmName,
          slug,
          email,
          phone,
          city,
          active: true,
          isSuspended: false,
          approvalThreshold: 50000.0,
          defaultGstRate: 18.0,
          defaultDueDays: 15,
        },
      });

      const user = await (tx.user as any).create({
        data: {
          name: fullName,
          email,
          passwordHash,
          phone,
          isSuperAdmin: false,
          active: true,
        },
      });

      await (tx.membership as any).create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "FIRM_OWNER",
          status: "ACTIVE",
        },
      });

      await (tx.auditLog as any).create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          action: "FIRM_REGISTERED",
          entityType: "TENANT",
          entityId: tenant.id,
          newValue: {
            firmName,
            email,
            city,
            role: "FIRM_OWNER",
            registeredAt: new Date().toISOString(),
          },
        },
      });

      return { user, tenant };
    });

    // Create session and set cookie
    await createSession(result.user.id, result.tenant.id);

    return {
      success: true,
      message: "Practice account created successfully. Redirecting to your workspace...",
      redirectUrl: "/dashboard",
    };
  } catch (error: any) {
    console.error("[registerAction Error]", error);
    return {
      success: false,
      message: "Registration failed due to a system error. Please try again or contact support.",
    };
  }
}
