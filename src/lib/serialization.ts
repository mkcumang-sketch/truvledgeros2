/**
 * Enterprise Serialization & Hydration Safety Utilities
 * Converts Prisma Decimal instances, Date objects, and complex database structures
 * into plain JSON-serializable primitives for Next.js Client Components and Server Action responses.
 */

export function isPrismaDecimal(val: unknown): boolean {
  if (!val || typeof val !== "object") return false;
  // Prisma Decimals implement toNumber() or have Decimal constructor characteristics
  return (
    ("toNumber" in val && typeof (val as { toNumber: unknown }).toNumber === "function") ||
    ("toFixed" in val && "d" in val && "e" in val && "s" in val)
  );
}

export function toDecimalNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string") {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (isPrismaDecimal(val)) {
    try {
      return (val as { toNumber: () => number }).toNumber();
    } catch {
      const num = Number(String(val));
      return Number.isFinite(num) ? num : fallback;
    }
  }
  return fallback;
}

export function toISOStringSafe(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toISOString();
  }
  return null;
}

/**
 * Deep recursive serializer for Next.js Client Component props and Server Action responses.
 * Replaces Decimal with number, Date with ISO string, and strips un-serializable objects.
 */
export function serializeForClient<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (input instanceof Date) {
    return input.toISOString() as unknown as T;
  }

  if (isPrismaDecimal(input)) {
    return toDecimalNumber(input) as unknown as T;
  }

  if (typeof input === "bigint") {
    return Number(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => serializeForClient(item)) as unknown as T;
  }

  if (typeof input === "object") {
    // Avoid mutating buffer or specialized classes if not plain object
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) {
      if (isPrismaDecimal(input)) {
        return toDecimalNumber(input) as unknown as T;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = serializeForClient(value);
    }
    return result as T;
  }

  return input;
}
