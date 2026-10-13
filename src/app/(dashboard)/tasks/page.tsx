import React from "react";
import { requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { TasksClient } from "./TasksClient";

export const metadata = {
  title: "Tasks & Partner Approvals — TRUV LedgerOS",
  description: "Practice workflow management, return reviews, and approval thresholds.",
};

export default async function TasksPage() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [tasks, clients, memberships] = await Promise.all([
    db.task.findMany({
      where: { tenantId },
      include: {
        client: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.client.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.membership.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { role: "asc" },
    }),
  ]);

  const teamMembers = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    role: m.role,
  }));

  return (
    <TasksClient
      tasks={tasks as any}
      clients={clients}
      teamMembers={teamMembers}
    />
  );
}