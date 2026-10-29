/**
 * TRUV CA / LedgerOS — Authoritative AI Calling Campaign & Follow-up Service
 * 
 * Central domain logic for:
 * 1. Campaign lifecycle (Draft, Scheduled, Active, Paused, Completed, Cancelled)
 * 2. Recipient eligibility, contact preference, and quiet hours validation
 * 3. Authoritative metrics aggregation (explicit denominators, unique clients vs attempts)
 * 4. Call outcome engine & AI response classification
 * 5. Follow-up workspace & staff action items
 */

import { db } from "@/lib/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  TaskType,
  TaskStatus,
  Role,
} from "@prisma/client";
import { normalizeIndianPhoneNumber } from "./sarvam-telephony";
import { generateSecureToken } from "@/lib/auth/password";

export interface CreateCampaignInput {
  name: string;
  purpose: "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN" | "CUSTOM";
  description?: string;
  clientIds: string[];
  scheduledAt?: string | Date | null;
  callingWindowStart?: string; // e.g. "10:00"
  callingWindowEnd?: string;   // e.g. "18:00"
  timezone?: string;          // default "Asia/Kolkata"
  frequency?: "ONCE" | "DAILY" | "WEEKLY";
  retryLimit?: number;        // default 2
  retryIntervalMinutes?: number; // default 120
  languagePreference?: "HINGLISH" | "HINDI" | "ENGLISH";
  scriptTemplate?: string;
  assignedOwnerId?: string | null;
}

export interface EligibilityResult {
  eligibleClients: Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    latestInvoice?: { id: string; invoiceNumber: string; amount: number; dueDate: string } | null;
  }>;
  excludedClients: Array<{
    id: string;
    name: string;
    phone?: string;
    reason: string;
  }>;
  totalRequested: number;
}

export interface CallingOverviewMetrics {
  scheduledCallsCount: number;
  callsAttemptedCount: number;
  answeredCount: number;
  unansweredCount: number;
  failedCount: number;
  callbacksRequestedCount: number;
  followUpsPendingCount: number;
  uniqueClientsAttempted: number;
  uniqueClientsAnswered: number;
  totalUniqueTargetClients: number;
  answerRate: number; // Answered / Attempted (0 - 100)
  unansweredRate: number; // Unanswered / Attempted (0 - 100)
  failureRate: number; // Failed / Attempted (0 - 100)
  followUpResolutionRate: number; // Resolved / Total Follow-ups (0 - 100)
}

/**
 * Returns current date/time components in Asia/Kolkata timezone.
 */
export function getISTDateParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const hours = parseInt(partMap.hour || "0", 10);
  const minutes = parseInt(partMap.minute || "0", 10);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hours,
    minutes,
    timeStr,
  };
}

/**
 * Validates whether the given UTC date corresponds to a permitted calling window in Asia/Kolkata.
 * TRAI regulations and CA practice norms: Calls should be strictly between 10:00 AM and 6:00 PM IST.
 */
export function isWithinCallingWindow(
  date: Date = new Date(),
  windowStart: string = "10:00",
  windowEnd: string = "18:00"
): boolean {
  const { timeStr } = getISTDateParts(date);
  return timeStr >= windowStart && timeStr <= windowEnd;
}

/**
 * Computes the next permitted UTC Date when the calling window opens in Asia/Kolkata.
 * TRAI / RBI commercial calling regulation: Never schedule automated calls on Sundays.
 */
