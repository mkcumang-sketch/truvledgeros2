import React from "react";

export type StatusType =
  | "FILED"
  | "PAID"
  | "READY_FOR_REVIEW"
  | "PARTIAL"
  | "OVERDUE"
  | "REJECTED"
  | "DRAFT"
  | "ARCHIVED";

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const statusConfig: Record<
  StatusType,
  { bg: string; text: string; dot: string; defaultLabel: string }
> = {
  FILED: {
    bg: "bg-status-success-subtle",
    text: "text-status-success",
    dot: "bg-status-success",
    defaultLabel: "Filed",
  },
  PAID: {
    bg: "bg-status-success-subtle",
    text: "text-status-success",
    dot: "bg-status-success",
    defaultLabel: "Paid",
  },
  READY_FOR_REVIEW: {
    bg: "bg-status-warning-subtle",
    text: "text-status-warning",
    dot: "bg-status-warning",
    defaultLabel: "Ready for Review",
  },
  PARTIAL: {
    bg: "bg-status-warning-subtle",
    text: "text-status-warning",
    dot: "bg-status-warning",
    defaultLabel: "Partial",
  },
  OVERDUE: {
    bg: "bg-status-danger-subtle",
    text: "text-status-danger",
    dot: "bg-status-danger",
    defaultLabel: "Overdue",
  },
  REJECTED: {
    bg: "bg-status-danger-subtle",
    text: "text-status-danger",
    dot: "bg-status-danger",
    defaultLabel: "Rejected",
  },
  DRAFT: {
    bg: "bg-status-neutral-subtle",
    text: "text-status-neutral",
    dot: "bg-status-neutral",
    defaultLabel: "Draft",
  },
  ARCHIVED: {
    bg: "bg-status-neutral-subtle",
    text: "text-status-neutral",
    dot: "bg-status-neutral",
    defaultLabel: "Archived",
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const current = statusConfig[status] || statusConfig.DRAFT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs font-medium ${current.bg} ${current.text} border border-transparent select-none`}
      role="status"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${current.dot}`}
        aria-hidden="true"
      />
      {label || current.defaultLabel}
    </span>
  );
};