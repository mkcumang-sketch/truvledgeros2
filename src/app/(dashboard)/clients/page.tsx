import React from "react";
import { requireTenant } from "@/lib/auth/session";
import {
  getClientDirectory,
  getClientMetrics,
  getTenantTeamMembers,
} from "@/lib/server/client-service";
import { ClientsDirectoryClient } from "./ClientsDirectoryClient";

export const metadata = {
  title: "Clients 360° Directory — TRUV LedgerOS",
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
    <ClientsDirectoryClient
      initialClients={directory.clients as any}
      metrics={metrics}
      teamMembers={teamMembers}
      initialStatus="ACTIVE"
    />
  );
}