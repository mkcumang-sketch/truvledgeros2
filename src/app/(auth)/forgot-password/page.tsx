"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import Link from "next/link";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TruvLogo } from "@/components/brand/truv-logo";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-[#E8ECE8] rounded-xl p-6 sm:p-8 shadow-card">
        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <TruvLogo size="lg" subtext="Practice Password Recovery" href="/" className="mb-2" />
        </div>

        {error && (
          <div className="mb-5">
            <Alert variant="danger">
              {error}
            </Alert>
          </div>
        )}

        {message && (
          <div className="mb-5">
            <Alert variant="success">
              {message}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-graphite-700 mb-1.5"
            >
              Registered Practice Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                disabled={loading}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
                placeholder="practitioner@firm.in"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full mt-2"
          >
            Send Recovery Instructions
            {!loading && <Send className="w-4 h-4 ml-1" />}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#E8ECE8] text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-xs text-orange-600 hover:text-orange-700 font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}