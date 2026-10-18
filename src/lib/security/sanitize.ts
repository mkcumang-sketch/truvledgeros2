/**
 * Enterprise Input Sanitization & Anti-XSS Guardrails
 * Protects against stored/reflected XSS and malformed input vectors.
 */

import { z } from "zod";

/**
 * Strips dangerous HTML tags, javascript: pseudo-protocols, and malicious script sequences.
 */
export function sanitizeString(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .trim();
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
