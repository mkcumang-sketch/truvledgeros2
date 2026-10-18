# TRUVCA LedgerOS — Project Resumption & Read-Only Technical Audit

> **Audit Date**: October 15, 2026  
> **Workspace Path**: `c:\Users\imris\OneDrive\Desktop\TRUVCA`  
> **Repository Root**: `c:\Users\imris\OneDrive\Desktop\TRUVCA\TRUVCA`  
> **Auditor**: Senior Application Security Engineer & Systems Architect  
> **Scope**: Safe, Read-Only Audit & Empirical Verification (Zero DB Mutations, Zero Secret Disclosure, Zero Fix Commits in this run)

---

## 1. Current Project and Git State

| Parameter | Current Value | Empirical Verification Evidence |
| :--- | :--- | :--- |
| **Workspace Root** | `c:\Users\imris\OneDrive\Desktop\TRUVCA` | Contains project documentation, workflows (`.agent`, `.agents`), and the application subdirectory `TRUVCA`. |
| **Git Repository Root** | `c:\Users\imris\OneDrive\Desktop\TRUVCA\TRUVCA` | Git metadata `.git` resides inside `TRUVCA/TRUVCA`. |
| **Git Remote Origin** | `https://github.com/mkcumang-sketch/truvledgeros2.git` | Verified via `git remote -v`. |
| **Active Branch** | `main` (Tracks `origin/main`) | Verified via `git status -uno` (Up to date with `origin/main`). |
| **Latest HEAD Commit** | `7c7c95e` | Message: `feat(security): harden authentication and team permissions` (Wed Oct 14 10:04:09 2026 +0530). |
| **Working Tree Status** | Clean except 1 unstaged modified file | `modified: scripts/bootstrap-owner.ts` (uncommitted local additions for `--send-email` and `--suppress-token`). Zero untracked files. |
| **Live Production Deployment** | `https://truvledgeros2.vercel.app` | Active Vercel deployment verified live via HTTP fetch. Reflects commit `7c7c95e` (demo login shortcuts are removed; `/accept-invite` is live). |
| **Deferred Integrations** | n8n workflows & automation dispatcher | Strictly deferred per instructions until core platform hardening is validated. |

---

## 2. Confirmed Completed Work

Through code inspection, schema audits, remote database inspection, and regression test execution, the following milestones have been confirmed complete:

### 2.1 Demo Login Shortcuts Eliminated from UI & Deployed Site
- **Files Inspected**: `src/app/(auth)/login/page.tsx`, `tests/login-security-hotfix.test.ts`.
- **Finding**: Hardcoded demo credentials (`priya.kulkarni@truvdemo.in`, `us7081569@gmail.com`, and `Password123!`), along with helper function `fillDemoAccount` and development icon `ShieldCheck`, were **completely excised** in commit `7c7c95e`.
- **Live Verification**: Inspection of the HTML bundle served by `https://truvledgeros2.vercel.app/login` confirmed zero occurrences of demo buttons or passwords. Verified with unit test suite `tests/login-security-hotfix.test.ts` (13/13 passing).

### 2.2 Machine-to-Machine (M2M) Security & Tenant Isolation Hardening
- **Files Inspected**: `src/lib/server/m2m-auth.ts`, `src/app/api/compliance/due-obligations/route.ts`, `src/app/api/documents/pending-requests/route.ts`, `src/app/api/webhooks/n8n/route.ts`.
- **Finding**:
  1. **Fallback Secret Removal**: Eliminated hardcoded development string fallback (`"default_dev_truv_n8n_secret_32bytes"`). Endpoints fail closed immediately (`401 UNCONFIGURED_SECRET`) if secrets are missing.
  2. **Timing-Safe Evaluation**: Implemented constant-time comparison (`crypto.timingSafeEqual`) on SHA-256 pre-hashed buffers in `timingSafeEqualCompare`.
  3. **Mandatory Tenant Scoping**: M2M requests require an explicit `tenantId` query parameter or `x-truv-tenant-id` header (`400 MISSING_TENANT_SCOPE` if omitted).
  4. **Tenant Verification**: Validates tenant existence (`db.tenant.findUnique`), active status, and non-suspended status (`403 TENANT_UNAUTHORIZED`).
  5. **Cross-Tenant Prevention**: Machine credentials bound to Tenant A requesting Tenant B are strictly rejected with `403 CROSS_TENANT_FORBIDDEN` before any database queries execute.
  6. **User Session Protection**: Session users derive tenant scope solely from server-side session cookies (`sessionContext.membership.tenantId`); caller-supplied query parameters are strictly ignored.
