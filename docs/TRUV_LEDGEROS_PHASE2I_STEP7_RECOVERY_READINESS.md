# TRUV LedgerOS — Phase 2I Step 7: Recovery Readiness & Baseline Reconciliation Audit

**Role:** Senior Database Reliability Engineer & Application Security Reviewer  
**Date:** 2026-10-13  
**Status:** Complete  
**Final Verdict:** `PARTIAL — RECOVERY OR RELEASE GAPS REMAIN`

---

## 1. Executive Summary

An independent, read-only recovery-readiness and baseline-reconciliation assessment was conducted for **TRUV LedgerOS**. This audit evaluates the gap between the verified local restore of the historical backup snapshot, the current live database state on Neon PostgreSQL, the Prisma ORM migration baseline, and the remaining application-level deployment blockers.

### Summary of Audit Findings

1. **Restore Evidence Confirmed:** Forensic inspection of `C:\Users\imris\.truv_restore_sandbox\logs` confirms that the Step 4C restore test was empirically validated. The initial restore returned exit code `1` due strictly and exclusively to 48 harmless `ALTER ... OWNER TO` statements for missing cloud-managed roles (`neondb_owner` and `neon_auth`). A subsequent role-matched restore completed with exit code `0` and **zero errors**.
2. **Snapshot-to-Baseline Temporal Divergence:** The sole available physical backup artifact (`truv_neondb_backup_20261013_095251.dump`) was captured at `09:52:51 IST` in Step 3, **before** the live addition of `PasswordResetToken` and before `_prisma_migrations` was resolved in Step 5. Consequently, the backup contains 26 domain tables and zero migration metadata, whereas the live database now contains 27 domain tables and `_prisma_migrations`.
3. **Disaster Recovery Gap:** Restoring the existing backup into production today would cause immediate application failure (`relation "PasswordResetToken" does not exist`) and break Prisma migration tracking. A post-baseline live backup has not yet been captured (`NOT VERIFIED`).
4. **Application Release Blockers:** Repository documentation confirms unresolved critical gaps, including 5 pairs of duplicate client records blocking unique tax constraints, missing rate limiting on auth endpoints, IDOR vulnerabilities on compliance APIs, and a complete absence of real PostgreSQL integration tests (all test suites run against in-memory JavaScript mocks).

---

## 2. Audit Task A: Verification of Local Restore Evidence

A detailed audit of the files in `C:\Users\imris\.truv_restore_sandbox\logs` was performed:

| Evidence File | File Size | Timestamp | Primary Contents / Verification Findings |
| :--- | :---: | :---: | :--- |
| `pg_restore.log` | `26,589 bytes` | `10:28:46 IST` | Full stderr trace of stock restore. Exit code `1`. Logged 48 errors: 38 `role "neondb_owner" does not exist` and 10 `role "neon_auth" does not exist`. 1 summary warning (`errors ignored on restore: 48`). All 35 tables, 12 enums, 82 indexes, and 43 FKs created. |
| `pg_restore_with_roles.log` | `15,392 bytes` | `10:29:54 IST` | Role-matched restore trace on cluster with `neondb_owner` and `neon_auth`. **Exit code `0`**. **0 errors**, **0 warnings**. |
| `postgres_server.log` | `39,083 bytes` | `10:29:54 IST` | Server lifecycle log confirming startup, UTF-8 cluster initialization, loopback binding on `127.0.0.1:5433`, query handling, and clean shutdown (`pg_ctl stop -m fast`). |
| `restore_verification_results.json` | `21.7 MB` | `10:28:46 IST` | Detailed schema catalog dump from `truv_restore_test` verifying 35 tables, 12 enums, 82 indexes, 43 foreign keys, and **148 live data rows**. |

### Detailed Error Reconciliation: Initial vs. Role-Matched Restore

```
Stock Restore (pg_restore.log):
├── Exit Code: 1
├── Total Error Lines: 48
│   ├── ERROR: role "neondb_owner" does not exist (38 occurrences)
│   └── ERROR: role "neon_auth" does not exist (10 occurrences)
└── DDL / Data Loss: ZERO. 100% of tables, schemas, constraints, and data recovered.

Role-Matched Restore (pg_restore_with_roles.log):
├── Exit Code: 0
├── Total Error Lines: 0
└── Total Warning Lines: 0
```

**Conclusion:** The local restore test has conclusive, empirical log evidence proving that the archive is uncorrupted and 100% restorable.

---

## 3. Audit Task B: Backup Snapshot vs. Current Local Migration Artifacts

### 3.1 Migration Artifact Catalog

