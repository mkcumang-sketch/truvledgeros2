"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await requestPasswordResetAction(formData);

    setLoading(false);
    if (res?.error) {
      setError(res.error);
    } else if (res?.message) {
      setMessage(res.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">Reset Password</h1>
          <p className="text-sm text-slate-400 mt-1">Enter your account email to receive recovery instructions</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-2">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="name@firm.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg shadow-md transition-all flex justify-center items-center"
          >
            {loading ? "Sending..." : "Send Reset Instructions"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}