export function getNextCallingWindowDate(
  baseDate: Date = new Date(),
  windowStart: string = "10:00"
): Date {
  const ist = getISTDateParts(baseDate);
  const [startH, startM] = windowStart.split(":").map((v) => parseInt(v, 10));

  // Determine target IST day
  let targetDay = ist.day;
  let targetMonth = ist.month - 1; // JS 0-based
  let targetYear = ist.year;

  // If current IST time is already past window, advance to tomorrow
  if (ist.timeStr >= windowStart) {
    targetDay += 1;
  }

  // Construct UTC equivalent for target IST datetime (IST is UTC+05:30)
  // Target UTC hour = startH - 5.5
  let nextTargetUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, startH - 5, startM - 30, 0, 0));

  // TRAI / Commercial calling guard: If target lands on Sunday, advance to Monday (10:00 AM IST)
  // In IST, check day of week:
  const istDayOfWeek = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(nextTargetUTC);

  if (istDayOfWeek === "Sun") {
    nextTargetUTC = new Date(nextTargetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return nextTargetUTC;
}

/**
 * Evaluates recipient eligibility before campaign creation or dispatch.
 * Enforces:
 * - Active client status
 * - Valid 10-digit Indian mobile number
 * - Suppression list (opt-out / wrong contact in historical communications or client notes)
 */
export async function validateClientEligibility(
  tenantId: string,
  clientIds: string[]
): Promise<EligibilityResult> {
  const clients = await db.client.findMany({
    where: {
      tenantId,
      id: { in: clientIds },
    },
    include: {
      invoices: {
        where: {
          status: { in: ["OVERDUE", "SENT", "PARTIALLY_PAID"] },
        },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
      communications: {
        where: {
          channel: CommunicationChannel.VOICE,
          sentiment: { in: ["OPT_OUT", "WRONG_CONTACT"] },
        },
        take: 1,
      },
    },
  });

  const eligibleClients: EligibilityResult["eligibleClients"] = [];
  const excludedClients: EligibilityResult["excludedClients"] = [];

  for (const client of clients) {
    // 1. Inactive check
    if (!client.active) {
      excludedClients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        reason: "Client marked inactive in practice directory.",
      });
      continue;
    }

    // 2. Phone validation
    let normalizedPhone = "";
    try {
      normalizedPhone = normalizeIndianPhoneNumber(client.phone);
    } catch (err: any) {
      excludedClients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        reason: `Invalid Indian phone number: ${err.message}`,
      });
      continue;
    }

    // 3. Suppression list check (Do Not Call / Opt-Out)
    const isSuppressedInNotes = client.notes && (
      client.notes.includes("[DO_NOT_CALL]") ||
      client.notes.includes("[OPT_OUT]") ||
      client.notes.toLowerCase().includes("do not call")
    );

    const hasOptedOutPreviously = client.communications.length > 0;

    if (isSuppressedInNotes || hasOptedOutPreviously) {
      excludedClients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        reason: "Client requested opt-out / suppression from automated calls.",
      });
      continue;
    }

    const latestInv = client.invoices[0];
    eligibleClients.push({
      id: client.id,
      name: client.name,
      phone: normalizedPhone,
      email: client.email,
      latestInvoice: latestInv ? {
        id: latestInv.id,
        invoiceNumber: latestInv.invoiceNumber,
        amount: Number(latestInv.totalAmount),
        dueDate: latestInv.dueDate.toISOString().slice(0, 10),
      } : null,
    });
  }

  // Handle clientIds that were not found in database
  const foundIds = new Set(clients.map((c) => c.id));
  for (const reqId of clientIds) {
    if (!foundIds.has(reqId)) {
      excludedClients.push({
        id: reqId,
        name: "Unknown Client",
        reason: "Client record not found in practice database.",
      });
    }
  }

  return {
    eligibleClients,
    excludedClients,
    totalRequested: clientIds.length,
  };
}

/**
 * Creates a persistent AI calling campaign and schedules all individual recipient calls.
 */
