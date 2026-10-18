import { EmailDeliveryResult } from "./email-service";

export interface StandbySafetyDecision {
  allowTokenSuppression: boolean;
  deliveryConfirmed: boolean;
  mustDisplaySetupUrl: boolean;
  errorMessage?: string;
}

/**
 * Evaluates whether an invitation token can be safely suppressed, or must be displayed
 * to prevent permanent administrative lockout.
 *
 * Safety Invariants:
 * 1. An unconfigured email provider (STANDBY_MODE) is NEVER treated as confirmed delivery.
 * 2. If email delivery was not confirmed as SENT by the provider, token suppression is strictly DISARMED.
 * 3. The single-use setup URL is NEVER silently discarded when network dispatch failed.
 */
export function evaluateStandbySafety(options: {
  shouldSendEmail: boolean;
  suppressToken: boolean;
  emailResult?: EmailDeliveryResult | null;
}): StandbySafetyDecision {
  if (!options.shouldSendEmail) {
    // Manual terminal output mode: always display setup link to operator
    return {
      allowTokenSuppression: false,
      deliveryConfirmed: false,
      mustDisplaySetupUrl: true,
    };
  }

  // Email delivery was requested
  const isConfirmedSent = Boolean(
    options.emailResult &&
    options.emailResult.success &&
    (options.emailResult.status === "SENT" || options.emailResult.status === "DELIVERED") &&
    options.emailResult.delivered === true
  );

  if (!isConfirmedSent) {
    const isStandby = options.emailResult?.status === "STANDBY_MODE";
    const errorMessage = isStandby
      ? "Email provider is unconfigured (RESEND_API_KEY missing, service in STANDBY_MODE). No network transmission occurred."
      : (options.emailResult?.error || "Provider transmission failed.");

    return {
      allowTokenSuppression: false, // Strictly disarmed!
      deliveryConfirmed: false,
      mustDisplaySetupUrl: true, // Emergency fallback: preserve single-use link
      errorMessage,
    };
  }

  // Email delivery was accepted and confirmed SENT by provider
  return {
    allowTokenSuppression: Boolean(options.suppressToken),
    deliveryConfirmed: true,
    mustDisplaySetupUrl: !options.suppressToken,
  };
}
