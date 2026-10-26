import { z } from "zod";

/**
 * TRUVCA LedgerOS — Central Server-Side Environment Validation Module
 * 
 * Strict architectural rules:
 * 1. Server-side only (never imported into client components or client bundles).
 * 2. Never print, log, or serialize secret values or plaintext tokens.
 * 3. Graceful degradation for optional providers (Resend, WhatsApp, Razorpay, S3, Redis).
 * 4. Fail-closed validation for core security invariants (Database, Encryption Keyring).
 */

export interface ProviderStatus {
  name: string;
  configured: boolean;
  mode: "ACTIVE" | "STANDBY" | "DISABLED";
  detail: string;
}

export interface EnvValidationReport {
  valid: boolean;
  environment: "development" | "staging" | "production" | "test";
  missingRequired: string[];
  warnings: string[];
  providers: ProviderStatus[];
}

const ServerEnvSchema = z.object({
  // 1. Application URL & Runtime Environment
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  APP_ENV: z.enum(["development", "staging", "production", "test"]).optional(),
  CONFIRM_DISPOSABLE_STAGING_DB: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  PORT: z.string().optional().default("3000"),

  // 2. Authentication & Session Security
  NEXTAUTH_SECRET: z.string().optional(),
  INVITATION_EXPIRY_HOURS: z.string().optional().default("48"),

  // 3. PostgreSQL Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for database connectivity"),
  DIRECT_URL: z.string().optional(),

  // 4. Credential Vault & M2M Keyring Encryption (AES-256-GCM: 64 hex chars / 32 bytes)
  ENCRYPTION_KEY: z.string().optional(),
  ENCRYPTION_KEY_M2M: z.string().optional(),
  ENCRYPTION_KEY_M2M_PRIMARY_VERSION: z.string().optional().default("1"),
  TOKEN_PEPPER: z.string().optional(),
  TOKEN_PEPPER_PRIMARY_VERSION: z.string().optional().default("1"),

  // 5. Transactional Email (Direct Gmail SMTP / Resend)
  SMTP_HOST: z.string().optional().default("smtp.gmail.com"),
  SMTP_PORT: z.string().optional().default("465"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional().default("TRUV LedgerOS <notifications@truvledgeros.in>"),

  // 6. Object Storage (S3 / R2 / MinIO)
  AWS_REGION: z.string().optional().default("us-east-2"),
  AWS_ENDPOINT_URL_S3: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional().default("truv-vault"),

  // 7. Payment Gateway (Razorpay)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // 8. WhatsApp Business API
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // 9. GST / GSP Portal Integration
  GSTN_API_BASE_URL: z.string().optional(),
  GSTN_CLIENT_ID: z.string().optional(),
  GSTN_CLIENT_SECRET: z.string().optional(),

  // 10. AI Advisory / Copilot
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // 11. Cron & Native Background Processing
  CRON_SECRET: z.string().optional(),
  ENABLE_INPROCESS_OUTBOX_WORKER: z.string().optional().default("false"),
  OUTBOX_POLL_INTERVAL_MS: z.string().optional().default("10000"),

  // 12. Rate Limiter (Redis)
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_REDIS_TIMEOUT_MS: z.string().optional().default("1000"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Validates current environment configuration without exposing secret values.
 */
export function validateEnvironment(customEnv?: Record<string, string | undefined>): EnvValidationReport {
  const envToValidate = customEnv || process.env;
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  const providers: ProviderStatus[] = [];

  const parsed = ServerEnvSchema.safeParse(envToValidate);
  const isVercelPreview = envToValidate.VERCEL_ENV === "preview" || envToValidate.APP_ENV === "staging";
  const isLiveProduction = (envToValidate.NODE_ENV === "production" || envToValidate.VERCEL_ENV === "production") && !isVercelPreview;

  let resolvedEnvironment: "development" | "staging" | "production" | "test" = "development";
  if (isVercelPreview) {
    resolvedEnvironment = "staging";
  } else if (isLiveProduction) {
    resolvedEnvironment = "production";
  } else if (envToValidate.NODE_ENV === "test") {
    resolvedEnvironment = "test";
  }

  // Check Database
  if (!envToValidate.DATABASE_URL?.trim()) {
    missingRequired.push("DATABASE_URL");
  }

  // Check Encryption Keyring (Required in Production for Credential Vault)
  const hasEncKey = !!(
    envToValidate.ENCRYPTION_KEY?.trim() ||
    envToValidate.ENCRYPTION_KEY_M2M?.trim()
  );
  if (!hasEncKey) {
    if (isLiveProduction) {
      missingRequired.push("ENCRYPTION_KEY or ENCRYPTION_KEY_M2M (AES-256 64-hex-char key required in production)");
    } else {
      warnings.push("ENCRYPTION_KEY is unset; credential vault will fail closed on encrypted fields.");
    }
  }

  // Check Email Provider Status (Direct Gmail SMTP / Resend)
  const smtpConfigured = !!(envToValidate.SMTP_USER?.trim() && envToValidate.SMTP_PASS?.trim());
  const resendConfigured = !!envToValidate.RESEND_API_KEY?.trim();
  providers.push({
    name: "Transactional Email (SMTP / Resend)",
    configured: smtpConfigured || resendConfigured,
    mode: smtpConfigured ? "ACTIVE" : resendConfigured ? "ACTIVE" : "STANDBY",
    detail: smtpConfigured
      ? "Direct Gmail SMTP configured (smtp.gmail.com:465)"
      : resendConfigured
      ? "Live Resend API key configured"
      : "Operating in safe STANDBY_MODE (logs delivery intent, does not throw error)",
  });

  // Check S3 Storage
  const s3Configured = !!(
    envToValidate.AWS_ACCESS_KEY_ID?.trim() &&
    envToValidate.AWS_SECRET_ACCESS_KEY?.trim()
  );
  providers.push({
    name: "Object Storage (S3 / R2)",
    configured: s3Configured,
    mode: s3Configured ? "ACTIVE" : "STANDBY",
    detail: s3Configured
      ? "AWS/S3 credentials configured"
      : "S3 credentials unconfigured; fallback to local storage or presign unavailable",
  });

  // Check Payment Gateway
  const razorpayConfigured = !!(
    envToValidate.RAZORPAY_KEY_ID?.trim() &&
    envToValidate.RAZORPAY_KEY_SECRET?.trim()
  );
  providers.push({
    name: "Payment Gateway (Razorpay)",
    configured: razorpayConfigured,
    mode: razorpayConfigured ? "ACTIVE" : "DISABLED",
    detail: razorpayConfigured
      ? "Razorpay merchant credentials active"
      : "Unconfigured; practice manages payments via manual bank transfer/cash/cheque recording",
  });

  // Check WhatsApp Cloud API
  const waConfigured = !!(
    envToValidate.WHATSAPP_ACCESS_TOKEN?.trim() &&
    envToValidate.WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
  providers.push({
    name: "WhatsApp Business API",
    configured: waConfigured,
    mode: waConfigured ? "ACTIVE" : "DISABLED",
    detail: waConfigured
      ? "Meta WhatsApp Cloud API active"
      : "Unconfigured; blocked pending Meta business verification. Email fallback active.",
  });

  // Check GSTN Direct API
  const gstnConfigured = !!(
    envToValidate.GSTN_CLIENT_ID?.trim() &&
    envToValidate.GSTN_CLIENT_SECRET?.trim()
  );
  providers.push({
    name: "GSTN / GSP Direct Portal Sync",
    configured: gstnConfigured,
    mode: gstnConfigured ? "ACTIVE" : "DISABLED",
    detail: gstnConfigured
      ? "GSP API credentials active"
      : "Unconfigured; blocked pending commercial GSP license. Standard JSON/Excel import active.",
  });

  // Check Redis Rate Limiter
  const redisConfigured = !!envToValidate.REDIS_URL?.trim();
  providers.push({
    name: "Distributed Rate Limiter (Redis)",
    configured: redisConfigured,
    mode: redisConfigured ? "ACTIVE" : "STANDBY",
    detail: redisConfigured
      ? "Redis cluster connection configured"
      : "Unconfigured; falling back to in-memory sliding window rate limiter",
  });

  // Check Native Automation Engine
  providers.push({
    name: "Automation Engine (Native In-Process)",
    configured: true,
    mode: "ACTIVE",
    detail: "100% self-contained Node.js & Railway PostgreSQL transactional automation engine active.",
  });

  return {
    valid: missingRequired.length === 0,
    environment: resolvedEnvironment,
    missingRequired,
    warnings,
    providers,
  };
}

/**
 * Returns sanitized server configuration for diagnostic reporting.
 * Completely strips all secret values and tokens.
 */
export function getSanitizedConfigSummary(): Record<string, string> {
  const env = process.env;
  const mask = (val?: string) => (val && val.trim().length > 0 ? "●●●●●●●● [CONFIGURED]" : "[UNSET]");

  return {
    NODE_ENV: env.NODE_ENV || "development",
    APP_BASE_URL: env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    DATABASE_URL: env.DATABASE_URL ? "postgresql://●●●●●●:●●●●●●@... [CONFIGURED]" : "[UNSET]",
    DIRECT_URL: mask(env.DIRECT_URL),
    ENCRYPTION_KEY: mask(env.ENCRYPTION_KEY || env.ENCRYPTION_KEY_M2M),
    SMTP: env.SMTP_USER ? `smtp.gmail.com (${env.SMTP_USER}) [CONFIGURED]` : "[UNSET]",
    RESEND_API_KEY: mask(env.RESEND_API_KEY),
    AWS_S3: mask(env.AWS_ACCESS_KEY_ID),
    RAZORPAY: mask(env.RAZORPAY_KEY_ID),
    WHATSAPP: mask(env.WHATSAPP_ACCESS_TOKEN),
    GSTN_API: mask(env.GSTN_CLIENT_ID),
    REDIS_URL: mask(env.REDIS_URL),
    CRON_SECRET: mask(env.CRON_SECRET),
  };
}
