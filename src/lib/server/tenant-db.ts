import { db } from "@/lib/db";
import { Role } from "@prisma/client";

export interface TenantScopedContext {
  tenantId: string;
  userId: string;
  role: Role;
  clientId?: string; // Set when user is a CLIENT
}

export function createTenantDb(ctx: TenantScopedContext) {
  const { tenantId, role, clientId } = ctx;

  return {
    clients: {
      async findMany() {
        if (role === "CLIENT" && clientId) {
          return db.client.findMany({ where: { tenantId, id: clientId } });
        }
        return db.client.findMany({ where: { tenantId } });
      },
      async findUnique(id: string) {
        if (role === "CLIENT" && clientId && id !== clientId) {
          return null; // IDOR prevention
        }
        return db.client.findFirst({ where: { id, tenantId } });
      },
    },

    invoices: {
      async findMany(whereFilter: Record<string, unknown> = {}) {
        return db.invoice.findMany({
          where: {
            ...whereFilter,
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
          include: { items: true, payments: true },
        });
      },
      async findUnique(id: string) {
        return db.invoice.findFirst({
          where: {
            id,
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
          include: { items: true, payments: true },
        });
      },
    },

    payments: {
      async findMany() {
        return db.payment.findMany({
          where: {
            tenantId,
            ...(role === "CLIENT" && clientId ? { invoice: { clientId } } : {}),
          },
        });
      },
      async findUnique(id: string) {
        return db.payment.findFirst({
          where: {
            id,
            tenantId,
            ...(role === "CLIENT" && clientId ? { invoice: { clientId } } : {}),
          },
        });
      },
    },

    documents: {
      async findMany() {
        return db.document.findMany({
          where: {
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
        });
      },
      async findUnique(id: string) {
        return db.document.findFirst({
          where: {
            id,
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
        });
      },
    },

    gstReturns: {
      async findMany() {
        return db.gstReturn.findMany({
          where: {
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
        });
      },
      async findUnique(id: string) {
        return db.gstReturn.findFirst({
          where: {
            id,
            tenantId,
            ...(role === "CLIENT" && clientId ? { clientId } : {}),
          },
        });
      },
    },
  };
}