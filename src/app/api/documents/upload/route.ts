import crypto from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DocumentStatus } from "@prisma/client";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/server/security/request-validator";
import { ALLOWED_MIME_TYPES, uploadBufferToS3, verifyMagicBytes } from "@/lib/server/s3";
import { serializeForClient } from "@/lib/serialization";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;
    const userId = context.user.id;
    const formData = await request.formData();
    const file = formData.get("file");
    const clientId = formData.get("clientId");
    const title = formData.get("title");
    const category = formData.get("category");
    const requestId = formData.get("requestId");

    if (!(file instanceof File) || !clientId || typeof clientId !== "string") {
      return NextResponse.json({ error: "A file and target client are required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 10 MB." }, { status: 413 });
    }

    const mimeType = (file.type || "").trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json({ error: "This file type is not supported." }, { status: 415 });
    }

    const client = await db.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) {
      return NextResponse.json({ error: "Client not found in this practice." }, { status: 404 });
    }

    if (requestId && typeof requestId === "string") {
      const documentRequest = await db.documentRequest.findFirst({
        where: { id: requestId, tenantId, clientId },
        select: { id: true },
      });
      if (!documentRequest) {
        return NextResponse.json({ error: "Document request not found for this client." }, { status: 404 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!verifyMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: "The file content does not match its declared type." }, { status: 415 });
    }

    const extension = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
    const key = `${tenantId}/users/${userId}/${crypto.randomUUID()}${extension}`;
    await uploadBufferToS3({ key, buffer, contentType: mimeType });

    const document = await db.document.create({
      data: {
        tenantId,
        clientId,
        name: typeof title === "string" && title.trim() ? title.trim().slice(0, 180) : file.name.slice(0, 180),
        category: typeof category === "string" && category.trim() ? category.trim().slice(0, 60) : "General",
        fileSize: file.size,
        mimeType,
        fileUrl: key,
        requestId: typeof requestId === "string" && requestId ? requestId : null,
        status: DocumentStatus.UPLOADED,
      },
    });

    if (typeof requestId === "string" && requestId) {
      await db.documentRequest.updateMany({
        where: { id: requestId, tenantId, clientId },
        data: { status: DocumentStatus.UPLOADED },
      });
    }

    return NextResponse.json({ success: true, document: serializeForClient(document) }, { status: 201 });
  } catch (error: any) {
    if (error?.message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "PERSISTENT_STORAGE_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Secure document storage is not configured. Contact the system administrator." }, { status: 503 });
    }
    console.error("[Document Upload Error]", error);
    return NextResponse.json({ error: "Unable to securely store this document." }, { status: 500 });
  }
}
