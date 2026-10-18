"use client";

import { ErrorBoundaryView } from "@/components/ui/error-boundary-view";

export default function TeamError({
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
      title="Team & Access Error"
      subtitle="Failed to load team memberships, invitations, or audit history."
    />
  );
}
