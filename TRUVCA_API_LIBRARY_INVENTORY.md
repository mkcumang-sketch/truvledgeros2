# TRUVCA LedgerOS — Complete API & Library Inventory

**Evaluation Standard:** Enterprise Practice Management Architecture  
**Verification Date:** 2026-10-15  
**Compilation Status:** Verified with `tsc --noEmit` (0 errors) & `next build` (37/37 routes compiled)

---

## 1. Route Handlers & API Endpoints (`src/app/api/`)

| Endpoint | Method | Server Guard / Auth | Input Validation | Rate Limiting | Idempotency / Transactions | Operational Status | File Reference |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| `/healthz` | `GET` | Public (Liveness) | None | Uncapped | Read-only memory uptime | **ACTIVE** | `src/app/healthz/route.ts` |
| `/readyz` | `GET` | Public (Readiness) | None | 3s DB Query Timeout | `SELECT 1` ping | **ACTIVE** | `src/app/readyz/route.ts` |
| `/api/auth/me` | `GET` | `getSessionContext` | Cookie `truv_session` | Session-governed | Database session lookup | **ACTIVE** | `src/app/api/auth/me/route.ts` |
| `/api/ai-chats` | `POST` | `requireTenant` (Session) | Zod `ChatMessageSchema` | 20 req/min/user (`AI_API`) | 5s execution timeout | **ACTIVE** | `src/app/api/ai-chats/route.ts` |
| `/api/clients` | `GET` | `getSessionContext` + Role | Query param sanitization | 60 req/min/user (`SEARCH_LIST`) | Scoped Prisma query (`take: 100`) | **ACTIVE** | `src/app/api/clients/route.ts` |
| `/api/clients` | `POST` | `getSessionContext` + Staff | Zod `CreateClientSchema` | 100 req/min/user (`GENERAL_API`) | Multi-table Prisma transaction | **ACTIVE** | `src/app/api/clients/route.ts` |
| `/api/compliance/due-obligations` | `GET` | Dual: M2M Bearer or Session | Date & status params | M2M / Session governed | Scoped return filter (`status != FILED`) | **ACTIVE** | `src/app/api/compliance/due-obligations/route.ts` |
| `/api/documents/pending-requests` | `GET` | Dual: M2M Bearer or Session | Tenant scope invariant | M2M / Session governed | Scoped query (`status == PENDING`) | **ACTIVE** | `src/app/api/documents/pending-requests/route.ts` |
| `/api/documents/upload` | `POST` | `requireTenant` (Session) | Magic bytes + 10MB limit | Upload limit tier | Client IDOR verification + DB update | **ACTIVE** | `src/app/api/documents/upload/route.ts` |
| `/api/cron/outbox-dispatch` | `GET/POST` | `CRON_SECRET` TimingSafe | Header token verification | IP rate limiter | Transactional worker outbox lock | **ACTIVE** | `src/app/api/cron/outbox-dispatch/route.ts` |
| `/api/webhooks/n8n` | `POST` | HMAC-SHA256 (`x-truv-signature`) | Zod `InboundWebhookSchema` | Signature + 5m Freshness | `idempotencyKey` in `AutomationEvent` | **STANDBY** | `src/app/api/webhooks/n8n/route.ts` |

---

## 2. Server Action Inventory (`src/lib/server/actions/`)

