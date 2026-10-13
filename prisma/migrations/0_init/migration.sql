-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GODMODE_ADMIN', 'FIRM_OWNER', 'FIRM_ADMIN', 'PARTNER', 'MANAGER', 'EXECUTIVE', 'CLIENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'REJECTED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRecoveryStage" AS ENUM ('GENTLE', 'FIRM', 'FINAL_NOTICE', 'PARTNER_ESCALATION');

-- CreateEnum
CREATE TYPE "GstReturnType" AS ENUM ('GSTR_1', 'GSTR_3B', 'GSTR_9', 'GSTR_9C', 'CMP_08');

-- CreateEnum
CREATE TYPE "GstReturnStatus" AS ENUM ('DATA_PENDING', 'READY_FOR_REVIEW', 'AWAITING_CLIENT_APPROVAL', 'APPROVED_BY_CLIENT', 'FILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'VOICE', 'PORTAL', 'WEB', 'SMS');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('INVOICE_APPROVAL', 'PAYMENT_ESCALATION', 'DOCUMENT_CALL', 'GST_REVIEW', 'AI_HANDOFF', 'GENERAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "approvalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 50000.00,
    "defaultGstRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "defaultDueDays" INTEGER NOT NULL DEFAULT 15,
    "recoveryGentleDays" INTEGER NOT NULL DEFAULT 7,
    "recoveryFirmDays" INTEGER NOT NULL DEFAULT 15,
    "recoveryFinalDays" INTEGER NOT NULL DEFAULT 30,
    "docReminderLimit" INTEGER NOT NULL DEFAULT 3,
    "paymentLinkBase" TEXT,
    "uploadLinkBase" TEXT,
    "accountingSoftware" TEXT NOT NULL DEFAULT 'ZOHO_BOOKS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EXECUTIVE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "planName" TEXT,
    "monthlyFee" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "portalUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "serviceDescription" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "lastRecoveryStage" "PaymentRecoveryStage",
    "promiseToPayDate" TIMESTAMP(3),
    "syncedToBooks" BOOLEAN NOT NULL DEFAULT false,
    "accountingRefId" TEXT,
    "paymentLinkUrl" TEXT,
    "pdfUrl" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSacCode" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "referenceNo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "registrationDate" TIMESTAMP(3),
    "filingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "gstPortalUser" TEXT,

    CONSTRAINT "GstProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "returnType" "GstReturnType" NOT NULL,
    "period" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dataReceived" BOOLEAN NOT NULL DEFAULT false,
    "outputTax" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "inputTaxCredit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "netPayable" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "status" "GstReturnStatus" NOT NULL DEFAULT 'DATA_PENDING',
    "dataRequestedAt" TIMESTAMP(3),
    "summarySentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "arnNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestId" TEXT,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "category" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT,
    "clientId" TEXT,
    "invoiceId" TEXT,
    "referenceId" TEXT,
    "completedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "invoiceId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'OUTBOUND',
    "purpose" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "visitorName" TEXT,
    "visitorPhone" TEXT,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'WEB',
    "status" TEXT NOT NULL DEFAULT 'AI_ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "toolInvoked" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cronSchedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "errorDetails" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'TRIAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxClients" INTEGER NOT NULL DEFAULT 50,
    "maxAiRuns" INTEGER NOT NULL DEFAULT 1000,
    "maxVoiceMinutes" INTEGER NOT NULL DEFAULT 100,
    "maxWhatsAppMsgs" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_active_idx" ON "Tenant"("active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");

-- CreateIndex
CREATE INDEX "Session_sessionToken_idx" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Membership_tenantId_role_idx" ON "Membership"("tenantId", "role");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Client_tenantId_name_idx" ON "Client"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Client_tenantId_gstin_idx" ON "Client"("tenantId", "gstin");

-- CreateIndex
CREATE INDEX "Client_tenantId_active_idx" ON "Client"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Contact_tenantId_clientId_idx" ON "Contact"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_clientId_idx" ON "Invoice"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_dueDate_idx" ON "Invoice"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GstProfile_clientId_key" ON "GstProfile"("clientId");

-- CreateIndex
CREATE INDEX "GstProfile_tenantId_gstin_idx" ON "GstProfile"("tenantId", "gstin");

-- CreateIndex
CREATE INDEX "GstReturn_tenantId_status_idx" ON "GstReturn"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GstReturn_tenantId_dueDate_idx" ON "GstReturn"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "GstReturn_tenantId_period_idx" ON "GstReturn"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "GstReturn_tenantId_clientId_returnType_period_key" ON "GstReturn"("tenantId", "clientId", "returnType", "period");

-- CreateIndex
CREATE INDEX "DocumentRequest_tenantId_clientId_idx" ON "DocumentRequest"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "DocumentRequest_tenantId_status_idx" ON "DocumentRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Document_tenantId_clientId_idx" ON "Document"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Document_tenantId_status_idx" ON "Document"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_type_idx" ON "Task"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Task_tenantId_assignedToId_idx" ON "Task"("tenantId", "assignedToId");

-- CreateIndex
CREATE INDEX "Communication_tenantId_channel_idx" ON "Communication"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "Communication_tenantId_purpose_idx" ON "Communication"("tenantId", "purpose");

-- CreateIndex
CREATE INDEX "Communication_tenantId_createdAt_idx" ON "Communication"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_status_idx" ON "Conversation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_channel_idx" ON "Conversation"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_tenantId_active_idx" ON "KnowledgeBase"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Automation_tenantId_enabled_idx" ON "Automation"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Automation_tenantId_code_key" ON "Automation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_triggeredAt_idx" ON "AutomationRun"("automationId", "triggeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEvent_idempotencyKey_key" ON "AutomationEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationEvent_tenantId_status_idx" ON "AutomationEvent"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AutomationEvent_tenantId_eventType_idx" ON "AutomationEvent"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "AutomationEvent_idempotencyKey_idx" ON "AutomationEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_metric_recordedAt_idx" ON "UsageRecord"("tenantId", "metric", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_tenantId_provider_key" ON "Integration"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_isRead_idx" ON "Notification"("tenantId", "userId", "isRead");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstProfile" ADD CONSTRAINT "GstProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstProfile" ADD CONSTRAINT "GstProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturn" ADD CONSTRAINT "GstReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturn" ADD CONSTRAINT "GstReturn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
