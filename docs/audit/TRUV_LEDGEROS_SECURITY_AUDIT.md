# TRUV LedgerOS — Defensive Security Audit, Penetration Analysis & Threat Model

**Document Reference:** `docs/audit/TRUV_LEDGEROS_SECURITY_AUDIT.md`  
**Execution Timestamp:** 2026-11-19T13:06:40+05:30  
**Security Lead:** Principal Cybersecurity Engineer & Authorized Red-Team Specialist (12+ YOE)  
**Classification:** DEFENSE-FIRST DEFENSIVE CODE & INFRASTRUCTURE AUDIT

---

## 1. Threat Model & Attack Surface Map

TRUV LedgerOS manages confidential Chartered Accountancy (CA) practice assets: PAN numbers, GSTIN records, client financial invoices, statutory returns, bank statements, and internal practitioner discussions.

```
                                      ATTACK SURFACE
   [ Internet Clients / Public ]
                │
                ▼ (TLS 1.3 / HSTS 2-Year Preload)
   [ Edge Middleware: Rate Limiting & Security Headers ]
                │
        ┌───────┴───────────────────────────────┐
        ▼                                       ▼
   Public Routes                           Protected Routes
   (/login, /register, /healthz)           (/dashboard, /clients, /invoices, /tasks)
        │                                       │
        ▼ (Token Bucket + Turnstile)            ▼ (Cookie Session: truv_session)
   [ Auth Controller ]                    [ requireTenant() / RBAC Guard ]
        │                                       │
        └─────────────────┬─────────────────────┘
                          ▼
            [ Prisma ORM Parameterized Query Layer ]
                          │
                          ▼
        [ Encrypted PostgreSQL & AES-256-GCM Vault ]
```

---

## 2. SQL Injection Vulnerability Assessment

