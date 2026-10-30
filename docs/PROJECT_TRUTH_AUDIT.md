# TRUV CA / TRUV LedgerOS — Project Truth Audit (Phase 0)

**Date**: 2026-10-30  
**Classification**: Enterprise Security & Architecture Audit  
**Status**: Authoritative Verified Audit  

---

## 1. Executive Summary

This document establishes the verified truth of the **TRUV CA / TRUV LedgerOS** codebase, environment configuration, database state, provider integrations, and runtime behavior. This audit was conducted following strict non-destructive, read-first protocols.

---

## 2. Repository & Workspace Truth

| Attribute | Verified Value |
| :--- | :--- |
| **Workspace Root** | `C:\Users\imris\OneDrive\Desktop\TRUVCA` |
| **Git Repository Root** | `C:\Users\imris\OneDrive\Desktop\TRUVCA\TRUVCA` |
| **Git Remote (`origin`)** | `https://github.com/mkcumang-sketch/truvledgeros2.git` |
| **Active Branch** | `main` |
| **Secondary Branches** | `staging-preview`, `remotes/origin/main`, `remotes/origin/staging-preview` |
| **HEAD Commit** | `11f32be` (*"fix: change cron schedule to daily for vercel hobby plan"*) |
| **Upstream Alignment** | Exact match with `origin/main` (`11f32be`) — 0 ahead, 0 behind |
| **Working Tree Modifications** | 8 modified files (remediation & test stabilization), 3 docs, 2 helper scripts, 1 test script |

### Working Tree File Status (Protected & Tracked)
- **Modified (Stabilization & Defect Fixes)**:
  - `src/lib/db.ts` — Added unified singleton export (`export { db as prisma, db }`)
  - `src/lib/prisma.ts` — Re-exports singleton instance to prevent connection leak
  - `src/lib/server/import/client-import-service.ts` — Configured explicit transaction timeout `{ maxWait: 10000, timeout: 20000 }`
  - `src/lib/server/security/rate-limiter.ts` — Handled test environment fallback to in-memory store when Redis unreachable in test suites while preserving strict fail-closed production defense
  - `tests/bulk-import.test.ts` — Configured explicit transaction options to prevent connection pool starvation
  - `tests/calling-operations.test.ts` — Replaced duplicate `new PrismaClient()` with singleton `db` import
  - `tests/phase4-e2e-automation.test.ts` — Fixed regression where pre-existing DB GST return record preserved `READY_FOR_REVIEW` state
  - `scripts/run-all-tests.js` — Injected `NODE_ENV=test` into child test runners
- **Untracked Additions**:
  - `src/lib/server/db.ts` — Alias re-export of `@/lib/db`
  - `scripts/run-test.js` — Single test runner helper utility
  - `test_sarvam.py` — Local voice provider sandbox script
  - `docs/PROJECT_TRUTH_AUDIT.md`, `docs/FEATURE_IMPLEMENTATION_MATRIX.md`, `docs/DEPLOYMENT_TRUTH_REPORT.md`

---

## 3. Technology Stack & Runtime Configuration

- **Framework**: Next.js `14.2.18` (App Router)
- **Runtime**: Node.js `v26.13.0`
- **Package Manager**: npm `11.20.0`
- **ORM**: Prisma `5.22.0`
- **Database Engine**: PostgreSQL on Railway (accessed via proxy `acela.proxy.rlwy.net:35942`)
- **Hosting Target**: Vercel (Production / Preview)
- **Cron Engine**: Vercel Cron (`vercel.json`), daily schedule at `03:30 UTC` / `09:00 IST`

---

## 4. Database Schema, Migrations & Baselining State

### Migration History & Resolution
1. **`0_init`**: Initial migration containing baseline tables (`User`, `Tenant`, `Client`, `Invoice`, `Task`, `GstReturn`, `Communication`, etc.). Baselined via `prisma migrate resolve --applied 0_init`.
2. **`20261014000000_add_team_invitations`**: Adds `TeamInvitation` table and `InvitationStatus` enum. Resolved via `prisma migrate resolve --applied 20261014000000_add_team_invitations`.
3. **`20261029190000_add_calling_operations`**: Adds calling operations tables (`CallingCampaign`, `ScheduledCall`, calling window fields, language preferences). Successfully deployed via `prisma migrate deploy`.
4. **Current Status**: `npx prisma migrate status` reports: **Database schema is up to date!**

