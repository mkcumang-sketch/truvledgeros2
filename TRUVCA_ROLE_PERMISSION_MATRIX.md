# TRUVCA LedgerOS — Comprehensive Role & Permission Matrix

**Classification:** Confirmed Architectural Standard  
**Platform Version:** TRUVCA LedgerOS Enterprise v2.4  
**Date of Audit:** October 2026  
**Auditor:** TRUVTECH Security & Platform Governance Desk  

---

## 1. Architectural Role Hierarchy Overview

TRUVCA LedgerOS enforces a strict, four-tier access hierarchy separating platform-level operations from customer CA practice boundaries. Roles are evaluated server-side on every protected server action, API route, and server-rendered page.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LEVEL 1: TRUVTECH PLATFORM OWNER                     │
│               Roles: `isSuperAdmin = true` | `GODMODE_ADMIN`           │
│   • Global Tenant Orchestration    • TRUVTECH Service Delivery ("My Team") │
│   • Multi-Tenant Isolation Controls • Platform-Wide Security Audit Stream │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Zero Customer Data Access by Default)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               LEVEL 2: ADMIN_CLIENT (CA FIRM ADMINISTRATOR)            │
│                 Roles: `FIRM_OWNER` | `FIRM_ADMIN`                     │
│   • Full Practice Profile & Settings • Firm Staff & Membership Mgmt    │
│   • Financial Thresholds & Invoices  • Client Master Registers & Groups│
│   • Practice Reports & MIS Exports   • Cryptographic Invitation Tokens │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Isolated to Own Tenant ID)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 LEVEL 3: ADMIN_TEAM (CA FIRM EMPLOYEES)                │
│             Roles: `PARTNER` | `MANAGER` | `EXECUTIVE`                 │
│   • Partner: Signing CA, Reviewer Approvals, Material Thresholds       │
│   • Manager: Work Assignment, Workpaper Review, Deadline Tracking     │
│   • Executive: Workpaper Preparation, Document Uploads, Timesheets     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Confined to Practice Workspace)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   LEVEL 4: CLIENT (EXTERNAL PORTAL)                    │
│                           Role: `CLIENT`                               │
│   • View Own Invoices & Balances   • Upload Requested Evidence         │
│   • Track Return Filing Status     • Zero Access to Internal Practice  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Definitive Role-by-Resource Permission Matrix

Permissions are represented server-side as `${Resource}:${Action}` tokens in `src/lib/server/rbac/permissions.ts`. Access evaluation follows a **strict deny-by-default policy**—any resource/action combination not explicitly granted evaluates to `false`.

| Resource | Action Token | GODMODE_ADMIN | FIRM_OWNER | FIRM_ADMIN | PARTNER | MANAGER | EXECUTIVE | CLIENT |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Platform God Mode** | `godmode:view` / `manage` | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **TRUVTECH Service Ops** | `service:view` / `manage` | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Dashboard Overview** | `dashboard:view` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED |
| **Client 360°** | `clients:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Assigned | ❌ DENIED |
| | `clients:create` / `edit` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED |
| | `clients:export` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `clients:archive` | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Invoices & Billing** | `invoices:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Own Only |
| | `invoices:create` / `edit` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Draft Only | ❌ DENIED |
| | `invoices:approve` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `invoices:void` / `delete` | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `invoices:export` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Payments & Recovery** | `payments:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Own Only |
| | `payments:create` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `payments:export` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **GST Compliance** | `gst:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ❌ DENIED |
| | `gst:edit` / `update` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED |
| | `gst:approve` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Tasks & Workpapers** | `tasks:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Assigned | ❌ DENIED |
| | `tasks:create` / `edit` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Workpaper | ❌ DENIED |
| | `tasks:approve` (Sign-off) | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Reviewer | ❌ DENIED | ❌ DENIED |
| | `tasks:reject` (Rework) | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Reviewer | ❌ DENIED | ❌ DENIED |
| **Document Vault** | `documents:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Assigned | ✅ Own Only |
| | `documents:create` (Upload)| ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Requested |
| | `documents:verify` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED |
| | `documents:reject` | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED |
| **Practice Team** | `team:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ✅ Practice | ❌ DENIED | ❌ DENIED |
| | `team:invite` | ✅ Granted | ✅ Granted | ✅ Granted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `team:manage_roles` | ✅ Granted | ✅ Granted | ⚠️ Restricted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `team:suspend` | ✅ Granted | ✅ Granted | ⚠️ Restricted | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Firm Settings** | `settings:view` | ✅ Global | ✅ Practice | ✅ Practice | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| | `settings:manage_settings` | ✅ Granted | ✅ Granted | ✅ Practice | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Audit Logs** | `audit_logs:view` | ✅ Global | ✅ Practice | ✅ Practice | ✅ Practice | ❌ DENIED | ❌ DENIED | ❌ DENIED |
| **Subscription & Plan** | `subscription:view` | ✅ Global | ✅ Practice | ✅ Practice | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED |

---

## 3. Governance Invariants & Protection Rules

### Invariant 1: Sole Active Owner Protection (`isSoleActiveOwner`)
- The platform strictly prohibits demoting, suspending, or revoking the sole remaining `FIRM_OWNER` of a practice.
- Evaluated atomically via database query in `src/lib/server/rbac/permissions.ts`.

### Invariant 2: Delegation Boundaries (`canManageMemberRole`)
- `FIRM_ADMIN` can invite, suspend, and assign roles for `PARTNER`, `MANAGER`, and `EXECUTIVE`.
- `FIRM_ADMIN` **cannot** alter, suspend, or demote a `FIRM_OWNER`.
- `FIRM_ADMIN` **cannot** elevate any team member to `FIRM_OWNER`. Only an existing `FIRM_OWNER` can grant Owner privileges.

### Invariant 3: Financial Threshold Sign-Off (`approvalThreshold`)
- Invoices exceeding the firm's configured `approvalThreshold` (default ₹50,000) are flagged as `AWAITING_APPROVAL`.
- Only `FIRM_OWNER`, `FIRM_ADMIN`, or `PARTNER` can approve invoices exceeding this threshold. Preparers and article assistants attempting to bypass this rule are blocked server-side.

### Invariant 4: Statutory Maker-Checker Evidence Policy
- Statutory review tasks (`GST_REVIEW`, Tax Audit, Statutory Audit) cannot be marked `COMPLETED` without a substantive resolution note or workpaper reference (`length >= 5`).
- Reviewers rejecting work must provide mandatory actionable feedback, which resets task status to `OPEN` and routes the item back to the preparer with an audit log entry.

### Invariant 5: Custom Permission Overrides (`customPermissions`)
- Memberships support a granular `permissions` JSON field allowing firm owners to grant or revoke specific `${Resource}:${Action}` capabilities without creating custom roles.
- Custom overrides strictly follow explicit boolean flags:
  - `customPermissions["reports:export"] = true` elevates an Executive to export MIS spreadsheets.
  - `customPermissions["invoices:create"] = false` revokes draft invoice creation.
  - Evaluated before fallback to default role permissions.
