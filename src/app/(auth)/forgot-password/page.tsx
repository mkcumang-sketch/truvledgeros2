"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import Link from "next/link";
import { ArrowLeft, Mail, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruvLogo } from "@/components/brand/truv-logo";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string)?.trim();
    setSubmittedEmail(email);

    const res = await requestPasswordResetAction(formData);

    setLoading(false);
    if (!res.success || res?.error) {
      setError(
        res.error ||
          "You don't have an active account with this email. Please check your credentials or register a new practice."
      );
    } else if (res?.message) {
      setMessage(res.message);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle atmospheric ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-10 right-10 w-[300px] h-[300px] bg-slate-800/40 blur-[90px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <TruvLogo size="lg" subtext="Practice Password Recovery" href="/" className="mb-2" />
          <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-2">
            Recover Practice Password
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enter your registered practice email to receive secure recovery credentials.
          </p>
        </div>

        {/* Direct Inline Error Banner */}
        {error && (
          <div
            id="forgot-password-error-banner"
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-start gap-3 text-xs leading-relaxed shadow-inner"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-300">Account Not Found</p>
              <p className="mt-0.5 text-rose-200/90">{error}</p>
            </div>
          </div>
        )}

        {/* Green Confirmation Alert */}
        {message && (
          <div
            id="forgot-password-success-banner"
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-start gap-3 text-xs leading-relaxed shadow-inner"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-300">Dispatch Successful</p>
              <p className="mt-0.5 text-emerald-200/90">{message}</p>
              {submittedEmail && (
                <p className="mt-1 text-[11px] text-emerald-400 font-mono">
                  Sent to: {submittedEmail}
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Registered Practice Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-800/80 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors disabled:opacity-50 disabled:bg-slate-900"
                placeholder="practitioner@firm.in"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full mt-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-orange-600/25 transition-all"
          >
            Send Recovery Instructions
            {!loading && <Send className="w-4 h-4 ml-1.5" />}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}