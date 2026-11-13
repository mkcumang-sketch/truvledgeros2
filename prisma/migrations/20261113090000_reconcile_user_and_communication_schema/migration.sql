-- Reconcile fields and enum types present in the Prisma schema but missing
-- from the original baseline migration. Safe for existing rows and repeatable
-- on databases where these columns/type have already been provisioned manually.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "resetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenExpires" TIMESTAMP(3);

DO $$
BEGIN
  CREATE TYPE "CommunicationStatus" AS ENUM (
    'DRAFT',
    'ANSWERED',
    'QUEUED',
    'INITIATED',
    'SENT',
    'DELIVERED',
    'FAILED',
    'BOUNCED',
    'STANDBY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Preserve all known status values. Legacy or unknown values are retained as
-- STANDBY rather than causing a migration failure on older installations.
ALTER TABLE "Communication"
  ALTER COLUMN "status" TYPE "CommunicationStatus"
  USING (
    CASE
      WHEN "status" IN ('DRAFT', 'ANSWERED', 'QUEUED', 'INITIATED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'STANDBY')
        THEN "status"
      ELSE 'STANDBY'
    END
  )::"CommunicationStatus";

ALTER TABLE "Communication"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';
