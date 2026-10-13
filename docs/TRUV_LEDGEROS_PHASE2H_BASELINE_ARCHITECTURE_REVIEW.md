# TRUV LEDGEROS — PHASE 2H: BASELINE ARCHITECTURE FINAL REVIEW

**Date:** October 13, 2026  
**Auditor / Architect:** Antigravity Agentic Security & Database Architect  
**Status:** COMPLETE (READ-ONLY ARCHITECTURE REVIEW)  
**Target Application:** TRUV LedgerOS (`c:\Users\imris\OneDrive\Desktop\TRUVCA\TRUVCA`)  
**Target Database:** Neon Cloud Serverless PostgreSQL (`ep-square-wildflower-b5bmrz7r-pooler...`)  
**Reviewed Artifact:** [`prisma/baseline/0_init/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/baseline/0_init/migration.sql)  
**Verdict:** **NO-GO FOR LIVE EXECUTION IN THIS PHASE — RUNBOOK PREPARED FOR OPERATOR APPROVAL**

---

## 1. Executive Summary

Phase 2H conducts the final, exhaustive architecture review of the Prisma migration baseline prepared in Phase 2G. 

The baseline script ([`prisma/baseline/0_init/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/baseline/0_init/migration.sql)) was generated to resolve a dangerous historical drift condition: the live Neon database was provisioned via `prisma db push`, leaving it without a `_prisma_migrations` history table, while the sole migration in the repository ([`20261006041258_phase2_auth_rbac_tenancy/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/migration.sql)) was an obsolete prototype with 17 floating-point `DOUBLE PRECISION` columns and no `Session` model.

This review delivers:
1. **Empirical Verification of the Baseline:** Confirms that `prisma/baseline/0_init/migration.sql` represents 100% of the active Prisma datamodel (27 tables, 12 enums, 44 foreign keys, 58 indexes, all 17 `DECIMAL` columns) with SHA-256 checksum `f850bf013ec035fb137429451ae2abdc467e2fd1238d4a5017b751e0074d2989`.
2. **Analysis of Prisma 5.22.0 Baselining Mechanics:** Details how Prisma Migrate resolves history when `_prisma_migrations` is absent and why blindly running `prisma migrate deploy` would fail immediately.
3. **Decoupling Physical Schema Equivalence from Migration History Registration:** Demonstrates why the additive `PasswordResetToken` table must be created in PostgreSQL **before** `0_init` is resolved as applied.
4. **Isolated Testing Strategies Without Local Docker/Postgres:** Evaluates Neon copy-on-write branching, WebAssembly PGlite, and ephemeral test databases.
5. **A Phased, Checkpoint-Gated Future Runbook:** Formulates an ordered execution plan with explicit stop conditions.
6. **Strict Evidence Segregation:** Explicitly categorizes all information into *Verified Local Facts*, *Unverified Assumptions*, *Proposed Actions*, and *Actions Requiring Operator Approval*.

---

## 2. Categorized Architectural State

```mermaid
graph TD
    subgraph FACTS["1. Verified Local Facts"]
        F1["Baseline matches schema 100%<br/>(27 tables, 12 enums, 17 decimals)"]
        F2["SHA-256 checksum verified:<br/>f850bf013ec0..."]
        F3["Live DB lacks _prisma_migrations<br/>(Provisioned via db push)"]
        F4["Legacy migration has type drift<br/>(DOUBLE PRECISION, no Session)"]
    end

    subgraph ASSUMPTIONS["2. Unverified Assumptions"]
        A1["Host environment lacks local DB<br/>(No Docker or local postgres)"]
        A2["Live Neon database state stable<br/>(19 models matching schema)"]
        A3["No external active transactions<br/>holding locks on User/Tenant"]
    end

    subgraph PROPOSED["3. Proposed Actions"]
        P1["Capture pg_dump backup"]
        P2["Apply additive PasswordResetToken DDL"]
        P3["Promote 0_init & archive legacy migration"]
        P4["Resolve 0_init as applied"]
    end

    subgraph APPROVAL["4. Actions Requiring Operator Approval"]
        O1["Execute DDL against live Neon database"]
        O2["Reorganize prisma/migrations/ directory"]
        O3["Execute prisma migrate resolve on Neon"]
    end

    FACTS --> PROPOSED
    ASSUMPTIONS --> PROPOSED
    PROPOSED --> APPROVAL
```

### 2.1 Verified Local Facts
1. **Baseline Parity:** [`prisma/baseline/0_init/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/baseline/0_init/migration.sql) matches [`prisma/schema.prisma`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/schema.prisma) 1:1:
   - Exactly 12 Enums in schema $\rightarrow$ Exactly 12 `CREATE TYPE` statements in baseline.
   - Exactly 27 Models in schema $\rightarrow$ Exactly 27 `CREATE TABLE` statements in baseline.
   - Exactly 46 `@@index` definitions $\rightarrow$ Exactly 46 `CREATE INDEX` statements in baseline.
   - Exactly 5 composite `@@unique` + 7 inline `@unique` (12 unique constraints) $\rightarrow$ Exactly 12 `CREATE UNIQUE INDEX` statements in baseline.
   - Exactly 44 foreign key relations $\rightarrow$ Exactly 44 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements in baseline.
   - Exactly 17 financial columns declared as `Decimal` in schema $\rightarrow$ Exactly 17 `DECIMAL(...)` definitions in baseline.
   - Zero `DOUBLE PRECISION` columns. Zero `DROP` or `TRUNCATE` statements.
2. **Checksum Integrity:** The SHA-256 hash of `prisma/baseline/0_init/migration.sql` was recalculated from disk and confirmed as `f850bf013ec035fb137429451ae2abdc467e2fd1238d4a5017b751e0074d2989` (28,657 bytes, 820 lines).
3. **Absence of Migration Tracking:** In the live Neon database, the table `_prisma_migrations` does not exist.
4. **Legacy Migration Hazards:** The legacy file `prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/migration.sql` lacks `Session`, lacks `PasswordResetToken`, and declares monetary fields as `DOUBLE PRECISION`.

### 2.2 Unverified Assumptions
1. **Live Schema Invariance:** It is assumed that no unrecorded manual DDL modifications have occurred on the live Neon database since Phase 2B's initial inspection.
2. **Neon Connection Pooler State:** It is assumed that PgBouncer / Neon connection pooler is operating in standard transaction mode and will allow `_prisma_migrations` creation without session-mode locks.
3. **Lock Availability:** It is assumed that when maintenance DDL is eventually executed, no long-running transactions are actively holding exclusive table locks on `User` or `Tenant`.

### 2.3 Proposed Actions
1. Execute an offline, verified logical backup using `pg_dump` and validate restorability in an isolated branch.
2. Execute the standalone additive script [`prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/proposed_migrations/20261013_phase2c_add_password_reset_token.sql) on Neon.
3. Move `prisma/baseline/0_init/` into `prisma/migrations/0_init/` and archive `20261006041258_...` to `.archive/legacy_migrations/`.
4. Register `0_init` as applied using `npx prisma migrate resolve --applied 0_init`.

### 2.4 Actions Requiring Explicit Operator Approval
1. **Connecting to Neon with DDL privileges** to create `PasswordResetToken`.
2. **Modifying the Git repository's `prisma/migrations/` structure** (moving or archiving legacy migration files).
3. **Registering the baseline migration** in Neon's `_prisma_migrations` table.

---

## 3. Analysis of Prisma 5.22.0 Baselining Mechanics

### 3.1 Behavior When `_prisma_migrations` Is Missing
In Prisma 5.22.0, the migration engine (`schema-engine-cli`) interacts with PostgreSQL as follows:

| Command Executed | Database State | Prisma Engine Action | Result on Live Neon DB |
|---|---|---|---|
| `prisma migrate deploy` | No `_prisma_migrations` | Creates `_prisma_migrations` table; attempts to run all files in `prisma/migrations/` in alphabetical order. | **FATAL CRASH:** Tries to execute `CREATE TABLE "Tenant"` $\rightarrow$ Aborts with `relation "Tenant" already exists`. |
| `prisma migrate dev` | No `_prisma_migrations` | Detects that the database is not empty. Prompts: *"We found changes that cannot be applied cleanly... Reset database?"* | **CRITICAL RISK:** If accepted, drops the public schema and deletes all operational data. |
| `prisma migrate resolve --applied <name>` | No `_prisma_migrations` | 1. Creates `_prisma_migrations` table.<br/>2. Reads `<name>/migration.sql` from disk and hashes it.<br/>3. Inserts metadata row with `finished_at = NOW()` and `applied_steps_count = 1`.<br/>4. **Executes zero SQL from the migration file.** | **SAFE BASELINE:** Registers migration history without modifying database objects. |

---

## 4. Proposal Evaluation: Introducing `0_init` and Archiving Legacy Migration

### 4.1 Safe Migration Directory Structure
In Prisma Migrate, all subdirectories under `prisma/migrations/` are treated as active migrations and are executed in lexical order. 

If `0_init` were placed into `prisma/migrations/0_init/` while `20261006041258_...` remained in `prisma/migrations/`:
- `0_init` would sort first.
- `20261006041258_phase2_auth_rbac_tenancy` would sort second.
- Resolving `0_init` as applied would leave `20261006041258` as a **pending, unapplied migration**.
- On the very next `prisma migrate deploy`, Prisma would attempt to execute `20261006041258` and crash with `relation "Tenant" already exists`.

### 4.2 Safe Archiving Strategy
During the authorized migration window:
1. Create a dedicated archive directory: `.archive/legacy_migrations/` (or `prisma/legacy_migrations/`).
2. Move `prisma/migrations/20261006041258_phase2_auth_rbac_tenancy/` into the archive directory.
3. Move `prisma/baseline/0_init/` into `prisma/migrations/0_init/`.
4. Resulting `prisma/migrations/` structure:
   ```
   prisma/
   ├── migrations/
   │   ├── 0_init/
   │   │   └── migration.sql
   │   └── migration_lock.toml
   └── schema.prisma
   ```

### 4.3 Risks of Modifying Migration History
- **In an existing migrated database:** Modifying or deleting migration folders causes checksum mismatch errors (`The migration ... has been modified since it was applied`).
- **In TRUV LedgerOS:** Because `_prisma_migrations` does not exist on Neon, no migration history has ever been recorded. Retiring the prototype migration does **not** cause checksum mismatch errors because there is no recorded history in the database.

---

## 5. Sequence Analysis: Additive DDL vs. Baseline Registration

A critical architectural question was evaluated: **Should the additive `PasswordResetToken` SQL be applied before or after `0_init` is resolved as applied?**

### 5.1 Technical Analysis of Both Sequences

#### Option A: Additive DDL BEFORE Baseline Registration (RECOMMENDED)
1. Live database currently has 26 models (all except `PasswordResetToken`).
2. Operator runs `20261013_phase2c_add_password_reset_token.sql` on Neon.
   - Table `PasswordResetToken` is created.
   - Live database now possesses **all 27 models**, matching `schema.prisma` and `0_init/migration.sql` 100%.
3. Operator runs `npx prisma migrate resolve --applied 0_init`.
   - `_prisma_migrations` is initialized with `0_init`.
   - **Outcome:** Physical database schema and Prisma migration metadata are in **perfect 100% equivalence**. Subsequent `prisma migrate deploy` runs execute 0 statements. Shadow database runs create 27 tables cleanly with zero drift.

#### Option B: Baseline Registration BEFORE Additive DDL (DEFECTIVE)
1. Operator marks `0_init` as applied on Neon while `PasswordResetToken` does not exist.
2. `_prisma_migrations` records `0_init` as applied.
3. Because `0_init` *includes* `CREATE TABLE "PasswordResetToken"`, Prisma assumes `PasswordResetToken` was created when `0_init` ran.
4. **Outcome:** A dangerous split-brain condition:
   - Prisma's migration history believes `PasswordResetToken` exists.
   - PostgreSQL's physical schema does **not** have `PasswordResetToken`.
   - Subsequent `prisma migrate deploy` commands will say *"No pending migrations"* and will **never create the table**.
   - Application password reset will throw runtime PostgreSQL errors: `relation "PasswordResetToken" does not exist`.

**Conclusion:** **Option A is mandatory.** The physical schema must reach full equivalence with `0_init` before `0_init` is registered in `_prisma_migrations`.

---

## 6. Safety of `prisma migrate diff` for Live Introspection

1. **Read-Only Invariant:** As confirmed via Prisma documentation and CLI inspection, `prisma migrate diff` is strictly read-only and does not issue DDL (`CREATE`, `ALTER`, `DROP`) or DML (`INSERT`, `UPDATE`, `DELETE`) against the datasource.
2. **Credential Confidentiality Policy:** To prevent credential leakage in logs or CI environments, running `prisma migrate diff --from-url "$DATABASE_URL"` must never echo connection strings, passwords, or pooler URLs to console output.
3. **Current Determination:** Because Phase 2B already performed live diff introspection and confirmed that only `PasswordResetToken` is missing, redundant network calls to Neon were bypassed during Phase 2H in favor of static analysis.

---

## 7. Isolated Testing Strategies Without Local Docker / Postgres

Because the host development environment (Windows x64) does not have Docker or a local PostgreSQL service installed, three isolated testing architectures are available:

### Strategy 1: Neon Serverless Instant Branching (RECOMMENDED)
Neon natively supports instant copy-on-write branching at the storage layer:
- The operator creates a disposable test branch from production:
  ```bash
  neon branch create --name "migration-test-sandbox"
  ```
- This provisions an isolated, fully functional PostgreSQL database with production schema and data in ~2 seconds.
- DDL and baseline commands are executed against the branch URL without any risk to the parent production database.
- After validation, the branch is deleted:
  ```bash
  neon branch delete "migration-test-sandbox"
  ```
- **Advantages:** 100% identical PostgreSQL engine version, zero local software installation required.

### Strategy 2: WebAssembly Embedded PostgreSQL (PGlite)
- Modern Node.js libraries such as `@electric-sql/pglite` package the full PostgreSQL 16 engine compiled to WebAssembly (Wasm).
- PGlite runs entirely in-memory inside Node.js without requiring background services or Docker.
- Can be used to test SQL DDL syntax and transactional rollback in automated test runners.

### Strategy 3: Sterile CI/CD Cloud Runner
- In GitHub Actions or GitLab CI, Linux runners provide pre-installed Docker and native PostgreSQL service containers (`services: postgres:16`).
- Test scripts and migrations can be executed against a transient ephemeral container during pull request checks.

---

## 8. Ordered Future Runbook with Checkpoints & Stop Conditions

> [!CAUTION]
> **DO NOT EXECUTE THIS RUNBOOK IN THIS PHASE.**  
> This runbook is strictly an architectural blueprint for future authorized deployment.

```
+-------------------------------------------------------------------------+
| PHASE 0: PRE-FLIGHT & BACKUP PREREQUISITES                              |
| Checkpoint 0.1: Terminate Next.js dev server (PID 25052).               |
| Checkpoint 0.2: Run `npx prisma generate` to refresh native engine.     |
| Checkpoint 0.3: Capture logical backup via pg_dump.                     |
| Checkpoint 0.4: Prove restorability via pg_restore in test branch.      |
| [STOP CONDITION 0]: Table count or row count mismatch -> HALT.          |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| PHASE 1: PHYSICAL SCHEMA ALIGNMENT (ADDITIVE DDL)                       |
| Checkpoint 1.1: Connect to Neon using production migration credentials. |
| Checkpoint 1.2: Execute 20261013_phase2c_add_password_reset_token.sql.  |
| Checkpoint 1.3: Verify PasswordResetToken table exists in Neon.         |
| [STOP CONDITION 1]: DDL syntax error or rollback failure -> HALT.       |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| PHASE 2: MIGRATION REPOSITORY PROMOTION                                 |
| Checkpoint 2.1: Create .archive/legacy_migrations/.                     |
| Checkpoint 2.2: Move 20261006041258_... into archive.                   |
| Checkpoint 2.3: Move prisma/baseline/0_init/ into prisma/migrations/.   |
| [STOP CONDITION 2]: Git working tree dirty or files missing -> HALT.    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| PHASE 3: METADATA HISTORY BASELINING                                    |
| Checkpoint 3.1: Execute `npx prisma migrate resolve --applied 0_init`.  |
| Checkpoint 3.2: Verify _prisma_migrations table created with 1 row.     |
| Checkpoint 3.3: Verify rolled_back_at IS NULL and status is success.    |
| [STOP CONDITION 3]: resolve returns non-zero exit code -> HALT.         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| PHASE 4: FULL SYSTEM VERIFICATION & POST-DEPLOYMENT                     |
| Checkpoint 4.1: Run `npx prisma migrate status` (Expect: up to date).   |
| Checkpoint 4.2: Run `npm run typecheck` (tsc --noEmit) (Expect: 0 err). |
| Checkpoint 4.3: Run `npm test` (all 254 test cases) (Expect: 100% pass).|
| Checkpoint 4.4: Restart Next.js dev server.                             |
+-------------------------------------------------------------------------+
```

---

## 9. Final Decision: GO / NO-GO

### Authoritative Verdict: **NO-GO FOR LIVE EXECUTION**

- **Architecture Review Status:** **APPROVED.** The baseline DDL, baselining sequence, and failure modes are fully understood and documented.
- **Artifact Status:** Prepared at `prisma/baseline/0_init/migration.sql` (SHA-256: `f850bf013ec035fb137429451ae2abdc467e2fd1238d4a5017b751e0074d2989`).
- **Live Database Status:** Untouched. No SQL executed against Neon.
- **Execution State:** **Strictly stopped.** Live execution requires explicit operator authorization, an active maintenance window, and verified pre-execution backup completion per Phase 0 of the runbook.

---
*Report certified by Antigravity Agentic Security & Database Architect.*  
*Phase 2H Baseline Architecture Review Concluded.*