- **Verification**: Verified via `tests/phase2k1-p0-security.test.ts` (44/44 passing) and `tests/phase2k3-tenant-auth.test.ts` (40/40 passing).

### 2.3 Authentication Middleware Unblocking API & Webhooks
- **File Inspected**: `src/middleware.ts`.
- **Finding**: Line 136 checks `!isApiRoute` (`const isApiRoute = pathname.startsWith("/api/");`). Legitimate external calls to `/api/webhooks/n8n`, `/api/cron/outbox-dispatch`, `/api/compliance/due-obligations`, and `/api/documents/pending-requests` are no longer redirected to `/login`.
- **Public Routes Added**: `PUBLIC_ROUTES` explicitly includes `/accept-invite`, `/healthz`, and `/readyz` alongside `/login`, `/forgot-password`, and `/reset-password`.

### 2.4 Database Migration Baseline & Monetary Types
- **Files Inspected**: `prisma/schema.prisma`, `prisma/migrations/0_init/migration.sql`, `scripts/audit-baseline.js`.
- **Finding**:
  1. The baseline migration `0_init/migration.sql` contains `CREATE TABLE "Session"` and `CREATE TABLE "PasswordResetToken"`.
  2. All 17 monetary and tax fields are typed as `DECIMAL(12,2)` / `DECIMAL(5,2)` in both `schema.prisma` and `0_init/migration.sql`.
  3. There are **0 `DOUBLE PRECISION` columns** in the baseline migration (verified via `scripts/audit-baseline.js`).
  4. Remote database `_prisma_migrations` reports `0_init` applied and up to date.

### 2.5 Enterprise Team Management & RBAC Architecture
- **Files Inspected**: `src/lib/server/rbac/permissions.ts`, `src/lib/server/actions/team-actions.ts`, `src/lib/server/team/team-service.ts`, `src/app/team/page.tsx`, `src/app/team/TeamManagementClient.tsx`.
- **Finding**: Complete enterprise team management system featuring deny-by-default RBAC evaluation, sole-owner protection (`isSoleActiveOwner`), role promotion/demotion barriers, invitation revocation, resend functionality, and audit logging.
- **Verification**: Verified via `tests/team-rbac-invitation.test.ts` (33/33 passing) and `tests/security-pre-deployment-gate.test.ts` (26/26 passing).

### 2.6 Cryptographic Invitation & Onboarding Flow
- **Files Inspected**: `src/app/(auth)/accept-invite/page.tsx`, `src/lib/server/team/team-service.ts`.
- **Finding**: Invitations generate single-use 256-bit cryptographic tokens (`crypto.randomBytes(32)`), stored as SHA-256 hashes with 48-hour expiration. Atomic acceptance transaction creates User, Membership, and marks Invitation `ACCEPTED` while rejecting concurrent acceptance attempts.
- **Live Verification**: `https://truvledgeros2.vercel.app/accept-invite` is deployed and functional.

### 2.7 Deterministic Financial Math & Atomic Payments
- **Files Inspected**: `src/lib/financial/math.ts`, `src/lib/server/payment-service.ts`.
- **Finding**: Verified deterministic Indian GST intra-state vs inter-state routing, half-up paise precision (`roundToPaise`), strict overpayment rejection (`paymentAmount > remainingBalance`), and sequential FY invoice numbering (`TRUV/YYYY-YY/XXXX`).
- **Verification**: Verified via `tests/phase3-financial.test.ts` (20/20 passing).

---

## 3. Remaining P0 Security & Infrastructure Blockers