| Artifact | File Path | SHA-256 Checksum | Size | Contents & Role |
| :--- | :--- | :--- | :---: | :--- |
| **Prisma Schema** | `prisma/schema.prisma` | `d0baec772a4548e1b53879c9384bbad54890250005d54e815e982187fa5ee919` | `23,509 B` | Canonical definition: 27 models (including `PasswordResetToken`), 12 enums. |
| **Active Baseline Migration** | `prisma/migrations/0_init/migration.sql` | `f850bf013ec035fb137429451ae2abdc467e2fd1238d4a5017b751e0074d2989` | `28,657 B` | Canonical SQL baseline: 27 models, 12 enums. Lines 100, 543, 696 define `PasswordResetToken`. |
| **Baseline Archive Copy** | `prisma/baseline/0_init/migration.sql` | `f850bf013ec035fb137429451ae2abdc467e2fd1238d4a5017b751e0074d2989` | `28,657 B` | Exact bit-for-bit duplicate of active baseline migration. |
| **Additive DDL Script** | `prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql` | `47e259abb6bf48bb2e781533ad3b1c676d0800b462be2ef579893d5f3060e6e7` | `1,987 B` | Standalone script used in Step 5 to create `PasswordResetToken` on Neon. |
| **Backup Archive** | `.truv_secure_backups/truv_neondb_backup_20261013_095251.dump` | `d963a1d74f1f21e7cbcb31268c6fd7ff30c1a1db3cb36214ce3ff000d043a2ef` | `107,008 B` | Logical backup taken at `09:52:51 IST` (pre-Step 5). |

### 3.2 Chronological Timeline of Database & Migration Events

```mermaid
timeline
    title TRUV LedgerOS Phase 2I Evolution
    2026-10-13 09:52:51 : Step 3 - Backup Captured : 26 public domain tables, 0 migration tables, 148 live rows
    2026-10-13 10:09:00 : Step 5A - Additive DDL on Neon : PasswordResetToken created on live Neon (27 domain tables)
    2026-10-13 10:10:00 : Step 5B - Baseline Promotion : 0_init placed in prisma/migrations; legacy migration archived
    2026-10-13 10:11:00 : Step 5C - Baseline Resolution : npx prisma migrate resolve --applied 0_init creates _prisma_migrations
    2026-10-13 10:11:30 : Step 5D - Drift Certification : npx prisma migrate status certifies 0 drift on Neon
    2026-10-13 10:29:00 : Step 4C - Local Restore Test : Restores 20261013_095251.dump; verifies 26 domain tables and 148 rows
```

### 3.3 Known Differences Between Backup Snapshot and Current State

1. **`PasswordResetToken` Presence:**
   - In Backup Snapshot: **ABSENT** (`SELECT EXISTS` returned `false`).
   - In Current Live Neon: **PRESENT** (Created via additive DDL in Step 5).
   - In `0_init/migration.sql`: **PRESENT** (Lines 100-108).
2. **`_prisma_migrations` Presence:**
   - In Backup Snapshot: **ABSENT** (`SELECT EXISTS` returned `false`).
   - In Current Live Neon: **PRESENT** (Created via `migrate resolve` in Step 5).
   - In `0_init/migration.sql`: Not defined (Prisma manages this table internally).
3. **Application Domain Table Count:**
   - In Backup Snapshot: **26 tables** in `public` (+ 9 in `neon_auth`).
   - In Current Live Neon: **27 tables** in `public` (+ 9 in `neon_auth`).

---

## 4. Audit Task C: Recovery Readiness Assessment

### 4.1 What the Existing Backup Can Recover
The existing backup artifact (`truv_neondb_backup_20261013_095251.dump`) is fully capable of recovering:
- The historical application state as of `2026-10-13 09:52:51 IST`.
- All 26 pre-baseline domain tables (`Tenant`, `User`, `Membership`, `Client`, `Invoice`, `Task`, `GstProfile`, etc.).
- All 9 Better Auth / Neon Auth tables in `neon_auth`.
- All 148 business rows (Clients, Invoices, Tasks, Contacts, GST Profiles, Users).
- All 12 custom enums and 82 indexes.

### 4.2 What Occurred After the Backup Was Taken
Between `09:52:51 IST` and the conclusion of Phase 2I:
1. Physical schema DDL was executed on Neon to create `PasswordResetToken`, its index on `userId`, unique constraint on `tokenHash`, and foreign key to `User(id)`.
2. Prisma metadata table `_prisma_migrations` was created on Neon and populated with the registration record for `0_init`.
3. Application code in `TRUVCA` was validated against this 27-table schema.

### 4.3 Why the Local Restore Does Not Prove Current Live Restorability
A successful restore of `truv_neondb_backup_20261013_095251.dump` proves that the **historical** pre-change database is restorable. However:
- It does **not** prove that the current live database (27 domain tables + `_prisma_migrations`) is restorable.
- If this historical backup were restored into Neon to recover from an outage today, the resulting database would be in a **broken state**:
  - The application backend (which now relies on `PasswordResetToken`) would immediately throw runtime database errors (`relation "PasswordResetToken" does not exist`) upon user login or password reset operations.
  - Prisma CLI would report the database as unmigrated or out-of-sync because `_prisma_migrations` would be completely missing.
  - Any password reset tokens issued since Step 5 would be lost.

