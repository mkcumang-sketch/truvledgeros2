"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  FileText,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Payments", href: "/payments", icon: CreditCard },
];

export function MobileBottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="More navigation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMoreOpen(false)}
            aria-label="Close more navigation"
          />
          <div className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 left-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-slate-900">More in LedgerOS</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-slate-500" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="px-1 pb-2 text-xs text-slate-500">Open the full practice menu for GST, documents, tasks, reports and settings.</p>
            <button
              type="button"
              onClick={() => { setMoreOpen(false); onOpenMore(); }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF4EE] px-4 text-sm font-semibold text-[#B94720] ring-1 ring-[#F26B38]/25"
            >
              <Menu className="h-4 w-4" />
              Open all modules
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Primary mobile navigation"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[#E7E5DE] bg-white/95 px-1 pt-1.5 backdrop-blur-xl"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {primaryItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
                  active ? "text-[#C44E25]" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <span className={cn("flex h-7 w-10 items-center justify-center rounded-full", active && "bg-[#FFF0E8]")}>
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold text-slate-500 hover:text-slate-900"
          >
            <span className="flex h-7 w-10 items-center justify-center rounded-full">
              <Menu className="h-5 w-5" />
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
