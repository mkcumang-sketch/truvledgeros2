"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function GstError({
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
      title="GST Compliance Error"
      subtitle="We were unable to load the GST return pipeline or compliance liabilities."
    />
  );
}
