import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/server/audit";
import { publishDomainEvent } from "./domain-events";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import {
  CLIENT_TYPES,
  ClientType,
  PAN_REGEX,
  GSTIN_REGEX,
} from "@/lib/constants/clients";

export { CLIENT_TYPES, PAN_REGEX, GSTIN_REGEX };
export type { ClientType };

export const CreateClientSchema = z.object({
  name: z.string().min(2, "Legal name must be at least 2 characters"),
  businessName: z.string().optional().nullable(),
  clientType: z.string().default("Pvt Ltd"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || GSTIN_REGEX.test(v), {
      message: "Please enter a valid 15-character Indian GSTIN (e.g. 27AAAAA0000A1Z5)",
    })
    .optional()
    .nullable()
    .or(z.literal("")),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || PAN_REGEX.test(v), {
      message: "Please enter a valid 10-character Permanent Account Number (e.g. AAAAA0000A)",
    })
    .optional()
    .nullable()
    .or(z.literal("")),
  email: z.string().trim().email("Please provide a valid primary email address"),
  phone: z.string().trim().min(10, "Please provide a valid 10-digit phone number"),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  monthlyFee: z.number().nonnegative("Monthly retainer must be zero or positive").default(0),
  notes: z.string().optional().nullable(),
  assignedLeadId: z.string().optional().nullable(),
});

export const UpdateClientSchema = CreateClientSchema.partial().extend({
  active: z.boolean().optional(),
});

export const ContactSchema = z.object({
  name: z.string().min(2, "Contact name required"),
  designation: z.string().optional().nullable(),
  email: z.string().email("Valid email required").optional().nullable().or(z.literal("")),
  phone: z.string().min(10, "Phone number required"),
  isPrimary: z.boolean().default(false),
});

export interface GetClientDirectoryOptions {
  search?: string;
  entityType?: string;
  status?: "ALL" | "ACTIVE" | "ARCHIVED";
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "createdAt" | "monthlyFee";
  sortOrder?: "asc" | "desc";
}

/**
 * Returns tenant-isolated client directory with search, filter, and pagination.
 */
