-- CreateTable
CREATE TABLE IF NOT EXISTS "CallingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "callingWindowStart" TEXT NOT NULL DEFAULT '10:00',
    "callingWindowEnd" TEXT NOT NULL DEFAULT '18:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "retryLimit" INTEGER NOT NULL DEFAULT 2,
    "retryIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
    "languagePreference" TEXT NOT NULL DEFAULT 'HINGLISH',
    "scriptTemplate" TEXT,
    "assignedOwnerId" TEXT,
    "createdById" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "nextAction" TEXT,
    "assignedOwnerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledCall_idempotencyKey_key" ON "ScheduledCall"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallingCampaign_tenantId_status_idx" ON "CallingCampaign"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CallingCampaign_tenantId_scheduledAt_idx" ON "CallingCampaign"("tenantId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "CallingCampaign_tenantId_createdAt_idx" ON "CallingCampaign"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledCall_tenantId_status_scheduledFor_idx" ON "ScheduledCall"("tenantId", "status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "ScheduledCall_tenantId_clientId_idx" ON "ScheduledCall"("tenantId", "clientId");
CREATE INDEX IF NOT EXISTS "ScheduledCall_campaignId_idx" ON "ScheduledCall"("campaignId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "CallingCampaign" ADD CONSTRAINT "CallingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CallingCampaign" ADD CONSTRAINT "CallingCampaign_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CallingCampaign" ADD CONSTRAINT "CallingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ScheduledCall" ADD CONSTRAINT "ScheduledCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ScheduledCall" ADD CONSTRAINT "ScheduledCall_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CallingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ScheduledCall" ADD CONSTRAINT "ScheduledCall_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ScheduledCall" ADD CONSTRAINT "ScheduledCall_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
