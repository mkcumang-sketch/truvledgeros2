"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Lock, Mail, Phone, MapPin, User, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { registerAction, type RegisterInput } from "@/lib/server/actions/register-actions";
import { TruvLogo } from "@/components/brand/truv-logo";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterInput>({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    firmName: "",
    city: "",
    termsConsent: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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
    setErrorMessage(null);
    setFormErrors({});

    startTransition(async () => {
      const res = await registerAction(formData);
      if (res.success && res.redirectUrl) {
        router.push(res.redirectUrl);
      } else {
        setErrorMessage(res.message);
        if (res.errors) {
          setFormErrors(res.errors);
        }
      }
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto py-10 px-4 sm:px-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2 flex flex-col items-center">
          <TruvLogo size="lg" subtext="Chartered Accountant Practice System" href="/" className="mb-2" />
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Register Your CA Practice
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Establish a dedicated practice tenant. As founding partner, you will be assigned the Firm Owner role.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Managing Partner Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Managing Partner Full Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                placeholder="e.g., CA Ankit Mehta"
                required
                className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                  formErrors.fullName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
              />
            </div>
            {formErrors.fullName && (
              <p className="text-[11px] text-rose-600 mt-1">{formErrors.fullName}</p>
            )}
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Practice Email *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="ankit@mehtaca.in"
                  required
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                    formErrors.email ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                />
              </div>
              {formErrors.email && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mobile Number (India) *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="9876543210"
                  required
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                    formErrors.phone ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                />
              </div>
              {formErrors.phone && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.phone}</p>
              )}
            </div>
          </div>

          {/* Firm Name & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                CA Firm / Practice Name *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="firmName"
                  value={formData.firmName}
                  onChange={handleInputChange}
                  placeholder="Mehta & Associates CA"
                  required
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                    formErrors.firmName ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                />
              </div>
              {formErrors.firmName && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.firmName}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Principal Office City *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="Mumbai / Delhi / Pune"
                  required
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                    formErrors.city ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                  } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
                />
              </div>
              {formErrors.city && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.city}</p>
              )}
            </div>
          </div>

            {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Master Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="At least 8 chars, 1 uppercase, 1 number"
                required
                className={`w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border bg-white ${
                  formErrors.password ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-300"
                } focus:outline-hidden focus:ring-2 focus:ring-[#F26B38]`}
              />
            </div>
            {formErrors.password && (
              <p className="text-[11px] text-rose-600 mt-1">{formErrors.password}</p>
            )}
          </div>

          {/* Consent */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
              <input
                type="checkbox"
                name="termsConsent"
                checked={formData.termsConsent}
                onChange={handleInputChange}
                className="mt-0.5 rounded-sm border-slate-300 text-[#F26B38] focus:ring-[#F26B38]"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-orange-600 font-semibold underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-orange-600 font-semibold underline">
                  Privacy Policy
                </Link>.
              </span>
            </label>
            {formErrors.termsConsent && (
              <p className="text-[11px] text-rose-600 mt-1">{formErrors.termsConsent}</p>
            )}
          </div>

          {/* Submit CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3.5 rounded-xl bg-[#F26B38] hover:bg-[#D95524] text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <span>Creating Practice Tenant & Workspace...</span>
              ) : (
                <>
                  <span>Create Practice Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
          Already registered your practice?{" "}
          <Link href="/login" className="text-orange-600 font-bold hover:underline">
            Sign in to your firm workspace →
          </Link>
        </div>
      </div>
    </div>
  );
}

