"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function TasksError({
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
      title="Tasks & Approvals Error"
      subtitle="An unexpected issue occurred while fetching your practice tasks or approval workflows."
    />
  );
}