### Railway Connection Pool & Latency Hardening
- **Pool Connection Limit**: Tuned via `DATABASE_URL` query parameter `&connection_limit=15&pool_timeout=30`.
- **Transaction Timeouts**: Remote latency across cloud proxy requires batch and transactional operations to configure `{ maxWait: 10000, timeout: 20000 }` instead of default 5s Prisma interactive transaction timeouts (`P2028`).
- **Singleton Connection Hygiene**: Consolidated all Prisma instantiations across `src/lib/db.ts`, `src/lib/prisma.ts`, `src/lib/server/db.ts`, and test harnesses to share a single global pool.

---

## 5. Security & Isolation Architecture

- **Multi-Tenant Isolation**: Enforced via `requireTenant()` middleware session extraction, validating `tenantId` in every Prisma query (`where: { tenantId }`).
- **RBAC Matrix**: 4 tiers:
  - `PARTNER` / `ADMIN`: Full authority, financial approval, threshold sign-offs, campaign authorization.
  - `MANAGER`: Workflow orchestration, task assignment, communication dispatch.
  - `ASSOCIATE` / `PREPARER`: Workpaper preparation, draft data entry, strictly barred from partner sign-offs.
  - `AUDITOR` / `CLIENT`: Read-only views of specific statutory records.
- **Webhook & Cron Authentication**:
  - Webhooks validate HMAC SHA-256 signatures with replay protection (5-minute timestamp skew window).
  - Cron endpoints enforce `CRON_SECRET` authorization bearer headers.
- **Rate Limiting**: Tiered IP and user rate limiting with Upstash Redis integration and fail-closed defense in production.
- **Zero Secrets Disclosure Policy**: No credentials, private keys, database passwords, or auth tokens are committed or printed in logs.

---

## 6. Architecture & Integration Audit Summary

### A. Telephony & Calling Operations (Sarvam AI)
- **Implementation**: Located at `src/lib/server/voice/sarvam-telephony.ts`, `src/lib/server/voice/campaign-service.ts`, `src/lib/server/voice/scheduler.ts`.
- **Capabilities**:
  - Outbound conversational telephony via Sarvam AI API.
  - Campaign creation wizard with regulatory calling window enforcement (default 10:00 to 18:00 IST), max retry limits, and Indian language preferences (`HINGLISH`, `HINDI`, `ENGLISH`).
  - DNC (Do Not Call) list verification and active client consent checks.
  - Dual-transcript logging with speaker tagging (`TRUV Sarvam AI Agent` vs `Client`).
  - Audio recording URL capture and sentiment analysis (`DISPUTING`, `PROMISED_TO_PAY`, `COOPERATIVE`, `UNRESPONSIVE`).
  - Follow-up task generation on unanswered or disputed calls.

### B. WhatsApp Integration
- **Implementation**: `src/lib/server/whatsapp/whatsapp-service.ts`.
- **Capabilities**: Template and freeform messaging via WhatsApp Business Cloud API, phone normalization (E.164), fallback to SMS/Email standby when unconfigured.

### C. Direct Email & Standby Protection
- **Implementation**: `src/lib/server/email/email-service.ts`, `src/lib/server/email/standby-guard.ts`.
- **Capabilities**: Standby guard protects test/staging environments from accidentally sending unsolicited messages to real clients. In production, dispatches via SMTP / Resend.

### D. Compliance & Practice Accounting
- **Implementation**: `src/lib/server/invoice-service.ts`, `src/lib/server/pdf/tax-invoice-generator.ts`, `src/lib/server/financial-analytics.ts`.
- **Capabilities**: Complete GST billing, sequential numbering (`TRUV/YY-YY/XXXX`), GSTR-1 / GSTR-3B statutory filing workflow tracking, client 360 overview.

---

## 7. Next Steps & Phase Progression
1. Confirm 100% pass across all 18 test suites in `scripts/run-all-tests.js`.
2. Maintain implementation matrix and deployment reports.
3. Advance to Omnichannel Command Center and AI Calling enhancements as needed.
