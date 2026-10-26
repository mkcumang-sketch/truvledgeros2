import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/server/automation/webhook-signer";
import crypto from "crypto";
import {
  classifyCredentialFormat,
  decryptRecoverableSecret,
  verifyBearerToken,
  computeBearerTokenDigest,
} from "@/lib/server/security/credential-vault";

export interface M2MAuthorizationResult {
  isM2MRequest: boolean;
  authorized: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  tenantId?: string;
  authScope?: "TENANT" | "SYSTEM";
  credentialId?: string;
}

/**
 * Constant-time comparison using pre-hashed SHA-256 digests.
 * Digests are always exactly 32 bytes, eliminating any byte-length timing leakage
 * and preventing RangeError exceptions from length mismatch in crypto.timingSafeEqual.
 */
export function timingSafeEqualCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Validates and authorizes incoming Machine-to-Machine (M2M) requests.
 * Enforces explicit credential-to-tenant binding:
 * - Checks tenant existence, active status, and non-suspended status.
 * - If caller presents a tenant-bound credential (via db.integration), strictly verifies
 *   that the credential belongs to the requested tenant. Cross-tenant access is rejected with 403.
 * - Missing, expired, revoked, or malformed credentials fail closed with 401.
 * - Tenant scope validation occurs upon authentic credentials.
 */