export async function createCallingCampaign(
  tenantId: string,
  createdById: string,
  input: CreateCampaignInput
) {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error("Campaign name is required.");
  }

  if (!input.clientIds || input.clientIds.length === 0) {
    throw new Error("At least one client must be selected.");
  }

  // 1. Run eligibility validation
  const eligibility = await validateClientEligibility(tenantId, input.clientIds);

  if (eligibility.eligibleClients.length === 0) {
    throw new Error(
      `No eligible clients found. All ${eligibility.totalRequested} selected clients were excluded (Reasons: ${eligibility.excludedClients.map((e) => e.reason).join("; ")}).`
    );
  }

  // 2. Resolve scheduled target time in UTC
  let targetScheduledFor: Date;
  if (input.scheduledAt) {
    targetScheduledFor = new Date(input.scheduledAt);
    if (isNaN(targetScheduledFor.getTime())) {
      throw new Error("Invalid scheduled date/time provided.");
    }
  } else {
    // Immediate dispatch requested — if within calling window, schedule for now; otherwise next window start
    const now = new Date();
    if (isWithinCallingWindow(now, input.callingWindowStart || "10:00", input.callingWindowEnd || "18:00")) {
      targetScheduledFor = now;
    } else {
      targetScheduledFor = getNextCallingWindowDate(now, input.callingWindowStart || "10:00");
    }
  }

  // 3. Create the parent CallingCampaign record
  const campaign = await db.callingCampaign.create({
    data: {
      tenantId,
      name: input.name.trim(),
      purpose: input.purpose,
      description: input.description?.trim() || null,
      status: targetScheduledFor <= new Date() ? "ACTIVE" : "SCHEDULED",
      scheduledAt: targetScheduledFor,
      callingWindowStart: input.callingWindowStart || "10:00",
      callingWindowEnd: input.callingWindowEnd || "18:00",
      timezone: input.timezone || "Asia/Kolkata",
      frequency: input.frequency || "ONCE",
      targetCount: eligibility.eligibleClients.length,
      retryLimit: input.retryLimit ?? 2,
      retryIntervalMinutes: input.retryIntervalMinutes ?? 120,
      languagePreference: input.languagePreference || "HINGLISH",
      scriptTemplate: input.scriptTemplate?.trim() || null,
      assignedOwnerId: input.assignedOwnerId || createdById,
      createdById,
      config: {
        excludedClients: eligibility.excludedClients,
        originalSelectedCount: input.clientIds.length,
      },
    },
  });

  // 4. Create ScheduledCall records for each eligible recipient
  // Each record receives an explicit unique idempotency key to prevent double-scheduling
  const scheduledCallRows = eligibility.eligibleClients.map((client) => {
    const idempotencyKey = `sc_${campaign.id}_${client.id}_attempt_0`;
    return {
      tenantId,
      campaignId: campaign.id,
      clientId: client.id,
      invoiceId: client.latestInvoice?.id || null,
      scheduledFor: targetScheduledFor,
      status: "SCHEDULED",
      attemptCount: 0,
      maxAttempts: (input.retryLimit ?? 2) + 1,
      assignedOwnerId: input.assignedOwnerId || createdById,
      idempotencyKey,
      metadata: {
        clientName: client.name,
        clientPhone: client.phone,
        clientEmail: client.email,
        campaignName: campaign.name,
        purpose: campaign.purpose,
        languagePreference: campaign.languagePreference,
        latestInvoiceNumber: client.latestInvoice?.invoiceNumber || null,
        latestInvoiceAmount: client.latestInvoice?.amount || null,
      },
    };
  });

  await db.scheduledCall.createMany({
    data: scheduledCallRows,
    skipDuplicates: true,
  });

  return {
    campaign,
    eligibleCount: eligibility.eligibleClients.length,
    excludedCount: eligibility.excludedClients.length,
    scheduledAt: targetScheduledFor.toISOString(),
  };
}

/**
 * Calculates authoritative calling operations metrics strictly from persisted records.
 * Explicitly separates unique clients from call attempts and calculates mathematically defined rates.
 */