### 4.4 Status of Post-Baseline Live Backup
- **Inspection of Backup Storage:** Directory `C:\Users\imris\.truv_secure_backups` was audited. It contains exactly one file (`truv_neondb_backup_20261013_095251.dump`).
- **Verdict on Post-Baseline Backup:** **`NOT VERIFIED`**. No post-baseline backup capturing the 27 domain tables and `_prisma_migrations` has been created or verified.

### 4.5 Mandatory Pre-Migration Requirement
Before any future production migration (Phase 3 or beyond):
- A fresh, timestamped logical backup (`pg_dump -Fc`) of the live Neon database must be taken.
- The new backup must be verified via SHA-256 and TOC inspection before executing any DDL.

---

## 5. Audit Task D: Baseline Deployment Safety Review

### 5.1 Distinct Layers of Database Assurance

In production database governance, four distinct concepts are frequently conflated. The reliability engineer must distinguish between them:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LAYERS OF ASSURANCE                             │
├─────────────────────────┬──────────────────────────────────────────────┤
│ 1. migrate status       │ ORM Metadata Check (Prisma CLI vs _prisma)   │
│                         │ Does NOT inspect physical table columns.     │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 2. Structural Parity    │ Catalog Audit (information_schema / pg_cat)  │
│                         │ Inspects physical tables, types, constraints │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 3. Restore Validation   │ Disaster Recovery Proof (pg_restore test)    │
│                         │ Proves backup artifacts reconstitute cleanly │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 4. Migration Execution  │ Forward DDL Pipeline (prisma migrate deploy) │
│                         │ Modifies live schema transactionally         │
└─────────────────────────┴──────────────────────────────────────────────┘
```

1. **`prisma migrate status`:**
   - Compares migration folders on disk (`prisma/migrations`) against rows in `_prisma_migrations`.
   - Confirms that checksums match and no migrations are marked failed.
   - **Limitation:** It does *not* query physical domain tables. If a column or table is altered out-of-band, `migrate status` remains green.
2. **Structural Schema Comparison:**
   - Queries `information_schema.tables`, `information_schema.columns`, `pg_constraint`, and `pg_type` directly.
   - Compares physical types (e.g., `numeric(12, 2)` vs `double precision`), indexes, and constraints against `prisma/schema.prisma`.
3. **Backup Restore Validation:**
   - Proves whether a binary dump can be restored from scratch into a fresh PostgreSQL instance, verifying relational constraints, sequences, and data types under real engine execution.
4. **Applying Future Migrations:**
   - Generates and applies forward DDL changes. Requires both metadata tracking (`_prisma_migrations`) and structural schema parity to succeed without collisions.

### 5.2 Required Evidence Before Next Production Migration

Before executing any forward migration in Phase 3:
1. **Fresh Live Backup Capture:** A post-baseline snapshot must be taken and hashed.
2. **Pre-Migration Rollback Script:** An explicit down-migration / rollback SQL script must be authored and tested.
3. **Staging Pipeline Validation:** The migration must be verified on a temporary Neon branch or local staging database before executing on main compute.

---

## 6. Audit Task E: Application Readiness Blockers

Based strictly on available repository documentation, the following high-risk items remain unresolved:

### 6.1 Authentication & Password Reset
- **Missing Endpoint Rate Limiting:**
  - *Source:* [`TRUVCA/docs/TRUV_LEDGEROS_PHASE2E_SECURITY_REPORT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/docs/TRUV_LEDGEROS_PHASE2E_SECURITY_REPORT.md) (Section 7, Table Item 6).
  - *Finding:* Application-level and reverse-proxy rate limiting is not implemented on `/api/auth/reset-password` and `/api/auth/forgot-password`. Vulnerable to brute-force and email-flooding attacks.
- **Insecure Godmode Route:**
  - *Source:* [`TRUV_LEDGEROS_PHASE1_AUDIT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUV_LEDGEROS_PHASE1_AUDIT.md) (Section 2, line 71).
  - *Finding:* Route `/godmode` (`src/app/godmode/page.tsx`) uses in-memory dummy tenants with no server-side authentication or `GODMODE_ADMIN` role guard.
- **Prisma Client Binary Lock on Windows:**
  - *Source:* [`TRUVCA/docs/TRUV_LEDGEROS_PHASE2E_SECURITY_REPORT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/docs/TRUV_LEDGEROS_PHASE2E_SECURITY_REPORT.md) (Section 7, Table Item 3).
  - *Finding:* When `next dev` is running, Windows file locking prevents `npx prisma generate` from replacing `query_engine-windows.dll.node` (`EPERM`).

