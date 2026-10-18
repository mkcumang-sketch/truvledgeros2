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

export type Serialized<T> = T extends Date
  ? string
  : T extends bigint
  ? number
  : T extends { toNumber: () => number }
  ? number
  : T extends { toFixed: (...args: any[]) => string; d: any; e: any; s: any }
  ? number
  : T extends Array<infer U>
  ? Serialized<U>[]
  : T extends readonly (infer U)[]
  ? readonly Serialized<U>[]
  : T extends Function
  ? T
  : T extends object
  ? { [K in keyof T]: Serialized<T[K]> }
  : T;

/**
 * Deep recursive serializer for Next.js Client Component props and Server Action responses.
 * Replaces Decimal with number, Date with ISO string, and strips un-serializable objects.
 */
export function serializeForClient<T>(input: T): Serialized<T> {
  if (input === null || input === undefined) {
    return input as Serialized<T>;
  }

  if (input instanceof Date) {
    return input.toISOString() as unknown as Serialized<T>;
  }

  if (isPrismaDecimal(input)) {
    return toDecimalNumber(input) as unknown as Serialized<T>;
  }

  if (typeof input === "bigint") {
    return Number(input) as unknown as Serialized<T>;
  }

  if (Array.isArray(input)) {
    return input.map((item) => serializeForClient(item)) as unknown as Serialized<T>;
  }

  if (typeof input === "object") {
    // Avoid mutating buffer or specialized classes if not plain object
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) {
      if (isPrismaDecimal(input)) {
        return toDecimalNumber(input) as unknown as Serialized<T>;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = serializeForClient(value);
    }
    return result as Serialized<T>;
  }

  return input as Serialized<T>;
}
