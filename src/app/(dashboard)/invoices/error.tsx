"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function InvoicesError({
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
      title="Invoices Module Error"
      subtitle="An error occurred while loading practice invoices or calculating billing aggregates."
    />
  );
}
