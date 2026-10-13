-- ==============================================================================
-- TRUV LEDGEROS — PHASE 2A: PROPOSED SCHEMA SYNCHRONIZATION MIGRATION
-- Migration Name: 20261013_phase2a_security_schema_sync.sql
-- Status: PROPOSED (DO NOT EXECUTE AUTOMATICALLY IN PHASE 2A)
-- Database Target: PostgreSQL / Neon Serverless
-- ==============================================================================
-- Summary of Remediation:
-- 1. Creates PasswordResetToken table to support secure, 1-hour expiring, one-time-use password resets.
-- 2. Deduplicates historical test/seed client entities sharing duplicate PAN/GSTIN in tenant cmv3qbc2900016k484ty6djm8.
-- 3. Adds tenant-scoped partial unique indexes for Client(tenantId, pan) and Client(tenantId, gstin)
--    safely handling nullable fields and empty strings.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: CREATE TABLE PasswordResetToken
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Unique index for constant-time lookup and replay protection
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" 
ON "PasswordResetToken"("tokenHash");

-- Query performance indexes
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" 
ON "PasswordResetToken"("userId");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_idx" 
ON "PasswordResetToken"("tokenHash");

-- Foreign key with cascading delete on User deletion
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey'
    ) THEN
        ALTER TABLE "PasswordResetToken" 
        ADD CONSTRAINT "PasswordResetToken_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 2: SAFE DEDUPLICATION FOR CLIENT PAN & GSTIN (PRE-INDEX PREREQUISITE)
-- ------------------------------------------------------------------------------
-- In tenant 'cmv3qbc2900016k484ty6djm8', 5 client pairs share identical GSTIN/PAN 
-- from multiple seed runs. Child references must be repointed before deduplication.

WITH RankedClients AS (
    SELECT 
        id, 
        "tenantId", 
        gstin, 
        pan,
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as rn,
        FIRST_VALUE(id) OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as primary_id
    FROM "Client"
    WHERE ("gstin" IS NOT NULL AND "gstin" <> '') OR ("pan" IS NOT NULL AND "pan" <> '')
),
Duplicates AS (
    SELECT id, primary_id FROM RankedClients WHERE rn > 1
)
-- Re-parent dependent records to the surviving primary Client record
UPDATE "Invoice" i
SET "clientId" = d.primary_id
FROM Duplicates d
WHERE i."clientId" = d.id;

WITH RankedClients AS (
    SELECT 
        id, 
        "tenantId", 
        gstin, 
        pan,
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as rn,
        FIRST_VALUE(id) OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as primary_id
    FROM "Client"
    WHERE ("gstin" IS NOT NULL AND "gstin" <> '') OR ("pan" IS NOT NULL AND "pan" <> '')
),
Duplicates AS (
    SELECT id, primary_id FROM RankedClients WHERE rn > 1
)
UPDATE "DocumentRequest" dr
SET "clientId" = d.primary_id
FROM Duplicates d
WHERE dr."clientId" = d.id;

WITH RankedClients AS (
    SELECT 
        id, 
        "tenantId", 
        gstin, 
        pan,
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as rn,
        FIRST_VALUE(id) OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as primary_id
    FROM "Client"
    WHERE ("gstin" IS NOT NULL AND "gstin" <> '') OR ("pan" IS NOT NULL AND "pan" <> '')
),
Duplicates AS (
    SELECT id, primary_id FROM RankedClients WHERE rn > 1
)
UPDATE "Contact" c
SET "clientId" = d.primary_id
FROM Duplicates d
WHERE c."clientId" = d.id;

-- Delete orphaned redundant duplicate client rows
WITH RankedClients AS (
    SELECT 
        id, 
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId", COALESCE(gstin, pan) 
            ORDER BY "createdAt" ASC, id ASC
        ) as rn
    FROM "Client"
    WHERE ("gstin" IS NOT NULL AND "gstin" <> '') OR ("pan" IS NOT NULL AND "pan" <> '')
)
DELETE FROM "Client"
WHERE id IN (
    SELECT id FROM RankedClients WHERE rn > 1
);


-- ------------------------------------------------------------------------------
-- STEP 3: TENANT-SCOPED UNIQUE CONSTRAINTS (PARTIAL INDEXES FOR NULL SAFETY)
-- ------------------------------------------------------------------------------
-- PostgreSQL partial unique indexes enforce uniqueness per tenant while allowing
-- multiple records with NULL or blank PAN/GSTIN where data is genuinely absent.

CREATE UNIQUE INDEX IF NOT EXISTS "Client_tenantId_pan_key" 
ON "Client"("tenantId", "pan") 
WHERE "pan" IS NOT NULL AND "pan" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Client_tenantId_gstin_key" 
ON "Client"("tenantId", "gstin") 
WHERE "gstin" IS NOT NULL AND "gstin" <> '';

COMMIT;

-- ==============================================================================
-- ROLLBACK SCRIPT (IF RECOVERY IS NEEDED):
-- ==============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS "Client_tenantId_gstin_key";
-- DROP INDEX IF EXISTS "Client_tenantId_pan_key";
-- DROP TABLE IF EXISTS "PasswordResetToken";
-- COMMIT;
