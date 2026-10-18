# TRUVCA LedgerOS — Environment Configuration Matrix

**Classification:** Infrastructure, DevOps & Operational Security Standard  
**Validation Utility:** `npm run env:validate` (`scripts/validate-env.ts`)  
**Status:** Preflight Verified (Zero Secret Exposure Guaranteed)

---

## 1. Complete Variable Specification (14 Functional Categories)

| # | Variable Name | Required? | Feature Dependency | Legitimate Acquisition Source | Expected Format / Type | Server Only? | Safe Validation Method | Behavior if Missing / Invalid |
| :-: | :--- | :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| **1** | **`NODE_ENV`** | Optional | Runtime optimization | Deployment platform config | `development` \| `staging` \| `production` \| `test` | YES | String enum match | Defaults to `development`. |
| | **`APP_BASE_URL`** | Required (Staging/Prod) | Email invite links, password resets, callbacks | Domain registrar / DNS record | `https://subdomain.domain.com` | YES | Valid URL parser | Falls back to `NEXTAUTH_URL` or `VERCEL_URL`. |
| | **`NEXT_PUBLIC_APP_URL`** | Required | Frontend relative redirects & canonical links | Domain registrar / DNS record | `https://subdomain.domain.com` | NO (Client-safe) | Valid URL parser | Defaults to `http://localhost:3000`. |
| | **`PORT`** | Optional | HTTP web server port | Server orchestrator / Docker | Integer (e.g. `3000`) | YES | Numeric parse | Defaults to `3000`. |
| **2** | **`INVITATION_EXPIRY_HOURS`**| Optional | Team invitation validity window | Internal firm security policy | Numeric string (e.g. `"48"`) | YES | Integer > 0 | Defaults to `48` hours. |
| | **`NEXTAUTH_SECRET`** | Optional | Fallback session signing | `openssl rand -hex 32` | 64-character hex string | YES | Length check >= 32 | Auth uses database-backed session tokens. |
| **3** | **`DATABASE_URL`** | **MANDATORY** | All database read/write queries | PostgreSQL host / AWS RDS / Neon | `postgresql://user:pass@host:5432/db?schema=public` | YES | `npm run db:readiness` | **CRITICAL: App fails to start.** |
| | **`DIRECT_URL`** | Optional (Pooler) | Prisma migrations & DDL | PostgreSQL direct connection | `postgresql://user:pass@host:5432/db?schema=public` | YES | Prisma schema validation | Uses `DATABASE_URL` if direct URL is unset. |
| **4** | **`ENCRYPTION_KEY`** | **MANDATORY (Prod)** | Credential vault AES-256-GCM | `openssl rand -hex 32` | 64-character hex string (32 raw bytes) | YES | Hex validation + 64 char check | Vault decryption fails closed with exception. |
| | **`ENCRYPTION_KEY_M2M`** | Optional | Machine webhook token encryption | `openssl rand -hex 32` | 64-character hex string | YES | Hex validation + 64 char check | Falls back to `ENCRYPTION_KEY`. |
| | **`TOKEN_PEPPER`** | Optional | M2M Bearer token digest hashing | `openssl rand -hex 32` | 64-character hex string | YES | Length >= 64 chars | Plain SHA-256 fallback without pepper. |
| **5** | **`RESEND_API_KEY`** | Optional | Transactional emails (invites, resets) | Resend.com developer dashboard | `re_[a-zA-Z0-9]+` | YES | Starts with `re_` prefix | **Safe STANDBY_MODE:** logs intent without crash. |
| | **`EMAIL_FROM`** | Optional | Sender email display name | Verified domain on Resend | `"Name <sender@domain.com>"` | YES | RFC-5322 email string | Defaults to `notifications@truvledgeros.in`. |
| **6** | **`AWS_ACCESS_KEY_ID`** | Optional | Client workpaper document storage | AWS IAM / Cloudflare R2 / MinIO | Alphanumeric string | YES | Regex `^[A-Z0-9]{20}$` | Falls back to local disk storage / uploads fail. |
| | **`AWS_SECRET_ACCESS_KEY`**| Optional | S3 authenticated presigned URLs | AWS IAM / Cloudflare R2 / MinIO | Base64 string | YES | Non-empty string check | Presigned URL generation throws error. |
| | **`AWS_REGION`** | Optional | S3 bucket region | AWS Console | e.g. `us-east-2`, `ap-south-1` | YES | Valid AWS region string | Defaults to `us-east-2`. |
| | **`S3_BUCKET_NAME`** | Optional | Target storage bucket | AWS S3 Console | Lowercase bucket name | YES | DNS-compliant name | Defaults to `truv-vault`. |
| **7** | **`RAZORPAY_KEY_ID`** | Optional | Automated fee payments & UPI | Razorpay Merchant Dashboard | `rzp_test_...` or `rzp_live_...` | YES | Key format check | Gateway disabled; manual bank recording active. |
| | **`RAZORPAY_KEY_SECRET`** | Optional | Webhook signature verification | Razorpay Merchant Dashboard | 32-character secret | YES | Secret length check | Webhook callbacks rejected as untrusted. |
| **8** | **`WHATSAPP_ACCESS_TOKEN`**| Optional | Automated WhatsApp reminders | Meta Developer Portal | System User Token | YES | Non-empty string | WhatsApp disabled; fallback to email. |
| | **`WHATSAPP_PHONE_NUMBER_ID`**| Optional | Outbound sender phone number | WhatsApp Business Cloud API | Numeric ID string | YES | Numeric string check | WhatsApp messaging fails closed. |
| **9** | **`GSTN_CLIENT_ID`** | Optional | Direct GSP GST return sync | Registered GSP Provider | Provider issued client ID | YES | Non-empty string | Direct sync disabled; offline JSON/Excel active. |
| | **`GSTN_CLIENT_SECRET`** | Optional | GSP API authentication token | Registered GSP Provider | Provider issued secret | YES | Non-empty string | Direct sync disabled; offline JSON/Excel active. |
| **10**| **`OPENAI_API_KEY`** | Optional | AI Notice parsing & extraction | OpenAI Developer Platform | `sk-proj-...` | YES | Key prefix check | Built-in tax knowledge base engine used. |
| | **`GEMINI_API_KEY`** | Optional | Google Gemini Copilot | Google AI Studio | Alphanumeric string | YES | Non-empty string | Built-in tax knowledge base engine used. |
| **11**| **`CRON_SECRET`** | Required (Prod) | Authenticated outbox worker triggers | `openssl rand -hex 24` | 48-character hex string | YES | Constant-time comparison | `/api/cron/outbox-dispatch` returns 401. |
| | **`ENABLE_INPROCESS_OUTBOX_WORKER`**| Optional | Server runtime background polling | Deployment architecture choice | `"true"` \| `"false"` | YES | Boolean string | Defaults to `"false"` (external cron preferred). |
| **12**| **`N8N_BASE_URL`** | Optional | Workflow orchestration hub | Local Docker or n8n cloud | `https://n8n.domain.com` | YES | Valid URL parser | Deferred on standby per governance rules. |
| | **`N8N_WEBHOOK_SECRET`**| Optional | Incoming n8n callback HMAC | Shared webhook secret | 32+ character hex string | YES | Constant-time HMAC match | Inbound n8n webhooks fail authorization. |
| **13**| **`REDIS_URL`** | Optional | Distributed rate limiter | Redis Cloud / Upstash / AWS ElastiCache | `redis://...` or `rediss://...` | YES | Redis URI parser | In-memory sliding window limiter active. |
| **14**| **`SENTRY_DSN`** | Optional | Production exception monitoring | Sentry.io project settings | `https://...` | YES | Valid Sentry DSN | Local console logging active. |

---

## 2. Preflight Deployment Validation Command

To test your active environment against these invariants without exposing any secrets:

```bash
npm run env:validate
```

### Expected Output Structure:
```
=================================================================
TRUVCA LedgerOS — Preflight Environment & Provider Diagnostic
=================================================================
Runtime Environment: PRODUCTION
Overall Invariant Status: VALID

--- CORE INFRASTRUCTURE CONFIGURATION (Masked) ---
  DATABASE_URL        : postgresql://●●●●●●:●●●●●●@... [CONFIGURED]
  ENCRYPTION_KEY      : ●●●●●●●● [CONFIGURED]
  RESEND_API_KEY      : [UNSET] -> Safe STANDBY_MODE active
  ...
```
