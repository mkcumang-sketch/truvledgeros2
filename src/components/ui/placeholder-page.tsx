import React from "react";
import { LucideIcon, Layers, ShieldCheck } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: string;
  phasePlanned: string;
  description: string;
  features: string[];
}

export function PlaceholderPage({
  title,
  subtitle,
  icon: Icon,
  badge = "Foundation Ready",
  phasePlanned,
  description,
  features,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-800 shadow-2xs">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
            {badge}
          </span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {phasePlanned}
          </span>
        </div>
      </div>

      {/* Module Architecture Information Card */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              Module Foundation & Architecture
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">{description}</p>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Key Capabilities Prepared in Schema
            </h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-xs text-slate-700"
                >
                  <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Multi-Tenant Security Note */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-teal-300 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Multi-Tenant Guarantee
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every query and mutation in this module is scoped to the active tenant ID resolved from verified session memberships. Cross-firm data leakage is prevented at the database layer.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-2">
            <div className="text-xs font-bold text-slate-800">Phase 1 Status</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Prisma entities, compound indexes, relational constraints, and seed fixtures are fully established. Ready for Phase 2–9 business logic.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