| Action Group | Exported Server Actions | Auth & Tenant Enforcement | Validation & Defense | Target DB Models | Audit Logging |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Auth & Team** | `inviteTeamMemberAction`<br>`resendInvitationAction`<br>`revokeInvitationAction`<br>`acceptInvitationAction`<br>`updateMemberRoleAction`<br>`toggleMemberStatusAction` | Server-authoritative `requireTenant` + `canManageMemberRole`. Blocks demoting sole active owner. | Zod schemas, 256-bit entropy token, SHA-256 hash storage. | `Membership`<br>`TeamInvitation`<br>`User` | `TEAM_INVITE_SENT`<br>`ROLE_CHANGED`<br>`MEMBER_SUSPENDED` |
| **God Mode & Operations** | `toggleTenantSuspensionAction`<br>`createInternalServiceTaskAction`<br>`createAuthorizedSupportNoteAction`<br>`togglePlatformFeatureFlagAction` | `verifyGodmodeAuthorization` (SuperAdmin or `GODMODE_ADMIN` in active tenant). | Mandatory justification reasons, enum checks, runtime cache. | `Tenant`<br>`AuditLog` | `TENANT_SUSPENDED`<br>`TENANT_ACTIVATED`<br>`PLATFORM_FLAG_TOGGLED` |
| **Clients & Ingestion** | `createClientAction`<br>`updateClientAction`<br>`deleteClientAction`<br>`bulkImportClientsAction` | `requireTenant` + Role check (CLIENT role strictly forbidden). | PAN/GSTIN regex, CSV formula injection defense (`'`), duplicate detection. | `Client`<br>`ClientContact` | `CLIENT_CREATED`<br>`CLIENT_UPDATED`<br>`BULK_IMPORT_COMPLETED` |
| **Tasks & Compliance** | `createTaskAction`<br>`completeTaskWithEvidenceAction`<br>`rejectTaskReviewAction`<br>`reassignTaskAction`<br>`createBillableTaskInvoiceAction` | `requireTenant` + Role authority (Maker-Checker enforced). | Resolution note mandatory for GST/Audit review; auto-schedules next period. | `Task`<br>`Invoice` | `TASK_CREATED`<br>`TASK_COMPLETED`<br>`TASK_REVIEW_REJECTED` |
| **Invoices & Billing** | `createInvoiceAction`<br>`updateInvoiceAction`<br>`recordPaymentAction`<br>`cancelInvoiceAction` | `requireTenant` + `canManageInvoices`. Client role can only view self. | Half-up paise precision; sequential `TRUV/YYYY-YY/XXXX` locking; overpayment rejection. | `Invoice`<br>`Payment`<br>`AuditLog` | `INVOICE_CREATED`<br>`PAYMENT_RECORDED`<br>`INVOICE_CANCELLED` |
| **Documents & Storage** | `requestDocumentAction`<br>`recordDocumentReminderAction`<br>`verifyDocumentAction`<br>`rejectDocumentAction` | `requireTenant` + client ownership cross-check. | 3-reminder escalation policy to Partner; MIME magic byte verification. | `Document`<br>`DocumentRequest` | `DOCUMENT_REQUESTED`<br>`DOCUMENT_REMINDER_SENT`<br>`DOCUMENT_VERIFIED` |
| **GST Compliance** | `updateGstReturnStatusAction`<br>`recordGstFilingAction` | `requireTenant` + Role check (Partner/Admin sign-off). | Mandatory ARN and filing date validation; status flow integrity. | `GstReturn` | `GST_STATUS_UPDATED`<br>`GST_RETURN_FILED` |
| **Registration** | `registerAction` | Public with `killSwitchGlobalRegistration` feature flag guard. | Password strength (8+ chars), email uniqueness, transaction boundary. | `Tenant`<br>`User`<br>`Membership` | `TENANT_CREATED`<br>`USER_REGISTERED` |

---

## 3. Core Shared Libraries & Adapters (`src/lib/server/`)

| Library / Module | Purpose | Key Exports | External Dependencies | Safety & Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `security/credential-vault.ts` | Zero-knowledge secret encryption | `encryptRecoverableSecret`<br>`decryptRecoverableSecret`<br>`computeBearerDigest` | Node.js `crypto` | AES-256-GCM authenticated encryption with AAD (tenantId, provider, integrationId). |
| `security/keyring.ts` | 256-bit master key management | `Keyring`<br>`getDefaultKeyring` | Node.js `crypto` | In-memory key registration; zero database calls; enforces 64-hex-char keys. |
| `security/rate-limiter.ts` | Distributed sliding-window limiter | `DistributedRateLimiter`<br>`rateLimiter` | `ioredis` (dynamic) | Atomic Redis Lua script; fails closed on auth routes; in-memory fallback. |
| `security/ssrf-guard.ts` | Outbound request protection | `validateOutboundUrl` | Node.js `net`, `url` | Blocks private RFC-1918 IPs, loopback, AWS metadata (169.254.169.254). |
| `email/email-service.ts` | Transactional email delivery | `sendTransactionalEmail`<br>`sendTeamInvitationEmail` | Resend API / `fetch` | Standby mode fallback when `RESEND_API_KEY` is unset; no crash on missing key. |
| `s3.ts` | Workpaper object storage | `getUploadPresignedUrl`<br>`getDownloadPresignedUrl` | `@aws-sdk/client-s3` | Key prefix isolation (`${tenantId}/users/...`); magic bytes; 10MB limit. |
| `automation/outbox-dispatcher.ts`| Transactional outbox worker | `processOutboxQueue`<br>`drainOutboxBatch` | Prisma `$transaction` | `SELECT ... FOR UPDATE SKIP LOCKED` atomic outbox event claims. |
| `m2m-auth.ts` | Machine-to-machine auth | `authorizeM2MRequest`<br>`verifyM2MBearerToken` | Node.js `crypto` | SHA-256 peppered digests; constant-time comparison; replay window (5 min). |
| `env.ts` | Environment validation & diagnostics| `validateEnvironment`<br>`getSanitizedConfigSummary` | `zod` | Server-only; masks all secrets; validates provider readiness before startup. |

---

## 4. Verification Evidence

- **TypeScript Compilation:** `npm run typecheck` exited with **Code 0**.
- **ESLint Quality Check:** `npm run lint` exited with **Code 0** (0 warnings, 0 errors).
- **Prisma Schema Check:** `npm run prisma:validate` exited with **Code 0** (valid schema).
- **Production Build:** `npx next build` exited with **Code 0** (37 pages generated).
- **Test Automation:** `npm test` exited with **Code 0** (16 suites, 412 passed).
- **Environment Diagnostic:** `npm run env:validate` exited with **Code 0** (core config verified).
- **Database Readiness:** `npm run db:readiness` exited with **Code 0** (connectivity, migrations, isolation verified).
