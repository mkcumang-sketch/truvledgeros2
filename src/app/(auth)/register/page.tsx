"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Mail } from "lucide-react";
import { TruvLogo } from "@/components/brand/truv-logo";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ivory p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E8ECE8] shadow-sm p-8 sm:p-10 space-y-6 text-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3">
          <TruvLogo size="lg" subtext="Chartered Accountant Practice System" href="/" />
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mt-2">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-graphite-900 tracking-tight">
            Registration Closed
          </h1>
          <p className="text-sm text-graphite-600 leading-relaxed max-w-sm">
            Public self-service registration is permanently disabled. Access to TRUV LedgerOS is strictly restricted to authorized practice firms and verified personnel.
          </p>
        </div>

        {/* Informational Card */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-left text-xs text-graphite-600 space-y-2">
          <div className="font-semibold text-graphite-800 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-graphite-500" />
            <span>Have an invitation?</span>
          </div>
          <p>
            If your organization has provisioned your account or sent you an invitation link, please check your inbox or contact your Firm Administrator.
          </p>
        </div>

        {/* Action Button */}
        <div>
          <Link href="/login" className="w-full block">
            <Button variant="primary" size="lg" className="w-full flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to Sign In
            </Button>
          </Link>
        </div>

        <p className="text-xs text-graphite-400">
          TRUV LedgerOS Enterprise Access Control &bull; Zero Trust Policy
        </p>
      </div>
    </div>
  );
}
