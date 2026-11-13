import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ALLOWED_MIME_TYPES, uploadBufferToS3, verifyMagicBytes } from "@/lib/server/s3";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/server/security/request-validator";
import {
  triageAndScanDocument,
  DocumentTriageResult,
} from "@/lib/server/ai/document-triage-scanner";
import {
  CommunicationChannel,
  CommunicationDirection,
  DocumentStatus,
  TaskType,
  TaskStatus,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * GET Handler: WhatsApp Cloud API Webhook Handshake Verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  }

  if (mode === "subscribe" && token && constantTimeEqual(token, verifyToken)) {
    console.log(">>> [WHATSAPP-WEBHOOK-HANDSHAKE] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden: Invalid verification token" }, { status: 403 });
}

/**
 * POST Handler: Omnichannel Inbound Document Ingestion (WhatsApp & Email)
 */
export async function POST(req: NextRequest) {
  try {
    const rawPayload = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    const inboundSecret = process.env.INBOUND_DOCUMENT_WEBHOOK_SECRET?.trim();
    const suppliedSecret =
      req.headers.get("x-inbound-webhook-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "";

    // A trusted gateway secret authenticates the tenant-routing header. Meta-signed
    // requests must additionally pass the raw-body HMAC check using the Meta App Secret.
    if (!inboundSecret || !suppliedSecret || !constantTimeEqual(suppliedSecret, inboundSecret)) {
      return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
    }
    if (signature) {
      if (!appSecret) {
        return NextResponse.json({ error: "WhatsApp webhook signature verification is not configured." }, { status: 503 });
      }
      const expectedSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawPayload).digest("hex")}`;
      if (!constantTimeEqual(signature, expectedSignature)) {
        return NextResponse.json({ error: "Invalid WhatsApp webhook signature." }, { status: 401 });
      }
    }

    let rawBody: any;
    try {
      rawBody = JSON.parse(rawPayload);
    } catch {
      return NextResponse.json({ error: "Invalid webhook JSON payload." }, { status: 400 });
    }

    // Tenant routing must come from a trusted gateway header, never an untrusted body field
    // or an arbitrary first-tenant fallback.
    const tenantId = req.headers.get("x-tenant-id")?.trim();
    if (!tenantId) {
      return NextResponse.json({ error: "Trusted x-tenant-id routing header is required." }, { status: 400 });
    }

    const tenant = await db.tenant.findFirst({
      where: { id: tenantId, active: true, isSuspended: false },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Active tenant not found for document ingestion." }, { status: 404 });
    }

    // 2. Parse Omnichannel Payload (WhatsApp Cloud API, Email Webhook, or Direct Unified API)
    let channel: "WHATSAPP" | "EMAIL" = "WHATSAPP";
    let senderIdentifier = "";
    let fileName = `inbound_doc_${Date.now()}.pdf`;
    let mimeType = "application/pdf";
    let fileBuffer: Buffer | null = null;
    let messageText = "";

    // Case A: WhatsApp Cloud API Webhook payload
    if (rawBody.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      channel = "WHATSAPP";
      const message = rawBody.entry[0].changes[0].value.messages[0];
      senderIdentifier = message.from || "";

      if (message.type === "document" && message.document) {
        fileName = message.document.filename || fileName;
        mimeType = message.document.mime_type || mimeType;
        messageText = message.document.caption || "";
        if (message.document.data) {
          fileBuffer = Buffer.from(message.document.data, "base64");
        }
      } else if (message.type === "image" && message.image) {
        fileName = `whatsapp_img_${Date.now()}.jpg`;
        mimeType = message.image.mime_type || "image/jpeg";
        messageText = message.image.caption || "";
        if (message.image.data) {
          fileBuffer = Buffer.from(message.image.data, "base64");
        }
      }
    }
    // Case B: Inbound Email Webhook payload (Resend / SendGrid / Nodemailer)
    else if (rawBody.attachments && Array.isArray(rawBody.attachments)) {
      channel = "EMAIL";
      senderIdentifier = rawBody.from || rawBody.sender || "";
      const firstAttachment = rawBody.attachments[0];
      if (firstAttachment) {
        fileName = firstAttachment.filename || firstAttachment.name || fileName;
        mimeType = firstAttachment.type || firstAttachment.contentType || mimeType;
        if (firstAttachment.content) {
          fileBuffer = Buffer.from(firstAttachment.content, "base64");
        }
      }
    }
    // Case C: Unified Omnichannel / Testing Payload
    else {
      channel = rawBody.channel?.toUpperCase() === "EMAIL" ? "EMAIL" : "WHATSAPP";
      senderIdentifier = rawBody.sender || rawBody.senderPhone || rawBody.senderEmail || rawBody.from || "+919876543210";
      fileName = rawBody.fileName || fileName;
      mimeType = rawBody.mimeType || mimeType;

      if (rawBody.fileBase64) {
        fileBuffer = Buffer.from(rawBody.fileBase64, "base64");
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json({ error: "Webhook payload does not contain a real document attachment." }, { status: 400 });
    }
    if (fileBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: "Inbound document exceeds the 10 MB limit." }, { status: 413 });
    }
    mimeType = (mimeType || "").trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json({ error: "Inbound document file type is not supported." }, { status: 415 });
    }
    if (!verifyMagicBytes(fileBuffer, mimeType)) {
      return NextResponse.json({ error: "Inbound file content does not match its declared type." }, { status: 415 });
    }

    // 3. Match Sender to Existing Client or Tag as "Unassigned / New Leads Queue"
    const cleanSender = senderIdentifier.trim();
    if (!cleanSender) {
      return NextResponse.json({ error: "Webhook sender identity is required." }, { status: 400 });
    }
    let matchedClient = null;

    if (channel === "WHATSAPP") {
      const numericPhone = cleanSender.replace(/[^0-9]/g, "").slice(-10);
      matchedClient = await db.client.findFirst({
        where: {
          tenantId,
          OR: [
            { phone: { contains: numericPhone } },
            { contacts: { some: { phone: { contains: numericPhone } } } },
          ],
        },
      });
    } else {
      matchedClient = await db.client.findFirst({
        where: {
          tenantId,
          OR: [
            { email: { equals: cleanSender, mode: "insensitive" } },
            { contacts: { some: { email: { equals: cleanSender, mode: "insensitive" } } } },
          ],
        },
      });
    }

    // If client does not exist, route to Unassigned / New Leads Queue
    let isUnassignedLead = false;
    if (!matchedClient) {
      isUnassignedLead = true;
      matchedClient = await db.client.create({
        data: {
          tenantId,
          name: `Unassigned Inbound Lead [${cleanSender || "Unknown"}]`,
          businessName: "New Inbound Lead (Pending Verification)",
          phone: channel === "WHATSAPP" ? cleanSender : "+910000000000",
          email: channel === "EMAIL" ? cleanSender : `unassigned.${Date.now()}@inbound.truv.in`,
          notes: `Created automatically by Omnichannel Document Ingestion via ${channel}. Incoming file: ${fileName}`,
        },
      });
    }

    // 4. Save to Storage Pipeline (S3 / Local Object Storage)
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${tenantId}/vault/${Date.now()}_${sanitizedFileName}`;

    await uploadBufferToS3({
      key: storageKey,
      buffer: fileBuffer,
      contentType: mimeType,
    });

    // 5. Execute Multi-Modal Gemini Triage & Error Scan
    const triageResult: DocumentTriageResult = await triageAndScanDocument({
      buffer: fileBuffer,
      fileName,
      mimeType,
      clientContext: {
        clientName: matchedClient.name,
        clientGstin: matchedClient.gstin || undefined,
        clientPan: matchedClient.pan || undefined,
        clientState: matchedClient.state || undefined,
      },
    });

    // 6. Database Persistence
    const docStatus =
      triageResult.overallRisk === "CRITICAL_ERROR"
        ? DocumentStatus.PENDING
        : DocumentStatus.UPLOADED;

    const primaryError = triageResult.auditErrorsAndWarnings[0]?.description || null;

    const document = await db.document.create({
      data: {
        tenantId,
        clientId: matchedClient.id,
        name: fileName,
        fileUrl: storageKey,
        fileSize: fileBuffer.length,
        mimeType,
        category: triageResult.documentType,
        status: docStatus,
        metadata: triageResult as any,
        rejectionReason: primaryError,
      },
    });

    // 7. Auto-create URGENT Partner Task if Critical Discrepancy Flagged
    let taskCreated = false;
    let createdTaskId: string | null = null;

    if (triageResult.overallRisk === "CRITICAL_ERROR" || isUnassignedLead) {
      const topError = triageResult.auditErrorsAndWarnings[0];
      const taskTitle = isUnassignedLead
        ? `[NEW LEAD] Review Inbound Document from ${cleanSender}`
        : `[CRITICAL DISCREPANCY] ${triageResult.documentType}: ${fileName} (${matchedClient.name})`;

      const taskDetail = `Omnichannel Document Ingestion Alert via ${channel}.
Client: ${matchedClient.name} (${cleanSender})
Detected Type: ${triageResult.documentType} (Confidence: ${triageResult.confidenceScore}%)
Overall Risk: ${triageResult.overallRisk}

Top Discrepancy:
${topError ? `• [${topError.category}] ${topError.title}: ${topError.description}` : "Manual review required"}

Recommended Remedy:
${topError?.suggestedRemedy || "Verify invoice numbers and client details."}

Pre-Drafted Client Response:
"${triageResult.suggestedClientReply}"`;

      const task = await db.task.create({
        data: {
          tenantId,
          clientId: matchedClient.id,
          type: TaskType.DOCUMENT_CALL,
          title: taskTitle,
          detail: taskDetail,
          priority: "URGENT",
          status: TaskStatus.OPEN,
          referenceId: document.id,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      taskCreated = true;
      createdTaskId = task.id;
    }

    // 8. Log Inbound Communication Audit Trail
    await db.communication.create({
      data: {
        tenantId,
        clientId: matchedClient.id,
        channel: channel === "WHATSAPP" ? CommunicationChannel.WHATSAPP : CommunicationChannel.EMAIL,
        direction: CommunicationDirection.INBOUND,
        purpose: "DOCS",
        category: "INBOUND_INGESTION",
        recipient: cleanSender,
        subject: `Inbound Document Received: ${fileName} [${triageResult.documentType}]`,
        content: `Document: ${fileName} received via ${channel}.
Classification: ${triageResult.documentType} (${triageResult.confidenceScore}% confidence)
Statutory Risk: ${triageResult.overallRisk}
Detected Issues: ${triageResult.auditErrorsAndWarnings.length}
Partner Summary: ${triageResult.partnerSummary}`,
        status: "DELIVERED",
        externalRef: document.id,
      },
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      documentName: document.name,
      category: document.category,
      clientMatched: {
        id: matchedClient.id,
        name: matchedClient.name,
        isUnassignedLead,
      },
      channel,
      triageResult,
      taskCreated,
      taskId: createdTaskId,
    });
  } catch (error: any) {
    console.error("[INBOUND-DOCUMENT-WEBHOOK-FATAL]", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process inbound document webhook",
      },
      { status: 500 }
    );
  }
}
