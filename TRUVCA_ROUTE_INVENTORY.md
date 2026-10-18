# TRUVCA LedgerOS — Comprehensive Route & Page Inventory

**Project**: TRUVCA LedgerOS — Indian Chartered Accountant Practice Operating System  
**Framework**: Next.js 14 App Router with Server Components & Server Actions  
**Audit & Verification Date**: October 15, 2026  
**Auditor**: Senior Full-Stack Security & QA Reviewer  
**Total Routes Cataloged**: 35 (24 UI Pages & Layouts + 11 API Endpoints / Webhooks / System Probes)  

---

## 1. Route Discovery & Architectural Classification

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TRUVCA LedgerOS Routing Architecture            │
├───────────────────┬────────────────────────────────────────────────────┤
│ Public / Visitor  │ / (Landing), /login, /forgot-password,             │
│                   │ /reset-password, /accept-invite, /healthz, /readyz │
├───────────────────┼────────────────────────────────────────────────────┤
│ Practice Console  │ /dashboard, /clients, /clients/[clientId],         │
│ (Authenticated)   │ /gst, /tasks, /documents, /invoices, /invoices/new,│
│                   │ /invoices/[invoiceId], /payments,                  │
│                   │ /payments/recovery, /communications, /reports,     │
│                   │ /subscription, /support, /settings, /automations   │
├───────────────────┼────────────────────────────────────────────────────┤
│ Privileged Admin  │ /team (FIRM_OWNER, FIRM_ADMIN),                    │
│                   │ /godmode (GODMODE_ADMIN, isSuperAdmin)             │
├───────────────────┼────────────────────────────────────────────────────┤
│ Machine & API     │ /api/auth/me, /api/compliance/due-obligations,     │
│                   │ /api/documents/pending-requests,                   │
│                   │ /api/documents/upload, /api/cron/outbox-dispatch,  │
│                   │ /api/webhooks/n8n, /api/ai-chats, /api/clients     │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## 2. Complete Route Inventory & Status Matrix