export async function getClientDirectory(options: GetClientDirectoryOptions = {}) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const rawPage = Math.max(1, Number(options.page) || 1);
  const rawPageSize = Math.max(1, Number(options.pageSize) || 20);
  const pageSize = Math.min(100, rawPageSize); // Hard clamp to maximum 100

  // Whitelist sort fields
  const allowedSortBy: Record<string, string> = {
    name: "name",
    createdAt: "createdAt",
    monthlyFee: "monthlyFee",
  };
  const sortBy = allowedSortBy[options.sortBy as string] || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

  const {
    search = "",
    entityType = "ALL",
    status = "ACTIVE",
  } = options;

  const whereClause: Prisma.ClientWhereInput = {
    tenantId,
  };

  // Status Filter
  if (status === "ACTIVE") {
    whereClause.active = true;
  } else if (status === "ARCHIVED") {
    whereClause.active = false;
  }

  // Entity Type Filter
  if (entityType && entityType !== "ALL") {
    whereClause.planName = {
      contains: entityType,
      mode: "insensitive",
    };
  }

  // Search Filter
  if (search.trim()) {
    const term = search.trim();
    whereClause.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { businessName: { contains: term, mode: "insensitive" } },
      { pan: { contains: term, mode: "insensitive" } },
      { gstin: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
    ];
  }

  const skip = (rawPage - 1) * pageSize;

  const [clients, total] = await Promise.all([
    db.client.findMany({
      where: whereClause,
      include: {
        contacts: {
          orderBy: { isPrimary: "desc" },
          take: 2,
        },
        gstProfile: {
          select: { gstin: true, filingFrequency: true },
        },
        _count: {
          select: {
            invoices: true,
            tasks: true,
            documents: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take: pageSize,
    }),
    db.client.count({ where: whereClause }),
  ]);

  return {
    clients,
    total,
    page: rawPage,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/**
 * Computes authoritative live summary metrics for Clients 360 view.
 */
export async function getClientMetrics() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const [allClients, activeClients, corporateClients, invoices] = await Promise.all([
    db.client.count({ where: { tenantId } }),
    db.client.count({ where: { tenantId, active: true } }),
    db.client.count({
      where: {
        tenantId,
        active: true,
        OR: [
          { planName: { contains: "Pvt Ltd", mode: "insensitive" } },
          { planName: { contains: "PRIVATE_LIMITED", mode: "insensitive" } },
          { planName: { contains: "LLP", mode: "insensitive" } },
          { planName: { contains: "Limited", mode: "insensitive" } },
        ],
      },
    }),
    db.invoice.findMany({
      where: {
        tenantId,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        clientId: true,
        dueDate: true,
      },
    }),
  ]);

  // Clients with overdue invoices
  const now = new Date();
  const overdueClientIds = new Set(
    invoices.filter((inv) => new Date(inv.dueDate) < now).map((inv) => inv.clientId)
  );

  // Calculate total monthly retainers
  const clientRetainers = await db.client.findMany({
    where: { tenantId, active: true },
    select: { monthlyFee: true },
  });
  const totalMonthlyRetainer = clientRetainers.reduce(
    (sum, c) => sum + Number(c.monthlyFee || 0),
    0
  );

  return {
    totalClients: allClients,
    activeClients,
    corporateClients,
    totalMonthlyRetainer,
    actionNeededCount: overdueClientIds.size,
  };
}

/**
 * Gets all active staff/partners in the current tenant for assignment controls.
 */
export async function getTenantTeamMembers() {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const memberships = await db.membership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: {
      role: "asc",
    },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));
}

/**
 * Creates a new client record, enforcing strict tenant isolation,
 * auto-creating the primary contact and GST profile if provided.
 */
export async function createClient(data: z.infer<typeof CreateClientSchema>) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const validated = CreateClientSchema.parse(data);

  // Duplicate identifier warnings/check within the firm
  if (validated.pan) {
    const existingPan = await db.client.findFirst({
      where: { tenantId, pan: validated.pan },
      select: { id: true, name: true },
    });
    if (existingPan) {
      throw new Error(
        `A client with PAN ${validated.pan} already exists in your practice: "${existingPan.name}". Please review or use an alternate identifier.`
      );
    }
  }

  if (validated.gstin) {
    const existingGstin = await db.client.findFirst({
      where: { tenantId, gstin: validated.gstin },
      select: { id: true, name: true },
    });
    if (existingGstin) {
      throw new Error(
        `A client with GSTIN ${validated.gstin} already exists in your practice: "${existingGstin.name}". Please verify the tax registration.`
      );
    }
  }

  // Validate lead assignment remains inside the firm
  if (validated.assignedLeadId) {
    const validMember = await db.membership.findFirst({
      where: { userId: validated.assignedLeadId, tenantId, status: "ACTIVE" },
    });
    if (!validMember) {
      throw new Error("The assigned partner/manager must hold an active membership in your firm.");
    }
  }

  const client = await db.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        tenantId,
        name: validated.name.trim(),
        businessName: validated.businessName?.trim() || null,
        planName: validated.clientType,
        gstin: validated.gstin || null,
        pan: validated.pan || null,
        email: validated.email.trim().toLowerCase(),
        phone: validated.phone.trim(),
        city: validated.city?.trim() || null,
        state: validated.state?.trim() || null,
        pincode: validated.pincode?.trim() || null,
        monthlyFee: validated.monthlyFee,
        notes: validated.notes?.trim() || null,
        active: true,
      },
    });

    // Create primary contact
    await tx.contact.create({
      data: {
        tenantId,
        clientId: created.id,
        name: validated.name.trim(),
        designation: "Primary Contact",
        email: validated.email.trim().toLowerCase(),
        phone: validated.phone.trim(),
        isPrimary: true,
      },
    });

    // Create GST Profile if GSTIN provided
    if (validated.gstin) {
      await tx.gstProfile.create({
        data: {
          tenantId,
          clientId: created.id,
          gstin: validated.gstin,
          legalName: validated.name.trim(),
          tradeName: validated.businessName?.trim() || null,
          filingFrequency: "MONTHLY",
        },
      });
    }

    return created;
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "CLIENT_CREATED" as any,
    entityType: "CLIENT",
    entityId: client.id,
    newValue: { name: client.name, email: client.email, pan: client.pan, gstin: client.gstin },
  });

  await publishDomainEvent({
    tenantId,
    eventType: "client.created",
    entityType: "CLIENT",
    entityId: client.id,
    payload: { clientId: client.id, name: client.name },
  });

  return client;
}

/**
 * Updates an existing client record.
 */
