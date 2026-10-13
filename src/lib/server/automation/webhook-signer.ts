import crypto from "crypto";

export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Signs a payload string with HMAC-SHA256 and a timestamp to guarantee payload integrity
 * and freshness.
 *
 * Signature format: "sha256=" + HMAC-SHA256(`${timestamp}.${payloadString}`)
 */
export function createWebhookSignature(
  payloadString: string,
  secret: string,
  timestamp: number = Date.now()
): { signature: string; timestamp: number } {
  if (!secret) {
    throw new Error("Cannot create webhook signature: secret is undefined or empty");
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payloadString}`);
  const digest = hmac.digest("hex");

  return {
    signature: `sha256=${digest}`,
    timestamp,
  };
}

/**
 * Validates an incoming webhook request signature and checks for timestamp freshness (replay protection).
 *
 * Default tolerance is 5 minutes (300,000 milliseconds).
 */
export function verifyWebhookSignature(params: {
  payloadString: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  secret: string;
  toleranceMs?: number;
}): SignatureVerificationResult {
  const {
    payloadString,
    signatureHeader,
    timestampHeader,
    secret,
    toleranceMs = 5 * 60 * 1000, // 5 minutes
  } = params;

  if (!secret) {
    return { valid: false, error: "N8N_WEBHOOK_SECRET is not configured on server" };
  }

  if (!signatureHeader || !timestampHeader) {
    return { valid: false, error: "Missing required signature or timestamp header" };
  }

  // 1. Verify Timestamp Freshness (Replay Attack Protection)
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp header value" };
  }

  const currentTime = Date.now();
  const timeDifference = Math.abs(currentTime - timestamp);

  if (timeDifference > toleranceMs) {
    return {
      valid: false,
      error: `Webhook timestamp expired or outside tolerance window (${timeDifference}ms > ${toleranceMs}ms). Possible replay attack.`,
    };
  }

  // 2. Validate Signature Format
  if (!signatureHeader.startsWith("sha256=")) {
    return { valid: false, error: "Malformed signature header format. Expected 'sha256=<hex>'" };
  }

  const providedHash = signatureHeader.slice(7);

  // 3. Compute Expected Signature
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payloadString}`);
  const expectedHash = hmac.digest("hex");

  // 4. Constant-Time Timing-Safe Comparison
  try {
    const providedBuffer = Buffer.from(providedHash, "hex");
    const expectedBuffer = Buffer.from(expectedHash, "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: "Signature hash length mismatch" };
    }

    const matches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    if (!matches) {
      return { valid: false, error: "Signature mismatch. Payload has been tampered with or secret is incorrect." };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Signature verification error: ${err.message}` };
  }
}
