/**
 * TRUV CA / LedgerOS — Persistent AI Calling Scheduler & Outcome Engine
 * 
 * Requirements satisfied:
 * - Survives server restarts (state persisted strictly in PostgreSQL)
 * - Distributed locking & concurrency control via atomic row-level status claims
 * - Timezone-safe execution in Asia/Kolkata (IST) respecting statutory quiet hours (10:00 - 18:00)
 * - Bounded retries with configurable intervals and max attempt caps
 * - Separation of verified financial/statutory truths from AI conversational commitments
 * - Automatic staff task creation for callbacks, promises, and retry exhaustion
 */

import { db } from "@/lib/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  TaskType,
  TaskStatus,
} from "@prisma/client";
import {
  isWithinCallingWindow,
  getNextCallingWindowDate,
  getISTDateParts,
} from "./campaign-service";
import { initiateOutboundVoiceCall } from "./calling-agent";

export interface SweepOptions {
  tenantId?: string;
  batchSize?: number;
  forceIgnoreWindow?: boolean; // For automated testing / emergency manual overrides
}

export interface SweepResult {
  totalEligible: number;
  claimed: number;
  dispatched: number;
  answered: number;
  unanswered: number;
  failed: number;
  retried: number;
  tasksCreated: number;
  windowDeferred: number;
  details: Array<{
    callId: string;
    clientId: string;
    clientName: string;
    action: "DISPATCHED" | "DEFERRED_QUIET_HOURS" | "RETRY_SCHEDULED" | "FAILED_EXHAUSTED" | "COMPLETED";
    outcome?: string;
    nextScheduledFor?: string;
  }>;
}

/**
 * Normalizes provider call status and transcript sentiment into standard AI classification.
 */
export function classifyCallResponse(params: {
  status: string;
  sentiment?: string;
  transcript?: string;
}) {
  const t = (params.transcript || "").toLowerCase();
  const s = (params.sentiment || "").toUpperCase();

  // 1. Explicit Opt-out
  if (s === "OPT_OUT" || t.includes("do not call") || t.includes("stop calling") || t.includes("remove my number")) {
    return {
      classification: "OPT_OUT",
      confidence: 0.95,
      evidence: "Client explicitly requested stop calling / removal",
      requiresHumanFollowup: true,
    };
  }

  // 2. Wrong Contact
  if (s === "WRONG_CONTACT" || t.includes("wrong number") || t.includes("wrong person") || t.includes("not the right person")) {
    return {
      classification: "WRONG_CONTACT",
      confidence: 0.92,
      evidence: "Recipient indicated number does not belong to client",
      requiresHumanFollowup: true,
    };
  }

  // 3. Callback Requested
  if (s === "CALLBACK_REQUESTED" || t.includes("call me back") || t.includes("busy right now") || t.includes("call later") || t.includes("press 1") || t.includes("callback")) {
    return {
      classification: "CALLBACK_REQUESTED",
      confidence: 0.88,
      evidence: "Recipient requested callback at another time",
      requiresHumanFollowup: true,
    };
  }

  // 4. Payment Commitment (Note: Never mark invoice paid automatically)
  if (s === "PROMISED_TO_PAY" || t.includes("will pay") || t.includes("releasing payment") || t.includes("paying tomorrow") || t.includes("neft tomorrow") || t.includes("by evening")) {
    return {
      classification: "PAYMENT_COMMITMENT",
      confidence: 0.85,
      evidence: "Recipient indicated intention to release payment",
      requiresHumanFollowup: true,
    };
  }

  // 5. Payment Query / Dispute
  if (s === "DISPUTING" || t.includes("dispute") || t.includes("already paid") || t.includes("incorrect amount") || t.includes("bill mismatch")) {
    return {
      classification: "PAYMENT_QUERY",
      confidence: 0.90,
      evidence: "Client raised billing question or disputed invoice",
      requiresHumanFollowup: true,
    };
  }

  // 6. Documents Promised / Compliance
  if (t.includes("will upload documents") || t.includes("sending bank statement") || t.includes("sending gst data") || t.includes("accountant will send")) {
    return {
      classification: "DOCUMENTS_PROMISED",
      confidence: 0.85,
      evidence: "Client indicated documents will be transmitted",
      requiresHumanFollowup: true,
    };
  }

  // 7. Unanswered / Unresponsive
  if (params.status === "NO_ANSWER" || params.status === "BUSY" || s === "UNRESPONSIVE") {
    return {
      classification: "NO_RESPONSE",
      confidence: 0.99,
      evidence: `Telephony outcome was ${params.status}`,
      requiresHumanFollowup: false,
    };
  }

  return {
    classification: "UNCERTAIN",
    confidence: 0.50,
    evidence: "Standard automated conversational completion",
    requiresHumanFollowup: false,
  };
}