| ID | Severity | Category | Description & Impact | Exact Location |
| :--- | :---: | :---: | :--- | :--- |
| **SEC-P0-01** | **CRITICAL (P0)** | **Migration / Schema Drift** | **`model Invitation` and `enum InvitationStatus` are missing from migration history.** Although `model Invitation` was added to `schema.prisma` in commit `7c7c95e` and applied to Neon via `db push`, `prisma/migrations` only contains `0_init`. `scripts/verify-parity.js` empirically confirms `Invitation` and `InvitationStatus` are missing from the baseline. Any fresh clone, CI test pipeline, or staging deployment executing `prisma migrate deploy` will fail. | `prisma/schema.prisma:251`, `prisma/migrations/` |
| **SEC-P0-02** | **CRITICAL (P0)** | **Silent Delivery Failure / Token Loss Risk** | **`scripts/bootstrap-owner.ts` loses single-use onboarding URL when email is unconfigured.** If run with `--send-email --suppress-token`, the email service executes in `STANDBY_MODE` and returns `success: true`. The script assumes network delivery succeeded, suppresses the raw token from terminal logs, and does not print the setup URL. Because `RESEND_API_KEY` is empty, no email was sent, permanently stranding the invitation without any party having access to the activation link. | `scripts/bootstrap-owner.ts:201-209`, `src/lib/server/email/email-service.ts:84-94` |
| **SEC-P0-03** | **HIGH (P0/P1)** | **Unauthenticated Route / Mock Exposure** | **`/godmode` is an unauthenticated client route with no server-side role check.** The page simulates superadmin operations and tenant switching in client-side memory without verifying `GODMODE_ADMIN` role or active session server-side. If visited in production, it presents mock controls and firm cards. | `src/app/godmode/page.tsx`, `src/app/godmode/GodmodeClient.tsx` |

---

## 4. P1 Functional and Usability Issues

| ID | Component | Current Code State | What Is Missing / Disconnected |
| :--- | :--- | :--- | :--- |
| **UI-P1-01** | **GST Filing Sign-Off & ARN Submission** | `src/app/(dashboard)/gst/gst-row-actions.tsx` implements client sign-off dispatch and government ARN modal. | **Unmounted.** `gst-row-actions.tsx` is never imported in `GstClient.tsx`. Table column renders read-only `{r.arnNumber \|\| "—"}`. Practice staff cannot record ARNs or send client sign-offs. |
| **UI-P1-02** | **Task Workpaper Evidence & Reviewer Rejection** | Server actions `completeTaskWithEvidenceAction` (enforcing 5+ char note for GST/Audit) and `rejectTaskReviewAction` exist in `src/lib/server/actions/task-actions.ts`. | **Unconnected in UI.** `TasksClient.tsx` only calls basic `createTaskAction` and `updateTaskStatusAction`. Staff cannot attach completion evidence or reject review tasks with feedback. |
| **UI-P1-03** | **Document Vault Upload & Client Requests** | Server actions `createDocumentRequestAction`, `escalateDocumentRequestReminderAction`, and S3 presigned URL generator exist. | **Read-Only Table.** `DocumentsClient.tsx` has no file upload dialog or document request form; it is strictly a read-only list. |
| **UI-P1-04** | **Command Palette (`Ctrl + K`)** | `src/components/CommandPalette.tsx` exists (221 lines). | **Unmounted & Stale State.** It is never rendered in `topbar.tsx` or `app-shell.tsx`. Topbar search input has no event listener. Component queries legacy Zustand mock store instead of live DB. |
| **UI-P1-05** | **Static Mock Pages** | `/reports`, `/subscription`, `/communications` are 100% hardcoded static components. | No live database interaction; Excel export buttons and subscription upgrade buttons lack click handlers. |
| **CODE-P1-06** | **Legacy `(db as any)` TypeScript Casts** | `src/lib/auth/session.ts` and `src/lib/auth/actions.ts` use `(db as any).session` and `(db as any).passwordResetToken`. | Both models now exist in `schema.prisma` and generated Prisma client. The `(db as any)` casts bypass type safety unnecessarily. |
| **UI-P1-07** | **Topbar Notification Link** | `src/components/layout/topbar.tsx:107` has a bell icon. | Static anchor tag pointing to `/tasks` with decorative red dot. No real notification dropdown or mark-as-read state. |

---

## 5. Owner Invitation Readiness Assessment

### Overall Verdict: ⚠️ **FAIL (BLOCKED FOR AUTOMATED EMAIL; CONDITIONAL PASS FOR MANUAL TERMINAL HANDOFF)**

```
                                [Owner Invitation Gate]
                                           |
                         Is us7907us@gmail.com in DB?
                                           |
                                   NO (Fresh Setup)
                                           |
                         Does Target Tenant Exist?
                                           |
                              YES ("truv-demo-ca", Active)
                                           |
                         Is Email Provider Ready?
                                      /         \
                                    NO           YES
                                   /               \
                       [Direct Network Email]    [Delivery Succeeded]
                              BLOCKED                   READY
                                 |
                 Can Use Secure Terminal Handoff?
                                 |
                 YES (npx ts-node ... --invite --execute)
                 (Outputs private link to secure terminal)
```

