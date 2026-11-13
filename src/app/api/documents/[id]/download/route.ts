import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDownloadPresignedUrl } from "@/lib/server/s3";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const context = await requireTenant();
    const document = await db.document.findFirst({
      where: { id: params.id, tenantId: context.membership.tenantId },
      select: { id: true, name: true, fileUrl: true },
    });

    if (!document || !document.fileUrl) {
      return NextResponse.json({ error: "Stored document not found." }, { status: 404 });
    }
    if (!document.fileUrl.startsWith(`${context.membership.tenantId}/`)) {
      return NextResponse.json({ error: "This legacy document must be securely re-uploaded before it can be downloaded." }, { status: 409 });
    }

    const downloadUrl = await getDownloadPresignedUrl({
      key: document.fileUrl,
      tenantId: context.membership.tenantId,
      originalFileName: document.name,
    });

    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error: any) {
    if (error?.message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Document Download Error]", error);
    return NextResponse.json({ error: "Unable to retrieve this document." }, { status: 500 });
  }
}
