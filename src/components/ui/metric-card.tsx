"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { StatusBadge } from "./StatusBadges";

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
  // Map badgeVariant to StatusBadge status
  const mappedStatus =
    badgeVariant === "success"
      ? "FILED"
      : badgeVariant === "warning"
      ? "READY_FOR_REVIEW"
      : badgeVariant === "danger"
      ? "OVERDUE"
      : "DRAFT";

  return (
    <GlassCard
      className={cn(
        "p-5 flex flex-col justify-between group",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] group-hover:text-[#f8fafc] transition-colors truncate">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#94a3b8] group-hover:text-[#6366f1] group-hover:border-[#6366f1]/30 transition-all shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#f8fafc] font-mono tabular-nums break-words">
          {value}
        </span>
        {badge && (
          <StatusBadge
            status={mappedStatus}
            label={badge}
            className="text-[10px] h-5 px-2 font-semibold"
          />
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-xs text-[#64748b] group-hover:text-[#94a3b8] transition-colors truncate">
          {subtitle}
        </p>
      )}
    </GlassCard>
  );
}
