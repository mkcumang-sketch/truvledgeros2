import React from "react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "danger" | "neutral" | "gold";
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  badge,
  badgeVariant = "neutral",
  icon,
  className,
}: MetricCardProps) {
  const badgeStyles = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
    warning: "bg-amber-50 text-amber-800 border-amber-200/60",
    danger: "bg-rose-50 text-rose-800 border-rose-200/60",
    neutral: "bg-graphite-100 text-graphite-700 border-graphite-200/60",
    gold: "bg-gold-50 text-gold-900 border-gold-200/60",
  };

  return (
    <div
      className={cn(
        "bg-white border border-[#E2E0D8] rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-graphite-500 truncate">
          {title}
        </span>
        {icon && <div className="text-graphite-400 flex-shrink-0">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-graphite-900">
          {value}
        </span>
        {badge && (
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full border",
              badgeStyles[badgeVariant]
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1 text-xs text-graphite-500 truncate">{subtitle}</p>
      )}
    </div>
  );
}