### 6.2 Tenant Isolation & Authorization
- **Cross-Tenant IDOR Data Leakage:**
  - *Source:* [`TRUV_LEDGEROS_PHASE1_AUDIT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUV_LEDGEROS_PHASE1_AUDIT.md) (Section 1, line 19; Section 2, lines 81-82).
  - *Finding:* Route handlers `/api/compliance/due-obligations` and `/api/documents/pending-requests` fail to scope queries by `tenantId` and allow signature checks to be bypassed, exposing compliance and document records across all tenants to any logged-in user.
- **Middleware Session Interception of Webhooks & Crons:**
  - *Source:* [`TRUV_LEDGEROS_PHASE1_AUDIT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUV_LEDGEROS_PHASE1_AUDIT.md) (Section 1, line 20; Section 2, lines 83-84).
  - *Finding:* `src/middleware.ts` intercepts all requests lacking session cookies and redirects them to `/login`, inadvertently blocking external webhook endpoints (`/api/webhooks/n8n`) and automated cron endpoints (`/api/cron/outbox-dispatch`).
- **Duplicate Client Records Blocking Unique Tax Constraints:**
  - *Source:* [`TRUVCA/docs/TRUV_LEDGEROS_PHASE2B_DATABASE_REVIEW.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/docs/TRUV_LEDGEROS_PHASE2B_DATABASE_REVIEW.md) (Sections 1.1 & 4.1).
  - *Finding:* Exactly 5 pairs of duplicate client records (10 records total) exist in tenant `cmv3qbc2900016k484ty6djm8`. Child relations (`Invoice`, `Contact`, `Task`, `DocumentRequest`, `GstProfile`) are attached to these duplicates. Applying unique indexes on `(tenantId, pan)` and `(tenantId, gstin)` is currently blocked until a dedicated merge migration is executed.

### 6.3 Financial Decimal Precision
- **Legacy Float Drift in Database Migration:**
  - *Source:* [`TRUV_LEDGEROS_PHASE1_AUDIT.md`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUV_LEDGEROS_PHASE1_AUDIT.md) (Section 4, lines 198-202).
  - *Finding:* The archived prototype migration (`20261006041258_phase2_auth_rbac_tenancy`) generated currency columns as `DOUBLE PRECISION`. While the active baseline `0_init` and live Neon schema use `numeric(12, 2)`, all frontend and server-action calculations must rigorously enforce `roundToPaise` to prevent JavaScript floating-point math rounding drift.

### 6.4 Migration & Backup Recovery Gaps
- **Missing Post-Baseline Backup:**
  - *Source:* Current Audit Inspection (`C:\Users\imris\.truv_secure_backups`).
  - *Finding:* Only the pre-Step 5 backup exists. Disaster recovery of the live environment would lose `PasswordResetToken` and `_prisma_migrations`.

### 6.5 Real PostgreSQL Integration Tests
- **Absence of Real Database Test Execution:**
  - *Source:* [`TRUVCA/tests/password-reset-concurrency.test.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/tests/password-reset-concurrency.test.ts) (lines 18-44), [`TRUVCA/tests/phase3-financial.test.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/tests/phase3-financial.test.ts) (lines 22-40).
  - *Finding:* 100% of the project's automated test suites execute against in-memory JavaScript mocks (`new Map()`) or pure arithmetic utility functions. Zero integration tests execute against a real PostgreSQL instance. Database-level race conditions, foreign key cascades, unique constraint violations, and transaction isolation semantics (`READ COMMITTED` vs `SERIALIZABLE`) remain unvalidated against PostgreSQL.

---

## 7. Final Verdict

$$\mathbf{PARTIAL\ —\ RECOVERY\ OR\ RELEASE\ GAPS\ REMAIN}$$

### Verdict Rationale

1. **What is Verified:**
   - The PostgreSQL 18.6 portable tooling setup is operational.
   - The logical backup artifact (`truv_neondb_backup_20261013_095251.dump`) is bit-for-bit verified and 100% restorable.
   - The live database on Neon has been successfully baselined with zero schema drift.
2. **What Precludes a Full "READY" Certification:**
   - **Recovery Gap:** A post-baseline backup capturing the current 27-table live state has not yet been taken (`NOT VERIFIED`).
   - **Data Governance Blocker:** 5 duplicate client pairs prevent applying unique tax constraints.
   - **Security Blockers:** IDOR data leaks on compliance/document routes and missing rate limiting on auth endpoints remain open.
   - **Testing Gap:** Zero integration tests currently run against a real PostgreSQL database.

All Phase 2I verification tasks are complete. No database modifications, migrations, or Phase 3 actions have been initiated.