export async function updateClient(
  clientId: string,
  data: z.infer<typeof UpdateClientSchema>
) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const validated = UpdateClientSchema.parse(data);

  const existing = await db.client.findFirst({
    where: { id: clientId, tenantId },
  });

  if (!existing) {
    throw new Error("We couldn't find this client in your firm's records.");
  }

  // Duplicate checks if changing PAN or GSTIN
  if (validated.pan && validated.pan !== existing.pan) {
    const duplicate = await db.client.findFirst({
      where: { tenantId, pan: validated.pan, id: { not: clientId } },
    });
    if (duplicate) {
      throw new Error(`Another client in your firm already uses PAN ${validated.pan}.`);
    }
  }

  if (validated.gstin && validated.gstin !== existing.gstin) {
    const duplicate = await db.client.findFirst({
      where: { tenantId, gstin: validated.gstin, id: { not: clientId } },
    });
    if (duplicate) {
      throw new Error(`Another client in your firm already uses GSTIN ${validated.gstin}.`);
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id: clientId },
      data: {
        ...(validated.name !== undefined && { name: validated.name.trim() }),
        ...(validated.businessName !== undefined && { businessName: validated.businessName?.trim() || null }),
        ...(validated.clientType !== undefined && { planName: validated.clientType }),
        ...(validated.gstin !== undefined && { gstin: validated.gstin || null }),
        ...(validated.pan !== undefined && { pan: validated.pan || null }),
        ...(validated.email !== undefined && { email: validated.email.trim().toLowerCase() }),
        ...(validated.phone !== undefined && { phone: validated.phone.trim() }),
        ...(validated.city !== undefined && { city: validated.city?.trim() || null }),
        ...(validated.state !== undefined && { state: validated.state?.trim() || null }),
        ...(validated.pincode !== undefined && { pincode: validated.pincode?.trim() || null }),
        ...(validated.monthlyFee !== undefined && { monthlyFee: validated.monthlyFee }),
        ...(validated.notes !== undefined && { notes: validated.notes?.trim() || null }),
        ...(validated.active !== undefined && { active: validated.active }),
      },
    });

    // Sync GST Profile if GSTIN changed
    if (validated.gstin) {
      await tx.gstProfile.upsert({
        where: { clientId },
        create: {
          tenantId,
          clientId,
          gstin: validated.gstin,
          legalName: client.name,
          tradeName: client.businessName,
          filingFrequency: "MONTHLY",
        },
        update: {
          gstin: validated.gstin,
          legalName: client.name,
          tradeName: client.businessName,
        },
      });
    }

    return client;
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "CLIENT_UPDATED" as any,
    entityType: "CLIENT",
    entityId: updated.id,
    oldValue: { name: existing.name, email: existing.email },
    newValue: { name: updated.name, email: updated.email },
  });

  return updated;
}

/**
 * Archives a client without deleting financial, statutory, or audit history.
 */
export async function archiveClient(clientId: string) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
  });

  if (!client) {
    throw new Error("We couldn't locate this client in your firm's records.");
  }

  const archived = await db.client.update({
    where: { id: clientId },
    data: { active: false },
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "CLIENT_ARCHIVED" as any,
    entityType: "CLIENT",
    entityId: clientId,
    newValue: { active: false, archivedAt: new Date() },
  });

  return archived;
}

/**
 * Restores an archived client back to active status.
 */
export async function restoreClient(clientId: string) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
  });

  if (!client) {
    throw new Error("We couldn't locate this client in your firm's records.");
  }

  const restored = await db.client.update({
    where: { id: clientId },
    data: { active: true },
  });

  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "CLIENT_RESTORED" as any,
    entityType: "CLIENT",
    entityId: clientId,
    newValue: { active: true, restoredAt: new Date() },
  });

  return restored;
}

/**
 * Fetches authoritative 360° details and financial calculations for a single client.
 */
export async function getClient360Details(clientId: string) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
    include: {
      contacts: { orderBy: { isPrimary: "desc" } },
      gstProfile: true,
      invoices: {
        orderBy: { issuedDate: "desc" },
        include: { items: true, payments: true },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!client) {
    throw new Error("Client not found or unauthorized.");
  }

  // Calculate authoritative Client 360 Financial Summary
  let totalInvoiced = 0;
  let totalPaid = 0;
  let overdueAmount = 0;
  let overdueInvoiceCount = 0;
  const now = new Date();

  for (const inv of client.invoices) {
    if (inv.status === "CANCELLED" || inv.status === "DRAFT") continue;

    totalInvoiced += Number(inv.totalAmount);
    const invPaid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    totalPaid += invPaid;
    const remaining = Number(inv.totalAmount) - invPaid;

    if (remaining > 0 && new Date(inv.dueDate) < now) {
      overdueAmount += remaining;
      overdueInvoiceCount++;
    }
  }

  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

  return {
    client,
    summary: {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      overdueAmount,
      overdueInvoiceCount,
      invoiceCount: client.invoices.length,
    },
  };
}

/**
 * Adds an authorized contact to a client, enforcing single primary contact rule.
 */
export async function addClientContact(clientId: string, data: z.infer<typeof ContactSchema>) {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
    select: { id: true },
  });

  if (!client) throw new Error("Client not found.");

  return await db.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.contact.updateMany({
        where: { tenantId, clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await tx.contact.create({
      data: {
        tenantId,
        clientId,
        name: data.name.trim(),
        designation: data.designation?.trim() || null,
        email: data.email?.trim().toLowerCase() || "",
        phone: data.phone.trim(),
        isPrimary: data.isPrimary,
      },
    });

    await logSecurityEvent({
      tenantId,
      userId: context.user.id,
      action: "CONTACT_CREATED" as any,
      entityType: "CONTACT",
      entityId: contact.id,
    });

    return contact;
  });
}