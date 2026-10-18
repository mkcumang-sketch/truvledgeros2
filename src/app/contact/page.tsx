"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Phone, MapPin, Send, CheckCircle2, AlertCircle, Building2, ShieldCheck } from "lucide-react";
import { PublicNavbar } from "@/components/public/public-navbar";
import { PublicFooter } from "@/components/public/public-footer";
import { submitEnquiryAction, type PracticeEnquiryInput } from "@/lib/server/actions/enquiry-actions";

export default function ContactPage() {
  const [formData, setFormData] = useState<PracticeEnquiryInput>({
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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);
    setFormErrors({});

    startTransition(async () => {
      const res = await submitEnquiryAction(formData);
      if (res.success) {
        setSubmitResult({ success: true, message: res.message });
        setFormData({
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
        setSubmitResult({ success: false, message: res.message });
        if (res.errors) {
          setFormErrors(res.errors);
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PublicNavbar />

      <section className="py-16 md:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
            Practice Consultation & Inquiries
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Connect with Our CA Practice Specialists
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
            Schedule a personalized practice consultation, discuss custom onboarding terms,
            or speak with our enterprise deployment team.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Contact Details Column */}
            <div className="lg:col-span-5 space-y-8">
              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-slate-900">Direct Practice Channels</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Our practice onboarding team is available Monday through Saturday to review compliance calendars,
                  GST matrices, and team migration plans.
                </p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Practice Onboarding & Inquiries</div>
                    <a href="mailto:onboarding@truvtech.com" className="text-blue-700 font-semibold hover:underline mt-0.5 block">
                      onboarding@truvtech.com
                    </a>
                    <div className="text-xs text-slate-500 mt-1">Typical response time: within 1 business day</div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Security & Isolation Verification</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      For firm data protection audits and tenant isolation architecture reviews.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Column */}
            <div className="lg:col-span-7">
              <div className="p-8 sm:p-10 rounded-2xl bg-slate-50 border border-slate-200 shadow-lg">
                {submitResult?.success ? (
                  <div className="text-center py-10 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-200">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-900">Enquiry Successfully Logged</h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                      {submitResult.message}
                    </p>
                    <div className="pt-4">
                      <button
                        onClick={() => setSubmitResult(null)}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all cursor-pointer"
                      >
                        Submit Another Enquiry
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    <div className="border-b border-slate-200 pb-4 mb-2">
                      <h4 className="text-lg font-bold text-slate-900">Practice Consultation Form</h4>
                      <p className="text-xs text-slate-500">All fields marked with an asterisk (*) are required.</p>
                    </div>

                    {submitResult?.success === false && (
                      <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{submitResult.message}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name / Managing Partner *
                      </label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="e.g., CA Rajesh Sharma"
                        required
                        className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                          formErrors.fullName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                        } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                      />
                      {formErrors.fullName && (
                        <p className="text-[11px] text-rose-600 mt-1">{formErrors.fullName}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Official Work Email *
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          placeholder="rajesh@sharmaca.in"
                          required
                          className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                            formErrors.email ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                          } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                        />
                        {formErrors.email && (
                          <p className="text-[11px] text-rose-600 mt-1">{formErrors.email}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Mobile Number (India) *
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="9876543210"
                          required
                          className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                            formErrors.phone ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                          } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                        />
                        {formErrors.phone && (
                          <p className="text-[11px] text-rose-600 mt-1">{formErrors.phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          CA Firm / Organization Name *
                        </label>
                        <input
                          type="text"
                          name="firmName"
                          value={formData.firmName}
                          onChange={handleInputChange}
                          placeholder="Sharma & Associates CA"
                          required
                          className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                            formErrors.firmName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                          } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                        />
                        {formErrors.firmName && (
                          <p className="text-[11px] text-rose-600 mt-1">{formErrors.firmName}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Role / Designation *
                        </label>
                        <select
                          name="role"
                          value={formData.role}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="Managing Partner">Managing Partner / Senior Partner</option>
                          <option value="Partner">Partner (GST / Tax / Audit)</option>
                          <option value="Audit Manager">Audit & Compliance Manager</option>
                          <option value="Practice Administrator">Practice Operations / Administrator</option>
                          <option value="Independent Practitioner">Sole Proprietor / Practitioner</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Firm Size (Partners + Staff) *
                        </label>
                        <select
                          name="practiceSize"
                          value={formData.practiceSize}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="1-5">1 - 5 Members (Core)</option>
                          <option value="6-15">6 - 15 Members (Multi-Partner)</option>
                          <option value="16-50">16 - 50 Members (Established)</option>
                          <option value="50+">50+ Members (Enterprise Network)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Current Practice Tool
                        </label>
                        <select
                          name="currentSoftware"
                          value={formData.currentSoftware}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="Excel / Spreadsheets">Excel / Google Sheets</option>
                          <option value="Computax / Taxmann">Computax / Taxmann</option>
                          <option value="Genius / KDK">Genius / KDK Software</option>
                          <option value="Zoho Practice / Books">Zoho Practice / Books</option>
                          <option value="Generic Project Tools">Trello / Asana / ClickUp</option>
                          <option value="None / Manual Registers">None / Paper Registers</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Primary Area of Interest *
                      </label>
                      <select
                        name="areasOfInterest"
                        value={formData.areasOfInterest}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="All-In-One Practice Management">All-In-One Practice Management</option>
                        <option value="GST & Compliance Matrix Automation">GST & Compliance Matrix Automation</option>
                        <option value="Two-Tier Review & Workpapers">Two-Tier Review & Workpapers</option>
                        <option value="Client Invoicing & Fee Recovery">Client Invoicing & Fee Recovery</option>
                        <option value="Categorized Document Vaults">Categorized Document Vaults</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Workflow Requirements / Practice Notes *
                      </label>
                      <textarea
                        name="message"
                        value={formData.message}
                        onChange={handleInputChange}
                        rows={3}
                        placeholder="Please describe your current compliance bottlenecks, multi-branch filings, or team migration questions..."
                        required
                        className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                          formErrors.message ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                        } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                      />
                      {formErrors.message && (
                        <p className="text-[11px] text-rose-600 mt-1">{formErrors.message}</p>
                      )}
                    </div>

                    <div className="pt-1">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
                        <input
                          type="checkbox"
                          name="privacyConsent"
                          checked={formData.privacyConsent}
                          onChange={handleInputChange}
                          className="mt-0.5 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          I consent to TRUVTECH Practice Technologies processing my details under the{" "}
                          <Link href="/privacy" className="text-blue-700 underline font-semibold">
                            Privacy Policy
                          </Link>.
                        </span>
                      </label>
                      {formErrors.privacyConsent && (
                        <p className="text-[11px] text-rose-600 mt-1">{formErrors.privacyConsent}</p>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {isPending ? (
                          <span>Verifying & Recording Consultation...</span>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Confirm Practice Consultation</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
