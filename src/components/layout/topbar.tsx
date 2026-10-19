"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Menu,
  Search,
  Bell,
  Sparkles,
  Building,
  UserCheck,
  LogOut,
  Shield,
  ChevronDown,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import CommandPalette from "@/components/CommandPalette";
import { TruvMonogram } from "@/components/brand/truv-monogram";

export interface TopbarProps {
  onOpenMobileNav?: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    role: string;
    firmName: string;
  }>({
    name: "CA Priya Kulkarni",
    email: "priya.kulkarni@truvdemo.in",
    role: "FIRM_OWNER",
    firmName: "TRUV Demo Chartered Accountants",
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setProfile({
            name: data.user.name || "CA Practitioner",
            email: data.user.email,
            role: data.membership?.role || (data.user.isSuperAdmin ? "SUPERADMIN" : "MEMBER"),
            firmName: data.tenant?.name || "TRUV Practice",
          });
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "CA";

  return (
    <header className="h-16 border-b border-[#E2E0D8] bg-white px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30 flex-shrink-0 select-none">
      {/* Left: Mobile Hamburger & Search */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 max-w-lg">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            data-testid="mobile-hamburger"
            className="lg:hidden p-2 rounded-lg text-graphite-600 hover:text-graphite-900 hover:bg-[#FAF9F5] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B38]"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Mobile TRUV Brand Monogram */}
        <Link href="/dashboard" className="lg:hidden flex items-center flex-shrink-0" title="TRUV LedgerOS">
          <TruvMonogram className="w-8 h-8" />
        </Link>

        {/* Global Search Bar */}
        <div
          onClick={() => setIsCommandPaletteOpen(true)}
          className="relative w-full max-w-md hidden sm:block cursor-pointer group"
        >
          <Search className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-[#F26B38] transition-colors" />
          <input
            type="text"
            readOnly
            placeholder="Search clients, PAN, GSTIN, invoices... (Ctrl + K)"
            className="w-full bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[#263238] placeholder:text-slate-400 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors"
          />
        </div>

        {/* Mobile Search Icon Button */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="sm:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-[#F8FAFC] transition-colors"
          aria-label="Search practice records"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Firm Badge (Desktop) */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-semibold text-[#263238]">
          <Building className="w-3.5 h-3.5 text-[#F26B38] flex-shrink-0" />
          <span className="truncate max-w-[200px]">{profile.firmName}</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[#FFF4EE] text-[#D95524] rounded font-bold uppercase border border-[#F26B38]/20">
            {profile.role.replace("_", " ")}
          </span>
        </div>

        {/* AI Practice Bot Quick Link */}
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FFF4EE] border border-[#F26B38]/30 text-[#D95524] hover:bg-[#FFE7DA] transition-colors shadow-2xs"
          title="Open AI Practice Copilot"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#F26B38]" />
          <span className="hidden sm:inline">AI Practice Bot</span>
        </Link>

        {/* Notifications */}
        <Link
          href="/tasks"
          className="relative p-2 rounded-lg border border-[#E5E7EB] text-slate-600 hover:bg-[#F8FAFC] hover:text-[#263238] transition-colors"
          title="Practice Notifications & Approvals"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#F26B38] ring-2 ring-white" />
        </Link>

        {/* User Profile Pill & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-2 border-l border-[#E5E7EB] text-left hover:opacity-90 transition-opacity focus-visible:outline-none"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <div className="w-8 h-8 rounded-full bg-[#F26B38] text-white font-bold text-xs flex items-center justify-center shadow-xs flex-shrink-0">
              {initials}
            </div>
            <div className="hidden xl:block">
              <div className="text-xs font-bold text-[#263238] leading-tight truncate max-w-[140px]">
                {profile.name}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <UserCheck className="w-2.5 h-2.5 text-[#F26B38]" />
                <span className="truncate max-w-[120px]">{profile.role.replace("_", " ")}</span>
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
          </button>

          {/* User Dropdown Menu */}
          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-2 w-64 bg-white border border-[#E2E0D8] rounded-xl shadow-popover p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-[#EBE9E1] mb-1">
                  <p className="font-bold text-graphite-900 truncate">{profile.name}</p>
                  <p className="text-graphite-500 text-[11px] truncate mt-0.5">{profile.email}</p>
                  <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFF4EE] text-[#D95524] text-[10px] font-semibold border border-[#F26B38]/30">
                    <Shield className="w-3 h-3 text-[#F26B38]" />
                    <span>{profile.role.replace("_", " ")}</span>
                  </div>
                </div>

                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-graphite-700 hover:bg-[#FAF9F5] hover:text-graphite-900 transition-colors"
                >
                  <Building className="w-4 h-4 text-graphite-400" />
                  <span>Practice Settings</span>
                </Link>

                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors text-left font-medium mt-1"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </header>
  );
}
