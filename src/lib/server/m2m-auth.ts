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
 * - Missing, expired, revoked, or malformed credentials fail closed.
 * - System-level credentials (CRON_SECRET, N8N_WEBHOOK_SECRET) are supported for automated outbox
 *   processing under tightly controlled, explicit system scope.
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

  // 1. Mandatory Tenant Scope Validation
  if (!requestedTenantId || typeof requestedTenantId !== "string" || !requestedTenantId.trim()) {
    return {
      isM2MRequest: true,
      authorized: false,
      statusCode: 400,
      errorCode: "MISSING_TENANT_SCOPE",
      errorMessage: "tenantId query parameter or x-truv-tenant-id header is required for machine-to-machine requests.",
    };
  }

  const tenantId = requestedTenantId.trim();
  if (tenantId.length > 128) {
    return {
      isM2MRequest: true,
      authorized: false,
      statusCode: 400,
      errorCode: "INVALID_TENANT_SCOPE",
      errorMessage: "Invalid or malformed tenantId parameter (length exceeds maximum 128 chars).",
    };
  }

  // 2. Validate Tenant Status in Database
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
      isM2MRequest: true,
      authorized: false,
      statusCode: 404,
      errorCode: "TENANT_NOT_FOUND",
      errorMessage: "Requested tenant does not exist or is not authorized.",
    };
  }

  if (!tenant.active || tenant.isSuspended) {
    return {
      isM2MRequest: true,
      authorized: false,
      statusCode: 403,
      errorCode: "TENANT_UNAUTHORIZED",
      errorMessage: "Tenant account is suspended or inactive.",
    };
  }

  // 3. Authenticate and Verify Credential-to-Tenant Scope
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

    // Check if the requested tenant has a registered tenant-bound credential
    const tenantIntegration = await db.integration.findFirst({
      where: {
        tenantId: tenant.id,
        provider: { in: ["N8N_M2M", "M2M_HMAC", "WEBHOOK"] },
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
      if (tenantIntegration.status !== "ACTIVE") {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 403,
          errorCode: "CREDENTIAL_REVOKED",
          errorMessage: "Tenant integration credential has been revoked or disabled.",
        };
      }

      let tenantSecret: string | null = null;
      const format = classifyCredentialFormat(tenantIntegration);

      if (format === "V1_ENCRYPTED") {
        try {
          tenantSecret = decryptRecoverableSecret({
            encryptedCredentials: tenantIntegration.encryptedCredentials!,
            iv: tenantIntegration.iv!,
            authTag: tenantIntegration.authTag!,
            tenantId: tenant.id,
            provider: tenantIntegration.provider,
            integrationId: tenantIntegration.id,
          });
        } catch {
          return {
            isM2MRequest: true,
            authorized: false,
            statusCode: 401,
            errorCode: "INVALID_CREDENTIALS",
            errorMessage: "Tenant integration secret decryption failed.",
          };
        }
      } else if (format === "LEGACY_PLAINTEXT") {
        tenantSecret = tenantIntegration.encryptedCredentials?.trim() || null;
      } else {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 401,
          errorCode: "UNCONFIGURED_SECRET",
          errorMessage: "Tenant integration secret is empty, malformed, or unsuitable for HMAC authentication.",
        };
      }

      if (!tenantSecret) {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 401,
          errorCode: "UNCONFIGURED_SECRET",
          errorMessage: "Tenant integration secret is empty or unconfigured.",
        };
      }

      const auth = verifyWebhookSignature({
        payloadString: options?.payloadString || "",
        signatureHeader,
        timestampHeader,
        secret: tenantSecret,
      });

      if (auth.valid) {
        return {
          isM2MRequest: true,
          authorized: true,
          tenantId: tenant.id,
          authScope: "TENANT",
          credentialId: tenantIntegration.id,
        };
      }

      // Check if signed with system-level HMAC secret (for internal system outbox dispatcher)
      const systemSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
      if (systemSecret) {
        const systemAuth = verifyWebhookSignature({
          payloadString: options?.payloadString || "",
          signatureHeader,
          timestampHeader,
          secret: systemSecret,
        });

        if (systemAuth.valid) {
          return {
            isM2MRequest: true,
            authorized: true,
            tenantId: tenant.id,
            authScope: "SYSTEM",
          };
        }
      }

      const isExpired = auth.error?.includes("expired") || auth.error?.includes("tolerance");
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: isExpired ? "TIMESTAMP_EXPIRED" : "INVALID_SIGNATURE",
        errorMessage: auth.error || "Invalid webhook signature.",
      };
    }

    // System-level HMAC secret fallback for system outbox automation
    const systemSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
    if (!systemSecret) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "UNCONFIGURED_SECRET",
        errorMessage: "Webhook authentication secret is not configured on server.",
      };
    }

    const auth = verifyWebhookSignature({
      payloadString: options?.payloadString || "",
      signatureHeader,
      timestampHeader,
      secret: systemSecret,
    });

    if (!auth.valid) {
      const isExpired = auth.error?.includes("expired") || auth.error?.includes("tolerance");
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: isExpired ? "TIMESTAMP_EXPIRED" : "INVALID_SIGNATURE",
        errorMessage: auth.error || "Invalid webhook signature.",
      };
    }

    return {
      isM2MRequest: true,
      authorized: true,
      tenantId: tenant.id,
      authScope: "SYSTEM",
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

    // 1. Check if token belongs to any registered Tenant Integration
    // Strategy:
    // a. Direct lookup for legacy plaintext tokens & in-memory test mocks
    let tokenIntegration = await db.integration.findFirst({
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

    // b. Lookup by computed blinded digest envelope (Contract B)
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
        // Active pepper unavailable or computation error; continue safely
      }
    }

    // c. Lookup by encrypted recoverable secret (Contract A) under requested tenant
    if (!tokenIntegration) {
      try {
        const encryptedCandidates = await db.integration.findMany({
          where: {
            tenantId: tenant.id,
            provider: { in: ["M2M_BEARER", "M2M_AUTH", "CRON", "API_KEY", "N8N_M2M"] },
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

        for (const candidate of encryptedCandidates) {
          if (classifyCredentialFormat(candidate) === "V1_ENCRYPTED") {
            try {
              const decrypted = decryptRecoverableSecret({
                encryptedCredentials: candidate.encryptedCredentials,
                iv: candidate.iv,
                authTag: candidate.authTag,
                tenantId: candidate.tenantId,
                provider: candidate.provider,
                integrationId: candidate.id,
              });
              if (timingSafeEqualCompare(providedToken, decrypted)) {
                tokenIntegration = candidate;
                break;
              }
            } catch {
              // Decryption failure - skip candidate
            }
          }
        }
      } catch {
        // Continue safely
      }
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
      if (tokenIntegration.tenantId !== tenant.id) {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 403,
          errorCode: "CROSS_TENANT_FORBIDDEN",
          errorMessage: `Cross-tenant access denied: Machine credential authorized for tenant '${tokenIntegration.tenantId}' cannot access tenant '${tenant.id}'.`,
        };
      }

      // Format-aware constant-time validation
      const format = classifyCredentialFormat(tokenIntegration);
      let isTokenValid = false;

      if (format === "V1_DIGEST") {
        isTokenValid = verifyBearerToken({
          providedToken,
          storedDigestEnvelope: tokenIntegration.encryptedCredentials,
        });
      } else if (format === "LEGACY_PLAINTEXT") {
        isTokenValid = timingSafeEqualCompare(providedToken, tokenIntegration.encryptedCredentials);
      } else if (format === "V1_ENCRYPTED") {
        try {
          const decrypted = decryptRecoverableSecret({
            encryptedCredentials: tokenIntegration.encryptedCredentials,
            iv: tokenIntegration.iv,
            authTag: tokenIntegration.authTag,
            tenantId: tokenIntegration.tenantId,
            provider: tokenIntegration.provider,
            integrationId: tokenIntegration.id,
          });
          isTokenValid = timingSafeEqualCompare(providedToken, decrypted);
        } catch {
          isTokenValid = false;
        }
      }

      if (!isTokenValid) {
        return {
          isM2MRequest: true,
          authorized: false,
          statusCode: 401,
          errorCode: "INVALID_CREDENTIALS",
          errorMessage: "Invalid machine credentials.",
        };
      }

      return {
        isM2MRequest: true,
        authorized: true,
        tenantId: tenant.id,
        authScope: "TENANT",
        credentialId: tokenIntegration.id,
      };
    }

    // 2. Check if token matches the system-level CRON_SECRET
    const systemCronSecret = (process.env.CRON_SECRET || process.env.N8N_WEBHOOK_SECRET)?.trim();
    if (!systemCronSecret) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "UNCONFIGURED_SECRET",
        errorMessage: "Machine authentication secret is not configured on server.",
      };
    }

    const isSystemAuthorized = timingSafeEqualCompare(providedToken, systemCronSecret);
    if (!isSystemAuthorized) {
      return {
        isM2MRequest: true,
        authorized: false,
        statusCode: 401,
        errorCode: "INVALID_CREDENTIALS",
        errorMessage: "Invalid machine credentials.",
      };
    }

    return {
      isM2MRequest: true,
      authorized: true,
      tenantId: tenant.id,
      authScope: "SYSTEM",
    };
  }

  return {
    isM2MRequest: false,
    authorized: false,
  };
}
