/**
 * Enterprise Input Normalization & Validation Guardrails
 * Provides whitespace normalization and identifier validation schemas.
 */

import { z } from "zod";

/**
 * Normalizes input strings by trimming whitespace, preserving original text without
 * destructive regex mutation. Relies on React's auto-escaping for secure presentation.
 */
export function sanitizeString(input: string): string {
  if (!input) return "";
  return input.trim();
}

/**
 * Zod schema transform that automatically trims and sanitizes strings.
 */
export const safeStringSchema = (min = 1, max = 1000) =>
  z
    .string()
    .min(min)
    .max(max)
    .transform((val) => sanitizeString(val));

export const safeOptionalStringSchema = (max = 2000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeString(val) : val));

/**
 * Validates entity ID parameters to prevent injection or malformed database queries.
 */
export const entityIdSchema = z
  .string()
  .trim()
  .min(1, "ID cannot be empty")
  .max(128, "ID exceeds maximum length")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier format");

export function validateEntityId(id: unknown): string {
  return entityIdSchema.parse(id);
}
