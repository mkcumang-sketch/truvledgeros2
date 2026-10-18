"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Building2,
  Landmark,
  FileText,
  CreditCard,
  FolderDown,
  ListTodo,
  ShieldCheck,
  Lock,
  Users,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Send,
  AlertCircle,
  FileCheck,
  Clock,
  Check,
  Calendar,
  Layers,
  ArrowUpRight,
  Eye,
  FileSpreadsheet,
  HelpCircle,
} from "lucide-react";
import { CinematicHeroBackground } from "@/components/landing/cinematic-hero-background";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";
import { EnquiryModal } from "@/components/public/enquiry-modal";
import { submitEnquiryAction, type PracticeEnquiryInput } from "@/lib/server/actions/enquiry-actions";

export function LandingPage() {
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("All-In-One Practice Management");
  const [activePreviewTab, setActivePreviewTab] = useState<"dashboard" | "gst" | "tasks" | "invoices">("dashboard");
  const [signedOffRow, setSignedOffRow] = useState<string | null>(null);

  // Embedded Quick Consultation Form State
  const [quickForm, setQuickForm] = useState<PracticeEnquiryInput>({
    fullName: "",
    email: "",
    phone: "",
    firmName: "",
    role: "Managing Partner",
    practiceSize: "6-15",
    areasOfInterest: "All-In-One Practice Management",
    currentSoftware: "Excel / Spreadsheets",
    message: "",
    privacyConsent: false,
  });
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const [isSubmittingQuick, startQuickTransition] = useTransition();
  const [quickResult, setQuickResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleQuickChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setQuickForm((prev) => ({ ...prev, [name]: val }));
    if (quickErrors[name]) {
      setQuickErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickResult(null);
    setQuickErrors({});

    startQuickTransition(async () => {
      const res = await submitEnquiryAction(quickForm);
      if (res.success) {
        setQuickResult({ success: true, message: res.message });
        setQuickForm({
          fullName: "",
          email: "",
          phone: "",
          firmName: "",
          role: "Managing Partner",
          practiceSize: "6-15",
          areasOfInterest: "All-In-One Practice Management",
          currentSoftware: "Excel / Spreadsheets",
          message: "",
          privacyConsent: false,
        });
      } else {
        setQuickResult({ success: false, message: res.message });
        if (res.errors) {
          setQuickErrors(res.errors);
        }
      }
    });
  };

  const openEnquiryWithPlan = (plan: string) => {
    setSelectedPlan(plan);
    setIsEnquiryModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-orange-100 selection:text-orange-950">
      {/* 1. Global Public Navigation */}
      <PublicNavbar onOpenEnquiry={() => setIsEnquiryModalOpen(true)} />

      {/* =========================================================================
          2. CINEMATIC HERO OPENING (Light Enterprise Software Palette)
         ========================================================================= */}
      <section className="relative min-h-[88vh] flex items-center justify-center pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden bg-[#FAFBFC] border-b border-slate-200">
        <CinematicHeroBackground />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold tracking-wide uppercase shadow-xs mb-6">
            <span className="w-2 h-2 rounded-full bg-[#F26B38] animate-pulse" />
            <span className="font-bold text-orange-600">TRUVCA LEDGEROS</span>
            <span className="text-slate-300">•</span>
            <span>Chartered Accountant Practice Operating System</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.08] max-w-5xl mx-auto">
            Run Your CA Practice. <br />
            <span className="text-orange-600">Automate the Workflows</span> Behind It.
          </h1>

          {/* Supporting Text */}
          <p className="mt-6 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal">
            TRUVCA connects client management, compliance calendars, document collection, task ownership,
            preparation and review, filing progress, billing, and team operations in a unified working environment.
            Purpose-engineered for Indian Chartered Accountant firms managing recurring statutory obligations.
          </p>

          {/* Hero Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setIsEnquiryModalOpen(true)}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white font-bold text-sm uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-3 group cursor-pointer"
            >
              <span>Book a Demo</span>
              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#features"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Explore the Platform</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Multi-GSTIN State Matrix</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Two-Tier Partner Review</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Server Tenant Isolation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Audit-Ready Resolution Trails</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. PLATFORM OVERVIEW & LIVE PRACTICE SIMULATION (#features)
         ========================================================================= */}
      <section id="features" className="py-20 md:py-28 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>01</span>
              <span>•</span>
              <span>Operational Clarity</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              The Connected Practice Environment
            </h2>
            <p className="text-base text-slate-600 leading-relaxed">
              Consolidate multi-client filings, task ownership, workpapers, and billing into an authoritative
              management console built specifically for Indian Chartered Accountant firms.
            </p>
          </div>

          {/* Live Practice Console Window */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            {/* Topbar Frame */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="ml-2 text-xs font-semibold text-slate-600 hidden sm:inline">
                  TRUVCA LedgerOS — Firm Partner Console (Live Practice Simulation)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-orange-50 text-orange-600 font-semibold border border-orange-200">
                  TENANT ISOLATED SESSION
                </span>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Active Corporate Clients
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2">142</div>
                  <div className="text-[11px] text-teal-700 mt-1.5 font-bold flex items-center gap-1">
                    <span>94 Pvt Ltd • 48 LLP</span>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-teal-50/60 border border-teal-200">
                  <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                    GST Returns (Current Period)
                  </div>
                  <div className="text-3xl font-extrabold text-teal-700 mt-2">98.4%</div>
                  <div className="text-[11px] text-teal-800 mt-1.5 font-semibold">
                    128 Filed • 4 In Partner Review
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-orange-50/60 border border-orange-200">
                  <div className="text-xs font-semibold text-orange-800 uppercase tracking-wider">
                    Dual-Control Review Queue
                  </div>
                  <div className="text-3xl font-extrabold text-orange-600 mt-2">11</div>
                  <div className="text-[11px] text-orange-800 mt-1.5 font-semibold">
                    Requires Resolution Notes
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Unrecovered Practice Fees
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2">₹4.82 L</div>
                  <div className="text-[11px] text-slate-600 mt-1.5 font-semibold">
                    8 Invoices in Recovery Pipeline
                  </div>
                </div>
              </div>

              {/* Practice Filing Status Table */}
              <div className="rounded-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Client Legal Entity</th>
                      <th className="py-3.5 px-4">GSTIN (State)</th>
                      <th className="py-3.5 px-4">Period & Return</th>
                      <th className="py-3.5 px-4">Workflow Status</th>
                      <th className="py-3.5 px-4">ARN Verification</th>
                      <th className="py-3.5 px-4 text-right">Partner Sign-off</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">Apex Logistics Solutions Pvt Ltd</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">27AAACA9812K1Z4 (MH)</td>
                      <td className="py-3.5 px-4">Oct 2026 • GSTR-3B</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                          FILED & VERIFIED
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-teal-700 font-semibold">AA2710260019284</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-[10px] text-slate-600 bg-white px-2.5 py-1 border border-slate-200 rounded font-semibold">
                          CA Sharma • 14-Oct
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">Bharat Infra Projects LLP</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">07AABCB4321M1Z1 (DL)</td>
                      <td className="py-3.5 px-4">Oct 2026 • GSTR-1</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                          {signedOffRow === "bharat" ? "PARTNER SIGNED OFF" : "READY FOR REVIEW"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {signedOffRow === "bharat" ? "ARN Entry Enabled" : "Pending Sign-off"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {signedOffRow === "bharat" ? (
                          <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2.5 py-1 rounded border border-teal-200">
                            Approved ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => setSignedOffRow("bharat")}
                            className="text-[11px] bg-[#F26B38] hover:bg-[#D95524] text-white px-3 py-1 rounded font-semibold transition-all cursor-pointer shadow-2xs"
                          >
                            Sign-off Return
                          </button>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">Zenith FinTech Advisory Pvt Ltd</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">29AACCZ1092P1Z8 (KA)</td>
                      <td className="py-3.5 px-4">Oct 2026 • GSTR-3B</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                          CLIENT APPROVED
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">Ready for Portal Submission</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-[10px] text-slate-600 bg-white px-2.5 py-1 border border-slate-200 rounded font-semibold">
                          CA Verma • 15-Oct
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CONNECTED WORKFLOWS SEQUENCE (#workflows)
         ========================================================================= */}
      <section id="workflows" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>02</span>
              <span>•</span>
              <span>End-to-End CA Workflows</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              How the Complete Practice Workflow Connects
            </h2>
            <p className="text-base text-slate-600">
              TRUVCA does not treat features as isolated silos. Every stage feeds directly into the next:
              from client intake to filing evidence and fee collection.
            </p>
          </div>

          {/* 7 Connected Workflow Stages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Stage 1 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                01
              </div>
              <h3 className="text-lg font-bold text-slate-900">Client Intake & 360° Profile</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Capture corporate structures, PAN, TAN, directors, and multi-state GSTINs (Maharashtra, Delhi, Karnataka)
                under a single master company record.
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Master Client Dossier with Multi-State Profile
              </div>
            </div>

            {/* Stage 2 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                02
              </div>
              <h3 className="text-lg font-bold text-slate-900">Compliance Calendar & Deadlines</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automated detection of recurring obligations (GSTR-1, GSTR-3B, CMP-08, TDS returns) mapped to
                designated managers with statutory due dates.
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Practice-wide statutory deadline ledger
              </div>
            </div>

            {/* Stage 3 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                03
              </div>
              <h3 className="text-lg font-bold text-slate-900">Document Calls & Evidence Vault</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Generate secure client upload links for bank statements and invoices with 10MB limits,
                automated follow-ups, and verification tags.
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Categorized document vault per client
              </div>
            </div>

            {/* Stage 4 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                04
              </div>
              <h3 className="text-lg font-bold text-slate-900">Preparation & Two-Tier Review</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Article assistants prepare reconciliations. Closing a compliance task requires a mandatory
                5+ character resolution note and partner authorization.
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Dual-control sign-off trail
              </div>
            </div>

            {/* Stage 5 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                05
              </div>
              <h3 className="text-lg font-bold text-slate-900">Filing Status & ARN Lock</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Confirm government portal filing with exact Acknowledgement Reference Number (ARN) receipt,
                filing date, and partner signatory recorded.
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Statutory filing acknowledgement proof
              </div>
            </div>

            {/* Stage 6 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-orange-300 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-sm flex items-center justify-center border border-orange-200">
                06
              </div>
              <h3 className="text-lg font-bold text-slate-900">Invoicing & 4-Stage Recovery</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Issue GST-compliant tax invoices with HSN/SAC codes. Automated 4-stage reminder cadence
                (Gentle → Firm → Final Notice → Partner Escalation).
              </p>
              <div className="text-[11px] text-slate-500 font-semibold pt-1">
                Output: Reconciled collections & zero fee leakage
              </div>
            </div>
          </div>

          {/* Workflow Continuity Banner */}
          <div className="mt-8 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Disciplined Accountability at Every Step</h4>
                <p className="text-xs text-slate-600">
                  Every transition generates immutable audit logs, ensuring compliance files withstand external peer reviews.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsEnquiryModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>See Workflow in Action</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. PLATFORM SHOWCASE WITH GENUINE APPLICATION SCREENSHOTS
         ========================================================================= */}
      <section className="py-20 md:py-28 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>03</span>
              <span>•</span>
              <span>Verified Application UI</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Real Product Interfaces. No Invented Dashboards.
            </h2>
            <p className="text-base text-slate-600">
              Inspect the genuine user interface of TRUVCA LedgerOS across core operational screens.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <button
              onClick={() => setActivePreviewTab("dashboard")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activePreviewTab === "dashboard"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Partner Dashboard
            </button>
            <button
              onClick={() => setActivePreviewTab("gst")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activePreviewTab === "gst"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Multi-State GST Matrix
            </button>
            <button
              onClick={() => setActivePreviewTab("tasks")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activePreviewTab === "tasks"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Two-Tier Tasks & Reviews
            </button>
            <button
              onClick={() => setActivePreviewTab("invoices")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activePreviewTab === "invoices"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Invoicing & Recovery
            </button>
          </div>

          {/* Screenshot Container */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-6 shadow-xl max-w-5xl mx-auto">
            {activePreviewTab === "dashboard" && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Practice Overview & Metrics Dashboard</h4>
                    <p className="text-slate-500">Firm-wide compliance status, active clients, and unrecovered billings</p>
                  </div>
                  <span className="font-mono text-orange-600 bg-orange-50 px-3 py-1 rounded border border-orange-200 font-semibold">
                    Live Runtime Capture
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] w-full bg-white">
                  <Image
                    src="/screenshots/landing_page_desktop.png"
                    alt="TRUVCA LedgerOS Partner Dashboard Screenshot"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>
            )}

            {activePreviewTab === "gst" && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Multi-State GST Compliance Matrix</h4>
                    <p className="text-slate-500">State-by-state return statuses, client approvals, and ARN entries</p>
                  </div>
                  <span className="font-mono text-teal-700 bg-teal-50 px-3 py-1 rounded border border-teal-200 font-semibold">
                    Verified Queue
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] w-full bg-white">
                  <Image
                    src="/screenshots/landing_desktop_1440.png"
                    alt="TRUVCA LedgerOS GST Filing Matrix Screenshot"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>
            )}

            {activePreviewTab === "tasks" && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Two-Tier Quality Review & Approvals</h4>
                    <p className="text-slate-500">Mandatory resolution notes enforced before statutory compliance task closure</p>
                  </div>
                  <span className="font-mono text-orange-600 bg-orange-50 px-3 py-1 rounded border border-orange-200 font-semibold">
                    Dual Control Active
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] w-full bg-white">
                  <Image
                    src="/screenshots/landing_tablet_768.png"
                    alt="TRUVCA LedgerOS Task Review Interface"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>
            )}

            {activePreviewTab === "invoices" && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Invoicing & 4-Stage Recovery Pipeline</h4>
                    <p className="text-slate-500">GST tax invoices, immutable payment audit records, and automated reminder cadence</p>
                  </div>
                  <span className="font-mono text-orange-600 bg-orange-50 px-3 py-1 rounded border border-orange-200 font-semibold">
                    Zero Leakage
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] w-full bg-white">
                  <Image
                    src="/screenshots/demo_form_filled.png"
                    alt="TRUVCA LedgerOS Invoicing Interface"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. PRICING OVERVIEW SECTION (Linking to /pricing)
         ========================================================================= */}
      <section className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>04</span>
              <span>•</span>
              <span>Practice Investment</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Predictable, Transparent Practice Pricing
            </h2>
            <p className="text-base text-slate-600">
              Pricing tailored to the size and compliance volume of your firm. No hidden fees or inflated user seat charges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Core Practice */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Core Practice
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900">Boutique & Sole Firms</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Engineered for independent practitioners and boutique firms with 1 to 5 members seeking complete filing control.
                </p>
                <div className="pt-2 text-2xl font-bold text-slate-900">
                  Custom Quote
                  <span className="text-xs font-normal text-slate-500 block">Based on active entity volume</span>
                </div>
                <ul className="text-xs space-y-2.5 text-slate-700 pt-2 border-t border-slate-100">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Up to 5 Team Licenses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Multi-GSTIN Matrix Tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Dual-Control Review Workflow</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Standard Email Support</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => openEnquiryWithPlan("Core Practice Tier (1-5 Users)")}
                className="w-full py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Request Core Quote
              </button>
            </div>

            {/* Multi-Partner */}
            <div className="p-8 rounded-2xl bg-white border-2 border-orange-600 shadow-md flex flex-col justify-between space-y-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Most Popular for CA Firms
              </div>
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  Multi-Partner Practice
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900">Established Partnerships</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For mid-sized firms of 6 to 25 members requiring departmental delegation across Tax, GST, and Audit wings.
                </p>
                <div className="pt-2 text-2xl font-bold text-slate-900">
                  Consultation Quote
                  <span className="text-xs font-normal text-slate-500 block">Includes custom team onboarding</span>
                </div>
                <ul className="text-xs space-y-2.5 text-slate-700 pt-2 border-t border-slate-100">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>6 to 25 Team Licenses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Multi-Branch Client Dossiers</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>4-Stage Automated Fee Recovery</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Priority Support & SLA</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => openEnquiryWithPlan("Multi-Partner Practice Tier (6-25 Users)")}
                className="w-full py-3 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer text-center"
              >
                Request Multi-Partner Quote
              </button>
            </div>

            {/* Enterprise Network */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Enterprise Network
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900">Multi-City Practices</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For large audit networks and multi-location firms with 25+ members needing dedicated infrastructure.
                </p>
                <div className="pt-2 text-2xl font-bold text-slate-900">
                  Enterprise Contract
                  <span className="text-xs font-normal text-slate-500 block">Dedicated account manager</span>
                </div>
                <ul className="text-xs space-y-2.5 text-slate-700 pt-2 border-t border-slate-100">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Unlimited Firm Licenses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Multi-Tenant Branch Isolation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Custom Migration Assistance</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>Dedicated Technical Partner</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => openEnquiryWithPlan("Enterprise Network Tier (25+ Users)")}
                className="w-full py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Contact Enterprise Sales
              </button>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 hover:text-orange-800 uppercase tracking-wider"
            >
              <span>View Full Practice Pricing & Feature Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. SECURITY & TENANT GOVERNANCE (#security)
         ========================================================================= */}
      <section id="security" className="py-20 md:py-28 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>05</span>
              <span>•</span>
              <span>Data Governance & Isolation</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Verified Enterprise Protections
            </h2>
            <p className="text-base text-slate-600">
              We protect client confidentiality and proprietary firm records with verified,
              cryptographic architecture and strict server-authoritative tenant isolation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Tenant Boundary Isolation</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every query enforces tenant filtering at the database layer. No cross-firm data exposure is possible.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Granular RBAC Hierarchy</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tiered permission boundaries for Partners, Managers, Executives, and Clients with zero privilege escalation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Immutable Audit Trails</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Security-critical operations — logins, financial modifications, and permission shifts — are permanently logged.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
                <FileCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">HSTS & Session Security</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Enforced Strict-Transport-Security (2-year preload), strict CSP, and HttpOnly session cookies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. MANAGING PARTNER FAQ (#faq)
         ========================================================================= */}
      <section id="faq" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>06</span>
              <span>•</span>
              <span>Managing Partner Questions</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs">
              <h4 className="font-bold text-base text-slate-900 mb-2">
                How does TRUVCA LedgerOS handle multi-state GSTINs for a single client?
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Each client record supports multiple GSTIN registrations mapped to specific Indian states.
                Filing status, ARN tracking, and return types (GSTR-1, GSTR-3B) are managed individually per GSTIN,
                while rolling up to the client&apos;s master compliance scorecard.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs">
              <h4 className="font-bold text-base text-slate-900 mb-2">
                Can article assistants close compliance tasks without partner approval?
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                No. High-stakes tasks in GST and Audit workflows require resolution notes and transition into
                the &ldquo;Under Review&rdquo; status. The task cannot be marked completed until a Partner or Firm Owner
                conducts the final review sign-off.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs">
              <h4 className="font-bold text-base text-slate-900 mb-2">
                Can our firm import our existing client database from Excel or CSV?
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Yes. TRUVCA LedgerOS includes a dedicated bulk client importer that parses client names,
                business names, PAN, GSTINs, and contact information with automated format validation.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs">
              <h4 className="font-bold text-base text-slate-900 mb-2">
                How does the automated payment recovery pipeline protect client relationships?
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Reminders are staged across 4 distinct levels. Stage 1 is polite and advisory.
                Subsequent stages escalate gradually, and Stage 4 alerts the managing partner directly before any
                abrupt outreach occurs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          9. EMBEDDED PRACTICE CONSULTATION FORM (#enquire)
         ========================================================================= */}
      <section id="enquire" className="py-20 md:py-28 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-widest">
              <span>07</span>
              <span>•</span>
              <span>Schedule Walkthrough</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Consult with Our Practice Specialists
            </h2>
            <p className="text-base text-slate-600">
              Schedule a 25-minute practice walkthrough to discuss your firm&apos;s compliance volume and workflow automation.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6 sm:p-10 shadow-lg">
            {quickResult?.success ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-14 h-14 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-200">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900">Enquiry Confirmed</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  {quickResult.message}
                </p>
              </div>
            ) : (
              <form onSubmit={handleQuickSubmit} className="space-y-5 text-left">
                {quickResult?.success === false && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{quickResult.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Full Name / Managing Partner *
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={quickForm.fullName}
                      onChange={handleQuickChange}
                      placeholder="e.g., CA Rajesh Sharma"
                      required
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                        quickErrors.fullName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                      } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                    />
                    {quickErrors.fullName && (
                      <p className="text-[11px] text-rose-600 mt-1">{quickErrors.fullName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Official Work Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={quickForm.email}
                      onChange={handleQuickChange}
                      placeholder="rajesh@sharmaca.in"
                      required
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                        quickErrors.email ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                      } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                    />
                    {quickErrors.email && (
                      <p className="text-[11px] text-rose-600 mt-1">{quickErrors.email}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile Number (India) *
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={quickForm.phone}
                      onChange={handleQuickChange}
                      placeholder="9876543210"
                      required
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                        quickErrors.phone ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                      } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                    />
                    {quickErrors.phone && (
                      <p className="text-[11px] text-rose-600 mt-1">{quickErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      CA Firm / Practice Name *
                    </label>
                    <input
                      type="text"
                      name="firmName"
                      value={quickForm.firmName}
                      onChange={handleQuickChange}
                      placeholder="Sharma & Associates CA"
                      required
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                        quickErrors.firmName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                      } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                    />
                    {quickErrors.firmName && (
                      <p className="text-[11px] text-rose-600 mt-1">{quickErrors.firmName}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Firm Size (Partners + Staff) *
                    </label>
                    <select
                      name="practiceSize"
                      value={quickForm.practiceSize}
                      onChange={handleQuickChange}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]"
                    >
                      <option value="1-5">1 - 5 Members (Core)</option>
                      <option value="6-15">6 - 15 Members (Multi-Partner)</option>
                      <option value="16-50">16 - 50 Members (Established)</option>
                      <option value="50+">50+ Members (Enterprise Network)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Primary Area of Interest
                    </label>
                    <select
                      name="areasOfInterest"
                      value={quickForm.areasOfInterest}
                      onChange={handleQuickChange}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]"
                    >
                      <option value="All-In-One Practice Management">All-In-One Practice Management</option>
                      <option value="GST & Statutory Compliance Matrix">GST & Compliance Matrix</option>
                      <option value="Statutory Audit & Tax Filing">Statutory Audit & Tax Filing</option>
                      <option value="Client Invoicing & Fee Recovery">Client Invoicing & Fee Recovery</option>
                      <option value="Document Vault & Client Links">Document Vault & Client Links</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Workflow Requirements / Practice Notes *
                  </label>
                  <textarea
                    name="message"
                    value={quickForm.message}
                    onChange={handleQuickChange}
                    rows={2}
                    placeholder="Briefly describe your firm's current client volume or workflow bottlenecks..."
                    required
                    className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                      quickErrors.message ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                    } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                  />
                  {quickErrors.message && (
                    <p className="text-[11px] text-rose-600 mt-1">{quickErrors.message}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
                    <input
                      type="checkbox"
                      name="privacyConsent"
                      checked={quickForm.privacyConsent}
                      onChange={handleQuickChange}
                      className="mt-0.5 rounded-sm border-slate-300 text-orange-600 focus:ring-[#F26B38]"
                    />
                    <span>
                      I consent to TRUVTECH Practice Technologies processing my details under the{" "}
                      <Link href="/privacy" className="text-orange-600 underline font-semibold">
                        Privacy Policy
                      </Link>.
                    </span>
                  </label>
                  {quickErrors.privacyConsent && (
                    <p className="text-[11px] text-rose-600 mt-1">{quickErrors.privacyConsent}</p>
                  )}
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isSubmittingQuick}
                    className="w-full py-3.5 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingQuick ? (
                      <span>Recording Practice Consultation...</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Schedule Practice Walkthrough</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 10. Global Footer */}
      <PublicFooter />

      {/* 11. Modal Form */}
      <EnquiryModal
        isOpen={isEnquiryModalOpen}
        onClose={() => setIsEnquiryModalOpen(false)}
        defaultPlan={selectedPlan}
      />
    </div>
  );
}

