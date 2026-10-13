"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  requiredIndicator?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      requiredIndicator,
      id,
      children,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-graphite-700"
          >
            {label}
            {requiredIndicator && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={cn(
              "w-full appearance-none px-3 py-2 pr-9 text-sm bg-white border rounded-lg transition-colors text-graphite-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600",
              error
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-[#E8ECE8]",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="w-4 h-4 text-graphite-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
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

Select.displayName = "Select";
