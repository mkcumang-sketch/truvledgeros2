import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "success" | "warning" | "danger" | "info";
  title?: string;
  icon?: React.ReactNode;
}

export function Alert({
  variant = "info",
  title,
  icon,
  className,
  children,
  ...props
}: AlertProps) {
  const variantStyles = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    danger: "bg-rose-50 border-rose-200 text-rose-900",
    info: "bg-sky-50 border-sky-200 text-sky-900",
  };

  const defaultIcons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />,
    danger: <AlertCircle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 text-sky-700 flex-shrink-0 mt-0.5" />,
  };

  return (
    <div
      role="alert"
      className={cn(
        "p-3.5 rounded-xl border flex items-start gap-3 text-xs leading-relaxed",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {icon ?? defaultIcons[variant]}
      <div className="flex-1 space-y-0.5">
        {title && <h5 className="font-semibold text-graphite-900">{title}</h5>}
        <div className="text-graphite-700">{children}</div>
      </div>
    </div>
  );
}
