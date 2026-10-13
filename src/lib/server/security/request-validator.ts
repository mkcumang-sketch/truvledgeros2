import { z } from "zod";
import { NextResponse } from "next/server";

export const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1 MB
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Strips null bytes (\0) and invisible control characters while preserving standard newlines/tabs.
 * Normalizes Unicode to Canonical Composition (NFC).
 */
export function sanitizeStringInput(val: unknown): string {
  if (typeof val !== "string") return "";
  return val
    .normalize("NFC")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Standard security field schemas enforcing strict types, min/max lengths, and sanitization.
 */
export const SecuritySchemas = {
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must not exceed 254 characters")
    .email("Invalid email format")
    .transform(sanitizeStringInput),

  password: z
    .string()
    .min(10, "Password must be at least 10 characters long")
    .max(128, "Password must not exceed 128 characters"),

  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .transform(sanitizeStringInput),

  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must not exceed 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, underscores, and hyphens")
    .transform(sanitizeStringInput),

  freeText: z
    .string()
    .max(2000, "Text must not exceed 2000 characters")
    .transform(sanitizeStringInput),

  url: z
    .string()
    .max(2048, "URL must not exceed 2048 characters")
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
      message: "URL protocol must be http or https",
    }),

  paginationPage: z.coerce.number().int().min(1).default(1),
  paginationLimit: z.coerce.number().int().min(1).max(100).default(20),
};

/**
 * Enforces a strict timeout on any asynchronous operation (DB, HTTP, external API).
 * Fails closed with an explicit TimeoutError.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validates incoming request content-length against max allowed payload size.
 * Rejects with 413 Payload Too Large if limit is exceeded.
 */
export function checkPayloadSize(
  req: Request,
  maxSizeBytes: number = MAX_BODY_SIZE_BYTES
): { valid: boolean; response?: NextResponse } {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (!isNaN(bytes) && bytes > maxSizeBytes) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            error: "Payload Too Large",
            message: `Request body exceeds maximum allowed limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(1)}MB.`,
          },
          { status: 413 }
        ),
      };
    }
  }
  return { valid: true };
}
