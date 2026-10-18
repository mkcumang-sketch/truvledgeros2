"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function AuthAwareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isAuthRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname?.startsWith("/accept-invite");

  if (isAuthRoute) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
        {children}
      </div>
    );
  }

  const isPublicMarketingRoute =
    pathname === "/" ||
    pathname?.startsWith("/pricing") ||
    pathname?.startsWith("/contact") ||
    pathname?.startsWith("/about") ||
    pathname?.startsWith("/privacy") ||
    pathname?.startsWith("/terms");

  if (isPublicMarketingRoute) {
    return (
      <div className="min-h-screen w-full bg-white text-slate-900 font-sans antialiased">
        {children}
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

export default AuthAwareShell;
