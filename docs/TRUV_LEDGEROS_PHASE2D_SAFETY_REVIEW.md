# TRUV LEDGEROS — PHASE 2D: INDEPENDENT SQL AND MIGRATION SAFETY REVIEW

**Author:** DeepMind Agentic Coding Assistant (Antigravity IDE)  
**Date:** October 13, 2026  
**Repository:** `TRUVCA / TRUV LedgerOS`  
**Phase:** Phase 2D (Independent SQL & Migration Safety Review)  
**Target Database:** Neon Cloud Serverless PostgreSQL (`ep-square-wildflower-b5bmrz7r-pooler.c-7.us-east-2.aws.neon.tech`)  
**Scope Under Review:**
- Proposed Additive SQL: [`prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql)
- Schema Definition: [`prisma/schema.prisma`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/schema.prisma)
- Password-Reset Logic: [`src/lib/auth/actions.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/src/lib/auth/actions.ts)
- Migration History: [`prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/migration.sql)

---

## 1. EXECUTIVE SUMMARY & FINAL VERDICT

An exhaustive, read-only architectural safety review was performed on the Phase 2C preparation artifacts. The additive SQL script ([`20261013_phase2c_add_password_reset_token.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql)) successfully isolates the `PasswordResetToken` table from client deduplication risks. However, deep analysis of the application transaction logic, migration baselining mechanics, and database rollback behavior revealed **critical security and operational risks** that must be resolved prior to production execution.

### Final Decision: **CONDITIONAL NO-GO**
Live database execution is **NOT AUTHORIZED** until:
1. The **concurrency race condition** in [`src/lib/auth/actions.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/src/lib/auth/actions.ts) (which permits concurrent multi-use of a single-use token) is remediated with an atomic conditional update (`WHERE id = ... AND usedAt IS NULL`).
2. The **redundant duplicate index** on `tokenHash` in the proposed SQL is removed.
3. The **migration baselining strategy** is corrected to prevent shadow database drift caused by mismatched `DOUBLE PRECISION` types in the legacy prototype migration.
4. A **verified, restorability-tested database backup** is produced and validated.

---

## 2. SEVERITY CLASSIFICATION OF FINDINGS

| ID | Finding Description | Severity | Impacted Area | Remediation Priority |
|---|---|:---:|---|:---:|
| **SEC-01** | **Concurrency Race Condition on Single-Use Token Redemption** | **CRITICAL** | `src/lib/auth/actions.ts` | Immediate (Pre-Execution) |
| **MIG-01** | **Migration Baselining Type Drift on Shadow Database** | **HIGH** | `prisma/migrations/` | Immediate (Pre-Baselining) |
| **OPS-01** | **Absence of Verified Database Backup and Test Restoration** | **HIGH** | Neon Database Ops | Immediate (Pre-Execution) |
| **SQL-01** | **Rollback Misrepresentation & Dependent Object Destruction** | **MEDIUM** | Proposed SQL Rollback | Documentation & Procedure |
| **SQL-02** | **Redundant Duplicate Index on `tokenHash`** | **MEDIUM** | Proposed SQL DDL | Code Adjustment |
| **SQL-03** | **`CREATE TABLE IF NOT EXISTS` Lack of Schema Validation** | **LOW** | Proposed SQL DDL | Known Limitation |
| **CLI-01** | **Prisma Client Windows Native Engine File Lock** | **LOW** | `@prisma/client` | Operational (Dev Server) |

---

## 3. FILE-BY-FILE FINDINGS WITH EVIDENCE

---

### 3.1 [`prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql)

#### Finding SQL-01: Rollback Misrepresentation & Cascading Destruction (Severity: MEDIUM)
- **Evidence:**
  ```sql
  -- ROLLBACK SCRIPT (IF RECOVERY IS NEEDED):
  -- BEGIN;
  -- DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;
  -- COMMIT;
  ```
- **Analysis:**
  Phase 2C described this rollback as an "instantaneous, non-destructive rollback". This claim is technically inaccurate:
  1. **Destruction of Active State:** Dropping `"PasswordResetToken"` permanently destroys all active, pending password reset tokens. Any legitimate users who received a reset email within the 1-hour window will experience broken links and failed password resets.
  2. **Cascading Side Effects:** In PostgreSQL, `DROP TABLE ... CASCADE` automatically and silently removes any foreign keys pointing *to* this table, any database views referencing this table (e.g., audit views or reporting views), and dependent triggers.
