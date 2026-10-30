/**
 * TRUV LedgerOS — Enterprise Design Tokens & Foundations
 * 
 * Strict WCAG 2.2 AA compliant tokens for multi-tenant compliance,
 * dense data legibility, statutory task tracking, and deterministic UI consistency.
 */

export const typography = {
  family: {
    primary: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  size: {
    xs: { fontSize: "11px", lineHeight: "16px", letterSpacing: "+0.01em" },
    sm: { fontSize: "12px", lineHeight: "18px", letterSpacing: "0" },
    md: { fontSize: "14px", lineHeight: "20px", letterSpacing: "0" },
    lg: { fontSize: "16px", lineHeight: "24px", letterSpacing: "-0.01em" },
    xl: { fontSize: "18px", lineHeight: "26px", letterSpacing: "-0.015em" },
    "2xl": { fontSize: "22px", lineHeight: "28px", letterSpacing: "-0.02em" },
    "3xl": { fontSize: "28px", lineHeight: "34px", letterSpacing: "-0.025em" },
    "4xl": { fontSize: "36px", lineHeight: "42px", letterSpacing: "-0.03em" },
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

export const colors = {
  surface: {
    canvas: "#090d16", // Deep app background
    base: "#0f172a",   // Card base, table row base
    raised: "#1e293b", // Elevated card, dropdowns, modal background
    overlay: "#334155",// Active selection, hovered row
    muted: "#182234",  // Table headers, nested inset panels
  },
  text: {
    primary: "#f8fafc",   // Headings, primary data values
    secondary: "#94a3b8", // Labels, metadata, descriptions
    tertiary: "#64748b",  // Disabled text, structural icons, placeholders
    inverse: "#0f172a",   // Text inside solid primary buttons
  },
  brand: {
    primary: "#6366f1", // Indigo primary action
    hover: "#4f46e5",   // Primary action hover
    subtle: "rgba(99, 102, 241, 0.12)", // Badge fill, active nav link
  },
  status: {
    success: {
      base: "#10b981",
      subtle: "rgba(16, 185, 129, 0.12)", // Filed, Paid, Approved
    },
    warning: {
      base: "#f59e0b",
      subtle: "rgba(245, 158, 11, 0.12)", // Pending Approval, Due Soon
    },
    danger: {
      base: "#ef4444",
      subtle: "rgba(239, 68, 68, 0.12)",  // Overdue, Rejection, Failed Outbox
    },
    neutral: {
      base: "#64748b",
      subtle: "rgba(100, 116, 139, 0.12)",// Archived, Draft
    },
  },
  border: {
    subtle: "#1e293b", // Table cell dividers, subtle card separators
    strong: "#334155", // Card borders, input strokes
    focused: "#6366f1",// Active focus ring & focused input outline
  },
} as const;

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "32px",
  8: "40px",
  9: "48px",
  10: "64px",
} as const;

export const radii = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "12px",
  full: "9999px",
} as const;

export const elevation = {
  raised: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
  overlay: "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)",
} as const;

export const motion = {
  duration: {
    instant: "150ms", // Hover color changes, tooltip fade
    fast: "200ms",    // Dropdown collapse/expansion, accordion toggles
  },
  timing: {
    standard: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

/**
 * Deterministic Indian Currency Formatter (₹ Lakhs & Crores grouping)
 * Example: 118000 -> "₹1,18,000"
 */
export function formatIndianRupees(amount: number, includeDecimals = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "₹0";
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(absAmount);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Normalizes statutory GSTIN into uppercase monospace format.
 */
export function formatGSTIN(gstin?: string | null): string {
  if (!gstin) return "—";
  return gstin.trim().toUpperCase();
}

/**
 * Normalizes statutory PAN into uppercase monospace format.
 */
export function formatPAN(pan?: string | null): string {
  if (!pan) return "—";
  return pan.trim().toUpperCase();
}

/**
 * Validates statutory PAN regex (5 letters, 4 digits, 1 letter).
 */
export function validatePAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.trim().toUpperCase());
}

/**
 * Validates 15-character GSTIN format.
 */
export function validateGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
}

/**
 * Resolves standard semantic badge styling token for compliance and invoice statuses.
 */
export function getStatusBadgeConfig(status: string) {
  const s = status.toUpperCase().trim();

  switch (s) {
    case "FILED":
    case "PAID":
    case "APPROVED":
    case "ACTIVE":
      return {
        variant: "success" as const,
        bg: colors.status.success.subtle,
        color: colors.status.success.base,
        label: s.replace(/_/g, " "),
      };

    case "READY_FOR_REVIEW":
    case "PARTIAL":
    case "PARTIALLY_PAID":
    case "PENDING_APPROVAL":
    case "DUE_SOON":
    case "AWAITING_CLIENT_APPROVAL":
      return {
        variant: "warning" as const,
        bg: colors.status.warning.subtle,
        color: colors.status.warning.base,
        label: s.replace(/_/g, " "),
      };

    case "OVERDUE":
    case "REJECTED":
    case "FAILED":
    case "FAILED_OUTBOX":
      return {
        variant: "danger" as const,
        bg: colors.status.danger.subtle,
        color: colors.status.danger.base,
        label: s.replace(/_/g, " "),
      };

    case "DRAFT":
    case "ARCHIVED":
    case "CANCELLED":
    default:
      return {
        variant: "neutral" as const,
        bg: colors.status.neutral.subtle,
        color: colors.status.neutral.base,
        label: s.replace(/_/g, " "),
      };
  }
}
