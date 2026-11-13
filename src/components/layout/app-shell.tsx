"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] min-h-[100svh] w-full max-w-full overflow-hidden bg-ivory">
      <Sidebar
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />
      <div className="flex min-w-0 h-full w-full max-w-full flex-1 flex-col overflow-hidden">
        <Topbar onOpenMobileNav={() => setIsMobileNavOpen(true)} />
        <main className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-ivory pb-24 lg:pb-0">
          {children}
        </main>
      </div>
      <MobileBottomNav onOpenMore={() => setIsMobileNavOpen(true)} />
    </div>
  );
}
