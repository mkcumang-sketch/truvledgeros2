"use client";

import { useState } from "react";
import { loginAction } from "@/lib/auth/actions";
import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await loginAction(formData);

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  function fillDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("Password123!");
    setError(null);
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-[#E2E0D8] rounded-2xl p-6 sm:p-8 shadow-card">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Sparkles className="w-5 h-5 text-emerald-100" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-extrabold text-graphite-900 text-xl tracking-tight">TRUV</span>
            <span className="text-emerald-700 font-bold text-xs uppercase px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded">
              LedgerOS
            </span>
          </div>
          <p className="text-xs text-graphite-500 mt-1.5">
            Indian CA Practice Operating System
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-graphite-700 mb-1.5">
              Practice Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E2E0D8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
                placeholder="priya.kulkarni@truvdemo.in"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-graphite-700">
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
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E2E0D8] rounded-lg text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
                placeholder="••••••••••••"
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
            Sign In to Practice
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </form>

        {/* Demo Fast-Login Assist */}
        <div className="mt-6 pt-5 border-t border-[#EBE9E1]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite-400 text-center mb-2.5">
            Quick Practice Login
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemoAccount("priya.kulkarni@truvdemo.in")}
              className="p-2 rounded-lg border border-[#E2E0D8] bg-[#FAF9F5] hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors"
            >
              <p className="text-xs font-bold text-graphite-800">CA Priya Kulkarni</p>
              <p className="text-[10px] text-graphite-500">Firm Owner</p>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount("us7081569@gmail.com")}
              className="p-2 rounded-lg border border-[#E2E0D8] bg-[#FAF9F5] hover:bg-emerald-50 hover:border-emerald-200 text-left transition-colors"
            >
              <p className="text-xs font-bold text-graphite-800">Umang Sharma</p>
              <p className="text-[10px] text-graphite-500">Superadmin</p>
            </button>
          </div>
          <p className="text-[10px] text-graphite-400 text-center mt-2">
            Password: <span className="font-mono text-graphite-600">Password123!</span>
          </p>
        </div>
      </div>
    </div>
  );
}