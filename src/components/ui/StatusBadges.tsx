import React from "react";
import { cn } from "@/lib/utils";

export type StatusType =
  | "FILED"
  | "PAID"
  | "APPROVED"
  | "ACTIVE"
  | "READY_FOR_REVIEW"
  | "PARTIAL"
  | "PARTIALLY_PAID"
  | "PENDING_APPROVAL"
  | "DUE_SOON"
  | "AWAITING_CLIENT_APPROVAL"
  | "OVERDUE"
  | "REJECTED"
  | "FAILED"
  | "FAILED_OUTBOX"
  | "DISPUTING"
  | "DRAFT"
  | "ARCHIVED"
  | "CANCELLED";

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType | string;
  label?: string;
  className?: string;
  showDot?: boolean;
}

// Strict WCAG 2.2 AA compliant status tokens (contrast ratio >= 4.5:1 against surfaces)
const statusConfig: Record<
  string,
  { bg: string; text: string; border: string; dot: string; glow: string; defaultLabel: string }
> = {
  FILED: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-600",
    glow: "shadow-2xs",
    defaultLabel: "Filed",
  },
  PAID: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-600",
    glow: "shadow-2xs",
    defaultLabel: "Paid",
  },
  APPROVED: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-600",
    glow: "shadow-2xs",
    defaultLabel: "Approved",
  },
  ACTIVE: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-600",
    glow: "shadow-2xs",
    defaultLabel: "Active",
  },
  READY_FOR_REVIEW: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Ready for Review",
  },
  PARTIAL: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Partial",
  },
  PARTIALLY_PAID: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Partially Paid",
  },
  PENDING_APPROVAL: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Pending Approval",
  },
  DUE_SOON: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Due Soon",
  },
  AWAITING_CLIENT_APPROVAL: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
    glow: "shadow-2xs",
    defaultLabel: "Awaiting Client",
  },
  OVERDUE: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
    glow: "shadow-2xs",
    defaultLabel: "Overdue",
  },
  REJECTED: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
    glow: "shadow-2xs",
    defaultLabel: "Rejected",
  },
  FAILED: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
    glow: "shadow-2xs",
    defaultLabel: "Failed",
  },
  FAILED_OUTBOX: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
    glow: "shadow-2xs",
    defaultLabel: "Outbox Failed",
  },
  DISPUTING: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
    glow: "shadow-2xs",
    defaultLabel: "Disputing",
  },
  DRAFT: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-500",
    glow: "shadow-2xs",
    defaultLabel: "Draft",
  },
  ARCHIVED: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-500",
    glow: "shadow-2xs",
    defaultLabel: "Archived",
  },
  CANCELLED: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-500",
    glow: "shadow-2xs",
    defaultLabel: "Cancelled",
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className,
  showDot = true,
  ...props
}) => {
  const normalizedStatus = (status || "").toUpperCase();
  const config = statusConfig[normalizedStatus] || {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-500",
    glow: "shadow-2xs",
    defaultLabel: status,
  };

  const displayLabel = label || config.defaultLabel;

  return (
    <span
      role="status"
      aria-label={`Status: ${displayLabel}`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border select-none transition-all duration-200",
        config.bg,
        config.text,
        config.border,
        config.glow,
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            config.dot
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{displayLabel}</span>
    </span>
  );
};