### Detailed Evaluation:
1. **Intended Owner Status**: User `us7907us@gmail.com` **does not exist** in the database (verified via read-only inspection `prisma.user.findUnique({ where: { email: 'us7907us@gmail.com' } })` -> `null`).
2. **Practice Tenant Status**: Target tenant `truv-demo-ca` exists (`id: cmv3qbc2900016k484ty6djm8`, `active: true`, `isSuspended: false`).
3. **Current Tenant Ownership**: Active owner is `Priya Kulkarni, FCA` (`priya.kulkarni@truvdemo.in`). The system supports multiple co-owners without conflict.
4. **Email Delivery Blocker**: `RESEND_API_KEY` is unconfigured (`false`). Any attempt to dispatch an invitation email falls back to `STANDBY_MODE` and does not transmit over the network.
5. **Token Suppression Danger**: Running `scripts/bootstrap-owner.ts --invite --send-email --suppress-token --execute` will suppress the token, log a standby message, and discard the link. The owner will never receive it.
6. **Available Safe Path**: The single-use invitation path **is fully functional** if executed in **Manual Terminal Output Mode** (`--invite --execute` without `--send-email` and without `--suppress-token`). This generates the 48-hour URL (`https://truvledgeros2.vercel.app/accept-invite?token=<hex>`), which can be provided directly to the owner over an encrypted, private channel.

---

## 6. Email Provider Readiness Assessment

| Configuration Variable | Configured in `.env`? | Status / Evaluation |
| :--- | :---: | :--- |
| `RESEND_API_KEY` | **NO** (`false`) | Unconfigured. Email service defaults to fail-safe `STANDBY_MODE`. No emails are transmitted. |
| `EMAIL_FROM` | **NO** (`false`) | Unconfigured. Service falls back to `"TRUV LedgerOS <onboarding@resend.dev>"`. |
| `APP_BASE_URL` | **NO** (`false`) | Unconfigured. Service falls back to `"https://truvledgeros2.vercel.app"`. |

### Security Evaluation:
- **No Secret Leakage**: Zero environment secrets, database connection strings, or keys were exposed in logs or reports.
- **Fail-Safe Behavior**: `src/lib/server/email/email-service.ts` does not crash when `RESEND_API_KEY` is missing. It safely logs `[EMAIL-STANDBY] To: <email>` and returns `{ success: true, status: "STANDBY_MODE" }`.
- **Pre-requisite for Email-Based Invitations**: Before enabling automated email invitations, a valid Resend API key and verified sending domain (or Resend onboarding sender) must be added to `.env` and Vercel Environment Variables.

---

## 7. Test and Build Verification Results

Every check executed was strictly non-mutating and verified with exit codes:

| Verification Suite / Command | Scope | Result | Exit Code | Evidence Summary |
| :--- | :--- | :---: | :---: | :--- |
| `npm run typecheck` (`tsc --noEmit`) | Full TypeScript codebase | **PASS** | `0` | Zero type errors across all routes and libraries. |
| `npm run lint` (`next lint`) | Full Next.js ESLint ruleset | **PASS** | `0` | Clean run; 0 warnings, 0 errors. |
| `npx prisma validate` | `prisma/schema.prisma` | **PASS** | `0` | Schema is structurally valid. |
| `npx prisma migrate status` | Neon PostgreSQL migrations | **PASS** | `0` | Remote DB schema up to date with 1 migration recorded. |
| `npm run build` (`next build`) | Next.js 14 production bundle | **PASS** | `0` | All 34 routes compiled; 29 static pages generated; Middleware bundled at 42.1 kB. |
| `tests/login-security-hotfix.test.ts` | Login security regression | **PASS** | `0` | 13/13 assertions passed (demo login controls removed). |
| `tests/phase2k1-p0-security.test.ts` | P0 M2M & API tenant isolation | **PASS** | `0` | 44/44 assertions passed (unscoped query prevention, fail-closed). |
| `tests/phase2k3-tenant-auth.test.ts` | Tenant-bound M2M credentials | **PASS** | `0` | 40/40 assertions passed (cross-tenant blocking, HMAC freshness). |
| `tests/team-rbac-invitation.test.ts` | Team RBAC & token entropy | **PASS** | `0` | 33/33 assertions passed (deny-by-default, owner protection). |
| `tests/security-pre-deployment-gate.test.ts` | Pre-deployment security gate | **PASS** | `0` | 26/26 assertions passed (atomic invitation acceptance concurrency). |
| `tests/phase3-financial.test.ts` | Deterministic financial math | **PASS** | `0` | 20/20 assertions passed (GST split, overpayment rejection). |
| `tests/bulk-import.test.ts` | CSV import security & injection | **PASS** | `0` | 36/36 assertions passed (formula injection escaping, duplicate PAN). |