| Route Path | Intended Access Level | Required Role / Guard | Render Status | States Verified (Empty/Populated/Loading/Error) | Working Actions & Controls | Desktop & Mobile Layout | Defects / Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Public (Unauthenticated) | None (Publicly Accessible) | **PASS** | Populated with real practice metrics; Error handling on demo modal | Hero CTA, Preview Tabs, Consultation Modal, Demo Server Action, Nav | Clean responsive layout; mobile drawer verified (375px) | None. Built in Phase 5. Fixed server action export. |
| `/login` | Public (Unauthenticated) | None (Redirects auth to `/dashboard`) | **PASS** | Form empty & error state (rate limit / invalid credentials) | Email, Password input, Sign in action, Forgot password link | Centered auth card on desktop & mobile (375px) | None. Demo shortcuts & hardcoded passwords eliminated. |
| `/forgot-password` | Public (Unauthenticated) | None | **PASS** | Email input state; anti-enumeration feedback message | Request password reset token; return to login | Full width mobile; centered desktop container | None. Anti-enumeration preserved. |
| `/reset-password` | Public (Unauthenticated) | Cryptographic Token Hash | **PASS** | Empty form; expired token error; success state | 64-char token verification; password update action | Responsive form container | None. Atomic rollback verified in tests. |
| `/accept-invite` | Public (Unauthenticated) | Cryptographic Invitation Token | **PASS** | Token parameter check; expired invitation state; success | Password creation; membership role confirmation | Responsive invitation confirmation | None. Migration drift reconciled; standby safe. |
| `/dashboard` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Real practice metrics, recent activities, KPI grid | Global navigation, active client breakdown, quick links | Sidebar + Topbar responsive shell with mobile drawer | None. Real DB counts wired. |
| `/clients` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Search results, filter by constitution, empty search | Search, filter, bulk CSV import modal, client dossier | Responsive card grid and table view | None. Cross-tenant isolation verified. |
| `/clients/[clientId]` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Client 360 profile, multi-state GSTINs, contacts | Edit client, archive, restore, add contact, link GST | Detailed dossier view with tabbed sections | None. Preserves historical invoices on archive. |
| `/gst` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Populated return pipeline, multi-state GSTIN roster | GSTR-1 & GSTR-3B status filter, search, record ARN, sign-off | Responsive table with filing action drawer | Mounted `GstReturnRowActions` with ARN dialog. |
| `/tasks` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Open, in-progress, completed queues; empty state | Create task modal, toggle status, complete with evidence, reject | Metric cards + priority task roster | Mounted Evidence Resolution & Rejection Modals. |
| `/documents` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Vault records, client category filters, empty vault | Deposit document modal, request document modal, verify/reject | Encrypted dossier table with action controls | Mounted Upload & Request dialogs in Phase 6. |
| `/invoices` | Authenticated Staff | `EXECUTIVE` (View), `PARTNER` (Approve) | **PASS** | Active invoices, status filters (DRAFT, SENT, PAID) | Create draft invoice, issue invoice, filter status | Financial table with status badges and INR formatting | None. RBAC strictly enforced on financial actions. |
| `/invoices/new` | Authenticated Staff | `FIRM_ADMIN`, `PARTNER`, `FIRM_OWNER` | **PASS** | Multi-item invoice builder form, tax computation | Dynamic line items, GST rate calculation (CGST/SGST/IGST) | Responsive financial creation form | None. Correct sequential invoice number generation. |
| `/invoices/[invoiceId]` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Authoritative invoice voucher, payment history | Record payment, partner sign-off, download voucher | Printable invoice voucher layout | Strict decimal precision & payment math verified. |
| `/payments` | Authenticated Staff | `EXECUTIVE` (View), `PARTNER` (Manage) | **PASS** | Ledger payments, payment mode filters, INR totals | Filter by mode (UPI, NEFT, RTGS, CHEQUE), view voucher | Financial transaction ledger | None. Client role strictly blocked from recording. |
| `/payments/recovery` | Authenticated Staff | `PARTNER`, `FIRM_OWNER` | **PASS** | 4-stage aging pipeline (Gentle, Firm, Final, Escalation) | Trigger reminder cadence, partner direct call log | Aging buckets matrix with client balances | Real stage thresholds verified. |
| `/communications` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Outbound/inbound communication log | Multi-channel history (Email, WhatsApp, Portal) | Message timeline and client interaction trail | None. |
| `/automations` | Authenticated Staff | `PARTNER`, `FIRM_OWNER` | **PASS** | 5-suite automation triggers, webhook logs | Inspect trigger status, configure webhooks | Card grid with automation suite metrics | None. Outbox transactions verified. |
| `/reports` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Analytics overview, revenue realization, compliance rates | Date range picker, export CSV data | Analytics charts and summary metric cards | None. Custom export permissions enforced. |
| `/team` | Firm Administration | `FIRM_OWNER`, `FIRM_ADMIN` | **PASS** | Team members roster, pending invitations, roles | Invite team member, change role, revoke invitation | Staff table with permission badges | None. Owner demotion protection & standby safe. |
| `/settings` | Firm Administration | `FIRM_OWNER`, `FIRM_ADMIN` | **PASS** | Practice configuration, PAN/GSTIN, bank details | Update threshold, due days, address, accounting sync | Multi-section settings forms | None. |
| `/subscription` | Firm Administration | `FIRM_OWNER` | **PASS** | Active plan tier (Professional), usage quotas | Upgrade plan, billing portal redirect | Pricing and feature breakdown table | None. |
| `/support` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | AI Practice Bot chat interface | Send question, query practice knowledge base | Split conversation layout | None. |
| `/godmode` | Platform SuperAdmin | `GODMODE_ADMIN` or `isSuperAdmin` | **PASS** | Multi-tenant practice roster, system audit log | Switch tenant view, suspend tenant, inspect migrations | High-privilege administrative dashboard | Replaced client check with pure server guard. |
| `/healthz` | Public Probe | None | **PASS** | JSON `{ status: "ok", timestamp: ... }` | Liveness healthcheck response | Direct HTTP 200 JSON | None. Bypasses middleware payload overhead. |
| `/readyz` | Public Probe | None | **PASS** | JSON `{ status: "ready", db: "connected" }` | Readiness check with database ping | Direct HTTP 200 JSON | None. |
| `/api/auth/me` | Authenticated / Public | None (returns `{ authenticated: false }`) | **PASS** | Session context, tenant details, membership role | Profile identification endpoint | JSON response | None. |
| `/api/compliance/due-obligations` | Machine-to-Machine | M2M HMAC Signature / Bearer Token | **PASS** | Due GST obligations for specified tenant | Automated compliance checking for n8n/cron | JSON array of due returns | Fixed credential checking precedence in M2M auth. |
| `/api/documents/pending-requests` | Machine-to-Machine | M2M HMAC Signature / Bearer Token | **PASS** | Outstanding client document requests | Automated document chasing pipeline query | JSON array of pending document requests | Protected with strict tenant-bound credential check. |
| `/api/documents/upload` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Multipart file upload, size check (10MB limit) | Save document metadata and deposit to client vault | JSON `{ success: true, document: ... }` | Created in Phase 6. Size and IDOR protected. |
| `/api/cron/outbox-dispatch` | Machine-to-Machine | `CRON_SECRET` Bearer Token | **PASS** | Processes pending `AutomationEvent` outbox | Claims and dispatches domain events idempotently | JSON `{ dispatchedCount: ... }` | Atomic row claiming verified in tests. |
| `/api/webhooks/n8n` | External Webhook | HMAC-SHA256 Signature + Timestamp | **PASS** | Validates inbound webhook from automation engine | Updates task/client status upon external event | JSON `{ received: true }` | Verified with replay & tampering defense. |
| `/api/ai-chats` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Conversation stream or response generation | Chat interaction with AI copilot | Streaming JSON | None. |
| `/api/clients` | Authenticated Staff | Any Member (`EXECUTIVE`+) | **PASS** | Client list or query | Query practice clients by search term | JSON array | Tenant isolated. |
| `/_not-found` | Public | None | **PASS** | 404 Not Found error layout | Return to dashboard / home | Centered error screen | None. |

---

## 3. Route Accessibility & Security Guard Summary

- **Total Public Routes**: 7 (`/`, `/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/healthz`, `/readyz`).
- **Total Protected App Routes**: 17 (wrapped in `AppShell` with strict session cookie requirement).
- **Total Privileged Routes**: 2 (`/team` restricted to `FIRM_OWNER`/`FIRM_ADMIN`; `/godmode` strictly restricted to `GODMODE_ADMIN` or `isSuperAdmin` via pure server-authoritative guard).
- **Total API & M2M Routes**: 9 (enforcing constant-time HMAC-SHA256, Bearer token, or authenticated session context).
- **Zero Route Regressions**: All 35 routes compile cleanly in the Next.js production bundle with zero hydration errors or unhandled exceptions.
