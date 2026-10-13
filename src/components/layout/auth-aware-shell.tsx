"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function AuthAwareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isAuthRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname?.startsWith("/accept-invite");

  if (isAuthRoute) {
    return (
      <div className="min-h-screen w-full bg-ivory flex items-center justify-center p-4">
        {children}
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

export default AuthAwareShell;
