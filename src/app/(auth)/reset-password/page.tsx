"use client";

import { useState, Suspense } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TruvLogo } from "@/components/brand/truv-logo";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("token", token);

    const res = await resetPasswordAction(formData);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else if (res?.success) {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    }
  }

  return (
    <div className="w-full max-w-md bg-white border border-[#E8ECE8] rounded-2xl p-6 sm:p-8 shadow-card">
      {/* Brand Header */}
      <div className="text-center mb-6 flex flex-col items-center">
        <TruvLogo size="lg" subtext="Practice Password Update" href="/" className="mb-2" />
        <h1 className="text-xl font-bold tracking-tight text-graphite-900 mt-2">
          Set New Password
        </h1>
        <p className="text-xs text-graphite-500 mt-1">
          Create a secure password (minimum 10 characters) for your practice account.
        </p>
      </div>

      {error && (
        <div className="mb-5">
          <Alert variant="danger">
            {error}
          </Alert>
        </div>
      )}

      {success && (
        <div className="mb-5">
          <Alert
            variant="success"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />}
          >
            Password updated successfully. Redirecting you to sign in...
          </Alert>
        </div>
      )}

      {!token ? (
        <div className="text-center py-4">
          <p className="text-xs text-rose-600 mb-4">
            Invalid or missing security password reset token. Please request a new link.
          </p>
          <Link href="/forgot-password">
            <Button variant="secondary" size="md">
              Request New Reset Link
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-graphite-700 mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                name="password"
                type="password"
                required
                disabled={loading || success}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
                placeholder="••••••••••••"
              />
            </div>
            <p className="text-[11px] text-graphite-400 mt-1">
              Minimum 10 characters with uppercase, lowercase, and numeric digits.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-graphite-700 mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                disabled={loading || success}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={success}
            className="w-full mt-2"
          >
            Update Practice Password
          </Button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-[#E8ECE8] text-center">
        <Link
          href="/login"
          className="inline-flex items-center text-xs text-orange-600 hover:text-orange-700 font-semibold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <Suspense
        fallback={
          <div className="text-xs text-graphite-500 font-medium">
            Loading secure reset form...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}