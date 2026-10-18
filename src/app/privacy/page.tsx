import React from "react";
import type { Metadata } from "next";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — TRUVCA LedgerOS",
  description: "Official Privacy Policy and Data Protection Standards for TRUVCA LedgerOS and TRUVTECH Practice Technologies.",
};

export default function PrivacyPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PublicNavbar />

      <section className="py-16 md:py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold uppercase tracking-wider">
            Data Governance & Confidentiality
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Privacy Policy & Data Protection Standards
          </h1>
          <p className="text-xs text-slate-500">
            Last Updated: October 2026 • Effective for all TRUVCA LedgerOS practices
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-sm text-slate-700 leading-relaxed">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">1. Architectural Commitment to Confidentiality</h2>
            <p>
              TRUVTECH Practice Technologies (&ldquo;TRUVTECH&rdquo;, &ldquo;we&rdquo;, or &ldquo;our&rdquo;) operates TRUVCA LedgerOS
              as an enterprise software platform for Chartered Accountant partnerships and tax practitioners.
              We recognize that financial workpapers, PAN/TAN records, GST returns, and client communications represent
              strictly privileged, highly sensitive corporate information.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">2. Data Controller vs. Data Processor</h2>
            <p>
              In our multi-tenant architecture, the subscribing Chartered Accountant firm is the <strong>Data Controller</strong> of
              its client profiles, tax records, uploaded documents, and billing history. TRUVTECH acts strictly as the
              <strong> Data Processor</strong>, providing secure hosting, cryptographic tenant isolation, and deterministic workflow engines.
              We never access, sell, commercialize, or aggregate client practice records.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">3. Technical Security Invariants</h2>
            <p>
              We implement industry-standard cryptographic and operational safeguards:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li><strong>Server-Authoritative Tenant Boundary:</strong> Database operations enforce firm-level tenant isolation, strictly preventing cross-tenant data exposure.</li>
              <li><strong>Cryptographic Password Protection:</strong> Account passwords are salted and hashed using bcrypt; plain passwords are never stored or logged.</li>
              <li><strong>Transport Security (HSTS):</strong> Enforced Strict-Transport-Security (2-year preload, max-age 63072000), strict Content-Security-Policy (CSP), and HttpOnly SameSite session cookies.</li>
              <li><strong>Immutable Audit Logging:</strong> Security-critical operations including logins, role changes, financial entries, and task closures are permanently recorded in system audit logs.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">4. Practice Enquiry & Demo Submissions</h2>
            <p>
              Information submitted via our public enquiry and demo forms (such as contact name, email, phone number,
              and firm size) is used solely to coordinate your requested practice walkthrough and configure relevant tier quotes.
              You may request modification or deletion of your consultation enquiry by contacting our team.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">5. Contact & Privacy Inquiries</h2>
            <p>
              For data protection questions, compliance audits, or data processing agreements, please email:
            </p>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800">
              TRUVTECH Practice Technologies — Data Governance<br />
              Email: onboarding@truvtech.com
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