/**
 * Executes a persistent calling scheduler sweep.
 * Drains all eligible `ScheduledCall` rows where `scheduledFor <= NOW()` and `status = 'SCHEDULED'`.
 */
export async function executeScheduledCallsSweep(
  options: SweepOptions = {}
): Promise<SweepResult> {
  const now = new Date();
  const batchSize = options.batchSize || 20;

  // 0. RECOVER STALE LEASES & MISSING WEBHOOKS
  // A. Stale DISPATCHING calls (older than 5 minutes without completion)
  const staleDispatchCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  await db.scheduledCall.updateMany({
    where: {
      status: "DISPATCHING",
      updatedAt: { lte: staleDispatchCutoff },
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    },
    data: {
      status: "SCHEDULED",
      nextAction: "RECOVERED_STALE_DISPATCH",
    },
  });

  // B. Stale IN_FLIGHT calls where webhooks were missing / dropped (older than 15 minutes)
  const staleInFlightCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const abandonedCalls = await db.scheduledCall.findMany({
    where: {
      status: "IN_FLIGHT",
      lastAttemptAt: { lte: staleInFlightCutoff },
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    },
    include: { campaign: true },
    take: 20,
  });

  for (const abCall of abandonedCalls) {
    if (abCall.attemptCount < abCall.maxAttempts) {
      const retryMin = abCall.campaign?.retryIntervalMinutes || 120;
      let nextRetry = new Date(now.getTime() + retryMin * 60 * 1000);
      if (!isWithinCallingWindow(nextRetry, abCall.campaign?.callingWindowStart || "10:00", abCall.campaign?.callingWindowEnd || "18:00")) {
        nextRetry = getNextCallingWindowDate(nextRetry, abCall.campaign?.callingWindowStart || "10:00");
      }
      await db.scheduledCall.update({
        where: { id: abCall.id },
        data: {
          status: "SCHEDULED",
          scheduledFor: nextRetry,
          lastOutcome: "TIMEOUT_NO_WEBHOOK",
          nextAction: "RETRY_PENDING",
        },
      });
    } else {
      await db.scheduledCall.update({
        where: { id: abCall.id },
        data: {
          status: "FAILED",
          lastOutcome: "TIMEOUT_NO_WEBHOOK",
          nextAction: "FOLLOW_UP_REQUIRED",
        },
      });
    }
  }

  const whereClause: any = {
    status: "SCHEDULED",
    scheduledFor: { lte: now },
  };

  if (options.tenantId) {
    whereClause.tenantId = options.tenantId;
  }

  // 1. Find eligible scheduled calls ordered by due date
  const eligibleCalls = await db.scheduledCall.findMany({
    where: whereClause,
    include: {
      client: true,
      campaign: true,
    },
    orderBy: { scheduledFor: "asc" },
    take: batchSize,
  });

  const result: SweepResult = {
    totalEligible: eligibleCalls.length,
    claimed: 0,
    dispatched: 0,
    answered: 0,
    unanswered: 0,
    failed: 0,
    retried: 0,
    tasksCreated: 0,
    windowDeferred: 0,
    details: [],
  };

  if (eligibleCalls.length === 0) {
    return result;
  }

  for (const call of eligibleCalls) {
    // 2. ATOMIC CLAIM (Distributed locking via DB updateMany)
    const claim = await db.scheduledCall.updateMany({
      where: {
        id: call.id,
        status: "SCHEDULED",
      },
      data: {
        status: "DISPATCHING",
      },
    });

    if (claim.count === 0) {
      // Concurrently claimed by another worker instance
      continue;
    }
    result.claimed++;

    // 3. QUIET HOURS / CALLING WINDOW CHECK (Asia/Kolkata)
    const windowStart = call.campaign?.callingWindowStart || "10:00";
    const windowEnd = call.campaign?.callingWindowEnd || "18:00";
    const inWindow = options.forceIgnoreWindow || isWithinCallingWindow(now, windowStart, windowEnd);

    if (!inWindow) {
      // Defer execution to the next permitted window
      const nextWindowTime = getNextCallingWindowDate(now, windowStart);
      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: "SCHEDULED",
          scheduledFor: nextWindowTime,
          nextAction: "DEFERRED_QUIET_HOURS",
        },
      });

      result.windowDeferred++;
      result.details.push({
        callId: call.id,
        clientId: call.clientId,
        clientName: call.client.name,
        action: "DEFERRED_QUIET_HOURS",
        nextScheduledFor: nextWindowTime.toISOString(),
      });
      continue;
    }

    // 3b. DISPATCH-TIME ACTIVE & DNC SUPPRESSION VERIFICATION
    if (!call.client.active) {
      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: "CANCELLED",
          lastOutcome: "CLIENT_INACTIVE",
          nextAction: "CANCELLED",
        },
      });
      result.details.push({
        callId: call.id,
        clientId: call.clientId,
        clientName: call.client.name,
        action: "COMPLETED",
        outcome: "CLIENT_INACTIVE_SUPPRESSED",
      });
      continue;
    }

    const isSuppressedInNotes = call.client.notes && (
      call.client.notes.includes("[DO_NOT_CALL]") ||
      call.client.notes.includes("[OPT_OUT]") ||
      call.client.notes.toLowerCase().includes("do not call")
    );

    if (isSuppressedInNotes) {
      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: "CANCELLED",
          lastOutcome: "OPT_OUT",
          nextAction: "DNC_SUPPRESSED",
        },
      });
      result.details.push({
        callId: call.id,
        clientId: call.clientId,
        clientName: call.client.name,
        action: "COMPLETED",
        outcome: "DNC_SUPPRESSED",
      });
      continue;
    }

    if (call.campaign && (call.campaign.status === "PAUSED" || call.campaign.status === "CANCELLED")) {
      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: call.campaign.status,
          nextAction: `CAMPAIGN_${call.campaign.status}`,
        },
      });
      continue;
    }

    // 4. DISPATCH OUTBOUND CALL VIA CORE TELEPHONY AGENT
    const metadata = (call.metadata as any) || {};
    const purpose = call.campaign?.purpose || "PAYMENT_RECOVERY";
    const mappedReason = purpose === "DOCUMENT_COLLECTION"
      ? "DOCUMENT_COLLECTION"
      : purpose === "GST_DEADLINE"
      ? "GST_DEADLINE"
      : "PAYMENT_RECOVERY";

    let callResult;
    try {
      callResult = await initiateOutboundVoiceCall({
        tenantId: call.tenantId,
        clientId: call.clientId,
        recipientPhone: metadata.clientPhone || call.client.phone,
        clientName: call.client.name,
        reason: mappedReason,
        invoiceId: call.invoiceId || undefined,
        languagePreference: (call.campaign?.languagePreference as any) || "HINGLISH",
      });
    } catch (dispatchErr: any) {
      console.error(`[CALLING-SCHEDULER] Dispatch exception for call ${call.id}:`, dispatchErr);
      callResult = {
        success: false,
        status: "FAILED" as const,
        callSid: `err_${Date.now()}`,
        durationSeconds: 0,
        transcript: dispatchErr.message,
        communicationId: "",
      };
    }

    result.dispatched++;
    const currentAttempt = call.attemptCount + 1;
    const isAnswered = callResult.status === "ANSWERED" || callResult.status === "COMPLETED";
    const isInitiated = callResult.status === "INITIATED";
    const isFailed = callResult.status === "FAILED";

    if (isAnswered) {
      result.answered++;
    } else if (isInitiated) {
      // Live asynchronous telephony dispatch (e.g. Sarvam AI outbound call accepted)
      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: "IN_FLIGHT",
          attemptCount: currentAttempt,
          lastAttemptAt: now,
          lastOutcome: "INITIATED",
          nextAction: "AWAITING_WEBHOOK",
          metadata: {
            ...metadata,
            callSid: callResult.callSid,
            dispatchedAt: now.toISOString(),
          },
        },
      });

      result.details.push({
        callId: call.id,
        clientId: call.clientId,
        clientName: call.client.name,
        action: "DISPATCHED",
        outcome: "INITIATED",
      });
      continue;
    } else if (isFailed) {
      result.failed++;
    } else {
      result.unanswered++;
    }

    // 5. AI CLASSIFICATION & DOMAIN ACTION DETERMINATION
    const classification = classifyCallResponse({
      status: callResult.status,
      sentiment: callResult.customerSentiment,
      transcript: callResult.transcript,
    });

    // 6. PROCESS OUTCOME & RETRY STATE MACHINE
    if (isAnswered) {
      // Call successfully answered
      let nextAction = "RESOLVED";
      if (classification.classification === "CALLBACK_REQUESTED") {
        nextAction = "CALLBACK_SCHEDULED";
      } else if (classification.classification === "PAYMENT_COMMITMENT" || classification.classification === "DOCUMENTS_PROMISED") {
        nextAction = "AWAITING_CLIENT_ACTION";
      }

      await db.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: "COMPLETED",
          attemptCount: currentAttempt,
          lastAttemptAt: now,
          lastOutcome: "ANSWERED",
          nextAction,
          metadata: {
            ...metadata,
            classification,
            callSid: callResult.callSid,
            recordingUrl: callResult.recordingUrl || null,
          },
        },
      });

      // Update parent campaign stats if attached
      if (call.campaignId) {
        await db.callingCampaign.update({
          where: { id: call.campaignId },
          data: {
            completedCount: { increment: 1 },
            answeredCount: { increment: 1 },
          },
        }).catch(() => null);
      }

      // Handle staff task creation for follow-ups
      if (classification.requiresHumanFollowup) {
        const taskTitle = `${classification.classification === "CALLBACK_REQUESTED" ? "Callback Required" : "Call Follow-up"}: ${call.client.name}`;
        
        await db.task.create({
          data: {
            tenantId: call.tenantId,
            clientId: call.clientId,
            invoiceId: call.invoiceId,
            type: TaskType.GENERAL,
            title: taskTitle,
            detail: `Automated call (${callResult.callSid}) concluded with classification: ${classification.classification}.\nEvidence: ${classification.evidence}\nTranscript: ${callResult.transcript?.slice(0, 300) || "N/A"}`,
            priority: "HIGH",
            status: TaskStatus.OPEN,
            assignedToId: call.assignedOwnerId,
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
          },
        });
        result.tasksCreated++;
      }

      // Handle opt-out suppression in client notes
      if (classification.classification === "OPT_OUT") {
        const updatedNotes = `${call.client.notes || ""}\n[OPT_OUT] Requested via voice call on ${now.toISOString().slice(0, 10)}`;
        await db.client.update({
          where: { id: call.clientId },
          data: { notes: updatedNotes.trim() },
        });
      }

      result.details.push({
        callId: call.id,
        clientId: call.clientId,
        clientName: call.client.name,
        action: "COMPLETED",
        outcome: "ANSWERED",
      });
    } else {
      // Call unanswered, busy, or provider failed
      const canRetry = currentAttempt < call.maxAttempts;

      if (canRetry) {
        // Schedule retry after configured interval
        const retryMinutes = call.campaign?.retryIntervalMinutes || 120;
        let nextRetry = new Date(now.getTime() + retryMinutes * 60 * 1000);

        // If next retry falls outside window, move to next morning window opening
        if (!isWithinCallingWindow(nextRetry, windowStart, windowEnd)) {
          nextRetry = getNextCallingWindowDate(nextRetry, windowStart);
        }

        await db.scheduledCall.update({
          where: { id: call.id },
          data: {
            status: "SCHEDULED",
            scheduledFor: nextRetry,
            attemptCount: currentAttempt,
            lastAttemptAt: now,
            lastOutcome: callResult.status,
            nextAction: "RETRY_PENDING",
            metadata: {
              ...metadata,
              lastError: callResult.transcript?.slice(0, 200) || "No answer",
            },
          },
        });

        result.retried++;
        result.details.push({
          callId: call.id,
          clientId: call.clientId,
          clientName: call.client.name,
          action: "RETRY_SCHEDULED",
          outcome: callResult.status,
          nextScheduledFor: nextRetry.toISOString(),
        });
      } else {
        // Max attempts exhausted — Mark FAILED and escalate to partner
        await db.scheduledCall.update({
          where: { id: call.id },
          data: {
            status: "FAILED",
            attemptCount: currentAttempt,
            lastAttemptAt: now,
            lastOutcome: callResult.status,
            nextAction: "FOLLOW_UP_REQUIRED",
            metadata: {
              ...metadata,
              exhaustionReason: `Exceeded maximum attempt limit of ${call.maxAttempts}.`,
            },
          },
        });

        if (call.campaignId) {
          await db.callingCampaign.update({
            where: { id: call.campaignId },
            data: {
              completedCount: { increment: 1 },
              failedCount: { increment: 1 },
            },
          }).catch(() => null);
        }

        // Create Escalation Task for human staff
        await db.task.create({
          data: {
            tenantId: call.tenantId,
            clientId: call.clientId,
            invoiceId: call.invoiceId,
            type: TaskType.PAYMENT_ESCALATION,
            title: `Exhausted Voice Calling: ${call.client.name}`,
            detail: `All ${call.maxAttempts} automated call attempts to ${metadata.clientPhone || call.client.phone} were unanswered (${callResult.status}). Immediate manual phone contact required by practice staff.`,
            priority: "URGENT",
            status: TaskStatus.OPEN,
            assignedToId: call.assignedOwnerId,
            dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000), // Due in 12 hours
          },
        });

        result.tasksCreated++;
        result.details.push({
          callId: call.id,
          clientId: call.clientId,
          clientName: call.client.name,
          action: "FAILED_EXHAUSTED",
          outcome: callResult.status,
        });
      }
    }
  }

  return result;
}
