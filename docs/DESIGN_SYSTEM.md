# TRUV LedgerOS — Enterprise Design System Specification

**Version**: 1.0.0  
**Compliance Standard**: WCAG 2.2 AA Deterministic  
**Primary Domain**: Enterprise Chartered Accountancy (CA) Practice Management, Multi-Tenant Compliance & Financial Operations  

---

## 1. Executive Summary & Philosophy

TRUV LedgerOS is an enterprise-grade platform for statutory audit management, GST compliance tracking, automated practice billing, and omnichannel client communication. 

The design system enforces:
- **Deterministic Token-Driven Consistency**: UI components consume explicit semantic tokens; hardcoded hex values and arbitrary layout margins are strictly prohibited.
- **Strict WCAG 2.2 AA Accessibility**: High-contrast ratios ($\ge 4.5:1$ for body text, $\ge 3.0:1$ for UI controls and large headings), comprehensive keyboard traversal, and accessible focus-visible rings.
- **Dense Data Legibility**: Monospace tabular numerals, uppercase statutory identifiers (GSTIN, PAN), right-aligned currency, and deterministic Indian numbering (`₹1,18,000`).
- **Predictable Interaction States**: Unambiguous loading spinners (`aria-busy="true"`), explicit empty states, and mandatory confirmations on irreversible actions.

---

## 2. Typography Architecture

### Font Families
- **Primary Font Family**: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Utilized for all headings, body text, form labels, and navigation.
- **Monospace Font Family**: `"JetBrains Mono", "Fira Code", monospace`
  - Mandatory for all financial amounts, invoice numbers (`TRUV/YY-YY/XXXX`), GSTINs, PANs, timestamps, and hash signatures.

### Base Configuration
- `font.size.base` = `14px`
- `font.weight.base` = `400`
- `font.lineHeight.base` = `20px`

### Typography Scale

| Token | Font Size | Line Height | Letter Spacing | Primary Usage |
| :--- | :--- | :--- | :--- | :--- |
| `font.size.xs` | `11px` | `16px` | `+0.01em` | Badges, Timestamps, Table Category Headers |
| `font.size.sm` | `12px` | `18px` | `0` | Table Cells, Microcopy, Form Help Text |
| `font.size.md` | `14px` | `20px` | `0` | Body Text, Form Inputs, Standard Buttons |
| `font.size.lg` | `16px` | `24px` | `-0.01em` | Subheaders, Modal Titles, Section Intros |
| `font.size.xl` | `18px` | `26px` | `-0.015em` | Card Headers, Statistical Values |
| `font.size.2xl`| `22px` | `28px` | `-0.02em` | Section Headers, Tab Group Titles |
| `font.size.3xl`| `28px` | `34px` | `-0.025em` | Page Titles, Command Center Headers |
| `font.size.4xl`| `36px` | `42px` | `-0.03em` | Primary KPI Telemetry Numbers |

---

## 3. Color Palette & Semantic Tokens

### A. Surfaces & Backgrounds
Designed for low eye-strain during extended CA tax-season shifts:

| Token | Hex Value | Purpose |
| :--- | :--- | :--- |
| `color.surface.canvas` | `#090d16` | Deep application viewport background |
| `color.surface.base` | `#0f172a` | Card base, primary table row surface |
| `color.surface.raised` | `#1e293b` | Elevated cards, action dropdowns, modal background |
| `color.surface.overlay`| `#334155` | Active selections, table row hover state |
| `color.surface.muted` | `#182234` | Sticky table headers, nested inset panels |

### B. Text & Icons
High contrast ratios meeting WCAG 2.2 AA standards against surface tokens:

| Token | Hex Value | Contrast on Canvas | Purpose |
| :--- | :--- | :--- | :--- |
| `color.text.primary` | `#f8fafc` | 18.2:1 ($\ge 4.5:1$) | Headings, primary data values, key metrics |
| `color.text.secondary`| `#94a3b8` | 7.6:1 ($\ge 4.5:1$) | Labels, column metadata, statutory descriptions |
| `color.text.tertiary` | `#64748b` | 4.6:1 ($\ge 4.5:1$) | Disabled text, structural icons, placeholders |
| `color.text.inverse` | `#0f172a` | N/A (on light brand) | Text inside solid primary brand buttons |

### C. Brand & Action Accents

| Token | Value | Purpose |
| :--- | :--- | :--- |
| `color.brand.primary` | `#6366f1` | Indigo primary action button, active state indicator |
| `color.brand.hover` | `#4f46e5` | Primary action hover, interactive press |
| `color.brand.subtle` | `rgba(99, 102, 241, 0.12)` | Active navigation link background, badge tint |

### D. Compliance & Statutory State Semantics