- **Verdict:** Replaced the claim of "instant rollback" with an explicit risk statement: *Rollback via `DROP TABLE` is data-destructive for active reset sessions and bypasses dependency safeguards via `CASCADE`.*

#### Finding SQL-02: Redundant Duplicate Index on `tokenHash` (Severity: MEDIUM)
- **Evidence:**
  ```sql
  -- Line 22:
  CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" 
  ON "PasswordResetToken"("tokenHash");

  -- Line 30:
  CREATE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_idx" 
  ON "PasswordResetToken"("tokenHash");
  ```
- **Analysis:**
  The proposed SQL creates **two identical B-tree indexes** on the single column `tokenHash`.
  - In PostgreSQL, a `UNIQUE INDEX` automatically provides B-tree search capabilities for queries filtering by `tokenHash = <value>`.
  - Creating a secondary non-unique index (`PasswordResetToken_tokenHash_idx`) provides zero performance benefit and wastes disk space, cache memory, and write I/O on every token creation and redemption.
- **Root Cause:** In `schema.prisma`, line 228 declares `tokenHash String @unique`, and line 236 declares `@@index([tokenHash])`. Prisma creates both in its DDL generation if both are specified.
- **Remediation:** Remove line 236 (`@@index([tokenHash])`) from `schema.prisma` and remove `PasswordResetToken_tokenHash_idx` from the SQL script. The unique index `PasswordResetToken_tokenHash_key` is completely sufficient.

#### Finding SQL-03: `CREATE TABLE IF NOT EXISTS` Schema Blindness (Severity: LOW)
- **Evidence:**
  ```sql
  CREATE TABLE IF NOT EXISTS "PasswordResetToken" ( ... );
  ```
- **Analysis:**
  `CREATE TABLE IF NOT EXISTS` provides *existence idempotency*, not *schema conformance*.
  - If a table named `"PasswordResetToken"` already exists with different columns (e.g. from a prior developer experiment), PostgreSQL emits a notice and skips table creation entirely.
  - Subsequent index and foreign key statements will fail with `column does not exist`.
  - *Mitigating Fact:* Introspection of the live Neon database (`check-db.js` and `prisma migrate diff`) confirmed that `"PasswordResetToken"` does not exist in `neondb`. However, this limitation must be acknowledged for shared/staging environments.

---

### 3.2 [`src/lib/auth/actions.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/src/lib/auth/actions.ts)

#### Finding SEC-01: Concurrency Race Condition on Token Redemption (Severity: CRITICAL)
- **Evidence:**
  ```ts
  // Step A: Find token outside transaction (lines 170-173)
  resetRecord = await (db as any).passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  // Step B: Application-level check (line 179)
  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
    return { error: "Invalid or expired password reset link." };
  }

  // Step C: Expensive CPU hashing (~100-200ms bcrypt delay) (line 183)
  const hashedPassword = await hashPassword(newPassword);

  // Step D: Non-conditional update in transaction (lines 186-198)
  await db.$transaction([
    db.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash: hashedPassword },
    }),
    (db as any).passwordResetToken.update({
      where: { id: resetRecord.id }, // <-- NO CHECK FOR usedAt === null!
      data: { usedAt: new Date() },
    }),
    db.session.deleteMany({
      where: { userId: resetRecord.userId },
    }),
  ]);
  ```
- **Attack Vector & Race Condition:**
  1. Attacker or client issues two simultaneous HTTP requests (Req 1 and Req 2) with the same reset token.
  2. Req 1 and Req 2 both execute Step A simultaneously. Both retrieve `resetRecord` where `usedAt === null`.
  3. Both requests pass the check at Step B.
  4. Both requests spend 150ms computing `bcrypt` password hashes at Step C.
  5. Req 1 executes Step D: updates the user's password and sets `usedAt = now()`. Transaction commits.
  6. Req 2 executes Step D: updates the user's password again and updates `usedAt = now()`. Because `where: { id: resetRecord.id }` has no condition checking `usedAt IS NULL`, PostgreSQL successfully executes the second update!
  7. **Result:** The single-use invariant is violated. A single reset token is redeemed twice concurrently.
