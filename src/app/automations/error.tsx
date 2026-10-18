"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function AutomationsError({
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
      title="Automations Pipeline Error"
      subtitle="Failed to load practice automations or workflow rules."
    />
  );
}
