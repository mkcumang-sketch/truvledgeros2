-- ==============================================================================
-- TRUV LEDGEROS — PHASE 2C: STANDALONE ADDITIVE MIGRATION
-- Migration Name: 20261013_phase2c_add_password_reset_token.sql
-- Status: PREPARED (DO NOT EXECUTE AUTOMATICALLY)
-- Target Database: PostgreSQL / Neon Serverless
-- Scope: PasswordResetToken Table, Indexes, and Constraints ONLY.
-- Excluded: Client deduplication, Client indexes, Financial column alterations.
-- ==============================================================================

BEGIN;

-- 1. Create PasswordResetToken table
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- 2. Create Unique Index on tokenHash for O(1) deterministic lookups
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" 
ON "PasswordResetToken"("tokenHash");

-- 3. Create Performance Index on userId for user audit and cleanup queries
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" 
ON "PasswordResetToken"("userId");

-- 4. Foreign Key to User with Cascading Delete (User deletion cleans up tokens)
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

COMMIT;

-- ==============================================================================
-- ROLLBACK SCRIPT (IF RECOVERY IS NEEDED):
-- ==============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;
-- COMMIT;
