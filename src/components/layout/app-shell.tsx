"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen max-w-full overflow-hidden bg-ivory">
      {/* Sidebar (Desktop persistent + Mobile drawer) */}
      <Sidebar
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden w-full max-w-full">
        <Topbar onOpenMobileNav={() => setIsMobileNavOpen(true)} />
        <main className="flex-1 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto bg-ivory">
          {children}
        </main>
      </div>
    </div>
  );
}
