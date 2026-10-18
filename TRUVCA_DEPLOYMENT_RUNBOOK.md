# TRUVCA LedgerOS — Staging & Production Deployment Runbook

**Classification:** DevOps Engineering Standard & Release Deployment Guide  
**Target Runtime:** Node.js 20 LTS | Next.js 14.2.18 (Standalone or Serverless) | PostgreSQL 15+  
**Release Readiness:** CONFIGURATION-READY FOR STAGING

---

## 1. Supported Deployment Topologies

TRUVCA LedgerOS is architected for two production-grade deployment models:

### Option A: Managed Cloud Platform (Vercel + Managed PostgreSQL)
- **Frontend / API:** Vercel Pro (Node.js 20 Serverless Runtime).
- **Database:** AWS RDS PostgreSQL, Supabase, or Neon (PostgreSQL 15+).
- **Connection Pooler:** PgBouncer or Supabase Transaction Pooler (`?pgbouncer=true&connection_limit=20`).
- **File Storage:** AWS S3 (Bucket: `truv-vault-prod`) or Cloudflare R2.
- **Cache / Rate Limiting:** Upstash Redis or AWS ElastiCache.

### Option B: Self-Hosted Container Cluster (Docker / Kubernetes / VPS)
- **Container Base:** `node:20-alpine` with multi-stage standalone Next.js build.
- **Database:** Dedicated PostgreSQL 15+ instance with SSD storage and automated WAL archiving.
- **Reverse Proxy:** NGINX or Caddy handling TLS termination and HTTP/2.
- **Cron Orchestration:** Linux crontab or Kubernetes CronJob calling `/api/cron/outbox-dispatch`.

---

## 2. Environment Provisioning Checklist

Prior to initiating deployment, configure these environment variables in your secret manager (AWS Secrets Manager, Vercel Environment Variables, or Doppler):

| Variable | Staging Setting | Production Setting |
| :--- | :--- | :--- |
| `NODE_ENV` | `staging` | `production` |
| `APP_BASE_URL` | `https://staging.truvledgeros.in` | `https://app.truvledgeros.in` |
| `NEXT_PUBLIC_APP_URL` | `https://staging.truvledgeros.in` | `https://app.truvledgeros.in` |
| `DATABASE_URL` | Staging PostgreSQL connection string | Production PostgreSQL connection string |
| `DIRECT_URL` | Direct connection (bypassing pooler) | Direct connection (bypassing pooler) |
| `ENCRYPTION_KEY` | 64-hex-char staging master key | 64-hex-char production master key |
| `RESEND_API_KEY` | Test Resend API key or leave empty (Standby) | Production Resend API key |
| `EMAIL_FROM` | `TRUV Staging <notifications@truvledgeros.in>` | `TRUV LedgerOS <notifications@truvledgeros.in>` |
| `AWS_ACCESS_KEY_ID` | IAM User credentials with S3 access | IAM User credentials with S3 access |
| `AWS_SECRET_ACCESS_KEY` | IAM Secret | IAM Secret |
| `S3_BUCKET_NAME` | `truv-vault-staging` | `truv-vault-prod` |
| `CRON_SECRET` | 48-char hex secret | 48-char hex secret |
| `REDIS_URL` | Staging Redis URI | Production Redis URI |

---

## 3. Step-by-Step Staging Deployment Procedure

### Step 1: Preflight Code Quality & Compilation Gate
Execute locally or in your CI/CD runner:
```bash
# 1. Typecheck
npm run typecheck

# 2. Linting
npm run lint

# 3. Prisma Schema Check
npm run prisma:validate

# 4. Automated Tests
npm test

# 5. Environment Validation
npm run env:validate
```
*Rule: If any command exits with non-zero status, halt deployment immediately.*

### Step 2: Database Migration Deployment
```bash
# Verify connectivity
npm run db:readiness

# Deploy migrations to staging database
npx prisma migrate deploy
```

### Step 3: Application Build & Asset Generation
```bash
# Generate optimized production build
npx next build
```

### Step 4: Health & Readiness Verification
Once deployed and running, issue HTTP GET requests to the health endpoints:
```bash
# 1. Liveness check (Expect 200 OK)
curl -s -i https://staging.truvledgeros.in/healthz

# 2. Database readiness check (Expect 200 OK)
curl -s -i https://staging.truvledgeros.in/readyz
```

---

## 4. Post-Deployment Smoke Test Protocol

Perform this manual verification sequence in a real browser on the staging deployment:

1. **Public Marketing & Consultation Flow:**
   - Navigate to `/` — verify video canvas renders, header links work, enquiry modal opens, and submitting an enquiry succeeds.
2. **Firm Login & Session Establishment:**
   - Log in as the test managing partner — verify cookie `truv_session` is set with `HttpOnly`, `Secure`, `SameSite=Lax`.
3. **Role-Based Access Control:**
   - Attempt to access `/godmode` as a regular firm owner — verify immediate redirect to `/dashboard` with audit entry.
4. **Maker-Checker Task Review:**
   - Preparer submits a task for partner review — verify partner can approve or reject with mandatory feedback.
5. **Sequential GST Invoicing:**
   - Generate a draft invoice — verify auto-increment sequence `TRUV/YYYY-YY/XXXX`.
   - Record a partial payment — verify remaining balance updates atomically.
6. **Workpaper Document Upload:**
   - Upload a sample PDF — verify magic bytes validation passes and file is stored in tenant-isolated S3 path.

---

## 5. Promotion Checklist (Staging to Production)

- [ ] All 16 automated test suites passed (412/412 tests).
- [ ] Post-deployment smoke tests completed successfully in staging.
- [ ] Production database snapshot verified and tested for restore.
- [ ] Production encryption keys (`ENCRYPTION_KEY`, `ENCRYPTION_KEY_M2M`) backed up in offline vault.
- [ ] DNS A/CNAME records configured with Cloudflare or target CDN with SSL full/strict mode.
- [ ] Production cron job configured to ping `/api/cron/outbox-dispatch` every 5 minutes with `CRON_SECRET`.
- [ ] Sentry / Datadog error monitoring alert channels verified in Slack / email.
- [ ] Pilot CA firm partners briefed on pilot onboarding window.