---

## 8. Ordered Remediation Plan

Work must proceed strictly in order, starting with P0 infrastructure and tenant security:

### Step 1: Formalize Database Migration for `Invitation` Model (P0)
- **Objective**: Eliminate migration drift so CI/CD and new environments do not fail.
- **Action**: Generate migration SQL for `model Invitation` and `enum InvitationStatus` via `prisma migrate diff --from-empty` or target migration, and store in `prisma/migrations/20261015_add_invitation_model/migration.sql`. Mark as applied on existing database via `prisma migrate resolve --applied`.

### Step 2: Fix Token Suppression Logic in `scripts/bootstrap-owner.ts` (P0)
- **Objective**: Prevent accidental loss of owner onboarding links.
- **Action**: Check `emailResult.status === "SENT"` before suppressing token. If `emailResult.status === "STANDBY_MODE"`, print warning: *"Email provider in standby mode. Displaying setup URL directly."* and output the URL. Commit uncommitted changes to `scripts/bootstrap-owner.ts`.

### Step 3: Secure or Remove `/godmode` Route (P0)
- **Objective**: Prevent unauthenticated exposure of mock superadmin screens.
- **Action**: Add server-side guard `const context = await requireRole([Role.GODMODE_ADMIN]);` in `src/app/godmode/page.tsx` or restrict route entirely in production.

### Step 4: Configure Email Provider or Authorize Terminal Handoff (P0/P1)
- **Objective**: Enable secure delivery of invitations.
- **Action**: Either supply `RESEND_API_KEY` in environment, or confirm that owner onboarding will be performed via terminal token handoff.

### Step 5: Mount `gst-row-actions.tsx` into `GstClient.tsx` (P1)
- **Objective**: Enable GST return client sign-off and government ARN recording.
- **Action**: Import `GstReturnRowActions` into `src/app/(dashboard)/gst/GstClient.tsx` and replace read-only ARN column with actionable row component.

### Step 6: Connect Task Completion Evidence & Review Rejection (P1)
- **Objective**: Enforce workpaper accountability for statutory compliance tasks.
- **Action**: Connect `completeTaskWithEvidenceAction` (resolution note modal) and `rejectTaskReviewAction` (review feedback prompt) in `src/app/(dashboard)/tasks/TasksClient.tsx`.

### Step 7: Wire Document Vault Upload & Request Dialogs (P1)
- **Objective**: Enable document upload and client document request workflows.
- **Action**: Connect `createDocumentRequestAction` and S3 presigned upload handler to UI in `src/app/(dashboard)/documents/DocumentsClient.tsx`.

### Step 8: Mount Live Command Palette (`Ctrl + K`) (P1)
- **Objective**: Provide keyboard-driven practice navigation.
- **Action**: Connect `CommandPalette` to `topbar.tsx` on `Ctrl + K`, replace Zustand mock store with server API route (`/api/search`).

### Step 9: Type Clean-Up for `(db as any)` Casts (P1)
- **Objective**: Restore 100% strict TypeScript safety on Prisma client.
- **Action**: Remove `(db as any)` in `src/lib/auth/session.ts` (`db.session`) and `src/lib/auth/actions.ts` (`db.passwordResetToken`).

---

## 9. Exact Next Action Requiring User Approval

To proceed safely with owner onboarding and platform hardening, please review and select from the following options:

### **Choice A (Recommended — Direct Terminal Invitation Handoff)**:
Run the owner bootstrap utility without email dependency to generate a live, cryptographically secure 48-hour setup URL printed directly in your private terminal:
```powershell
npx ts-node -r tsconfig-paths/register scripts/bootstrap-owner.ts --invite --execute
```
*You will receive the private link `https://truvledgeros2.vercel.app/accept-invite?token=<TOKEN>` to deliver to `us7907us@gmail.com` via private channel.*

### **Choice B (Configure Email Provider First)**:
Supply a valid `RESEND_API_KEY` and verified `EMAIL_FROM` address to `.env` so invitations can be dispatched over the network automatically.

### **Choice C (Remediate P0 Migration Drift First)**:
Generate and commit the official Prisma migration for `model Invitation` before creating any new invitations.

*Awaiting your explicit selection to proceed.*