- **Required Fix:**
  Replace the unconditional `update` with an atomic conditional update inside the transaction:
  ```ts
  const updateResult = await (db as any).passwordResetToken.updateMany({
    where: {
      id: resetRecord.id,
      usedAt: null, // Atomic check-and-set
    },
    data: { usedAt: new Date() },
  });

  if (updateResult.count === 0) {
    throw new Error("TOKEN_ALREADY_USED");
  }
  ```
  If another concurrent request redeemed the token during the bcrypt hashing window, `updateResult.count` evaluates to `0`, and the transaction aborts, returning `"Invalid or expired password reset link."`.

#### Finding SEC-02: Error Handling and Safe Messaging (VERIFIED SECURE)
- In `requestPasswordResetAction`: The function returns a generic dispatch message regardless of whether the user exists or if database token storage is temporarily unavailable. This prevents account enumeration and timing attacks.
- In `resetPasswordAction`: Any validation error, query failure, or transaction rollback returns `{ error: ... }`. The function **never** silently returns `{ success: true }` when a password reset fails.

---

### 3.3 [`prisma/schema.prisma`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/schema.prisma)

#### Finding SCH-01: Schema Representation vs. SQL Alignment (VERIFIED WITH 1 REDUNDANCY)
- **Column Types:**
  - `id`: `String @id @default(cuid())` $\rightarrow$ `TEXT PRIMARY KEY` (**MATCH**)
  - `userId`: `String` $\rightarrow$ `TEXT NOT NULL` (**MATCH**)
  - `tokenHash`: `String @unique` $\rightarrow$ `TEXT NOT NULL UNIQUE` (**MATCH**)
  - `expiresAt`: `DateTime` $\rightarrow$ `TIMESTAMP(3) NOT NULL` (**MATCH**)
  - `usedAt`: `DateTime?` $\rightarrow$ `TIMESTAMP(3)` Nullable (**MATCH**)
  - `createdAt`: `DateTime @default(now())` $\rightarrow$ `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` (**MATCH**)
- **Foreign Key:** `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` $\rightarrow$ `FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE` (**MATCH**)
- **Redundant Index:** Line 236 (`@@index([tokenHash])`) duplicates line 228 (`tokenHash String @unique`). Should be pruned from `schema.prisma`.

---

### 3.4 Migration History & Baselining Strategy

#### Finding MIG-01: Shadow Database Type Drift on Baselining (Severity: HIGH)
- **Evidence:**
  `prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/migration.sql` lines 53, 54, 312, 317, 371:
  ```sql
  "approvalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50000.00,
  "defaultGstRate" DOUBLE PRECISION NOT NULL DEFAULT 18.00,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  ```
- **The Risk:**
  Phase 2C proposed running:
  `npx prisma migrate resolve --applied 20261006041258_phase2_auth_rbac_tenancy`
  However, this legacy migration contains `DOUBLE PRECISION` for monetary fields, whereas:
  - The live Neon database uses `numeric(12, 2)` for these fields.
  - `prisma/schema.prisma` declares `Decimal @db.Decimal(12, 2)`.
- **Consequence:**
  If that legacy migration is resolved as applied, whenever a developer runs `prisma migrate dev`:
  1. Prisma creates a temporary **shadow database**.
  2. Prisma executes all recorded migrations in `prisma/migrations/` (creating tables with `DOUBLE PRECISION`).
  3. Prisma compares the shadow database with `prisma/schema.prisma` (which specifies `Decimal(12, 2)`).
  4. Prisma detects a schema conflict between its migration history and its datamodel:
     *"The following columns in your migration history do not match your schema... Prisma needs to alter columns from DOUBLE PRECISION to DECIMAL..."*
  5. Prisma will either prompt to reset the database or generate a spurious alter-column migration.
- **Correct Baselining Architecture:**
  Before baselining:
  1. Create a true, clean initial baseline migration file that matches the actual schema (`Decimal(12, 2)`):
     `prisma/migrations/0_init/migration.sql`.
  2. Retire or replace the draft `20261006041258` migration.
  3. Resolve `0_init` as applied: `npx prisma migrate resolve --applied 0_init`.
  4. Then and only then apply subsequent additive migrations.

