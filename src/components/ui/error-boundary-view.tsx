"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryViewProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  subtitle?: string;
}

export function ErrorBoundaryView({
  error,
  reset,
  title = "Something went wrong",
  subtitle = "Our system caught an unexpected exception and protected your data. You can attempt to retry the operation or return to safety.",
}: ErrorBoundaryViewProps) {
  useEffect(() => {
    // Log exception safely to diagnostics
    console.error("[LedgerOS Route Error Boundary]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-5 shadow-xs">
        <AlertTriangle className="w-7 h-7" />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-graphite-900 tracking-tight mb-2">
        {title}
      </h2>

      <p className="text-sm text-graphite-600 max-w-md mx-auto mb-6 leading-relaxed">
        {subtitle}
      </p>

      {error.message && process.env.NODE_ENV !== "production" && (
        <div className="max-w-lg mx-auto mb-6 p-3 bg-graphite-50 rounded-lg border border-graphite-200 text-xs font-mono text-left text-graphite-700 overflow-x-auto">
          {error.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} variant="primary" size="md">
          <RotateCcw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
        <Link href="/dashboard">
          <Button variant="secondary" size="md">
            <Home className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
