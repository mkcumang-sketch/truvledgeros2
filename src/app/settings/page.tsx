import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  Building,
  Shield,
  Bell,
  Key,
  CheckCircle2,
  FileBadge,
  Mail,
  Phone,
  Globe,
  MapPin,
  Lock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/financial/math";

export const metadata = {
  title: "Firm Settings — TRUV LedgerOS",
  description: "Configure CA firm identity, ICAI registration, and practice policies.",
};

export default async function SettingsPage() {
  const context = await requireTenant();
  const tenant = await db.tenant.findUnique({
    where: { id: context.tenant.id },
  });

  if (!tenant) return null;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
          Firm Profile & Practice Configuration
        </h1>
        <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
          Official statutory profile, approval limits, and multi-tenant security boundaries.
        </p>
      </div>

      {/* Firm Profile Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Practice Identity</CardTitle>
            <p className="text-xs text-graphite-500 mt-0.5">Primary firm credentials and registration</p>
          </div>
          <Badge variant="gold" size="sm">
            Verified Firm
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-graphite-500 block">Firm Legal Name</span>
              <span className="font-semibold text-graphite-900 text-sm">{tenant.name}</span>
            </div>
            <div>
              <span className="text-graphite-500 block">Tenant Slug</span>
              <span className="font-mono text-emerald-800 font-semibold">{tenant.slug}</span>
            </div>
            <div>
              <span className="text-graphite-500 block">Practice Email</span>
              <span className="font-medium text-graphite-900">{tenant.email}</span>
            </div>
            <div>
              <span className="text-graphite-500 block">Contact Telephone</span>
              <span className="font-mono text-graphite-900">{tenant.phone}</span>
            </div>
            <div>
              <span className="text-graphite-500 block">Firm GSTIN</span>
              <span className="font-mono text-graphite-900">{tenant.gstin || "Unregistered"}</span>
            </div>
            <div>
              <span className="text-graphite-500 block">Firm PAN</span>
              <span className="font-mono text-graphite-900">{tenant.pan || "N/A"}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-[#EBE9E1] text-xs">
            <span className="text-graphite-500 block">Registered Office Address</span>
            <span className="text-graphite-800">
              {[tenant.address, tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ") ||
                "Suite 401, Nariman Point, Mumbai, Maharashtra 400021"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Policy & Thresholds Card */}
      <Card>
        <CardHeader>
          <CardTitle>Partner Approval & Financial Thresholds</CardTitle>
          <p className="text-xs text-graphite-500 mt-0.5">
            Operational governance rules configured for billing and escalations
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded-xl">
              <span className="text-graphite-500 block text-[11px]">Partner Approval Limit</span>
              <span className="text-base font-bold text-graphite-900 mt-1 block">
                {formatINR(Number(tenant.approvalThreshold))}
              </span>
              <span className="text-[10px] text-graphite-400 mt-0.5 block">
                Invoices above this amount require partner sign-off
              </span>
            </div>

            <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded-xl">
              <span className="text-graphite-500 block text-[11px]">Default Invoice Credit Days</span>
              <span className="text-base font-bold text-graphite-900 mt-1 block">
                {tenant.defaultDueDays} Days
              </span>
              <span className="text-[10px] text-graphite-400 mt-0.5 block">
                Applied to newly generated client bills
              </span>
            </div>

            <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded-xl">
              <span className="text-graphite-500 block text-[11px]">Accounting System</span>
              <span className="text-base font-bold text-emerald-800 mt-1 block font-mono">
                {tenant.accountingSoftware}
              </span>
              <span className="text-[10px] text-graphite-400 mt-0.5 block">
                Sync adapter destination
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}