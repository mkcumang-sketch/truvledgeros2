# TRUV LedgerOS — Current Production Readiness Status

**Last reviewed:** 13 November 2026  
**Repository:** mkcumang-sketch/truvledgeros2  
**Release branch:** production-readiness/fix-migration-docs-2026-11  
**Base:** main at b4375b9fccac26d3db36a2f2605fde5dd1929f52  
**Status:** REMEDIATION IN PROGRESS — NOT APPROVED FOR PRODUCTION DEPLOYMENT

This is the current source of truth for release decisions. Older phase reports and QA summaries are historical evidence from their stated dates. Their earlier PASS counts, route counts, deployment claims, and “zero blockers” conclusions must not be treated as current verification.

## Executive decision

Do not merge this remediation branch to main, run production migrations, or promote a deployment until the release gates below are complete.

The latest main-branch CI run observed during this review (run 43412039472) passed dependency reporting, Prisma validation, TypeScript and lint, but failed while applying migrations to the isolated CI PostgreSQL database. The failing SQL was the new reconciliation migration’s malformed PostgreSQL DO-block delimiter. The delimiter has been corrected on the release branch. A new CI result is still required; no test or build pass is claimed here.

No production database migration, production secret change, data deletion, merge, or production deployment was performed as part of this remediation.

## Documentation review

All 62 Markdown paths in the current release-branch tree were enumerated and reviewed. They represent 48 unique contents because several phase reports are duplicated between the repository root and docs folder. The two current release-authority documents are included in this count.

The documentation set contains historical claims that conflict with the current implementation, including:
- Older QA reports claim 393/393 or 495 assertions passed and zero release blockers. Those results are date-bound and do not validate the current main commit.
- Older environment documentation describes local-disk document storage and in-memory rate-limit fallback as acceptable deployment behavior. Current storage code intentionally fails closed without persistent S3-compatible storage, and production authentication throttling must fail closed without Redis.
- Older release notes describe staging/configuration readiness, not current production verification.
- Some route and feature inventories describe mock, simulated, or provider-blocked functionality as completed. Verify the current route and provider behavior before external launch.
- Backup/restore and migration-baseline reports are historical. They do not substitute for a fresh backup, restore drill, or production migration preflight.

Use this document and the deployment checklist below for current release decisions. Preserve older reports as historical audit artifacts rather than rewriting their original findings.

## Changes made on the remediation branch

| File | Change | Why it matters |
|---|---|---|
| prisma/migrations/20261113090000_reconcile_user_and_communication_schema/migration.sql | Corrected PostgreSQL DO block delimiters to valid dollar-quoted blocks. Kept unknown Communication.status values as a hard migration failure rather than silently converting historical data. | Fixes the observed CI migration syntax failure while preserving data safety. |
| src/lib/auth/actions.ts | Password reset now returns the same generic response for existing and non-existing accounts; raw reset URLs are never returned to the browser; reset requests and redemptions are rate-limited by IP as well as email/token; User-row and PasswordResetToken-row claims are atomically consumed; session revocation is part of the transaction. | Prevents account enumeration, reset-token disclosure, concurrent token reuse, and password changes that leave old sessions active. |
| src/app/(auth)/forgot-password/page.tsx | Updated the client page to handle the new typed response, remove “Account Not Found” messaging and avoid claiming that an email was dispatched or displaying a false “Sent to” confirmation. | Keeps the UI consistent with generic account-reset behavior and provider standby/failure states. |
| src/lib/server/security/upstash-rate-limiter.ts | Production login rate limiting fails closed when Redis/Upstash is unavailable instead of silently using per-instance memory. | Prevents serverless instance scaling from bypassing authentication throttling. |
| src/lib/server/env.ts | Reports schema parsing errors; validates deployed-runtime requirements for HTTPS APP_BASE_URL, DIRECT_URL, CRON_SECRET, Redis, S3 storage, transactional email, ENCRYPTION_KEY, ENCRYPTION_KEY_M2M and TOKEN_PEPPER; accurately describes fail-closed storage/rate-limit behavior; masks SMTP account identity. | Prevents a deployment from being labelled valid while critical services are absent or key material is unusable. |
| tests/password-reset-concurrency.test.ts | Added regression coverage for generic account-reset responses, absence of resetUrl in the action result, stored token digests, and atomic User-row token consumption. | Guards the password-reset security fixes. |
| tests/env-validation.test.ts | Added staging/production infrastructure prerequisite checks, including missing Redis, S3 and email configuration. | Guards environment validation against future weakening. |
| tests/login-rate-limiter-fail-closed.test.ts | Added a dedicated production fail-closed test for missing Redis. | Verifies the login limiter does not silently downgrade in production. |
| scripts/seed.ts | Disabled this demo/admin seed in staging and production; removed the built-in default password and stopped printing seed passwords. | Prevents accidental creation or credential reset of demo/platform admin accounts in a live database. |
| prisma/seed.ts | Disabled demo-firm and fixture seeding in production. | Prevents accidental insertion of demo users, clients and records into a live practice database. |
| src/lib/server/email/email-service.ts | Corrected password-reset email copy to match the actual one-hour token expiry. | Removes contradictory security instructions in the email. |\n| src/components/layout/mobile-bottom-nav.tsx | Added a phone-first bottom navigation bar for Home, Clients, Invoices and Payments, with a More panel that opens the complete module drawer. Includes active-route state and safe-area-aware positioning. | Makes core workflows reachable by thumb on Android/iPhone without hiding secondary modules. |\n| src/components/layout/app-shell.tsx | Uses dynamic viewport sizing and reserves mobile bottom-navigation space while retaining the desktop sidebar layout. | Avoids mobile browser viewport/gesture-bar overlap and content hidden behind navigation. |\n| src/app/globals.css | Added mobile viewport, overscroll and touch-target defaults. | Improves touch interaction and mobile viewport stability. |\n| src/components/ui/metric-card.tsx | Reduced KPI card padding and type scale at phone breakpoints. | Keeps financial metrics readable in a compact two-column phone dashboard. |\n| src/app/(dashboard)/dashboard/page.tsx | Changed the KPI grid to two columns on phones, retaining the four-column desktop layout. | Reduces unnecessary vertical scrolling while preserving the larger-screen layout. |\n| src/components/layout/topbar.tsx | Hides the secondary AI shortcut on extra-narrow screens while retaining it on wider phones and desktop. | Prevents header controls from crowding or overflowing small phone widths. |\n| tests/password-reset-concurrency.test.ts | Narrows discriminated action-result unions before reading error messages. | Fixes a strict TypeScript compilation failure in CI. |\n| prisma/migrations/20261113090000_reconcile_user_and_communication_schema/migration.sql | Adds the missing Communication.durationSeconds column idempotently during schema reconciliation. | Fixes the current CI runtime failure where the generated Prisma client queried a missing column after migrations. |
| .env.example | Clarified which infrastructure variables are mandatory in staging/production and that in-memory fallback is development/test only. | Makes deployment setup instructions match runtime enforcement. |

