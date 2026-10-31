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

const statusConfig: Record<
  string,
  { bg: string; text: string; border: string; dot: string; glow: string; defaultLabel: string }
> = {
  FILED: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    defaultLabel: "Filed",
  },
  PAID: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    defaultLabel: "Paid",
  },
  APPROVED: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    defaultLabel: "Approved",
  },
  ACTIVE: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    defaultLabel: "Active",
  },
  READY_FOR_REVIEW: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Ready for Review",
  },
  PARTIAL: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Partial",
  },
  PARTIALLY_PAID: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Partially Paid",
  },
  PENDING_APPROVAL: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Pending Approval",
  },
  DUE_SOON: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Due Soon",
  },
  AWAITING_CLIENT_APPROVAL: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    defaultLabel: "Client Review",
  },
  OVERDUE: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    defaultLabel: "Overdue",
  },
  REJECTED: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    defaultLabel: "Rejected",
  },
  FAILED: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    defaultLabel: "Failed",
  },
  FAILED_OUTBOX: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    defaultLabel: "Outbox Failed",
  },
  DISPUTING: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    defaultLabel: "Disputing",
  },
  DRAFT: {
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/25",
    dot: "bg-slate-400",
    glow: "shadow-[0_0_6px_rgba(148,163,184,0.4)]",
    defaultLabel: "Draft",
  },
  ARCHIVED: {
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/25",
    dot: "bg-slate-400",
    glow: "shadow-[0_0_6px_rgba(148,163,184,0.4)]",
    defaultLabel: "Archived",
  },
  CANCELLED: {
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/25",
    dot: "bg-slate-400",
    glow: "shadow-[0_0_6px_rgba(148,163,184,0.4)]",
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
  const normStatus = String(status || "DRAFT").toUpperCase().trim();
  const current = statusConfig[normStatus] || statusConfig.DRAFT;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium",
        "backdrop-blur-md border select-none transition-all duration-150",
        current.bg,
        current.text,
        current.border,
        className
      )}
      role="status"
      {...props}
    >
      {showDot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", current.dot, current.glow)}
          aria-hidden="true"
        />
      )}
      <span>{label || current.defaultLabel}</span>
    </span>
  );
};
