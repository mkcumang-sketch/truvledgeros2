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

-- Fail safely if legacy status values are outside the Prisma enum. Do not
-- silently rewrite historical communication states during a production migration.
DO $
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Communication"
    WHERE "status" NOT IN ('DRAFT', 'ANSWERED', 'QUEUED', 'INITIATED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'STANDBY')
  ) THEN
    RAISE EXCEPTION 'Communication.status contains values outside CommunicationStatus; review and reconcile them before migrating.';
  END IF;
END $;

ALTER TABLE "Communication"
  ALTER COLUMN "status" TYPE "CommunicationStatus"
  USING "status"::"CommunicationStatus";

ALTER TABLE "Communication"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';
