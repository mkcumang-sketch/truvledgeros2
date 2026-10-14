"use client";

import { useState, useEffect } from "react";
import { loginAction } from "@/lib/auth/actions";
import Link from "next/link";
import { Sparkles, ArrowRight, Lock, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

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

    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await loginAction(formData);

    if (res?.error) {
      setError(res.error);
      setLoading(false);
      if (res.retryAfter && typeof res.retryAfter === "number") {
        setLockoutSeconds(res.retryAfter);
      }
    }
  }

  const isLockedOut = lockoutSeconds !== null && lockoutSeconds > 0;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-[#E8ECE8] rounded-xl p-6 sm:p-8 shadow-card">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Sparkles className="w-5 h-5 text-emerald-100" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-bold text-graphite-900 text-xl tracking-tight">TRUV</span>
            <span className="text-emerald-700 font-semibold text-xs uppercase px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded">
              LedgerOS
            </span>
          </div>
          <p className="text-xs text-graphite-500 mt-1">
            Indian CA Practice Operating System
          </p>
        </div>

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
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
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
                className="text-xs text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
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
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E8ECE8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors disabled:opacity-60 disabled:bg-[#FAFAF7]"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={isLockedOut}
            className="w-full mt-2"
          >
            {isLockedOut ? `Locked (${lockoutSeconds}s)` : "Sign In to Practice"}
            {!isLockedOut && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </form>
      </div>
    </div>
  );
}