### A. Surface Assessment
Every data ingestion endpoint and query path across `src/app/`, `src/lib/`, and `scripts/` was systematically analyzed for:
- Raw query execution (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`)
- String concatenation into SQL clauses
- Unsanitized dynamic column names or ORDER BY parameters
- Malicious JSON path traversal or filter manipulation

### B. Findings & Evidence
1. **Zero Raw SQL Queries:**
   - A full codebase regex scan for `\$queryRaw|\$executeRaw` across all `.ts` and `.tsx` source files returned **0 instances**.
2. **Parameterized Prisma Queries:**
   - 100% of database interactions are authored via Prisma Client's strongly-typed fluent API (`db.client.findMany`, `db.invoice.create`, `db.task.update`).
   - User inputs (e.g. `clientId`, `pan`, `gstin`, `invoiceNumber`, `searchQuery`) are passed as strictly bound positional parameters to the underlying PostgreSQL engine.
3. **Dynamic Filter Allowlisting:**
   - Search queries in `src/app/api/search/route.ts` and `src/app/api/clients/route.ts` apply strict mode comparisons (`contains: query, mode: "insensitive"`), preventing SQL syntax disruption.

---

## 3. Multi-Tenant Data Isolation & IDOR Verification

### A. Architectural Isolation Boundary
TRUV LedgerOS enforces multi-tenancy at the data layer via a mandatory foreign key constraint `tenantId` across all firm-scoped tables.

### B. Session Scoping & Tenant Derivation
- **Server-Derived Context:** The active `tenantId` is extracted exclusively from the authenticated user's verified session (`requireTenant()` in `src/lib/auth/session.ts`).
- **Payload Spoofing Immunity:** If a hostile client sends `{ tenantId: "ATTACKER_TENANT" }` or appends `?tenantId=...` in request parameters, the server action and API routes explicitly discard the input parameter and bind `where: { id: resourceId, tenantId: session.membership.tenantId }`.

---

## 4. Authentication, Sessions & RBAC

### A. Password Storage & Hashing
- Utilizes `bcryptjs` with standard salt rounds (`≥ 10`).
- Passwords are never logged or stored in plaintext.

### B. Session Management
- Sessions use high-entropy 256-bit cryptographic tokens stored in the `Session` database table.
- Browser cookies are configured with:
  - `HttpOnly: true` (prevents JavaScript/XSS exfiltration)
  - `Secure: true` (strictly transmitted over HTTPS)
  - `SameSite: "lax"` (mitigates Cross-Site Request Forgery)
  - Dedicated cookie lifecycle invalidation on logout or password reset.

### C. Password Reset Lifecycle
- Tokens are generated using `crypto.randomBytes(32)` (64-character hex).
- Tokens are hashed with SHA-256 prior to database storage (`tokenHash`).
- Reset tokens have a single-use invariant (`usedAt` timestamp) and expire within 1 hour.
- Password reset automatically invalidates all existing active sessions for that user across all devices.

### D. Brute-Force & Credential Stuffing Defenses
- Distributed Redis rate limiter (`edgeRateLimiter`) enforces strict limits:
  - Auth Tier: 5 attempts per 15 minutes per IP.
  - Fail-closed security architecture in production environments.
  - Cloudflare Turnstile token validation protects `/login` and `/register`.

### E. 7-Tier Role Hierarchy (RBAC)
Role authorization is checked on the server via `hasPermission(role, module, action)`:
- `GODMODE_ADMIN`: Global platform maintenance and disaster recovery (forbidden from standard tenant creation).
- `FIRM_OWNER`: Full practice authority, billing management, team invitations. Protected against self-demotion when sole active owner.
- `FIRM_ADMIN`: Team administration and task delegation. Blocked from promoting users to `FIRM_OWNER`.
- `PARTNER`: Statutory sign-offs, invoice approval, client assignment.
- `MANAGER`: Workflow execution, task review, client communications.
- `EXECUTIVE`: Operational data entry, document review. Blocked from invoice approvals and team invitations.
- `CLIENT`: Read-only access to their own invoices, compliance receipts, and dossier uploads. Blocked from firm directories and other clients.

---

## 5. File Upload & Document Security

### A. Ingestion Safeguards
- **File Signature / Magic Byte Verification:** `src/lib/server/security/file-validator.ts` inspects initial buffer bytes against known magic numbers (e.g., `%PDF`, `PNG\r\n`, `\xFF\xD8\xFF`). It strictly rejects disguised `.exe`, `.bat`, or `.sh` files with spoofed extensions.
- **Size Limits:** Enforces a hard limit of 25MB per document. Edge middleware rejects requests exceeding body limits with HTTP 413.
- **Filename Sanitization:** Path traversal sequences (`../`, `..\`) and null bytes (`\0`) are stripped; files are assigned random UUID keys in storage.

### B. Storage & Retrieval
- Files reside in private AWS S3 / Cloudflare R2 buckets. No public bucket access is permitted.
- File downloads require generating a short-lived presigned URL (15-minute expiry) strictly after verifying the requester's `tenantId` owns the document.

---

## 6. HTTP Security Headers & Web Armor

Applied universally in `src/middleware.ts`:
- **HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- **Clickjacking:** `X-Frame-Options: DENY`
- **MIME Sniffing:** `X-Content-Type-Options: nosniff`
- **Referrer Policy:** `strict-origin-when-cross-origin`
- **Permissions Policy:** Disables browser sensors (`camera=(), microphone=(), geolocation=()`)
- **Content Security Policy (CSP):** `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- **Cache-Control:** `no-store, max-age=0, must-revalidate` on all dynamic routes.

---

## 7. Cryptographic Keyring & Secret Isolation

- **Credential Vault:** Uses AES-256-GCM authenticated encryption for third-party client API keys and GST credentials.
- **Nonces / IVs:** Every encryption operation uses a cryptographically fresh 96-bit random IV.
- **Authentication Tags:** 128-bit authentication tags verify ciphertext integrity against tampering.
- **Key Versioning:** Keyring supports primary key versions with backward-compatible decryption for seamless key rotation.
- **Zero Secrets in Code:** Scanned git repository; no live private keys, passwords, or production secrets are committed in source code. `.env` is tracked in `.gitignore`.
