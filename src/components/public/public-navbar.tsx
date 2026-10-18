"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { TruvLogo } from "@/components/brand/truv-logo";

interface PublicNavbarProps {
  onOpenEnquiry?: () => void;
}

export function PublicNavbar({ onOpenEnquiry }: PublicNavbarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Authentic TRUV Monogram & Brand Identity */}
        <TruvLogo size="md" subtext="Chartered Accountant Practice System" href="/" />

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-600 tracking-wide uppercase">
          <Link href="/" className="hover:text-slate-950 transition-colors">
            Home
          </Link>
          <Link href="/#features" className="hover:text-slate-950 transition-colors">
            Platform
          </Link>
          <Link href="/#workflows" className="hover:text-slate-950 transition-colors">
            Workflows
          </Link>
          <Link href="/pricing" className="hover:text-slate-950 transition-colors">
            Pricing
          </Link>
          <Link href="/contact" className="hover:text-slate-950 transition-colors">
            Contact Us
          </Link>
          <Link href="/about" className="hover:text-slate-950 transition-colors">
            About
          </Link>
        </nav>

        {/* Desktop Action CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-orange-600 tracking-wider uppercase transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-orange-600 tracking-wider uppercase transition-colors border border-slate-300 rounded-lg bg-white hover:bg-slate-50"
          >
            Register
          </Link>
          {onOpenEnquiry ? (
            <button
              onClick={onOpenEnquiry}
              className="px-5 py-2.5 rounded-lg bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 group cursor-pointer"
            >
              <span>Enquire Now</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <Link
              href="/contact"
              className="px-5 py-2.5 rounded-lg bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 group"
            >
              <span>Enquire Now</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Navigation Dropdown */}
      {isMobileOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-6 space-y-4 shadow-lg animate-in slide-in-from-top-2">
          <nav className="flex flex-col gap-3 text-sm font-semibold uppercase tracking-wider text-slate-700">
            <Link href="/" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              Home
            </Link>
            <Link href="/#features" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              Platform Features
            </Link>
            <Link href="/#workflows" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              CA Workflows
            </Link>
            <Link href="/pricing" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              Pricing Plans
            </Link>
            <Link href="/contact" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              Contact Us
            </Link>
            <Link href="/about" onClick={() => setIsMobileOpen(false)} className="py-2 hover:text-orange-600">
              About TRUVCA
            </Link>
          </nav>

          <div className="pt-4 border-t border-slate-200 flex flex-col gap-3">
            <Link
              href="/login"
              onClick={() => setIsMobileOpen(false)}
              className="w-full text-center py-2.5 rounded-lg border border-slate-300 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white"
            >
              Sign In to Workspace
            </Link>
            <Link
              href="/register"
              onClick={() => setIsMobileOpen(false)}
              className="w-full text-center py-2.5 rounded-lg border border-orange-500 text-xs font-bold uppercase tracking-wider text-orange-700 bg-orange-50"
            >
              Register New Practice
            </Link>
            <button
              onClick={() => {
                setIsMobileOpen(false);
                if (onOpenEnquiry) onOpenEnquiry();
              }}
              className="w-full text-center py-2.5 rounded-lg bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
            >
              Enquire Now
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
