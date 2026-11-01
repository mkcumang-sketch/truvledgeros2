"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "destructive"
    | "ghost"
    | "gold"
    | "indigo";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // WCAG 2.2 touch-size compliant: min-h-[44px] touch targets with smooth scale micro-interaction
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B38]/30 focus-visible:ring-offset-1 active:scale-[0.98] motion-reduce:transform-none disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none min-h-[44px] cursor-pointer";

    const variantStyles = {
      primary:
        "bg-[#F26B38] text-white hover:bg-[#D95524] active:bg-[#B83E15] shadow-xs border border-transparent",
      secondary:
        "bg-white text-[#1E293B] border border-[#EBE9E1] hover:bg-[#F8FAFC] active:bg-[#F1F5F9] shadow-xs",
      outline:
        "bg-white border border-[#F26B38] text-[#D95524] hover:bg-[#FFF4EE] active:bg-[#FFE7DA] shadow-xs",
      destructive:
        "bg-[#EF4444] text-white hover:bg-[#DC2626] active:bg-[#B91C1C] shadow-xs border border-transparent",
      ghost:
        "bg-transparent text-[#1E293B] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:bg-[#E2E8F0] border border-transparent",
      gold:
        "bg-[#D97706] text-white font-semibold hover:bg-[#B45309] active:bg-[#92400E] shadow-xs border border-transparent",
      indigo:
        "bg-[#4F46E5] text-white font-semibold hover:bg-[#4338CA] active:bg-[#3730A3] shadow-xs border border-transparent",
    };

    const sizeStyles = {
      sm: "text-xs px-3 py-2 gap-1.5 min-h-[44px]",
      md: "text-xs sm:text-sm px-4 py-2.5 gap-2 min-h-[44px]",
      lg: "text-sm sm:text-base px-5 py-3 gap-2.5 min-h-[48px]",
      icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0 shrink-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
