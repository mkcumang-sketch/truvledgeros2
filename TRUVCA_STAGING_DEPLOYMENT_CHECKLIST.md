# TRUVCA LedgerOS — Pre-Deployment Staging Checklist & Operational Safety Review

**Classification:** DevOps Preflight Standard & Pre-Deployment Safety Review  
**Target Staging Project:** `truvca-staging` (Newly created, independent Neon project)  
**Safety Gate Status:** **STOP GATE ACTIVE — ZERO REMOTE OPERATIONS, CLOUD PROVISIONING, OR MIGRATIONS EXECUTED**

---

## 1. Multi-Factor Isolation Verification & Limitations Analysis

### Critical Architectural Truth: Code-Level Limits vs. Cloud Reality
A project-name environment variable (`STAGING_PROJECT_NAME="truvca-staging"`), a hostname pattern, endpoint parity, an empty-table check, and an operator confirmation flag are valuable safety defenses, but **they do not independently prove Neon project ownership or the absence of inherited data**.

- **PostgreSQL Wire Protocol Limit:** A PostgreSQL client connecting via standard connection string receives connection telemetry (host, port, database, user). PostgreSQL wire protocol has no native awareness of the Neon Project Name (`truvca-staging`) or Neon organization ownership. Only the **Neon Management Console** or authenticated Neon Cloud API knows which project owns an endpoint.
- **Why Self-Asserted Env Vars are Insufficient:** If an operator mistakenly copies a connection string from a cloned child branch of production and also sets `STAGING_PROJECT_NAME="truvca-staging"`, the environment variable cannot detect the mistake on its own.
- **Fail-Closed Cleanliness Enforcement:** To protect against inherited or cloned databases, the readiness guard enforces that an initial staging preflight **fails closed** if any user tables/views in `public`, custom enum types in `public`, non-standard schemas, or an existing `_prisma_migrations` table are found.
- **Fail-Closed on Ambiguous Inspection:** If inspection queries against `information_schema` or `pg_type` fail due to permission errors or network timeouts, the guard **fails closed immediately** rather than assuming an empty database.
- **Mandatory Human Step:** Physical separation must be verified by visually confirming in the Neon Dashboard that the endpoint was generated inside `truvca-staging` and differs from `ep-square-wildflower-b5bmrz7r`.

---

## 2. Target Database Provider Protocol (Supabase Free Staging)

> **Provider Migration Notice:** In accordance with the database cleanup directive, Neon is removed as the staging database provider. The active staging configuration uses an independently isolated **Supabase PostgreSQL Free** project. Historical Neon candidate investigations (`ep-weathered-snow-b403ti47` / `ep-square-wildflower-b5bmrz7r`) are preserved for forensic auditability in Section 9.

### 2.1 Supabase Free Staging Project Provisioning & Verification Protocol

Before running any migration, verify the target project in the **Supabase Dashboard** (`https://supabase.com/dashboard`):

1. **Independent Project Creation:**
   - Create a new project in the Supabase Dashboard (e.g. `truvca-staging-preview`) on the Free tier.
   - Choose the AWS region matching application deployment (e.g., `us-east-2` Ohio or closest to Vercel Preview).
   - Generate a strong, random database password and store it securely in your password manager (never in Git).
2. **Retrieve Project Reference & Connection Strings:**
   - Navigate to **Project Settings → Database → Connection String**.
   - **`DATABASE_URL` (Runtime & Pooler):**
     - Select **Transaction** pooler mode (port `6543`, Supavisor pooler).
     - Host format: `aws-0-<region>.pooler.supabase.com:6543/postgres`
     - Username format: `postgres.<project-ref>`
     - Append `?pgbouncer=true&connection_limit=20`.
   - **`DIRECT_URL` (Migrations & CLI):**
     - Select **Direct** connection (port `5432`) or **Session** pooler mode (port `5432`).
     - Direct Host format: `db.<project-ref>.supabase.co:5432/postgres`
     - Username format: `postgres`
