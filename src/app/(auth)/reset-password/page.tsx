"use client";

import { useState, Suspense } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruvLogo } from "@/components/brand/truv-logo";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = (formData.get("password") as string) || "";
    const confirmPassword = (formData.get("confirmPassword") as string) || "";

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    setLoading(true);
    formData.set("token", token);
    formData.set("email", email);
    formData.set("newPassword", password);

    const res = await resetPasswordAction(formData);
    setLoading(false);

    if (!res.success || res?.error) {
      setError(res.error || "Failed to update password. Please check your reset link.");
    } else if (res?.success) {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    }
  }

  return (
    <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 text-slate-100">
      {/* Brand Header */}
      <div className="text-center mb-6 flex flex-col items-center">
        <TruvLogo size="lg" subtext="Practice Password Update" href="/" className="mb-2" />
        <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-2">
          Set New Practice Password
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {email ? `Updating credentials for ${email}` : "Create a secure new password (minimum 8 characters)."}
        </p>
      </div>

      {error && (
        <div
          id="reset-password-error-banner"
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-start gap-3 text-xs leading-relaxed shadow-inner"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-300">Update Failed</p>
            <p className="mt-0.5 text-rose-200/90">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div
          id="reset-password-success-banner"
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-start gap-3 text-xs leading-relaxed shadow-inner"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300">Password Updated</p>
            <p className="mt-0.5 text-emerald-200/90">
              Your password was successfully updated with bcrypt security. Redirecting you to sign in...
            </p>
          </div>
        </div>
      )}

      {!token ? (
        <div className="text-center py-4">
          <p className="text-xs text-rose-400 mb-4 bg-rose-950/40 border border-rose-800/40 p-3 rounded-xl">
            Invalid or missing security password reset token. Please request a new recovery link.
          </p>
          <Link href="/forgot-password">
            <Button
              variant="secondary"
              size="md"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              Request New Reset Link
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              New Password (8+ characters)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                name="password"
                type="password"
                required
                disabled={loading || success}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-800/80 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors disabled:opacity-50 disabled:bg-slate-900"
                placeholder="••••••••••••"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Minimum 8 characters. Hashed using 12 rounds of bcrypt.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                disabled={loading || success}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-800/80 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors disabled:opacity-50 disabled:bg-slate-900"
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
            className="w-full mt-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-orange-600/25 transition-all"
          >
            Update Practice Password
          </Button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-slate-800 text-center">
        <Link
          href="/login"
          className="inline-flex items-center text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors"
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
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle atmospheric ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-10 right-10 w-[300px] h-[300px] bg-slate-800/40 blur-[90px] rounded-full pointer-events-none" />

      <Suspense
        fallback={
          <div className="text-xs text-slate-400 font-medium animate-pulse">
            Loading secure reset form...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}