"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-4">
      <ErrorBoundaryView
        error={error}
        reset={reset}
        title="Application Error"
        subtitle="An unexpected issue occurred while rendering this page. Your session and tenant data remain safe."
      />
    </div>
  );
}