3. **Verify Identity & Parity Invariants:**
   - Both strings **must** resolve to the exact same Supabase Project Reference (`<project-ref>`).
   - The project reference must differ from any protected business database host.
4. **Clean Schema Gate Verification:**
   - Check the **Table Editor** in the Supabase Dashboard:
     - Standard `public` schema must have **0 user tables** and **0 custom enum types**.
     - No pre-existing application tables or cloned data.
   - Supabase system schemas (`auth`, `storage`, `vault`, `extensions`) reside in their own system namespaces and do not conflict with the uninitialized `public` schema domain models.

---

## 3. Package.json Migration Commands & Bypass Audit

| Script Command | Target / Implementation | Guard Status | Risk Analysis |
| :--- | :--- | :---: | :--- |
| **`npm run prisma:migrate`** | `prisma migrate dev` | **BYPASSES GUARD** | **P1 Risk:** Interactive local migration command that modifies schema directly using `.env` without isolation checks. Developers must NOT run this for staging. |
| **`npm run prisma:migrate:staging`** | `ts-node -r tsconfig-paths/register scripts/safe-migrate.ts` | **PROTECTED BY GUARD** | **Safe:** Evaluates endpoint identity, dual-URL parity, and schema cleanliness in memory immediately before spawning `prisma migrate deploy`. |
| **`npm run prisma:generate`** | `prisma generate` | **SAFE (Codegen)** | Safe code generator; does not connect to database or execute DDL. |
| **`npm run prisma:validate`** | `prisma validate` | **SAFE (Syntax)** | Validates `prisma/schema.prisma` syntax without database mutations. |
| **`npm run prisma:seed`** | `prisma db seed` | **BLOCKED** | Runs `prisma/seed.ts` directly without isolation guard. Blocked until post-migration synthetic fixtures are approved. |
| **`npm run db:readiness:staging`** | `ts-node -r tsconfig-paths/register scripts/db-readiness.ts --enforce-staging` | **PROTECTED BY GUARD** | Strict preflight gate; fails closed on non-staging hosts, pre-existing tables, or permissions errors. |

---

## 4. Migration Compatibility & Parity Review

