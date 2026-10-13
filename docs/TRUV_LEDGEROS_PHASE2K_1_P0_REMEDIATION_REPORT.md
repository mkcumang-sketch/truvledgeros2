# TRUV LedgerOS — Phase 2K.1: P0 Critical Security Remediation Report

**Role:** Senior Application-Security Engineer & Database Reliability Engineer  
**Date:** 2026-10-13  
**Status:** Complete & Verified  
**Final Verdict:** `P0 REMEDIATION COMPLETE & VERIFIED` (Stopping at P0 boundary; P1/P2 remediation deferred)

---

## 1. Executive Summary

This report documents the implementation and empirical verification of **Phase 2K.1: P0 Critical Security Remediation** for **TRUV LedgerOS** (`TRUVCA`).

Following the independent security audit conducted in Phase 2J (`TRUV_LEDGEROS_PHASE2J_SECURITY_REMEDIATION_AUDIT.md`), two critical P0 vulnerabilities were identified in the Machine-to-Machine (M2M) authorization paths:
1. **SEC-02A (Fallback Secrets):** Active M2M routes contained hardcoded fallback secrets (`default_dev_truv_n8n_secret_32bytes`) allowing unauthorized parties to sign or forge M2M requests if the environment variable was missing or empty.
2. **SEC-02B (Unscoped Cross-Tenant M2M Queries):** Valid M2M authentication did not enforce an explicit, authorized tenant scope; omitting `?tenantId=` resulted in global database queries returning records across all tenants in the system.

Both P0 vulnerabilities have been remediated, verified with timing-safe cryptography, fail-closed mechanisms, strict tenant authorization checks, and validated by 44 comprehensive isolated regression tests and TypeScript typechecking.

---

## 2. Exact Files Changed

| File Path | Action | Description of Modifications |
| :--- | :---: | :--- |
| `src/app/api/compliance/due-obligations/route.ts` | **Remediated** | Removed `"default_dev_truv_n8n_secret_32bytes"` fallback; enforced fail-closed secret checks; added `timingSafeEqualCompare` for cron/bearer secrets; enforced mandatory `tenantId` parameter for M2M callers; validated tenant existence (`db.tenant.findUnique`), active status, and non-suspended status; added defense-in-depth assertion preventing unscoped queries. |
| `src/app/api/documents/pending-requests/route.ts` | **Remediated** | Removed `"default_dev_truv_n8n_secret_32bytes"` fallback; enforced fail-closed secret checks; added `timingSafeEqualCompare` for cron/bearer secrets; enforced mandatory `tenantId` parameter for M2M callers; validated tenant existence (`db.tenant.findUnique`), active status, and non-suspended status; added defense-in-depth assertion preventing unscoped queries. |
| `src/app/api/webhooks/n8n/route.ts` | **Remediated** | Removed `"default_dev_truv_n8n_secret_32bytes"` fallback; enforced fail-closed response (401 `UNCONFIGURED_SECRET`) if `process.env.N8N_WEBHOOK_SECRET` is unset or empty. |
| `tests/phase2a-security-remediation.test.ts` | **Updated** | Added database mock isolation to eliminate live database connection risks; updated M2M test cases 2.6 and 2.7 to include explicit authorized tenant scope. |
| `tests/phase2k1-p0-security.test.ts` | **Created** | Comprehensive isolated regression test suite covering all 8 required security scenarios for both affected routes (44 total test assertions). |

---

## 3. Detailed Behavior Analysis: Before vs After

### Fix A — Removal of Fallback Secrets (SEC-02A)

#### Before Remediation:
- Routes inspected environment variables using:
  ```typescript
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "default_dev_truv_n8n_secret_32bytes";
  const cronSecret = process.env.CRON_SECRET || process.env.N8N_WEBHOOK_SECRET;
  ```
- If `N8N_WEBHOOK_SECRET` was omitted from `.env` or empty in production or staging, any external caller who knew the default string could generate a valid HMAC-SHA256 signature and authenticate as an M2M system.
- Bearer token comparisons used standard JavaScript equality (`providedToken === cronSecret`), exposing the endpoint to potential timing-side-channel attacks.

#### After Remediation:
- Routes strictly load trimmed environment variables without fallbacks:
  ```typescript
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
  const cronSecret = (process.env.CRON_SECRET || process.env.N8N_WEBHOOK_SECRET)?.trim();
  ```
- If an HMAC request is received and `!webhookSecret`, the route **fails closed immediately**:
  ```typescript
  if (!webhookSecret) {
    return NextResponse.json(
      {
        error: "Unauthorized: Webhook authentication secret is not configured.",
        code: "UNCONFIGURED_SECRET",
      },
      { status: 401 }
    );
  }
  ```
- If a Bearer/Cron token request is received and `!cronSecret`, the route **fails closed immediately**:
  ```typescript
  if (!cronSecret) {
    return NextResponse.json(
      {
        error: "Unauthorized: Machine authentication secret is not configured.",
        code: "UNCONFIGURED_SECRET",
      },
      { status: 401 }
    );
  }
  ```
