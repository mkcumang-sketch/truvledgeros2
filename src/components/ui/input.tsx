"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  requiredIndicator?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      requiredIndicator,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-graphite-700"
          >
            {label}
            {requiredIndicator && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "w-full px-3 py-2 text-sm bg-white border rounded-lg transition-colors text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600",
            error
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-[#E2E0D8]",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        )}
        {!error && helperText && (
          <p className="text-xs text-graphite-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