export async function authorizeM2MRequest(
  req: NextRequest,
  options?: { payloadString?: string }
): Promise<M2MAuthorizationResult> {
  const timestampHeader = req.headers.get("x-truv-timestamp");
  const signatureHeader = req.headers.get("x-truv-signature");
  const authHeader = req.headers.get("authorization");
  const cronSecretHeader = req.headers.get("x-cron-secret");

  const hasHmacHeaders = Boolean(signatureHeader || timestampHeader);
  const hasTokenHeaders = Boolean(authHeader || cronSecretHeader);

  // If no machine credentials/headers are present, this is not an M2M request (caller may be a user session)
  if (!hasHmacHeaders && !hasTokenHeaders) {
    return {
      isM2MRequest: false,
      authorized: false,
    };
  }

  const { searchParams } = new URL(req.url);
  const queryTenantId = searchParams.get("tenantId")?.trim();
  const headerTenantId = req.headers.get("x-truv-tenant-id")?.trim();

  // Defense: detect conflicting tenant IDs in query vs header
  if (queryTenantId && headerTenantId && queryTenantId !== headerTenantId) {
    return {
      isM2MRequest: true,
      authorized: false,
      statusCode: 400,
      errorCode: "CONFLICTING_TENANT_SCOPE",
      errorMessage: "Conflicting tenant IDs provided in query parameter and x-truv-tenant-id header.",
    };
  }

  const requestedTenantId = queryTenantId || headerTenantId;

  // Helper to validate tenant status once credential is valid
  async function validateTenantScope(): Promise<
    { valid: true; tenant: { id: string; active: boolean; isSuspended: boolean } } |
    { valid: false; result: M2MAuthorizationResult }
  > {
    if (!requestedTenantId || typeof requestedTenantId !== "string" || !requestedTenantId.trim()) {
      return {
        valid: false,
        result: {
          isM2MRequest: true,
          authorized: false,
          statusCode: 400,
          errorCode: "MISSING_TENANT_SCOPE",
          errorMessage: "tenantId query parameter or x-truv-tenant-id header is required for machine-to-machine requests.",
        },
      };
    }

    const tenantId = requestedTenantId.trim();
    if (tenantId.length > 128) {
      return {
        valid: false,
        result: {
          isM2MRequest: true,
          authorized: false,
          statusCode: 400,
          errorCode: "INVALID_TENANT_SCOPE",
          errorMessage: "Invalid or malformed tenantId parameter (length exceeds maximum 128 chars).",
        },
      };
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        active: true,
        isSuspended: true,
      },
    });

    if (!tenant) {
      return {
        valid: false,
        result: {
          isM2MRequest: true,
          authorized: false,
          statusCode: 404,
          errorCode: "TENANT_NOT_FOUND",
          errorMessage: "Requested tenant does not exist or is not authorized.",
        },
      };
    }

    if (!tenant.active || tenant.isSuspended) {
      return {
        valid: false,
        result: {
          isM2MRequest: true,
          authorized: false,
          statusCode: 403,
          errorCode: "TENANT_UNAUTHORIZED",
          errorMessage: "Tenant account is suspended or inactive.",
        },
      };
    }

    return { valid: true, tenant };
  }

  // Branch A: Machine-to-Machine HMAC Signature Authentication
  if (hasHmacHeaders) {
    if (!signatureHeader || !timestampHeader) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "MISSING_SIGNATURE",
        errorMessage: "Both x-truv-signature and x-truv-timestamp headers are required for signature authentication.",
      };
    }

    // Enforce 5-minute replay attack tolerance window
    const tsNumber = parseInt(timestampHeader, 10);
    const now = Date.now();
    if (isNaN(tsNumber) || Math.abs(now - tsNumber) > 300000) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "TIMESTAMP_EXPIRED",
        errorMessage: "Webhook timestamp expired or outside tolerance window.",
      };
    }

    // Check system-level secret first
    const systemSecret = (process.env.M2M_WEBHOOK_SECRET || process.env.CRON_SECRET)?.trim();
    let isSignatureValid = false;
    let authScope: "TENANT" | "SYSTEM" = "SYSTEM";
    let matchedIntegrationId: string | undefined;

    if (systemSecret) {
      const systemAuth = verifyWebhookSignature({
        payloadString: options?.payloadString || "",
        signatureHeader,
        timestampHeader,
        secret: systemSecret,
      });
      if (systemAuth.valid) {
        isSignatureValid = true;
        authScope = "SYSTEM";
      }
    }

    let tenantIntegration: any = null;

    // If not verified with system secret, check if caller provided tenant scope and matches tenant integration
    if (!isSignatureValid && requestedTenantId) {
      tenantIntegration = await db.integration.findFirst({
        where: {
          tenantId: requestedTenantId,
          provider: { in: ["N8N_M2M", "M2M_HMAC", "WEBHOOK"] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          tenantId: true,
          provider: true,
          encryptedCredentials: true,
          iv: true,
          authTag: true,
          status: true,
        },
      });

      if (tenantIntegration) {
        let tenantSecret: string | null = null;
        const format = classifyCredentialFormat(tenantIntegration);

        if (format === "V1_ENCRYPTED") {
          try {
            tenantSecret = decryptRecoverableSecret({
              encryptedCredentials: tenantIntegration.encryptedCredentials!,
              iv: tenantIntegration.iv!,
              authTag: tenantIntegration.authTag!,
              tenantId: tenantIntegration.tenantId,
              provider: tenantIntegration.provider,
              integrationId: tenantIntegration.id,
            });
          } catch {
            tenantSecret = null;
          }
        } else if (format === "LEGACY_PLAINTEXT") {
          tenantSecret = tenantIntegration.encryptedCredentials?.trim() || null;
        }

        if (tenantSecret) {
          const tenantAuth = verifyWebhookSignature({
            payloadString: options?.payloadString || "",
            signatureHeader,
            timestampHeader,
            secret: tenantSecret,
          });
          if (tenantAuth.valid) {
            isSignatureValid = true;
            authScope = "TENANT";
            matchedIntegrationId = tenantIntegration.id;
          }
        }
      }
    }

    if (!isSignatureValid) {
      if (!systemSecret && !tenantIntegration) {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 401,
          errorCode: "UNCONFIGURED_SECRET",
          errorMessage: "M2M webhook authentication secret is not configured on server.",
        };
      }

      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "INVALID_SIGNATURE",
        errorMessage: "Invalid webhook signature.",
      };
    }

    // Signature is valid; now enforce tenant scope
    const scopeCheck = await validateTenantScope();
    if (!scopeCheck.valid) {
      return scopeCheck.result;
    }

    return {
      isM2MRequest: true,
      authorized: true,
      tenantId: scopeCheck.tenant.id,
      authScope,
      credentialId: matchedIntegrationId,
    };
  }

  // Branch B: Machine-to-Machine Bearer Token / Secret Token Authentication
  if (hasTokenHeaders) {
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    const providedToken = bearerToken || cronSecretHeader?.trim();

    if (!providedToken) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "INVALID_CREDENTIALS",
        errorMessage: "Missing or empty machine authorization credentials.",
      };
    }

    // 1. Check if token matches system-level CRON_SECRET
    const systemCronSecret = process.env.CRON_SECRET?.trim();
    const isSystemAuthorized =
      systemCronSecret && timingSafeEqualCompare(providedToken, systemCronSecret);

    let tokenIntegration: any = null;

    if (!isSystemAuthorized) {
      // 2. Check if token belongs to any registered Tenant Integration
      tokenIntegration = await db.integration.findFirst({
        where: {
          encryptedCredentials: providedToken,
          provider: { in: ["M2M_BEARER", "M2M_AUTH", "CRON", "API_KEY", "N8N_M2M"] },
        },
        select: {
          id: true,
          tenantId: true,
          provider: true,
          encryptedCredentials: true,
          iv: true,
          authTag: true,
          status: true,
        },
      });

      if (!tokenIntegration) {
        try {
          const { digestEnvelope } = computeBearerTokenDigest({ token: providedToken });
          tokenIntegration = await db.integration.findFirst({
            where: {
              encryptedCredentials: digestEnvelope,
              provider: { in: ["M2M_BEARER", "M2M_AUTH", "CRON", "API_KEY", "N8N_M2M"] },
            },
            select: {
              id: true,
              tenantId: true,
              provider: true,
              encryptedCredentials: true,
              iv: true,
              authTag: true,
              status: true,
            },
          });
        } catch {
          // Digest unavailable
        }
      }
    }

    if (!isSystemAuthorized && !tokenIntegration) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "INVALID_CREDENTIALS",
        errorMessage: "Invalid machine credentials.",
      };
    }

    // Token is valid; now enforce tenant scope
    const scopeCheck = await validateTenantScope();
    if (!scopeCheck.valid) {
      return scopeCheck.result;
    }

    if (tokenIntegration) {
      if (tokenIntegration.status !== "ACTIVE") {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 403,
          errorCode: "CREDENTIAL_REVOKED",
          errorMessage: "Machine credential for this tenant has been revoked or disabled.",
        };
      }

      // STRICT CROSS-TENANT BINDING: The token's registered tenant MUST match the requested tenant!
      if (tokenIntegration.tenantId !== scopeCheck.tenant.id) {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 403,
          errorCode: "CROSS_TENANT_FORBIDDEN",
          errorMessage: `Cross-tenant access denied: Machine credential authorized for tenant '${tokenIntegration.tenantId}' cannot access tenant '${scopeCheck.tenant.id}'.`,
        };
      }

      return {
        isM2MRequest: true,
        authorized: true,
        tenantId: scopeCheck.tenant.id,
        authScope: "TENANT",
        credentialId: tokenIntegration.id,
      };
    }

    return {
      isM2MRequest: true,
      authorized: true,
      tenantId: scopeCheck.tenant.id,
      authScope: "SYSTEM",
    };
  }

  return {
    isM2MRequest: false,
    authorized: false,
  };
}