- Bearer/Cron comparison enforces constant-time timing-safe evaluation using `crypto.timingSafeEqual`:
  ```typescript
  function timingSafeEqualCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
  ```
- Secrets are never logged to console or returned in response payloads.

---

### Fix B — Enforce Tenant Scope for M2M Requests (SEC-02B)

#### Before Remediation:
- Once an M2M caller passed HMAC or Bearer authentication:
  ```typescript
  if (isM2MAuthorized) {
    if (requestedTenantId) {
      whereClause.tenantId = requestedTenantId;
    }
    // If requestedTenantId was omitted, whereClause.tenantId WAS NEVER SET!
  }
  ```
- If an attacker or automation client omitted `?tenantId=...`, `whereClause.tenantId` remained undefined.
- `db.gstReturn.findMany` or `db.documentRequest.findMany` executed an **unscoped query across the entire database**, returning up to 100 sensitive GST returns or document requests belonging to arbitrary client firms.

#### After Remediation:
1. **Mandatory Tenant Scope:**
   - M2M callers **must** supply `tenantId` via query parameter or `x-truv-tenant-id` header.
   - If missing or blank, the request is rejected with `400 Bad Request`:
     ```typescript
     if (!requestedTenantId || typeof requestedTenantId !== "string" || !requestedTenantId.trim()) {
       return NextResponse.json(
         {
           error: "tenantId query parameter is required for machine-to-machine requests",
           code: "MISSING_TENANT_SCOPE",
         },
         { status: 400 }
       );
     }
     ```
2. **Input Validation:**
   - Parameter length is bounded (max 128 characters). Excessively long strings return `400 INVALID_TENANT_SCOPE`.
3. **Tenant Existence & Authorization Verification:**
   - Merely passing a string is insufficient. The route queries the database:
     ```typescript
     const tenant = await db.tenant.findUnique({
       where: { id: tenantId },
       select: { id: true, active: true, isSuspended: true },
     });
     ```
   - If `!tenant`: returns `404 TENANT_NOT_FOUND`.
   - If `!tenant.active || tenant.isSuspended`: returns `403 TENANT_UNAUTHORIZED`.
   - Only when verified active and not suspended is `whereClause.tenantId = tenant.id` assigned.
4. **User-Session Boundary Preservation:**
   - User sessions strictly derive `whereClause.tenantId = sessionContext.membership.tenantId`.
   - Client-supplied `?tenantId=` query parameters are strictly ignored.
   - `CLIENT` role callers are forbidden with `403 FORBIDDEN_ROLE`.
   - Suspended/inactive tenants are rejected with `403 TENANT_UNAUTHORIZED`.
5. **Defense-in-Depth Assertion:**
   - Directly preceding the database read:
     ```typescript
     if (!whereClause.tenantId) {
       return NextResponse.json(
         {
           error: "Tenant scope violation: Unscoped queries are strictly forbidden.",
           code: "UNSCOPED_QUERY_FORBIDDEN",
         },
         { status: 400 }
       );
     }
     ```
   - It is programmatically impossible for an unscoped query to reach `findMany`.

---

## 4. Regression Test Results

Testing was performed in complete isolation from Neon using mocked database calls and mock session contexts.

### Command Execution Log

| # | Command Executed | Exit Code | Results |
| :-: | :--- | :-: | :--- |
| **1** | `npx ts-node -r tsconfig-paths/register tests/phase2k1-p0-security.test.ts` | **0** | **44 passed, 0 failed** |
| **2** | `npx ts-node -r tsconfig-paths/register tests/phase2a-security-remediation.test.ts` | **0** | **27 passed, 0 failed** |
| **3** | `npx ts-node -r tsconfig-paths/register tests/security.test.ts` | **0** | **22 passed, 0 failed** |
| **4** | `npm run typecheck` (`tsc --noEmit`) | **0** | **0 compilation errors** |

---

### Verification Matrix for the 8 Required Test Scenarios

The test suite `tests/phase2k1-p0-security.test.ts` verified both affected routes against all 8 scenarios:

