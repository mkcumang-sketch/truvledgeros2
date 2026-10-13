import React from "react";
import { FolderSearch } from "lucide-react";
import { Button } from "./button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-xl bg-ivory-200 border border-[#E2E0D8] flex items-center justify-center text-graphite-500 mb-3.5">
        {icon || <FolderSearch className="w-6 h-6 text-graphite-400" />}
      </div>
      <h3 className="text-sm font-semibold text-graphite-900">{title}</h3>
      <p className="text-xs text-graphite-500 max-w-sm mt-1 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
