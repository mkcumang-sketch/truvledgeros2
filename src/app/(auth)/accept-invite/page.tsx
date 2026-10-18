"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  User,
  Building,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TruvLogo } from "@/components/brand/truv-logo";
import { TruvMonogram } from "@/components/brand/truv-monogram";
import {
  getInvitationDetailsAction,
  acceptInvitationAction,
} from "@/lib/server/actions/team-actions";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitationData, setInvitationData] = useState<{
    valid: boolean;
    email?: string;
    firmName?: string;
    inviterName?: string;
    role?: string;
    error?: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setInvitationData({ valid: false, error: "Missing invitation token in link." });
      return;
    }

    getInvitationDetailsAction(token).then((data) => {
      setInvitationData(data);
      setLoading(false);
    });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify your entry.");
      return;
    }

    setSubmitting(true);
    const res = await acceptInvitationAction({
      token,
      name,
      password,
    });

    setSubmitting(false);

    if (res?.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } else {
      setError(res?.error || "Failed to accept invitation. Please try again.");
    }
  }

  // Password policy indicators
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (loading) {
    return (
      <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-xl p-8 shadow-card text-center">
        <TruvMonogram className="w-10 h-10 mx-auto mb-3 animate-pulse" />
        <h2 className="text-sm font-semibold text-charcoal-900">Validating Invitation...</h2>
        <p className="text-xs text-slate-500 mt-1">Verifying cryptographic token security</p>
      </div>
    );
  }

  if (!invitationData?.valid) {
    return (
      <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-xl p-8 shadow-card text-center">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-charcoal-900">Invitation Expired or Invalid</h2>
        <p className="text-xs text-slate-500 mt-1.5 mb-6">
          {invitationData?.error || "This invitation link is invalid or has expired."}
        </p>
        <Link href="/login">
          <Button variant="secondary" className="w-full text-xs">
            Return to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-xl p-6 sm:p-8 shadow-card">
      {/* Brand Header */}
      <div className="text-center mb-6 flex flex-col items-center">
        <TruvLogo size="lg" subtext="Practice Workspace Invitation" href="/" className="mb-2" />
        <h1 className="text-base font-bold text-[#263238] mt-2">
          Accept Team Invitation
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Join <strong>{invitationData.firmName}</strong> practice workspace
        </p>
      </div>

      {/* Invitation Context Card */}
      <div className="bg-[#F7F8FA] border border-[#E5E7EB] rounded-lg p-3.5 mb-5 text-xs text-[#263238]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[#64748B]">Invited By:</span>
          <span className="font-semibold">{invitationData.inviterName}</span>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[#64748B]">Assigned Role:</span>
          <span className="font-bold text-[#D95524] bg-[#FFF4EE] px-2 py-0.5 rounded text-[11px] border border-[#F26B38]/20">
            {invitationData.role?.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#64748B]">Work Email:</span>
          <span className="font-mono text-[#263238]">{invitationData.email}</span>
        </div>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {success && (
        <div className="mb-4">
          <Alert
            variant="success"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          >
            Account activated successfully! Redirecting you to the workspace...
          </Alert>
        </div>
      )}

      {/* Activation Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-[#263238] mb-1.5">
            Full Legal / Practice Name
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="name"
              type="text"
              required
              disabled={submitting || success}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CA Rahul Verma"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg text-[#263238] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-[#263238] mb-1.5">
            Create Account Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="password"
              type="password"
              required
              disabled={submitting || success}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg text-[#263238] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors"
            />
          </div>
          {/* Policy Checklist */}
          <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] text-[#64748B]">
            <div className={`flex items-center gap-1 ${hasMinLength ? "text-emerald-600 font-semibold" : ""}`}>
              <Check className={`w-3 h-3 ${hasMinLength ? "text-emerald-600" : "text-slate-300"}`} />
              8+ chars
            </div>
            <div className={`flex items-center gap-1 ${hasLetter ? "text-emerald-600 font-semibold" : ""}`}>
              <Check className={`w-3 h-3 ${hasLetter ? "text-emerald-600" : "text-slate-300"}`} />
              Letters
            </div>
            <div className={`flex items-center gap-1 ${hasNumber ? "text-emerald-600 font-semibold" : ""}`}>
              <Check className={`w-3 h-3 ${hasNumber ? "text-emerald-600" : "text-slate-300"}`} />
              Numbers
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-xs font-semibold text-[#263238] mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="confirmPassword"
              type="password"
              required
              disabled={submitting || success}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg text-[#263238] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26B38]/20 focus:border-[#F26B38] transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || success}
          className="w-full mt-2 inline-flex items-center justify-center font-semibold rounded-lg text-sm px-4 py-2.5 gap-2 bg-[#F26B38] hover:bg-[#D95524] text-white shadow-xs transition-colors disabled:opacity-50"
        >
          {submitting ? "Activating Account..." : "Join Practice Workspace"}
          {!submitting && <ArrowRight className="w-4 h-4 ml-1" />}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-[#E5E7EB] text-center">
        <Link href="/login" className="text-xs text-[#F26B38] hover:text-[#D95524] font-medium transition-colors">
          Already have credentials? Sign In
        </Link>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F7F8FA] p-4 sm:p-6">
      <Suspense
        fallback={
          <div className="text-xs text-slate-500 font-medium">Loading invitation...</div>
        }
      >
        <AcceptInviteContent />
      </Suspense>
    </div>
  );
}
