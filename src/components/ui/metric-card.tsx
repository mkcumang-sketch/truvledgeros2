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
      variant="light"
      className={cn(
        "p-3 sm:p-5 flex flex-col justify-between group min-w-0 border border-[#EBE9E1] shadow-xs",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#64748B] group-hover:text-[#1E293B] transition-colors truncate">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-xl bg-[#FAF9F5] border border-[#EBE9E1] text-[#64748B] group-hover:text-[#4F46E5] group-hover:border-[#4F46E5]/30 transition-all shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 sm:mt-4 flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-lg sm:text-2xl font-bold tracking-tight text-[#1E293B] font-mono tabular-nums break-words">
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
        <p className="mt-1 sm:mt-1.5 text-xs text-[#64748B] group-hover:text-[#475569] transition-colors truncate">
          {subtitle}
        </p>
      )}
    </GlassCard>
  );
}
