"use client";

import React, { useState, useTransition } from "react";
import { X, Send, CheckCircle2, AlertCircle, Building2, ShieldCheck } from "lucide-react";
import { submitEnquiryAction, type PracticeEnquiryInput } from "@/lib/server/actions/enquiry-actions";

interface EnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlan?: string;
}

export function EnquiryModal({ isOpen, onClose, defaultPlan }: EnquiryModalProps) {
  const [formData, setFormData] = useState<PracticeEnquiryInput>({
    fullName: "",
    email: "",
    phone: "",
    firmName: "",
    role: "Managing Partner",
    practiceSize: "6-15",
    areasOfInterest: defaultPlan || "All-In-One Practice Management",
    currentSoftware: "Excel / Spreadsheets",
    message: defaultPlan ? `Enquiry regarding ${defaultPlan} tier for our practice.` : "",
    privacyConsent: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close practice consultation modal"
        >
          <X className="w-5 h-5" />
        </button>

        {submitResult?.success ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Consultation Enquiry Received
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              {submitResult.message}
            </p>
            <div className="pt-4">
              <button
                onClick={() => {
                  setSubmitResult(null);
                  onClose();
                }}
                className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6 space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                <span>Enterprise Practice Consultation</span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Schedule Practice Walkthrough
              </h3>
              <p className="text-xs text-slate-500">
                Discuss your firm&apos;s compliance volume, workflow hierarchy, and multi-client requirements.
              </p>
            </div>

            {submitResult?.success === false && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{submitResult.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {/* Full Name */}
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

              {/* Email & Phone */}
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

              {/* Firm Name & Role */}
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

              {/* Team Size & Current Software */}
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

              {/* Area of Interest */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Interest / Plan *
                </label>
                <select
                  name="areasOfInterest"
                  value={formData.areasOfInterest}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                >
                  <option value="All-In-One Practice Management">All-In-One Practice Management</option>
                  <option value="Core Practice Tier (1-5 Users)">Core Practice Tier (1-5 Users)</option>
                  <option value="Multi-Partner Practice Tier (6-25 Users)">Multi-Partner Practice Tier (6-25 Users)</option>
                  <option value="Enterprise Network Tier (25+ Users)">Enterprise Network Tier (25+ Users)</option>
                  <option value="GST & Compliance Automation">GST & Compliance Matrix Automation</option>
                  <option value="Client Invoicing & Fee Recovery">Client Invoicing & Fee Recovery</option>
                  <option value="Two-Tier Review & Workpapers">Two-Tier Review & Audit Workpapers</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Workflow Requirements / Practice Notes *
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  rows={2}
                  placeholder="Describe your current client volume, multi-branch filings, or bottlenecks..."
                  required
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white ${
                    formErrors.message ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-blue-600`}
                />
                {formErrors.message && (
                  <p className="text-[11px] text-rose-600 mt-1">{formErrors.message}</p>
                )}
              </div>

              {/* Privacy Consent */}
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
                    I consent to TRUVTECH Practice Technologies processing my details in accordance with the{" "}
                    <a href="/privacy" target="_blank" className="text-blue-700 underline font-semibold">
                      Privacy Policy
                    </a>.
                  </span>
                </label>
                {formErrors.privacyConsent && (
                  <p className="text-[11px] text-rose-600 mt-1">{formErrors.privacyConsent}</p>
                )}
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? (
                    <span>Verifying & Recording Enquiry...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Confirm Practice Consultation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