| Status Domain | Base Color | Subtle Background | Permitted Usage |
| :--- | :--- | :--- | :--- |
| **Success** | `#10b981` | `rgba(16, 185, 129, 0.12)` | `FILED`, `PAID`, `APPROVED`, `ACTIVE` |
| **Warning** | `#f59e0b` | `rgba(245, 158, 11, 0.12)` | `READY_FOR_REVIEW`, `PARTIALLY_PAID`, `DUE_SOON` |
| **Danger** | `#ef4444` | `rgba(239, 68, 68, 0.12)` | `OVERDUE`, `REJECTED`, `FAILED_OUTBOX`, `DISPUTED` |
| **Neutral** | `#64748b` | `rgba(100, 116, 139, 0.12)`| `DRAFT`, `ARCHIVED`, `CANCELLED` |

### E. Borders & Dividers

| Token | Hex Value | Purpose |
| :--- | :--- | :--- |
| `color.border.subtle` | `#1e293b` | Table cell dividers, subtle card separators |
| `color.border.strong` | `#334155` | Card borders, text input strokes |
| `color.border.focused`| `#6366f1` | Active focus ring & focused input outline |

---

## 4. Spacing, Radii, Elevation & Motion

### Spacing Scale
- `space.0`: `0px`
- `space.1`: `4px` (Micro-gaps, badge vertical padding)
- `space.2`: `8px` (Badge horizontal padding, compact cell vertical padding)
- `space.3`: `12px` (Standard table cell vertical padding, button padding)
- `space.4`: `16px` (Card inner padding, standard horizontal cell padding)
- `space.5`: `20px` (Section gaps)
- `space.6`: `24px` (Major layout gaps, modal padding)
- `space.7`: `32px` (Dashboard grid gutters)
- `space.8`: `40px` (Page header spacing)
- `space.9`: `48px` (Landing hero spacing)
- `space.10`: `64px` (Major portal block spacing)

### Border Radii
- `radius.xs`: `4px` (Checkboxes, small tags)
- `radius.sm`: `6px` (Form inputs, small buttons)
- `radius.md`: `8px` (Standard buttons, dropdowns, table cards)
- `radius.lg`: `12px` (Primary cards, dialogs, drawers)
- `radius.full`: `9999px` (Badges, circular indicators, pills)

### Elevation Shadows
- `shadow.raised`: `0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)`
- `shadow.overlay`: `0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)`

### Motion & Transitions
- `motion.duration.instant`: `150ms` (Hover color shifts, tooltip reveals)
- `motion.duration.fast`: `200ms` (Dropdown collapse/expansion, accordion toggles)
- `motion.timing.standard`: `cubic-bezier(0.16, 1, 0.3, 1)`
- **Accessibility Rule**: `@media (prefers-reduced-motion: reduce)` must immediately force animation durations to `0.01ms`.

---

## 5. Component-Level Rules

### 1. Data Tables (Client 360°, GST Obligations, Task Management)
- **Anatomy**: Table Container, Sticky Header Row, Standard Data Rows, Checkbox Column, Action Menu Column, Pagination Footer.
- **Container Background**: `color.surface.base` (`#0f172a`).
- **Header Row**: `color.surface.muted` (`#182234`), `font.size.sm` (`12px`), `font.weight = 600`, text `color.text.secondary`, uppercase with tracking `+0.05em`.
- **Cell Padding**: `space.3` vertical (`12px`), `space.4` horizontal (`16px`). Compact mode: `space.2` vertical (`8px`).
- **Cell Font**: `font.size.sm` (`12px`), text `color.text.primary`. Numeric and currency cells **must align right** using `font.family.mono` and `.tabular-nums`.
- **States**:
  - *Default*: Transparent row background.
  - *Hover*: Row background transitions to `color.surface.raised` (`150ms ease`).
  - *Selected*: Row background `color.brand.subtle`, left border `2px solid color.brand.primary`.
  - *Empty*: Displays empty vault/illustration, explicit message (*"No compliance obligations found for this period"*), and optional primary action button.
- **Overflow & Long Content**: Text cells must truncate with an ellipsis (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) and expose full text via an accessible tooltip on hover/focus.

---

### 2. Status Badges & Pill Tags (Filing Status, Invoice State)
- **Anatomy**: Container pill, optional 6px circular dot indicator, text label.
- **Tokens**: Height `24px`, padding `space.1` vertical (`4px`), `space.2` horizontal (`8px`), `radius.full`.
- **Variants**:
  - `FILED` / `PAID`: Background `color.status.success.subtle`, text `color.status.success.base`.
  - `READY_FOR_REVIEW` / `PARTIAL`: Background `color.status.warning.subtle`, text `color.status.warning.base`.
  - `OVERDUE` / `REJECTED`: Background `color.status.danger.subtle`, text `color.status.danger.base`.
  - `DRAFT` / `ARCHIVED`: Background `color.status.neutral.subtle`, text `color.status.neutral.base`.
