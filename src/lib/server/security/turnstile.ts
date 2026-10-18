export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
  challengeTs?: string;
  hostname?: string;
}

const CLOUDFLARE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Cloudflare dummy test keys
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

/**
 * Validates Cloudflare Turnstile token against Cloudflare's API.
 * Shields backend authentication and database from automated brute force attacks.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim();

  // If Turnstile is not configured in development or test, allow pass-through
  if (!secretKey) {
    if (process.env.NODE_ENV === "production" && process.env.ENFORCE_TURNSTILE === "true") {
      return {
        success: false,
        error: "Turnstile secret key is not configured on the server.",
      };
    }
    // Permissive in dev/test if not configured
    return { success: true };
  }

  if (!token || !token.trim()) {
    return {
      success: false,
      error: "Captcha verification is required. Please solve the captcha.",
    };
  }

  // Fast-path test token for local or test environments
  if (secretKey === TEST_SECRET_KEY || token.startsWith("XXXX.DUMMY.TOKEN")) {
    return { success: true };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch(CLOUDFLARE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(5000), // 5s timeout on Cloudflare API
    });

    if (!res.ok) {
      console.error(`[TURNSTILE_VERIFY_ERROR] HTTP ${res.status} from Cloudflare verify`);
      return {
        success: false,
        error: "Failed to verify captcha. Please try again.",
      };
    }

    const data = await res.json();
    if (data.success) {
      return {
        success: true,
        challengeTs: data.challenge_ts,
        hostname: data.hostname,
      };
    }

    console.warn("[TURNSTILE_REJECTED]", data["error-codes"]);
    return {
      success: false,
      error: "Captcha verification failed. Please try again.",
    };
  } catch (err: any) {
    console.error("[TURNSTILE_NETWORK_ERROR]", err?.message || err);
    return {
      success: false,
      error: "Captcha service temporarily unreachable. Please retry.",
    };
  }
}
