"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundaryView
      error={error}
      reset={reset}
      title="Document Vault Error"
      subtitle="Failed to load document vault files or pending client upload requests."
    />
  );
}
