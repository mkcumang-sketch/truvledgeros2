"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function ClientsError({
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
      title="Client Directory Error"
      subtitle="We encountered an issue loading your client roster. Please retry or verify your active firm membership."
    />
  );
}
