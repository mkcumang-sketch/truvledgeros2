import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DocumentStatus } from "@prisma/client";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/server/security/request-validator";

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientId = formData.get("clientId") as string | null;
    const category = (formData.get("category") as string | null) || "General";
    const requestId = formData.get("requestId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Bad Request", message: "No file was uploaded." },
        { status: 400 }
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: "Bad Request", message: "Target client is required." },
        { status: 400 }
      );
    }

    // Verify tenant ownership of target client (IDOR prevention)
    const client = await db.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) {
      return NextResponse.json(
        { error: "Forbidden", message: "Client not found in this practice." },
        { status: 403 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "Payload Too Large",
          message: "Uploaded file exceeds maximum limit of 10MB.",
        },
        { status: 413 }
      );
    }

    // Create Document record
    const document = await db.document.create({
      data: {
        tenantId,
        clientId,
        name: file.name,
        category,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        fileUrl: `/uploads/${file.name}`,
        requestId: requestId || null,
        status: DocumentStatus.UPLOADED,
      },
    });

    if (requestId) {
      await db.documentRequest.updateMany({
        where: { id: requestId, tenantId },
        data: { status: DocumentStatus.UPLOADED },
      });
    }

    return NextResponse.json(
      { success: true, document },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Upload API Error]", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error?.message || "Failed to process upload." },
      { status: 500 }
    );
  }
}