export async function getAuthoritativeCallingMetrics(
  tenantId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    campaignId?: string;
    clientId?: string;
  } = {}
): Promise<CallingOverviewMetrics> {
  const whereCall: any = { tenantId };
  const whereComm: any = {
    tenantId,
    channel: CommunicationChannel.VOICE,
    direction: CommunicationDirection.OUTBOUND,
  };

  if (options.campaignId) {
    whereCall.campaignId = options.campaignId;
    whereComm.content = { contains: options.campaignId };
  }

  if (options.clientId) {
    whereCall.clientId = options.clientId;
    whereComm.clientId = options.clientId;
  }

  if (options.startDate || options.endDate) {
    whereComm.createdAt = {};
    whereCall.createdAt = {};
    if (options.startDate) {
      whereComm.createdAt.gte = options.startDate;
      whereCall.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      whereComm.createdAt.lte = options.endDate;
      whereCall.createdAt.lte = options.endDate;
    }
  }

  // 1. Scheduled Calls in queue (not yet completed/cancelled)
  const scheduledCallsCount = await db.scheduledCall.count({
    where: {
      ...whereCall,
      status: { in: ["SCHEDULED", "QUEUED", "DISPATCHING"] },
    },
  });

  // 2. All Communications (Attempts logged)
  const comms = await db.communication.findMany({
    where: whereComm,
    select: {
      id: true,
      clientId: true,
      status: true,
      sentiment: true,
      content: true,
    },
  });

  const callsAttemptedCount = comms.length;

  let answeredCount = 0;
  let unansweredCount = 0;
  let failedCount = 0;
  let callbacksRequestedCount = 0;

  const uniqueClientsAttemptedSet = new Set<string>();
  const uniqueClientsAnsweredSet = new Set<string>();

  for (const c of comms) {
    if (c.clientId) {
      uniqueClientsAttemptedSet.add(c.clientId);
    }

    const s = c.status;
    const content = c.content || "";
    const isAnswered = s === CommunicationStatus.DELIVERED || content.includes("[LIFECYCLE STATUS]: answered") || content.includes("[LIFECYCLE STATUS]: completed") || content.includes("[STATUS]: COMPLETED");
    const isNoAnswer = content.includes("no-answer") || content.includes("busy") || s === "NO_ANSWER" as any;
    const isFailed = s === CommunicationStatus.FAILED || content.includes("[STATUS]: FAILED");

    if (isAnswered) {
      answeredCount++;
      if (c.clientId) uniqueClientsAnsweredSet.add(c.clientId);
    } else if (isNoAnswer) {
      unansweredCount++;
    } else if (isFailed) {
      failedCount++;
    } else {
      unansweredCount++;
    }

    if (c.sentiment === "CALLBACK_REQUESTED" || content.includes("[CLIENT SENTIMENT]: CALLBACK_REQUESTED") || content.includes("press 1 for callback") || content.includes("callback")) {
      callbacksRequestedCount++;
    }
  }

  // 3. Follow-up Tasks Pending
  const followUpsPendingCount = await db.task.count({
    where: {
      tenantId,
      type: { in: [TaskType.PAYMENT_ESCALATION, TaskType.DOCUMENT_CALL, TaskType.GENERAL] },
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
      title: { contains: "Call" },
    },
  });

  const resolvedFollowUpsCount = await db.task.count({
    where: {
      tenantId,
      type: { in: [TaskType.PAYMENT_ESCALATION, TaskType.DOCUMENT_CALL, TaskType.GENERAL] },
      status: TaskStatus.COMPLETED,
      title: { contains: "Call" },
    },
  });

  // 4. Calculate Mathematical Rates (explicit denominator = callsAttemptedCount)
  const denom = callsAttemptedCount > 0 ? callsAttemptedCount : 0;
  const answerRate = denom > 0 ? Math.round((answeredCount / denom) * 100) : 0;
  const unansweredRate = denom > 0 ? Math.round((unansweredCount / denom) * 100) : 0;
  const failureRate = denom > 0 ? Math.round((failedCount / denom) * 100) : 0;

  const totalFollowUps = followUpsPendingCount + resolvedFollowUpsCount;
  const followUpResolutionRate = totalFollowUps > 0 ? Math.round((resolvedFollowUpsCount / totalFollowUps) * 100) : 100;

  return {
    scheduledCallsCount,
    callsAttemptedCount,
    answeredCount,
    unansweredCount,
    failedCount,
    callbacksRequestedCount,
    followUpsPendingCount,
    uniqueClientsAttempted: uniqueClientsAttemptedSet.size,
    uniqueClientsAnswered: uniqueClientsAnsweredSet.size,
    totalUniqueTargetClients: uniqueClientsAttemptedSet.size + scheduledCallsCount,
    answerRate,
    unansweredRate,
    failureRate,
    followUpResolutionRate,
  };
}

/**
 * Reschedules an eligible scheduled call to a new target time.
 */
export async function rescheduleCall(
  tenantId: string,
  callId: string,
  newScheduledFor: Date | string,
  assignedOwnerId?: string
) {
  const targetDate = new Date(newScheduledFor);
  if (isNaN(targetDate.getTime())) {
    throw new Error("Invalid target reschedule date.");
  }

  const existing = await db.scheduledCall.findFirst({
    where: { id: callId, tenantId },
  });

  if (!existing) {
    throw new Error("Scheduled call not found or unauthorized.");
  }

  if (existing.status === "COMPLETED") {
    throw new Error(`Cannot reschedule a call that is already COMPLETED.`);
  }

  const isStale = (Date.now() - new Date(existing.updatedAt).getTime()) > 5 * 60 * 1000;
  if ((existing.status === "DISPATCHING" || existing.status === "IN_FLIGHT") && !isStale) {
    throw new Error(`Cannot reschedule a call that is actively in flight or dispatching. Please wait for completion or retry after lease expiry.`);
  }

  return await db.scheduledCall.update({
    where: { id: callId },
    data: {
      scheduledFor: targetDate,
      status: "SCHEDULED",
      assignedOwnerId: assignedOwnerId || existing.assignedOwnerId,
      nextAction: "CALLBACK_SCHEDULED",
    },
  });
}

/**
 * Pauses or cancels a scheduled call safely.
 */
export async function updateScheduledCallStatus(
  tenantId: string,
  callId: string,
  action: "PAUSE" | "RESUME" | "CANCEL"
) {
  const existing = await db.scheduledCall.findFirst({
    where: { id: callId, tenantId },
  });

  if (!existing) {
    throw new Error("Scheduled call not found.");
  }

  let nextStatus = "SCHEDULED";
  if (action === "PAUSE") nextStatus = "PAUSED";
  if (action === "CANCEL") nextStatus = "CANCELLED";
  if (action === "RESUME") nextStatus = "SCHEDULED";

  return await db.scheduledCall.update({
    where: { id: callId },
    data: { status: nextStatus },
  });
}
