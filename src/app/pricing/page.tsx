"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, ShieldCheck, HelpCircle, Building2, Users } from "lucide-react";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";
import { EnquiryModal } from "@/components/public/enquiry-modal";

export default function PricingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("Multi-Partner Practice Tier (6-25 Users)");

  const handleOpenPlan = (plan: string) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PublicNavbar onOpenEnquiry={() => setIsModalOpen(true)} />

      {/* Header */}
      <section className="py-16 md:py-24 bg-slate-50 border-b border-slate-200 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold uppercase tracking-wider">
            Practice Pricing Architecture
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Consultation-Based Pricing for Professional CA Firms
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Every Chartered Accountant firm handles a unique mix of GST registrations, audit cycles,
            and article assistant team members. We configure pricing based on your operational scale.
          </p>
        </div>
      </section>

      {/* Pricing Factors Explanation */}
      <section className="py-12 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center sm:text-left">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-sm">1. Team Capacity</div>
              <p className="text-xs text-slate-600">
                Number of partners, audit managers, and article assistants requiring concurrent workspace access.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-sm">2. Compliance Volume</div>
              <p className="text-xs text-slate-600">
                Total active corporate clients, LLPs, and multi-state GSTIN matrices managed under your firm.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-sm">3. Storage & Vaults</div>
              <p className="text-xs text-slate-600">
                Dedicated encrypted document vault storage requirements for client tax records and audit workpapers.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-sm">4. Migration & SLA</div>
              <p className="text-xs text-slate-600">
                Custom historical data migration from spreadsheets, dedicated onboarding training, and priority SLA.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Pricing Tiers */}
      <section className="py-16 md:py-24 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Core Practice */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Core Practice Tier
                </span>
                <h3 className="text-2xl font-extrabold text-slate-900">Sole & Boutique Practices</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For independent practitioners and boutique firms with up to 5 members seeking centralized client compliance tracking.
                </p>
                <div className="pt-2 text-3xl font-extrabold text-slate-900">
                  Request Quote
                  <span className="text-xs font-normal text-slate-500 block mt-1">Configured for 1 - 5 team licenses</span>
                </div>
                <ul className="text-xs space-y-3 text-slate-700 pt-4 border-t border-slate-100">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Up to 5 User Accounts (Partners + Staff)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Multi-State GSTIN Matrix Tracking</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Dual-Control Task Review Workflow</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Client Document Vaults with Request Links</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>GST-Compliant Tax Invoicing</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleOpenPlan("Core Practice Tier (1-5 Users)")}
                className="w-full py-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Request Core Quote
              </button>
            </div>

            {/* Multi-Partner */}
            <div className="p-8 rounded-2xl bg-white border-2 border-orange-600 shadow-md flex flex-col justify-between space-y-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Recommended for CA Firms
              </div>
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  Multi-Partner Practice Tier
                </span>
                <h3 className="text-2xl font-extrabold text-slate-900">Established Partnerships</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For mid-sized firms with 6 to 25 members managing departmental delegation across Tax, GST, and Audit wings.
                </p>
                <div className="pt-2 text-3xl font-extrabold text-slate-900">
                  Consultation Quote
                  <span className="text-xs font-normal text-slate-500 block mt-1">Configured for 6 - 25 team licenses</span>
                </div>
                <ul className="text-xs space-y-3 text-slate-700 pt-4 border-t border-slate-100">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>6 to 25 User Accounts (RBAC Hierarchy)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Multi-Branch Master Client Dossiers</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Automated 4-Stage Payment Recovery</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Mandatory Workpaper Resolution Sign-offs</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Priority Support & Assisted Team Onboarding</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleOpenPlan("Multi-Partner Practice Tier (6-25 Users)")}
                className="w-full py-3.5 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer text-center"
              >
                Request Multi-Partner Quote
              </button>
            </div>

            {/* Enterprise Network */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Enterprise Network Tier
                </span>
                <h3 className="text-2xl font-extrabold text-slate-900">Large & Multi-City Firms</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For large audit partnerships and multi-location practices with 25+ members needing custom deployment terms.
                </p>
                <div className="pt-2 text-3xl font-extrabold text-slate-900">
                  Enterprise Contract
                  <span className="text-xs font-normal text-slate-500 block mt-1">Dedicated capacity & infrastructure</span>
                </div>
                <ul className="text-xs space-y-3 text-slate-700 pt-4 border-t border-slate-100">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Unlimited User Licenses across Branch Offices</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Full Server-Authoritative Tenant Isolation</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Assisted Bulk Database Migration</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Custom Retainer & Invoicing Terms</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Dedicated Technical Account Manager</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleOpenPlan("Enterprise Network Tier (25+ Users)")}
                className="w-full py-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Contact Enterprise Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Matrix */}
      <section className="py-16 md:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-slate-900">Detailed Feature Comparison</h3>
            <p className="text-xs text-slate-600">Entitlements verified in TRUVCA LedgerOS</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Capability</th>
                  <th className="py-3 px-4 text-center">Core</th>
                  <th className="py-3 px-4 text-center text-orange-600">Multi-Partner</th>
                  <th className="py-3 px-4 text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Master Corporate Dossiers</td>
                  <td className="py-3 px-4 text-center">Included</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Included</td>
                  <td className="py-3 px-4 text-center font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Multi-State GSTIN Matrix</td>
                  <td className="py-3 px-4 text-center">Included</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Included</td>
                  <td className="py-3 px-4 text-center font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Two-Tier Dual-Control Review</td>
                  <td className="py-3 px-4 text-center">Included</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Included</td>
                  <td className="py-3 px-4 text-center font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Client Document Request Links</td>
                  <td className="py-3 px-4 text-center">Included</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Included</td>
                  <td className="py-3 px-4 text-center font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">4-Stage Automated Payment Recovery</td>
                  <td className="py-3 px-4 text-center text-slate-400">Manual</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Automated</td>
                  <td className="py-3 px-4 text-center font-bold">Custom Cadence</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Cryptographic Tenant Isolation</td>
                  <td className="py-3 px-4 text-center">Included</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Included</td>
                  <td className="py-3 px-4 text-center font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">Dedicated Account Manager</td>
                  <td className="py-3 px-4 text-center text-slate-400">—</td>
                  <td className="py-3 px-4 text-center text-slate-400">—</td>
                  <td className="py-3 px-4 text-center font-bold text-teal-700">Included</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <PublicFooter />

      <EnquiryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultPlan={selectedPlan}
      />
    </div>
  );
}

