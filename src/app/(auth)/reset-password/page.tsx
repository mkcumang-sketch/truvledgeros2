"use client";

import { useState, Suspense } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowLeft, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
    <div className="w-full max-w-md bg-white border border-[#E8ECE8] rounded-xl p-6 sm:p-8 shadow-card">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-xs">
          <Sparkles className="w-5 h-5 text-emerald-100" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-graphite-900">
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
        <div className="space-y-4 text-center py-2">
          <Alert variant="warning" title="Missing Reset Token">
            This password reset link is invalid or incomplete. Please request a new link from the forgot password page.
          </Alert>
          <div className="pt-2">
            <Link
              href="/forgot-password"
              className="text-xs text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="newPassword"
              className="block text-xs font-semibold text-graphite-700 mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={10}
                maxLength={128}
                disabled={loading || success}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
                placeholder="Minimum 10 characters"
              />
            </div>
            <p className="text-[11px] text-graphite-500 mt-1">
              Must be at least 10 characters long.
            </p>
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
          className="inline-flex items-center text-xs text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
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