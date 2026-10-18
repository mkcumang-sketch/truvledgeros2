export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export function successResult<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function errorResult(error: unknown, code?: string): ActionResult<never> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "An unexpected error occurred.";
  return { success: false, error: message, code };
}
