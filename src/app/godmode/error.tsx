"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function GodmodeError({
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
      title="Platform Operations Error"
      subtitle="Failed to initialize Godmode superadmin console. Please verify elevated security credentials."
    />
  );
}
