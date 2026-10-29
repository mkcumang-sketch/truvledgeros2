import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serializeForClient } from "@/lib/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const context = await getSessionContext();
    if (!context?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const tenantId = context.membership?.tenantId || context.tenant?.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Active practice firm required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return NextResponse.json({
        clients: [],
        invoices: [],
        tasks: [],
        documents: [],
        compliance: [],
      });
    }

    const [clients, invoices, tasks, documents, compliance] = await Promise.all([
      db.client.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { pan: { contains: query, mode: "insensitive" } },
            { gstin: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          pan: true,
          gstin: true,
          planName: true,
        },
        take: 6,
      }).catch(() => []),

      db.invoice.findMany({
        where: {
          tenantId,
          OR: [
            { invoiceNumber: { contains: query, mode: "insensitive" } },
            { client: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          client: { select: { name: true } },
        },
        take: 6,
      }).catch(() => []),

      db.task.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { detail: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
        take: 6,
      }).catch(() => []),

      db.document.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
        },
        take: 6,
      }).catch(() => []),

      db.gstReturn.findMany({
        where: {
          tenantId,
          OR: [
            { period: { contains: query, mode: "insensitive" } },
            { financialYear: { contains: query, mode: "insensitive" } },
            { arnNumber: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          returnType: true,
          period: true,
          status: true,
          arnNumber: true,
        },
        take: 6,
      }).catch(() => []),
    ]);

    return NextResponse.json(
      serializeForClient({
        clients,
        invoices,
        tasks,
        documents,
        compliance,
      })
    );
  } catch (err: any) {
    console.error("[SearchAPI] Query execution failed:", err);
    return NextResponse.json(
      { error: "Internal search error" },
      { status: 500 }
    );
  }
}
