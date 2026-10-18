"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 p-6 flex items-center justify-center">
      <ErrorBoundaryView
        error={error}
        reset={reset}
        title="Workspace Error"
        subtitle="This workspace view encountered an unexpected issue. Please retry or navigate to another module."
      />
    </div>
  );
}
