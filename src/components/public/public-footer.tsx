"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, Mail, ArrowUpRight } from "lucide-react";
import { TruvLogo } from "@/components/brand/truv-logo";

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          {/* Identity Column */}
          <div className="space-y-4 md:col-span-2">
            <TruvLogo size="md" theme="dark" href="/" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              Authoritative Practice Management and Workflow Automation Operating System
              engineered specifically for Indian Chartered Accountant firms, statutory audit teams, and tax practitioners.
            </p>
            <div className="text-xs text-orange-400 font-semibold tracking-wide">
              TRUVTECH Practice Technologies
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
              <Mail className="w-3.5 h-3.5 text-orange-400" />
              <span>Contact: onboarding@truvtech.com</span>
            </div>
          </div>

          {/* Platform Column */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Platform</h5>
            <ul className="text-xs space-y-2.5 text-slate-400">
              <li>
                <Link href="/#features" className="hover:text-white transition-colors">
                  Client 360° Records
                </Link>
              </li>
              <li>
                <Link href="/#workflows" className="hover:text-white transition-colors">
                  GST Compliance Matrix
                </Link>
              </li>
              <li>
                <Link href="/#workflows" className="hover:text-white transition-colors">
                  Two-Tier Review Hierarchy
                </Link>
              </li>
              <li>
                <Link href="/#workflows" className="hover:text-white transition-colors">
                  Categorized Document Vaults
                </Link>
              </li>
              <li>
                <Link href="/#workflows" className="hover:text-white transition-colors">
                  4-Stage Fee Recovery
                </Link>
              </li>
            </ul>
          </div>

          {/* Company & Legal */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Company & Legal</h5>
            <ul className="text-xs space-y-2.5 text-slate-400">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About TRUVCA
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Practice Pricing
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Firm Access */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Firm Workspace</h5>
            <ul className="text-xs space-y-2.5 text-slate-400">
              <li>
                <Link href="/login" className="text-orange-400 font-semibold hover:underline inline-flex items-center gap-1">
                  <span>Sign In to Workspace</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-white transition-colors">
                  Register Practice Firm
                </Link>
              </li>
              <li>
                <Link href="/accept-invite" className="hover:text-white transition-colors">
                  Accept Team Invitation
                </Link>
              </li>
              <li>
                <Link href="/forgot-password" className="hover:text-white transition-colors">
                  Reset Password
                </Link>
              </li>
              <li className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Zero-Leakage Tenant Boundary</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            &copy; {currentYear} TRUVTECH Practice Technologies. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span>Built for Indian Chartered Accountants</span>
            <span>Server-Authoritative Tenant Isolation</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
