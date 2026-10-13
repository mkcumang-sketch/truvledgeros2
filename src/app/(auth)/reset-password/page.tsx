"use client";

import { useState, Suspense } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

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
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Create New Password</h1>
        <p className="text-sm text-slate-400 mt-1">Enter your new secure password below</p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center">
          Password updated successfully! Redirecting to sign in...
        </div>
      )}

      {!token ? (
        <div className="text-center text-sm text-red-400">
          Invalid reset link. Token is missing.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-2">
              New Password
            </label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg shadow-md transition-all flex justify-center items-center"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <Suspense
        fallback={
          <div className="text-slate-400 text-sm">
            Loading reset form...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}