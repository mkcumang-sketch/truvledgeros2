# TRUV CA / TRUV LedgerOS — Deployment Truth Report (Phase 0)

**Date**: 2026-10-30  
**Deployment Target**: Vercel (Production / Preview) & Railway PostgreSQL  
**Audit Standard**: Rigorous Separation of Localhost vs Production Verification  

---

## 1. Git Repository & Branch State

| Branch | Local Commit | Remote Tracking | Status |
| :--- | :--- | :--- | :--- |
| `main` | `11f32be` | `origin/main` (`11f32be`) | Exact match (0 ahead, 0 behind) |
| `staging-preview` | `11f32be` | `origin/staging-preview` (`11f32be`) | Exact match (0 ahead, 0 behind) |

- **Remote URL**: `https://github.com/mkcumang-sketch/truvledgeros2.git`
- **Latest Commit Title**: `fix: change cron schedule to daily for vercel hobby plan`
- **Uncommitted Code Modifications**: Local remediation files strictly preserved for test and database stability:
  - `src/lib/db.ts` & `src/lib/prisma.ts` (Prisma singleton pool hygiene)
  - `src/lib/server/security/rate-limiter.ts` (in-memory test fallback, production fail-closed)
  - `src/lib/server/import/client-import-service.ts` (explicit transaction timeouts)
  - `tests/bulk-import.test.ts` & `tests/phase4-e2e-automation.test.ts` (test regression hotfixes)
  - `tests/calling-operations.test.ts` (singleton db import)

---

## 2. Infrastructure & Hosting Topology

### A. Application Layer: Vercel
- **Framework**: Next.js `14.2.18` (Server Actions, App Router, Route Handlers)
- **Node.js Runtime**: `20.x` / `22.x` on Vercel Edge/Serverless Lambdas
- **Cron Configuration (`vercel.json`)**:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/autonomous-daily",
        "schedule": "0 4 * * *"
      }
    ]
  }
  ```
  - Scheduled daily at `04:00 UTC` (`09:30 IST`) to conform to Vercel Hobby plan limitations while triggering morning autonomous practice routines.

### B. Database Layer: Railway PostgreSQL
- **Host**: `acela.proxy.rlwy.net:35942`
- **Database Engine**: PostgreSQL 16
- **Connection Configuration**:
  - `DATABASE_URL` query parameters: `?sslmode=require&connection_limit=15&pool_timeout=30`
  - Transaction settings: Explicit timeouts configured for batch workloads (`maxWait: 10000`, `timeout: 20000`) to absorb cloud proxy round-trip latency.
- **Migration History & Baselining**:
  - `0_init`: Marked applied (`npx prisma migrate resolve --applied 0_init`).
  - `20261014000000_add_team_invitations`: Marked applied (`npx prisma migrate resolve --applied 20261014000000_add_team_invitations`).
  - `20261029190000_add_calling_operations`: Successfully applied (`npx prisma migrate deploy`).
  - Schema Status: Fully up-to-date and in sync with Prisma schema.

### C. Cache & Rate Limiting: Upstash Redis
- Primary store for distributed rate limiting.
- Configured with strict fail-closed security for production workloads, with test-suite isolated in-memory fallback.

---

## 3. Production Environment Variable Requirements

The following environment variables are required for full production operation:

| Variable | Scope | Purpose | Status |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Server | PostgreSQL connection string | Active on Railway & Local |
| `SESSION_SECRET` | Server | Iron session cryptographic cookie secret | Configured |
| `CRON_SECRET` | Server | Bearer authentication for Vercel Cron | Configured |
| `SARVAM_API_KEY` | Server | Sarvam AI conversational telephony API | Configured |
| `SARVAM_AGENT_ID` | Server | Sarvam AI telephony agent identifier | Configured |
| `WHATSAPP_PHONE_NUMBER_ID`| Server | Meta WhatsApp Business phone number ID | Blocked / Optional Standby |
| `WHATSAPP_ACCESS_TOKEN` | Server | Meta WhatsApp Business system user token | Blocked / Optional Standby |
| `SMTP_HOST` / `SMTP_USER`| Server | Transactional email delivery | Configured / Standby Guard |

---

## 4. Production Verification Boundary & Truth Assessment

> [!IMPORTANT]
> **Verification Boundary Rule**:
> Successful local execution and passing unit/integration test suites against the Railway database prove **software correctness and data layer integrity**.
> They do **not** constitute proof of live Vercel production deployment until:
> 1. The code changes are staged, committed, and pushed to `main`.
> 2. Vercel deployment pipeline finishes with a successful production build.
> 3. Production domain routes return HTTP 200 with live SSL certificates.
> 4. Webhook endpoints respond to live provider ping events.

**Current Deployment Truth**:
- Local & Database Layer: **Verified & Operational**.
- Production Cloud Runtime: **Deployment Status Unknown** (pending git commit, push, and Vercel build run).