The exact commit list is available in the release branch history. CI is the source of truth for whether these changes compile and pass.

## Required deployed environment

The environment validator now requires the following for staging and production:

| Variable | Requirement | Purpose |
|---|---|---|
| DATABASE_URL | PostgreSQL application connection | Application data |
| DIRECT_URL | Direct PostgreSQL connection | Prisma migration operations |
| APP_BASE_URL | Canonical HTTPS URL | Password-reset and invitation links |
| ENCRYPTION_KEY | Exactly 64 hexadecimal characters | Credential encryption |
| ENCRYPTION_KEY_M2M | Exactly 64 hexadecimal characters | Active machine-to-machine keyring |
| TOKEN_PEPPER | Exactly 64 hexadecimal characters | Machine-token digest peppering |
| REDIS_URL | Reachable Redis instance | Distributed rate limiting; production auth fails closed without it |
| AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY | Credentials for private persistent S3-compatible storage | Document Vault uploads and downloads |
| SMTP_USER + SMTP_PASS, or RESEND_API_KEY | Working transactional email provider | Password reset, invitations and notices |
| CRON_SECRET | At least 32 characters | Authenticated scheduled work |

Use independently generated secrets for each key. Never paste secret values into chat, commit them, or include them in screenshots or diagnostic output. Verify only variable names and masked configuration state.

Optional integrations such as WhatsApp Business, Razorpay, GSTN/GSP, and e-sign providers remain commercially or externally gated. Do not advertise those integrations as live until the respective provider approval and real end-to-end delivery are verified.

## Migration safety notes

The reconciliation migration:
1. Adds User reset-token columns if they are absent.
2. Creates CommunicationStatus if it does not exist.
3. Checks existing Communication.status values against the enum.
4. Aborts if any historical status is unknown.
5. Converts the status column to the enum and sets the default.

Before applying this migration to any existing database, run a read-only query to list distinct Communication.status values and compare them with: DRAFT, ANSWERED, QUEUED, INITIATED, SENT, DELIVERED, FAILED, BOUNCED, STANDBY. Resolve unknown values with an explicit reviewed mapping; do not weaken the migration by silently changing data.

The migration must first pass against a clean isolated PostgreSQL database in CI and a disposable staging database. Production migration is a separate approved operation after backup and rollback planning.

## Remaining release gates

- [ ] New CI run passes migration application, fixture seed, every test suite and Next.js production build. The latest observed run (43416417035) failed: 3 of 36 suites failed (password-reset test TypeScript narrowing, missing Communication.durationSeconds after migrations, and credential-migration audit-log assertion). Two known failures have been corrected on this branch; the credential-migration assertion remains under investigation and a fresh CI run is required.
- [ ] Review CI logs for any skipped tests, flaky tests, audit findings or ignored failures.
- [ ] Confirm the release-branch Vercel preview is built from the exact latest commit.
- [ ] Run authenticated browser smoke tests on the preview: login, logout, client isolation, invoices, tasks, GST actions, Document Vault, password reset and mobile layout. Phone-first bottom navigation, compact two-column KPIs and narrow-screen topbar behavior are implemented in the release branch but still need real-device/browser verification at 360px, 390px and 430px widths.
- [ ] Configure and verify the production environment variables listed above without exposing values.
- [ ] Test private S3 upload, tenant-scoped download, invalid MIME rejection, oversized-file rejection and cross-tenant denial on preview.
- [ ] Verify a real transactional email reaches a controlled test inbox; standby mode is not delivery.
- [ ] Verify Redis-backed login/reset throttling and that a Redis outage fails closed.
- [ ] Verify scheduled cron authentication and one successful non-destructive outbox run.
- [ ] Take a fresh production database backup and complete a restore drill into a disposable database.
- [ ] Review live test/demo records and repository PDFs for data hygiene. Do not delete records or rewrite Git history without an explicit approved plan.
- [ ] Compare production migration history and current schema read-only; confirm the unknown Communication.status check is clean.
- [ ] Prepare and review a production migration/rollback plan.
- [ ] Obtain explicit approval before production merge, migration or deployment.

## Deployment rule

A green CI run and a working preview are necessary, not sufficient. Production readiness also requires verified production configuration, persistent storage, email delivery, distributed rate limiting, backup/restore evidence, and a safe migration plan. No production operation is authorized by this document alone.
