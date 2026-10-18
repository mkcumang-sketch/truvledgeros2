import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Sparkles, Building2, ShieldCheck, Scale, Cpu, Users, ArrowRight } from "lucide-react";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata: Metadata = {
  title: "About TRUVCA LedgerOS — Built for Indian Chartered Accountants",
  description:
    "Learn about TRUVCA LedgerOS, the practice operating system engineered by TRUVTECH Practice Technologies for Indian Chartered Accountant partnerships.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PublicNavbar />

      {/* Header */}
      <section className="py-16 md:py-24 bg-slate-50 border-b border-slate-200 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold uppercase tracking-wider">
            Practice Technology Engineering
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Engineered for the Realities of Indian CA Firms
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            TRUVCA LedgerOS was created by TRUVTECH Practice Technologies to replace fragmented tools,
            manual spreadsheets, and disconnected messaging with an authoritative practice operating system.
          </p>
        </div>
      </section>

      {/* Core Mission & Background */}
      <section className="py-16 md:py-24 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 leading-relaxed text-slate-700 text-sm sm:text-base">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Why Generic SaaS Tools Fail Accounting Practices
            </h2>
            <p>
              Chartered Accountancy in India operates under high-stakes statutory compliance. A missed deadline
              on GSTR-3B, an unverified input tax credit claim, or an unrecorded resolution note during a tax audit
              is not a cosmetic error—it leads to statutory interest, penalties, and professional liability.
            </p>
            <p>
              Standard CRM platforms and generic task trackers lack fundamental concepts required by CA firms:
              multi-state GSTIN state matrices, two-tier dual-control review hierarchies (preparer vs. signing partner),
              government Acknowledgement Reference Number (ARN) receipt locks, and staged payment recovery pipelines.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center border border-orange-200">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Dual-Control Governance</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Article assistants prepare workpapers, while partners retain statutory sign-off authority.
                Enforces mandatory resolution notes of 5+ characters to ensure no filing is closed without written evidence.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Sovereign Tenant Isolation</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Client confidentiality is non-negotiable. Every database query enforces strict tenant filtering,
                ensuring complete physical separation between competing practice accounts.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              About TRUVTECH Practice Technologies
            </h2>
            <p>
              TRUVTECH develops software infrastructure for professional service firms. We build deterministic
              software where calculations are exact, audit histories are immutable, and system boundaries fail closed.
            </p>
            <p className="text-xs text-slate-500">
              For direct partnership inquiries, technical evaluations, or security audits, contact us at{" "}
              <a href="mailto:onboarding@truvtech.com" className="text-orange-600 font-bold hover:underline">
                onboarding@truvtech.com
              </a>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-slate-50 text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <h3 className="text-2xl font-extrabold text-slate-900">Ready to Modernize Your Firm?</h3>
          <p className="text-sm text-slate-600">
            Schedule a 25-minute practice consultation with our specialists.
          </p>
          <div className="pt-2">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
            >
              <span>Schedule Consultation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