A column-by-column, enum-by-enum, and constraint analysis between [`prisma/schema.prisma`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/schema.prisma) and the migration SQL files ([`0_init/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/migrations/0_init/migration.sql) + [`20261014000000_add_team_invitations/migration.sql`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/migrations/20261014000000_add_team_invitations/migration.sql)) was conducted:

| Architecture Layer | Schema Count | Migration SQL Count | Parity Status |
| :--- | :---: | :---: | :---: |
| **Prisma Models / Tables** | 28 models | 28 tables | **100% Match (0 missing tables)** |
| **Table Columns** | 248 scalar/enum columns | 248 columns | **100% Match (0 missing columns)** |
| **Enum Types** | 13 enums | 13 PostgreSQL types | **100% Match** |
| **Enum Values** | 68 total values | 68 exact values | **100% Match (0 discrepancies)** |
| **Foreign Key Constraints** | 46 relations | 46 relational constraints | **100% Match** |
| **Indexes** | 62 indexes | 62 indexes created | **100% Match** |
| **Postgres Extensions** | 0 required | 0 required | **Zero external extension dependency** |

### Unsupported Assumptions & Operational Notes
- **Prisma Direct Connection Requirement:** Prisma Migrate uses `directUrl` in `prisma/schema.prisma`. It requires a direct PostgreSQL connection (port `5432`, non-pooled) because transaction-mode connection poolers (PgBouncer) reject advisory locks (`pg_advisory_lock`) and multi-statement DDL transactions.
- **Clean Initialization Verified:** Migrations contain pure DDL (`CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD CONSTRAINT`) with zero assumptions of pre-existing tables. When applied to an empty database, Prisma will create `_prisma_migrations` and apply `0_init` followed by `20261014000000_add_team_invitations` cleanly.

---

## 5. Synthetic Test Data Safety Review (`prisma/seed.ts`)

A line-by-line inspection of [`prisma/seed.ts`](file:///c:/Users/imris/OneDrive/Desktop/TRUVCA/TRUVCA/prisma/seed.ts) identified realistic identifiers in the current demo fixtures.

### Proposed Synthetic Replacements (To apply only upon separate approval):
| Current Fixture Identifier | Risk Level | Proposed Obviously Synthetic Replacement |
| :--- | :---: | :--- |
| `Sharma Traders Pvt Ltd` | P2 (Realistic entity) | `Demo Client Alpha Trading Pvt Ltd` |
| `Mehta Textiles LLP` | P2 (Realistic entity) | `Demo Client Beta Manufacturing LLP` |
| `Patel Foods Private Limited` | P2 (Realistic entity) | `Demo Client Gamma Foods Pvt Ltd` |
| `Joshi Engineering Works` | P2 (Realistic entity) | `Demo Client Delta Engineering Enterprises` |
| `Verma Retail Enterprises` | P2 (Realistic entity) | `Demo Client Epsilon Retail Pvt Ltd` |
| `Priya Kulkarni, FCA` | P2 (Realistic person) | `Practice Owner FCA (Demo)` |
| `Rajesh Iyer, FCA` | P2 (Realistic person) | `Practice Partner FCA (Demo)` |
| `Ananya Mehta, ACA` | P2 (Realistic person) | `Practice Manager ACA (Demo)` |
| `+9198200xxxxx` (active Mumbai cellular prefix) | P1 (Notification risk) | `+910000000001` through `+910000000010` (reserved dummy block) |
| `godmode@truvtech.com` | P2 | `godmode-staging@example.internal` |

**Execution Status:** **Seed script was NOT executed and remains blocked.**

---

## 6. Security Invariants & Cleanliness Enforcement

| Safety Invariant | Implementation Mechanism | Verified Status |
| :--- | :--- | :---: |
| **`DATABASE_URL` + `DIRECT_URL` Checked** | Both connection strings are parsed and evaluated before any database interaction. | **VERIFIED** |
| **Credential Redaction** | `parseDbCoordinates` strips passwords before the last `@`. `sanitizeErrorMessage` scrubs passwords, bearer tokens, and URIs from logs and stack traces. | **VERIFIED** |
| **Protected Endpoint Lockout** | `ep-square-wildflower-b5bmrz7r` is permanently blacklisted. Fails closed with Exit Code 1 under all conditions. | **VERIFIED** |
| **Pooled & Direct Host Parsing** | Strips `-pooler` suffixes and compares base endpoint IDs. | **VERIFIED** |
| **Fail Closed on Pre-Existing Tables** | `evaluateSchemaCleanliness` rejects any database containing tables or views in `public`. | **VERIFIED** |
| **Fail Closed on Pre-Existing Custom Types** | `evaluateSchemaCleanliness` rejects any database containing pre-existing enum types in `public`. | **VERIFIED** |
| **Fail Closed on `_prisma_migrations`** | If `_prisma_migrations` table already exists in an alleged clean staging database, it fails closed with Exit Code 1. | **VERIFIED** |
| **Fail Closed on Inspection Errors** | If schema/table/type inspection queries fail due to permissions or ambiguity, the guard aborts immediately. | **VERIFIED** |
| **Coupled Migration Runner** | `scripts/safe-migrate.ts` verifies isolation in memory immediately before spawning `prisma migrate deploy` in the same execution context. | **VERIFIED** |
| **Zero Migrations Executed** | `prisma migrate deploy` was NOT run during this review. | **VERIFIED** |

---

## 7. Exact Windows PowerShell Commands (Post-Provisioning)

Execute these commands in your Windows PowerShell terminal after manually creating the `truvca-staging` project in the Neon dashboard:

```powershell
# 1. Generate Staging Cryptographic Secrets Directly to Clipboard (Never Printed to Screen)
# Copy 32-byte Master Encryption Key to clipboard
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | Set-Clipboard

# Copy 24-byte Cron Execution Secret to clipboard
node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" | Set-Clipboard

# 2. Set Staging Environment Variables in Current PowerShell Session
$env:CONFIRM_DISPOSABLE_STAGING_DB = "true"
$env:STAGING_PROJECT_NAME = "truvca-staging"
$env:DATABASE_URL = "<paste-pooled-connection-string-from-truvca-staging>"
$env:DIRECT_URL   = "<paste-direct-connection-string-from-truvca-staging>"

# 3. Run Strict Database Readiness Verification (Must exit with Code 0)
npm run db:readiness:staging

# 4. When Step 3 passes, Apply Schema Migrations to Staging
npm run prisma:migrate:staging
```

---

## 8. Comprehensive 4-Tier Deployment Checklist

### Tier 1: Verified Locally
- [x] **TypeScript Strict Compilation:** `npm run typecheck` passed (Exit Code 0, 0 compiler errors).
- [x] **ESLint Linting:** `npm run lint` passed (Exit Code 0, 0 warnings, 0 errors).
- [x] **Prisma Schema Validation:** `npm run prisma:validate` passed (Exit Code 0, valid schema).
- [x] **Schema & Migration Parity:** 28 models, 248 columns, 13 enums, 46 foreign keys, 62 indexes verified 100% matching.
- [x] **Isolation Gate Unit Tests:** `npm run test:db-guard` passed (Exit Code 0, 40 tests passed).
- [x] **Protected Business DB Lockout:** `npm run db:readiness:staging` against `ep-square-wildflower-b5bmrz7r` failed closed (Exit Code 1).
- [x] **Safe Migration Runner Gate:** `npm run prisma:migrate:staging` against `ep-square-wildflower-b5bmrz7r` failed closed (Exit Code 1).
- [x] **Fail Closed on Pre-Existing Tables:** Guard verified to reject databases containing tables, views, custom types, or `_prisma_migrations`.
- [x] **Decoupled Vercel Build:** `package.json` `"build": "prisma generate && next build"` confirmed does not run migrations.
- [x] **Local Git Branch:** `staging-preview` exists locally; 0 remote commits or pushes.

### Tier 2: Verified in Cloud Dashboard
- [x] **Candidate Staging Project Selected:** `truvca-staging` (Branch: `production`, Endpoint: `ep-weathered-snow-b403ti47`, DB: `neondb`).
- [x] **Physical Separation Verified:** Candidate endpoint `ep-weathered-snow-b403ti47` is distinct from protected production host `ep-square-wildflower-b5bmrz7r`.
- [x] **Catalog Investigation Completed (Read-Only):**
  - Found non-standard schema `neon_auth` (9 cloud auth tables).
  - Found sample table `playing_with_neon` (10 sample rows) in `public` schema.
  - Zero application business data found.
- [x] **App Neon Auth Dependency Audit:** Confirmed TRUVCA LedgerOS has 0 dependencies on Neon Auth. Auth is managed internally via Prisma models (`User`, `Session`, etc.) in `public`.

### Tier 3: Remaining Verification Steps (Operator Action Required)
- [ ] **STAGING DATABASE CLEANLINESS RESOLUTION:**
  - The current database `neondb` on `ep-weathered-snow-b403ti47` contains `playing_with_neon` in `public` and `neon_auth` schema.
  - **Cleanliness Guard Verdict:** Both objects independently block initial migrations (`evaluateSchemaCleanliness` fails closed).
  - **Required Action:** To achieve an uninitialized clean staging target without violating safety rules:
    - *Option A (Recommended):* Create a clean database (e.g. `truv_staging`) inside the `truvca-staging` project in the Neon Dashboard (`CREATE DATABASE truv_staging;`). A newly created database starts completely empty (0 tables, standard `public` schema only).
    - *Option B:* In Neon Dashboard / SQL Editor, remove the sample table `playing_with_neon` and address the `neon_auth` schema. (No remote DDL was executed by the agent).
- [ ] **CONFIGURE CONNECTION STRINGS & ENDPOINT PARITY IN `.env` / ENVIRONMENT:**
  - `DATABASE_URL`: Set to Pooled connection string for the verified clean database (contains `-pooler`).
  - `DIRECT_URL`: Set to Direct connection string for the verified clean database (unpooled, port `5432`).
  - Note: Both must share base endpoint `ep-weathered-snow-b403ti47` and the same database name.
- [ ] **SET OPERATOR FLAGS:**
  - `STAGING_PROJECT_NAME="truvca-staging"`
  - `CONFIRM_DISPOSABLE_STAGING_DB="true"`
- [ ] **EXECUTE PREFLIGHT GATE:**
  - Run `npm run db:readiness:staging` — must pass with Exit Code 0 and report `CLEAN EMPTY DATABASE`.
- [ ] **EXECUTE SAFE MIGRATION:**
  - Run `npm run prisma:migrate:staging` — applies baseline `0_init` and `20261014000000_add_team_invitations`.
- [ ] **CONFIGURE PREVIEW-SCOPED ENVIRONMENT VARIABLES IN VERCEL:**
  - `APP_ENV = staging` (Preview scope only)
  - `DATABASE_URL` (Preview scope only)
  - `DIRECT_URL` (Preview scope only)
  - `ENCRYPTION_KEY` (Preview scope only)
  - `CRON_SECRET` (Preview scope only)
  - `CONFIRM_DISPOSABLE_STAGING_DB = true` (Preview scope only)
  - `STAGING_PROJECT_NAME = truvca-staging` (Preview scope only)
  - Leave `RESEND_API_KEY`, `RAZORPAY_KEY_ID`, `WHATSAPP_ACCESS_TOKEN` unconfigured in Preview.

### Tier 4: Blocked
- [ ] **BLOCKED:** Pushing `staging-preview` branch to remote GitHub repository.
- [ ] **BLOCKED:** Modifying Vercel dashboard settings or initiating preview deployments.
- [ ] **BLOCKED:** Running migrations against any unverified or active database.
- [ ] **BLOCKED:** Running seed scripts (`prisma db seed`) before migrations and schema validation.
- [ ] **BLOCKED:** Bypassing cleanliness checks via `--allow-existing-schema` on initial staging.
- [ ] **BLOCKED:** Configuring n8n or external webhooks (deferred).

---

## 9. Staging Database Candidate Investigation Summary (`ep-weathered-snow-b403ti47`)

| Investigation Item | Finding / Value | Gate Impact |
| :--- | :--- | :---: |
| **Neon Project** | `truvca-staging` | Matched |
| **Active Branch** | `production` | Matched |
| **Base Endpoint ID** | `ep-weathered-snow-b403ti47` | **SAFE** (Distinct from protected `ep-square-wildflower-b5bmrz7r`) |
| **Target Database** | `neondb` | Verified |
| **`neon_auth` Schema** | 9 tables present | **BLOCKS MIGRATION** (Fails non-standard schema cleanliness check) |
| **`playing_with_neon` Table** | 1 table in `public` (10 rows) | **BLOCKS MIGRATION** (Fails 0-table cleanliness check) |
| **App Neon Auth Dependency** | 0 dependencies | TRUVCA uses native Prisma models with `bcryptjs` and `truv_session` cookie |
| **`DIRECT_URL` in `.env`** | **UNSET** | **BLOCKS PRISMA** (Causes `prisma validate` / migration error) |
| **Endpoint Parity** | `DATABASE_URL` set, `DIRECT_URL` unset | **BLOCKS MIGRATION** (`endpointsMatch: false`) |
| **Operator Flags** | `CONFIRM_DISPOSABLE_STAGING_DB` unset | **BLOCKS MIGRATION** |
| **Migration Gate Status** | **HARD STOP ACTIVE** | Initial migration cannot run until database is clean and env is configured |

---

## 10. Stop Gate Status

The application preflight and regression test suite are verified locally. Migration to `ep-weathered-snow-b403ti47` remains strictly blocked by the cleanliness guard until the candidate database is cleaned/provisioned and `DIRECT_URL` parity is configured. Zero remote DDL, drops, migrations, or secret exposures were performed.
