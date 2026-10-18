import React from "react";
import type { Metadata } from "next";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata: Metadata = {
  title: "Terms of Service — TRUVCA LedgerOS",
  description: "Official Terms of Service and Practice Licensing Agreement for TRUVCA LedgerOS.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PublicNavbar />

      <section className="py-16 md:py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
            Practice Agreement
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Terms of Service & Licensing Agreement
          </h1>
          <p className="text-xs text-slate-500">
            Last Updated: October 2026 • Effective for all active TRUVCA LedgerOS firm accounts
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-sm text-slate-700 leading-relaxed">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By accessing, registering an account, or subscribing to TRUVCA LedgerOS (&ldquo;the Platform&rdquo;),
              provided by TRUVTECH Practice Technologies (&ldquo;TRUVTECH&rdquo;), the subscribing Chartered Accountant firm,
              partnership, or sole practitioner agrees to be bound by these Terms of Service.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">2. Professional Responsibility Disclaimer</h2>
            <p>
              TRUVCA LedgerOS is an administrative, organizational, and workflow automation operating system.
              The Platform provides deadline calendars, document vaults, task queues, and filing status tracking.
              <strong> The practicing Chartered Accountant or firm partner remains solely responsible for the legal accuracy,
              statutory interpretation, audit opinion, and government portal filings (including GSTN, Income Tax Department, and MCA)
              executed on behalf of their clients.</strong> TRUVCA LedgerOS does not provide formal legal, auditing, or tax advice.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">3. Practice Tenant Ownership & Security</h2>
            <p>
              Upon firm registration, the founding partner is provisioned as the <strong>Firm Owner</strong>. The firm owner
              is responsible for configuring user roles (Partners, Managers, Article Clerks) and revoking access for departing
              team members. Our architecture enforces strict tenant isolation; account credentials must never be shared across
              multiple concurrent individuals.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">4. Service Availability & Scheduled Updates</h2>
            <p>
              TRUVTECH endeavors to provide high continuous availability. Routine system updates, database index optimizations,
              and security patches are scheduled outside of critical statutory filing windows (such as GST 20th due dates or
              Tax Audit deadlines) whenever practically possible, with advance notifications to managing partners.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">5. Practice Inquiries & Support</h2>
            <p>
              For legal agreements, master service contracts, or technical inquiries regarding these terms:
            </p>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800">
              TRUVTECH Practice Technologies — Legal & Compliance<br />
              Email: onboarding@truvtech.com
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