---

### 3.5 Generated Prisma Client Status & Process Lock

#### Finding CLI-01: Windows Native Binary Lock (Severity: LOW)
- **Status:**
  - TypeScript definitions in `node_modules/.prisma/client/index.d.ts` already expose `PasswordResetToken`.
  - Model delegate `db.passwordResetToken` is active and recognized by `PrismaClient`.
  - Typecheck (`tsc --noEmit`) passes with 0 errors.
- **Generation Blocker:**
  Running `npx prisma generate` fails with `EPERM: operation not permitted` on `query_engine-windows.dll.node` because active Node.js processes running the Next.js dev server hold an exclusive Windows OS file lock.
- **Manual Restart Steps for Operator:**
  1. Switch to the terminal running the Next.js development server.
  2. Stop the dev server (`Ctrl + C`).
  3. Run:
     ```powershell
     npx prisma generate
     ```
  4. Restart dev server:
     ```powershell
     npm run dev
     ```

---

## 4. BACKUP & RESTORATION PREREQUISITES

> [!WARNING]
> **RECONFIRMED: ZERO VERIFIED BACKUPS CURRENTLY EXIST.**
> No database dumps, cold SQL exports, or verified Neon snapshots exist in the repository or project files. Relying on cloud-provider background WAL retention without an explicit snapshot is unacceptable for schema modifications.

### 4.1 Required Pre-DDL Backup Protocol
Before any SQL or migration command is executed against the live Neon database:

1. **Capture Physical/Logical Dump:**
   ```powershell
   pg_dump -h "ep-square-wildflower-b5bmrz7r-pooler.c-7.us-east-2.aws.neon.tech" `
           -U "neondb_owner" -d "neondb" `
           --clean --if-exists --no-owner --no-privileges `
           -Fc -f "backups/truv_pre_phase2d_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
   ```
   *Alternative:* Create a dedicated Neon Cloud branch snapshot:
   ```bash
   neon branch create --name "pre-migration-safety-point"
   ```
2. **Mandatory Restorability Proof:**
   A backup must be tested before it is considered valid:
   - Run `pg_restore --list <backup_file>` and verify that all 19 application tables are enumerated.
   - Restore the dump into an isolated test container or temporary Neon branch.
   - Verify table row count parity between the live database and restored test database.

---

## 5. WORKING TREE VERIFICATION

- Working tree inspected via `git status`.
- Branch: `master` (No commits yet).
- Untracked files preserved.
- No unstaged changes discarded.
- Zero live database state modifications made during Phase 2D.

---

## 6. FINAL DECISION: CONDITIONAL NO-GO

### Explicit Scope of Decision:
| Proposed Action | Status | Blocker / Requirement |
|---|:---:|---|
| **Executing `20261013_phase2c_add_password_reset_token.sql` on Live DB** | **NO-GO** | Blocked on Backup Verification & SEC-01 concurrency fix |
| **Executing Client Deduplication / Unique Indexes** | **NO-GO** | Blocked on dedicated reconciliation window (Phase 2B finding) |
| **Running `prisma migrate deploy` or `prisma migrate dev`** | **NO-GO** | Blocked on MIG-01 baselining type drift |
| **Running `prisma migrate resolve --applied`** | **NO-GO** | Blocked on MIG-01 baselining type drift |

### Requirements to Advance to "GO":
1. **Fix SEC-01 in `src/lib/auth/actions.ts`:** Update token redemption to use atomic conditional updates (`WHERE id = ... AND usedAt IS NULL`) to eliminate concurrency race conditions.
2. **Prune Redundant Index:** Remove `CREATE INDEX "PasswordResetToken_tokenHash_idx"` from SQL and `schema.prisma`.
3. **Capture and Verify Backup:** Create and test a restorable database snapshot.
4. **Correct Baselining Architecture:** Ensure migration history files match `numeric(12, 2)` to prevent shadow database drift.

---

**Phase 2D Status: COMPLETE.**  
No migrations were executed. No live records were modified. All review findings are documented.
