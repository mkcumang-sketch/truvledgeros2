"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "indigo";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  shimmerColor?: string;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      shimmerColor = "rgba(255, 255, 255, 0.25)",
      ...props
    },
    ref
  ) => {
    // WCAG 2.2 touch standard: min-h-[44px]
    const baseStyles = cn(
      "group relative inline-flex items-center justify-center font-medium overflow-hidden select-none cursor-pointer",
      "rounded-xl transition-all duration-200 ease-out min-h-[44px]",
      "active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF9F5]",
      "disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100"
    );

    const variantStyles = {
      primary: cn(
        "bg-gradient-to-r from-[#F26B38] to-[#D95524] text-white",
        "border border-white/20 shadow-xs hover:shadow-md",
        "hover:from-[#D95524] hover:to-[#B83E15]"
      ),
      indigo: cn(
        "bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white",
        "border border-white/20 shadow-xs hover:shadow-md",
        "hover:from-[#4f46e5] hover:to-[#4338ca]"
      ),
      secondary: cn(
        "bg-white text-[#1E293B] hover:bg-[#F8FAFC]",
        "border border-[#EBE9E1] shadow-xs",
        "hover:border-[#CBD5E1]"
      ),
      danger: cn(
        "bg-gradient-to-r from-rose-600 to-rose-700 text-white",
        "border border-rose-400/30 shadow-xs hover:shadow-md",
        "hover:from-rose-500 hover:to-rose-600"
      ),
      ghost: cn(
        "bg-transparent text-[#64748B] hover:text-[#0F172A]",
        "hover:bg-[#F1F5F9] border border-transparent"
      ),
    };

    const sizeStyles = {
      sm: "text-xs px-3.5 py-2 gap-1.5 min-h-[44px]",
      md: "text-xs sm:text-sm px-4 py-2.5 gap-2 min-h-[44px]",
      lg: "text-sm sm:text-base px-5 py-3 gap-2.5 min-h-[48px]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {/* Shimmer Light Ray Overlay */}
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out motion-reduce:hidden"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
          }}
          aria-hidden="true"
        />

        {/* Top edge specular hairline highlight */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
          aria-hidden="true"
        />

        {/* Content */}
        <span className="relative z-10 inline-flex items-center gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
          {children}
        </span>
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