| Scenario | Test Description | Compliance Route Result | Documents Route Result |
| :--- | :--- | :---: | :---: |
| **1. Missing Secret** | HMAC headers with unset `N8N_WEBHOOK_SECRET` fails closed (401 `UNCONFIGURED_SECRET`) | ✔ PASS | ✔ PASS |
| | Bearer token with unset `CRON_SECRET` fails closed (401 `UNCONFIGURED_SECRET`) | ✔ PASS | ✔ PASS |
| | Default dev fallback secret string rejected | ✔ PASS | ✔ PASS |
| | Unauthenticated request rejected (401 `UNAUTHORIZED_ACCESS`) | ✔ PASS | ✔ PASS |
| **2. Incorrect Secret** | Forged / mismatched HMAC signature rejected (401 `INVALID_SIGNATURE`) | ✔ PASS | ✔ PASS |
| | Expired timestamp (>5 min) rejected (401 `TIMESTAMP_EXPIRED`) | ✔ PASS | ✔ PASS |
| | Incorrect Bearer token rejected (401 `INVALID_CREDENTIALS`) | ✔ PASS | ✔ PASS |
| **3. Missing Tenant Scope** | Valid HMAC signature but missing `tenantId` rejected (400 `MISSING_TENANT_SCOPE`) | ✔ PASS | ✔ PASS |
| | Valid HMAC signature but whitespace `tenantId` rejected (400 `MISSING_TENANT_SCOPE`) | ✔ PASS | ✔ PASS |
| | Valid Bearer token but missing `tenantId` rejected (400 `MISSING_TENANT_SCOPE`) | ✔ PASS | ✔ PASS |
| | Malformed `tenantId` (>128 chars) rejected (400 `INVALID_TENANT_SCOPE`) | ✔ PASS | ✔ PASS |
| **4. Unauthorized Tenant** | Non-existent `tenantId` rejected (404 `TENANT_NOT_FOUND`) | ✔ PASS | ✔ PASS |
| | Inactive tenant (`active: false`) rejected (403 `TENANT_UNAUTHORIZED`) | ✔ PASS | ✔ PASS |
| | Suspended tenant (`isSuspended: true`) rejected (403 `TENANT_UNAUTHORIZED`) | ✔ PASS | ✔ PASS |
| **5. Authorized Tenant Scope** | Valid HMAC returns records scoped strictly to `TENANT_ALPHA` | ✔ PASS | ✔ PASS |
| | Valid Bearer token returns records scoped strictly to `TENANT_BETA` | ✔ PASS | ✔ PASS |
| **6. Forged Session Parameter** | User session with `?tenantId=FORGED_VICTIM_TENANT` ignored; scoped to session tenant | ✔ PASS | ✔ PASS |
| **7. Role Restrictions** | `CLIENT` role forbidden (403 `FORBIDDEN_ROLE`); database findMany call count = 0 | ✔ PASS | ✔ PASS |
| **8. Unscoped Query Prevention** | Missing tenant scope never executes database query (findMany count: 0) | ✔ PASS | ✔ PASS |
| | Non-existent tenant never executes database query (findMany count: 0) | ✔ PASS | ✔ PASS |
| | Inactive tenant never executes database query (findMany count: 0) | ✔ PASS | ✔ PASS |

---

## 5. Safety Boundaries Compliance

During the execution of Phase 2K.1, all safety constraints were strictly maintained:
1. **Zero Remote Database Contact:** No connections were opened to Neon. No connection string was parsed or invoked.
2. **No Environment File Changes:** `.env` and `.env.example` were not modified. No credentials were read, printed, or committed.
3. **No Database Migrations or Mutations:** Zero DDL/DML, zero Prisma migrations, zero `db push`.
4. **Boundary Preservation:** Cron dispatcher logic, password-reset actions, financial arithmetic, and n8n outbound event processing were **not altered**.
5. **Zero Dependency Installs:** No new packages or dependencies were installed into `package.json`.
6. **Git Cleanliness:** Unrelated repository files and untracked artifacts were preserved without unintended alterations.

---

## 6. Unresolved Risks & Follow-Up Roadmap (Phase 2K.2+)

In accordance with strict phase discipline, remediation stopped at the P0 boundary. The following P1 and P2 findings documented in `TRUV_LEDGEROS_PHASE2J_SECURITY_REMEDIATION_AUDIT.md` remain open for subsequent phases:

| Finding ID | Title | Severity | Current Status | Scheduled Phase |
| :--- | :--- | :---: | :---: | :--- |
| **SEC-03** | Missing Rate Limiting on Password Reset Endpoints | **P1 (High)** | OPEN | Phase 2K.2 |
| **SEC-04** | Fail-Open Cron Authorization in `/api/cron/outbox-dispatch` | **P1 (High)** | OPEN | Phase 2K.2 |
| **SEC-05** | Test Suite Live Database Pollution Hazard (`package.json`) | **P1 (High)** | OPEN | Phase 2K.2 |
| **SEC-09** | Godmode Control Surface Prototype Unwired State | **P2 (Medium)** | OPEN | Phase 2L |
| **SEC-10** | Floating-Point Arithmetic Casts in Payment Computations | **P2 (Medium)** | OPEN | Phase 2L |

---

## 7. Rollback Guidance

If operational defects arise from this change, the exact rollback procedure is as follows:

### Step 1: Revert Modified Source Files
To restore the pre-remediation versions of the modified route files:
```bash
cd "C:\Users\imris\OneDrive\Desktop\TRUVCA\TRUVCA"

# Discard changes to route handlers and tests
git checkout -- src/app/api/compliance/due-obligations/route.ts
git checkout -- src/app/api/documents/pending-requests/route.ts
git checkout -- src/app/api/webhooks/n8n/route.ts
git checkout -- tests/phase2a-security-remediation.test.ts

# Remove newly created test file
rm tests/phase2k1-p0-security.test.ts
```

### Step 2: Validate Clean Baseline
Execute TypeScript compilation to verify clean restoration:
```bash
npm run typecheck
```
Exit code should be 0.
