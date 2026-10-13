"use client";

import React from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  const icons = {
    danger: <AlertCircle className="w-5 h-5 text-rose-600" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    primary: <Info className="w-5 h-5 text-emerald-600" />,
  };

  const bgStyles = {
    danger: "bg-rose-50 border-rose-100",
    warning: "bg-amber-50 border-amber-100",
    primary: "bg-emerald-50 border-emerald-100",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title={title}
      maxWidth="md"
    >
      <div className="space-y-4">
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-3 ${bgStyles[variant]}`}
        >
          <div className="flex-shrink-0 mt-0.5">{icons[variant]}</div>
          <p className="text-xs text-graphite-700 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "destructive" : "primary"}
            size="md"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
