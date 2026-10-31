"use client";

import { useState, useEffect, Suspense } from "react";
import { loginAction } from "@/lib/auth/actions";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Lock, Mail, Clock, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Turnstile } from "@marsidev/react-turnstile";
import { TruvLogo } from "@/components/brand/truv-logo";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  "";

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const isLoggedOut = searchParams.get("logout") === "true";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Development-safe bypass:
  // If NODE_ENV !== "production" or NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // is missing or dummy test key, bypass Turnstile enforcement so login is never blocked.
  const isProduction = process.env.NODE_ENV === "production";
  const configuredSiteKey =
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hasValidTurnstileKey =
    Boolean(configuredSiteKey) && configuredSiteKey !== "1x00000000000000000000AA";

  const isTurnstileEnforced = isProduction && hasValidTurnstileKey;
  const requireTurnstile =
    isTurnstileEnforced &&
    (failedAttempts >= 2 || process.env.NEXT_PUBLIC_REQUIRE_TURNSTILE === "true");

  useEffect(() => {
    if (urlError === "SESSION_EXPIRED") {
      setError("Your practice session expired or was reset. Please sign in again.");
    } else if (urlError === "TENANT_MEMBERSHIP_REQUIRED") {
      setError("No active practice tenant found for this account. Please contact your firm administrator.");
    } else if (urlError === "TENANT_SUSPENDED") {
      setError("This practice firm account is currently suspended. Please contact support.");
    } else if (urlError === "MEMBERSHIP_INACTIVE") {
      setError("Your firm membership is currently inactive.");
    }
  }, [urlError]);

  // Active lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lockoutSeconds && lockoutSeconds > 0) return;

    if (requireTurnstile && !turnstileToken) {
      setError("Please complete the security verification challenge before continuing.");
      return;
    }

    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    if (turnstileToken) {
      formData.set("turnstileToken", turnstileToken);
      formData.set("cf-turnstile-response", turnstileToken);
    }

    const res = await loginAction(formData);

    if (res?.error) {
      setError(res.error);
      setLoading(false);
      setFailedAttempts((prev) => prev + 1);
      setTurnstileToken(null);
      if (res.retryAfter && typeof res.retryAfter === "number") {
        setLockoutSeconds(res.retryAfter);
      }
    }
  }

  const isLockedOut = lockoutSeconds !== null && lockoutSeconds > 0;
  const isSubmitDisabled = loading || isLockedOut || (requireTurnstile && !turnstileToken);

  return (
    <div className="w-full max-w-md bg-white border border-[#E8ECE8] rounded-2xl p-6 sm:p-8 shadow-card">
      {/* Official TRUV Monogram & Brand Header */}
      <div className="text-center mb-6 flex flex-col items-center">
        <TruvLogo size="lg" subtext="Chartered Accountant Practice System" href="/" />
      </div>

      {/* Logout Confirmation Feedback */}
      {isLoggedOut && !error && (
        <div className="mb-5">
          <Alert
            variant="info"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
            title="Signed Out"
          >
            You have been cleanly signed out of your practice workspace.
          </Alert>
        </div>
      )}

      {/* Lockout / Error Feedback */}
      {isLockedOut ? (
        <div className="mb-5">
          <Alert
            variant="warning"
            icon={<Clock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />}
            title="Authentication Rate Limit Active"
          >
            Too many attempts. Please wait{" "}
            <span className="font-bold tabular-nums text-graphite-900">{lockoutSeconds}s</span> before retrying.
          </Alert>
        </div>
      ) : error ? (
        <div className="mb-5">
          <Alert variant="danger">
            {error}
          </Alert>
        </div>
      ) : null}

      {/* Security Challenge Notice */}
      {requireTurnstile && !isLockedOut && (
        <div className="mb-4">
          <Alert
            variant="info"
            icon={<ShieldAlert className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />}
            title="Security Verification Required"
          >
            Please verify your identity using the Cloudflare Turnstile challenge below.
          </Alert>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-graphite-700 mb-1.5"
          >
            Practice Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              required
              disabled={loading || isLockedOut}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
              placeholder="practitioner@firm.in"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-graphite-700"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-orange-600 hover:text-orange-700 font-semibold transition-colors"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="password"
              name="password"
              type="password"
              required
              disabled={loading || isLockedOut}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
              placeholder="••••••••••••"
            />
          </div>
        </div>

        {/* Cloudflare Turnstile Captcha Widget */}
        {requireTurnstile && Boolean(TURNSTILE_SITE_KEY) && (
          <div className="pt-2 pb-1 flex justify-center">
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={loading}
          disabled={isSubmitDisabled}
          className="w-full mt-2"
        >
          {isLockedOut
            ? `Locked (${lockoutSeconds}s)`
            : requireTurnstile && !turnstileToken
            ? "Verify Captcha to Continue"
            : "Sign In to Practice"}
          {!isLockedOut && (!requireTurnstile || turnstileToken) && (
            <ArrowRight className="w-4 h-4 ml-1" />
          )}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <Suspense fallback={<div className="w-full max-w-md h-96 bg-white rounded-2xl animate-pulse" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}