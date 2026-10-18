"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, LogOut, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[Dashboard Runtime Error]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const handleResetSession = () => {
    // Clear cookies by calling logout and redirect to clean login with force bypass
    window.location.href = "/api/auth/logout";
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 mb-5 shadow-xs">
        <AlertTriangle className="w-8 h-8" />
      </div>

      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
        Practice Session or Dashboard Exception
      </h2>

      <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6 leading-relaxed">
        The dashboard encountered an unexpected runtime exception while loading practice telemetry.
        If your session expired or tenant assignment was updated, resetting your session will restore access.
      </p>

      {error.digest && (
        <div className="mb-6 px-3 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600">
          Error Digest: {error.digest}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={handleResetSession} variant="primary" size="md">
          <LogOut className="w-4 h-4 mr-2" />
          Reset Session / Re-Login
        </Button>

        <Button onClick={reset} variant="secondary" size="md">
          <RotateCcw className="w-4 h-4 mr-2" />
          Try Again
        </Button>

        <Link href="/">
          <Button variant="ghost" size="md">
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