- **Statutory Invariant**: Badges must **never rely solely on color**; text content must convey the exact uppercase status string.

---

### 3. Action Buttons & Form Controls
- **Anatomy**: Leading Icon (optional), Text Label, Trailing Icon / Kbd shortcut (optional).
- **Variants**:
  - `Primary`: Background `color.brand.primary`, text `color.text.primary`, border none.
  - `Secondary`: Background `color.surface.raised`, border `1px solid color.border.strong`, text `color.text.primary`.
  - `Destructive`: Background `color.status.danger.base`, text `color.text.primary`.
  - `Ghost`: Background transparent, text `color.text.secondary`.
- **States**:
  - *Hover*: Opacity 0.9, background tone shift (`color.brand.hover`).
  - *Focus-Visible*: Outline `2px solid color.brand.primary`, outline-offset `2px`.
  - *Active*: Scale transform down `transform: scale(0.98)`.
  - *Disabled*: Background `color.surface.muted`, text `color.text.tertiary`, border `color.border.subtle`, `cursor: not-allowed`.
  - *Loading*: Text hidden or replaced, centered spinner with `aria-busy="true"`.

---

## 6. Accessibility Standards (WCAG 2.2 AA)

1. **Color Contrast Constraints**:
   - All body text, data values, and button labels must meet minimum **4.5:1** contrast against adjacent surface tokens.
   - Large text ($\ge 18px$ bold or $\ge 24px$ regular) and UI component boundaries (input strokes, active badges) must meet minimum **3.0:1** contrast.
2. **Keyboard Navigation & Traversal**:
   - Every interactive control must be reachable via the `Tab` key in intuitive reading order.
   - Modal dialogs must trap focus within the modal container and restore focus to the trigger button upon closure via `Escape`.
   - Data tables with bulk-selection must support `Space` for row selection and `Shift + Click` or `Shift + Space` for range selection.
3. **Focus-Visible Ring**:
   - Outlines must never be set to `outline: none` without providing an explicit `:focus-visible` replacement (`box-shadow` or 2px outline with 2px offset).
4. **Screen Reader Semantic Invariants**:
   - Dynamic counters (such as overdue invoice totals or calling dispatch numbers) must declare `aria-live="polite"`.
   - Action icon buttons lacking text labels must provide an explicit `aria-label` (e.g., `aria-label="Download Tax Invoice PDF"`).

---

## 7. Content, Voice & Tone Standards

- **Voice**: Precise, statutory, professional, concise.
- **Labels vs Actions**:
  - *Do*: "Approve Invoice", "Record Payment", "Dispatch Reminders", "Import Clients".
  - *Don't*: "Click Here", "Submit", "Process", "Go".
- **Currency & Numbers**:
  - Always format Indian currency using deterministic Rupee notation: `₹1,18,000` (incorporating correct lakhs and crores grouping).
  - GSTIN and PAN entries must render in uppercase monospace (`27AAACT2727Q1ZW`, `ABCDE1234F`).
- **Error Messages**:
  - *Do*: "PAN must follow standard statutory format (5 letters, 4 digits, 1 letter)."
  - *Don't*: "Invalid input."

---

## 8. Anti-Patterns & Prohibited Implementations

- 🚫 **Prohibited**: Hardcoding raw hex values in React components or inline Tailwind styles. All styling must use design system tokens or corresponding Tailwind config aliases.
- 🚫 **Prohibited**: Auto-advancing compliance returns to `FILED` status without verified government portal receipts (ARN / acknowledgement numbers).
- 🚫 **Prohibited**: Suppressing modal confirmation on irreversible actions (such as Client Archival, Team Member Revocation, or Database Purging).
- 🚫 **Prohibited**: Removing or suppressing visible focus outlines on forms and navigational links.
- 🚫 **Prohibited**: Truncating statutory invoice totals or financial line items inside tables without an explicit full-width breakdown.

---

## 9. Design System QA Checklist

- [x] All typography scales map to defined `font.size.*` tokens.
- [x] Financial numbers use `font.family.mono` and are right-aligned in table columns.
- [x] Contrast ratios for primary and secondary text verify at $\ge 4.5:1$ via accessibility inspect tools.
- [x] Tab order reaches all inputs, buttons, and action dropdowns with a visible focus ring.
- [x] Modals and slide-over drawers contain focus and close cleanly via the `Escape` key.
- [x] Empty states are explicitly styled for all data tables and lists.
- [x] Currency formats match Indian numbering conventions (`₹X,XX,XXX.XX`).
- [x] Form submission buttons display a loading spinner and set `aria-busy="true"` during asynchronous operations.
