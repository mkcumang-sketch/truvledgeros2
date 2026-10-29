import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DocumentsClient } from "./DocumentsClient";
import { serializeForClient } from "@/lib/serialization";

export const metadata = {
  title: "Document Vault • TRUV LedgerOS",
  description: "Secure client dossiers, checklists, and statutory documents.",
};

export default async function DocumentsPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [documents, clients] = await Promise.all([
    db.document.findMany({
      where: { tenantId },
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.client.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <DocumentsClient
      documents={serializeForClient(documents) as any}
      clients={serializeForClient(clients) as any}
    />
  );
}
