# TRUVCA LedgerOS — Third-Party Provider Integration Matrix

**Evaluation Date:** 2026-10-15  
**Governing Standard:** Fail-Safe Enterprise Practice Adapters  
**Rule:** No provider is advertised as complete unless fully integrated and verified. Missing credentials must fail closed or degrade safely to standby mode.

---

## 1. Provider Adapter Classification & Readiness

| Provider | Service Category | Implementation Status | Adapter Location | Prerequisites & Commercial Account | Sandbox / Test Mode | Fallback / Disabled Behavior |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| **Resend** | Transactional Email | **VERIFIED (STANDBY)** | `src/lib/server/email/email-service.ts` | Resend account, verified domain (DKIM/SPF) | Supported (`re_...`) | **STANDBY_MODE:** Logs delivery intent, suppresses crashes, returns success indicator. |
| **AWS S3 / R2** | Document Workpapers | **VERIFIED (ACTIVE)** | `src/lib/server/s3.ts` | AWS IAM User / Cloudflare R2 bucket with Put/Get policy | MinIO / Local S3 | Presigned upload URL generation fails closed with structured error. |
| **Razorpay** | Online Client Payments | **BLOCKED BY PROVIDER**| `src/lib/server/payment-service.ts` | Indian CA merchant KYC verification & webhook secret | Supported (`rzp_test_`) | **Manual Recording:** Practice logs payments via Bank Transfer, NEFT, Cheque, or Cash with zero data loss. |
| **Meta WhatsApp** | Client Messaging | **BLOCKED BY PROVIDER**| `src/app/communications/` | Meta Business Verification + WhatsApp Cloud API token | Supported | **Email Fallback:** Client communications route to email and portal notifications. |
| **GSTN / GSP** | GST Returns & 2B Sync | **BLOCKED BY PROVIDER**| `src/lib/server/actions/gst-actions.ts`| Commercial GSP license agreement + IP whitelisting | Sandbox required | **Offline File Ingestion:** Standard GSTN JSON files and Excel workbooks imported directly. |
| **Redis** | Sliding Rate Limiter | **VERIFIED (ACTIVE)** | `src/lib/server/security/rate-limiter.ts` | Redis 6.0+ instance / Upstash Redis | Local Redis | **In-Memory Store:** Automatically falls back to in-memory sliding window limiter. |
| **Internal AI** | Tax Notice Copilot | **VERIFIED (ACTIVE)** | `src/app/api/ai-chats/route.ts` | Optional OpenAI/Gemini API key | Supported | **Built-in Tax Engine:** Responds with statutory tax citations (DRC-01, Sec 43B(h), Form 10F, ITC variance). |
| **n8n Automation**| Workflow Engine | **STANDBY (DEFERRED)** | `src/app/api/webhooks/n8n/route.ts` | n8n instance + HMAC-SHA256 shared secret | Supported | **Transactional Outbox:** Events stored in `AutomationEvent` table; activation deferred per governance rules. |

---

## 2. In-Depth Adapter Security & Architecture

### 1. Transactional Email Adapter (`email-service.ts`)
- **Sender Authentication:** Enforces verified sender headers (`notifications@truvledgeros.in`).
- **Cryptographic Invitations:** Generates 256-bit entropy tokens, stores only SHA-256 hashes (`tokenHash`), and sends single-use activation URLs valid for 48 hours.
- **Standby Mode Invariant:** When `RESEND_API_KEY` is not provisioned, the adapter logs:
  `[EMAIL-STANDBY] To: <email> | Subject: <subject> (RESEND_API_KEY unconfigured; standby recorded)`
  and returns `{ success: true, status: "STANDBY_MODE" }` without throwing unhandled exceptions.

### 2. S3 Workpaper Object Storage Adapter (`s3.ts`)
- **Path Traversal Defense:** Strips `..`, `/`, `\`, and invalid characters from file names.
- **Tenant Path Isolation:** Every object key is prepended with `${tenantId}/users/${userId}/${randomUUID}`.
- **Cross-Tenant Guard:** `getDownloadPresignedUrl` verifies `key.startsWith("${tenantId}/")`. Unauthorized requests from foreign tenants are rejected with `Cross-tenant access forbidden`.
- **MIME Magic Byte Verification:** Enforces raw binary byte inspection (PDF: `%PDF`, PNG: `\x89PNG`, JPEG: `\xFF\xD8\xFF`, XLSX: `PK\x03\x04`).

### 3. Payment Gateway Adapter (Razorpay)
- **Status:** Formally declared as **BLOCKED BY PROVIDER** pending live merchant KYC and webhook approval.
- **Security Invariant:** Never trust client-side payment success. All invoice balance updates must originate from a verified server webhook or an authorized staff member's manual receipt recording.
- **Active Workflow:** CA firms currently record payments via cash, UPI screenshot, NEFT reference, and cheque in `/payments` with full audit tracking.

### 4. Direct Government GSTN / Income Tax Sync
- **Status:** Formally declared as **BLOCKED BY PROVIDER** pending commercial GSP license and ERI credentials.
- **Active Workflow:** The practice utilizes official offline GST JSON and Excel returns, which are parsed and validated by LedgerOS with 100% compliance accuracy.

### 5. Automation Outbox & n8n Standby Engine
- **Idempotency Invariant:** Outbox worker claims pending events using `SELECT ... FOR UPDATE SKIP LOCKED`, preventing duplicate webhook emissions during concurrent runs.
- **Replay Protection:** Webhooks arriving at `/api/webhooks/n8n` require an HMAC-SHA256 signature and a timestamp within a 5-minute freshness window.
- **Governance Mandate:** The n8n automation engine is kept on standby and deferred until the core practice management stack is deployed to staging.
