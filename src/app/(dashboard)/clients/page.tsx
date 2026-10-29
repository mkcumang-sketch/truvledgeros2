import React, { Suspense } from "react";
import { requireTenant } from "@/lib/auth/session";
import {
  getClientDirectory,
  getClientMetrics,
  getTenantTeamMembers,
} from "@/lib/server/client-service";
import { ClientsDirectoryClient } from "./ClientsDirectoryClient";
import { serializeForClient } from "@/lib/serialization";

export const metadata = {
  title: "Clients 360 Directory • TRUV LedgerOS",
  description: "Manage client master records, PAN/GSTIN compliance status, and assigned lead partners.",
};

export default async function ClientsPage() {
  await requireTenant();

  const [directory, metrics, teamMembers] = await Promise.all([
    getClientDirectory({ status: "ALL", pageSize: 100 }),
    getClientMetrics(),
    getTenantTeamMembers(),
  ]);

  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-graphite-500">Loading Clients 360 directory...</div>}>
      <ClientsDirectoryClient
        initialClients={serializeForClient(directory.clients) as any}
        metrics={serializeForClient(metrics)}
        teamMembers={serializeForClient(teamMembers)}
        initialStatus="ACTIVE"
      />
    </Suspense>
  );
}
