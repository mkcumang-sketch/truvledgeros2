"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function PaymentsError({
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
      title="Payments & Recovery Error"
      subtitle="We were unable to load the payments register or receivables aging metrics."
    />
  );
}
