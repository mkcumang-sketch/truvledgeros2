import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral"
    | "gold"
    | "orange"
    | "outline";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "neutral",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    warning: "bg-amber-50 text-amber-800 border-amber-200/80",
    danger: "bg-rose-50 text-rose-800 border-rose-200/80",
    info: "bg-sky-50 text-sky-800 border-sky-200/80",
    neutral: "bg-slate-100 text-slate-800 border-slate-200/80",
    gold: "bg-amber-50 text-amber-900 border-amber-200/80",
    orange: "bg-[#FFF4EE] text-[#D95524] border-[#F26B38]/30 font-semibold",
    outline: "bg-transparent text-graphite-700 border-[#E5E7EB]",
  };

  const sizeStyles = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium border rounded-md select-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
