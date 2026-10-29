import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TaskType, TaskStatus, CommunicationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { timingSafeEqualCompare } from "@/lib/server/m2m-auth";
import { isWithinCallingWindow, getNextCallingWindowDate } from "@/lib/server/voice/campaign-service";

export const runtime = "nodejs";

export type SarvamVoiceSentiment =
  | "COOPERATIVE"
  | "PROMISED_TO_PAY"
  | "DISPUTING"
  | "UNRESPONSIVE";

export type SarvamCallLifecycleStatus =
  | "completed"
  | "answered"
  | "no-answer"
  | "busy"
  | "failed";

/**
 * Normalizes raw webhook status string into standard lifecycle status.
 */
function normalizeStatus(rawStatus?: string): SarvamCallLifecycleStatus {
  const s = (rawStatus || "").toLowerCase().trim();
  if (s.includes("no-answer") || s.includes("no_answer") || s.includes("unanswered")) {
    return "no-answer";
  }
  if (s.includes("busy")) {
    return "busy";
  }
  if (s.includes("fail") || s.includes("cancel") || s.includes("error")) {
    return "failed";
  }
  if (s.includes("answered") || s.includes("in-progress") || s.includes("in_progress")) {
    return "answered";
  }
  return "completed";
}

/**
 * Normalizes raw sentiment into standard enum value.
 */
function normalizeSentiment(rawSentiment?: string, status?: SarvamCallLifecycleStatus): SarvamVoiceSentiment {
  const s = (rawSentiment || "").toUpperCase().trim();
  if (s.includes("DISPUT")) {
    return "DISPUTING";
  }
  if (s.includes("PROMISE") || s.includes("PAY")) {
    return "PROMISED_TO_PAY";
  }
  if (s.includes("UNRESPONSIVE") || s.includes("SILENT") || status === "no-answer") {
    return "UNRESPONSIVE";
  }
  if (s.includes("COOPERATIVE") || s.includes("POSITIVE") || s.includes("AGREED")) {
    return "COOPERATIVE";
  }
  return "COOPERATIVE";
}

/**
 * Extracts human-readable transcript from payload string or message array.
 */
function extractTranscript(rawTranscript: any): string {
  if (!rawTranscript) return "";
  if (typeof rawTranscript === "string") return rawTranscript.trim();
  if (Array.isArray(rawTranscript)) {
    return rawTranscript
      .map((item: any) => {
        const role = item.role || item.speaker || item.sender || "Agent";
        const text = item.text || item.content || item.message || "";
        return `${role}: ${text}`;
      })
      .join("\n");
  }
  return JSON.stringify(rawTranscript);
}

/**
 * Sarvam AI Post-Call Webhook Route
 * 
 * Ingests call outcomes, audio transcripts, and client sentiment.
 * Updates PostgreSQL Communication audit records and triggers high-priority partner tasks
 * whenever calls go unanswered or clients dispute outstanding invoices.
 */
export async function POST(req: NextRequest) {
  try {
    // 0. Verify Webhook Token / Authentication if secret is configured
    const webhookSecret = process.env.SARVAM_WEBHOOK_SECRET?.trim() || process.env.VOICE_WEBHOOK_SECRET?.trim() || process.env.CRON_SECRET?.trim();
    if (webhookSecret) {
      const providedToken =
        req.headers.get("x-webhook-token")?.trim() ||
        req.headers.get("x-sarvam-token")?.trim() ||
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
        new URL(req.url).searchParams.get("token")?.trim();

      if (!providedToken || !timingSafeEqualCompare(providedToken, webhookSecret)) {
        return NextResponse.json({ error: "Unauthorized: Invalid webhook secret token" }, { status: 401 });
      }
    }

    let body: any = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    }

    // 1. Extract core webhook parameters
    const callId =
      body.call_id ||
      body.callSid ||
      body.call_sid ||
      body.CallSid ||
      body.id ||
      body.data?.call_id;

    if (!callId) {
      return NextResponse.json(
        { error: "Missing required call identifier (call_id/callSid)" },
        { status: 400 }
      );
    }

    const rawStatus = body.status || body.call_status || body.state || body.CallStatus;
    const status = normalizeStatus(rawStatus);

    const rawTranscript =
      body.transcript ||
      body.transcription ||
      body.transcript_text ||
      body.conversation_transcript ||
      body.messages;
    const transcript = extractTranscript(rawTranscript);

    const rawSentiment =
      body.sentiment ||
      body.customer_sentiment ||
      body.analysis?.sentiment ||
      body.variables?.sentiment;
    const sentiment = normalizeSentiment(rawSentiment, status);

    const durationSeconds = parseInt(
      body.duration || body.CallDuration || body.duration_seconds || "0",
      10
    );

    const recordingUrl =
      body.recording_url ||
      body.RecordingUrl ||
      body.audio_url ||
      body.audio_url_recording;

    console.log(
      `[SARVAM-VOICE-WEBHOOK] Received webhook for call ${callId}: status=${status}, sentiment=${sentiment}`
    );

    // 2. Query matching Communication record by externalRef
    const communication = await db.communication.findFirst({
      where: { externalRef: callId },
    });

    let communicationUpdated = false;
    let mappedCommStatus: CommunicationStatus = CommunicationStatus.SENT;

    if (status === "completed" || status === "answered") {
      mappedCommStatus = CommunicationStatus.DELIVERED;
    } else if (status === "no-answer" || status === "busy" || status === "failed") {
      mappedCommStatus = CommunicationStatus.FAILED;
    }

    if (communication) {
      const updatedAuditTrail = `${communication.content}\n\n--- SARVAM POST-CALL WEBHOOK UPDATE ---\n[TIMESTAMP]: ${new Date().toISOString()}\n[LIFECYCLE STATUS]: ${status} (${mappedCommStatus})\n[DURATION]: ${durationSeconds}s\n[CLIENT SENTIMENT]: ${sentiment}\n[RECORDING]: ${recordingUrl || "N/A"}\n\n[TRANSCRIPT]:\n${transcript || "No transcript recorded."}`;

      await db.communication.update({
        where: { id: communication.id },
        data: {
          status: mappedCommStatus,
          content: updatedAuditTrail,
        },
      });
      communicationUpdated = true;
    } else {
      console.warn(
        `[SARVAM-VOICE-WEBHOOK] No Communication record found matching externalRef: "${callId}". Creating detached audit log.`
      );
    }

    // 3. Automated High-Priority Escalation Evaluation
    // If call status is 'no-answer', 'busy', 'failed', or sentiment is 'DISPUTING'
    let taskCreated = false;
    let createdTaskId: string | undefined;

    const requiresEscalation =
      status === "no-answer" ||
      status === "busy" ||
      status === "failed" ||
      sentiment === "DISPUTING";

    if (requiresEscalation && communication?.tenantId) {
      const tenantId = communication.tenantId;
      const clientId = communication.clientId;
      const invoiceId = communication.invoiceId;

      // Idempotency check: Ensure an open PAYMENT_ESCALATION task does not already exist
      const existingTask = await db.task.findFirst({
        where: {
          tenantId,
          type: TaskType.PAYMENT_ESCALATION,
          status: TaskStatus.OPEN,
          OR: [
            { referenceId: callId },
            ...(clientId ? [{ clientId }] : []),
          ],
        },
      });

      if (!existingTask) {
        const isDispute = sentiment === "DISPUTING";
        const taskPriority = isDispute ? "URGENT" : "HIGH";

        let taskTitle = "";
        let taskDetail = "";

        if (isDispute) {
          taskTitle = `Urgent Escalation: Client Disputing Statutory Invoice [${callId.slice(-6)}]`;
          taskDetail = `The client expressed active dispute during the autonomous Sarvam AI voice call (Call SID: ${callId}).\n\nRecorded Sentiment: ${sentiment}\nCall Duration: ${durationSeconds}s\n\nTranscript Excerpt:\n${transcript ? transcript.slice(0, 600) : "No transcript recorded"}\n\nAction Required: Designated CA Partner must initiate manual contact immediately to resolve billing discrepancies.`;
        } else {
          taskTitle = `Payment Escalation: Unreachable Client (${status}) [${callId.slice(-6)}]`;
          taskDetail = `Autonomous AI recovery call to client concluded with status: "${status}" (Call SID: ${callId}).\n\nClient was unreachable. Partner follow-up required via alternate phone or WhatsApp dispatch.`;
        }

        const newTask = await db.task.create({
          data: {
            tenantId,
            clientId: clientId || null,
            invoiceId: invoiceId || null,
            referenceId: callId,
            type: TaskType.PAYMENT_ESCALATION,
            title: taskTitle,
            detail: taskDetail,
            priority: taskPriority,
            status: TaskStatus.OPEN,
          },
        });

        taskCreated = true;
        createdTaskId = newTask.id;
        console.log(`[SARVAM-VOICE-WEBHOOK] Raised Task #${newTask.id} (${taskPriority}) for partner escalation.`);
      } else {
        console.log(`[SARVAM-VOICE-WEBHOOK] Existing open task #${existingTask.id} detected. Skipping duplicate.`);
      }
    }

    // 4. ScheduledCall Lifecycle Reconciliation (Closing the Loop)
    let scheduledCallUpdated = false;
    try {
      const scheduledCall = await db.scheduledCall.findFirst({
        where: {
          OR: [
            { metadata: { path: ["callSid"], equals: callId } },
            ...(communication?.clientId ? [{ clientId: communication.clientId, status: { in: ["IN_FLIGHT", "DISPATCHING"] } }] : []),
          ],
        },
        include: { campaign: true },
      });

      if (scheduledCall) {
        const isCompleted = status === "completed" || status === "answered";
        if (isCompleted) {
          let nextAction = "RESOLVED";
          if (sentiment === "PROMISED_TO_PAY") nextAction = "AWAITING_CLIENT_ACTION";
          else if (sentiment === "DISPUTING") nextAction = "FOLLOW_UP_REQUIRED";

          await db.scheduledCall.update({
            where: { id: scheduledCall.id },
            data: {
              status: "COMPLETED",
              lastOutcome: "ANSWERED",
              nextAction,
              metadata: {
                ...((scheduledCall.metadata as any) || {}),
                callSid: callId,
                durationSeconds,
                sentiment,
                recordingUrl: recordingUrl || null,
                transcriptExcerpt: transcript?.slice(0, 300) || null,
              },
            },
          });

          if (scheduledCall.campaignId) {
            await db.callingCampaign.update({
              where: { id: scheduledCall.campaignId },
              data: {
                completedCount: { increment: 1 },
                answeredCount: { increment: 1 },
              },
            }).catch(() => null);
          }
          scheduledCallUpdated = true;
        } else {
          // Failed / unanswered call from provider webhook
          const canRetry = scheduledCall.attemptCount < scheduledCall.maxAttempts;
          if (canRetry) {
            const retryMin = scheduledCall.campaign?.retryIntervalMinutes || 120;
            let nextRetry = new Date(Date.now() + retryMin * 60 * 1000);
            if (!isWithinCallingWindow(nextRetry, scheduledCall.campaign?.callingWindowStart || "10:00", scheduledCall.campaign?.callingWindowEnd || "18:00")) {
              nextRetry = getNextCallingWindowDate(nextRetry, scheduledCall.campaign?.callingWindowStart || "10:00");
            }
            await db.scheduledCall.update({
              where: { id: scheduledCall.id },
              data: {
                status: "SCHEDULED",
                scheduledFor: nextRetry,
                lastOutcome: status.toUpperCase(),
                nextAction: "RETRY_PENDING",
              },
            });
          } else {
            await db.scheduledCall.update({
              where: { id: scheduledCall.id },
              data: {
                status: "FAILED",
                lastOutcome: status.toUpperCase(),
                nextAction: "FOLLOW_UP_REQUIRED",
              },
            });

            if (scheduledCall.campaignId) {
              await db.callingCampaign.update({
                where: { id: scheduledCall.campaignId },
                data: {
                  completedCount: { increment: 1 },
                  failedCount: { increment: 1 },
                },
              }).catch(() => null);
            }
          }
          scheduledCallUpdated = true;
        }
      }
    } catch (scErr: any) {
      console.warn("[SARVAM-VOICE-WEBHOOK] Failed to reconcile ScheduledCall:", scErr.message);
    }

    // Revalidate dashboard views
    try {
      revalidatePath("/tasks");
      revalidatePath("/communications");
      revalidatePath("/payments");
    } catch {}

    return NextResponse.json(
      {
        success: true,
        callId,
        communicationUpdated,
        status,
        sentiment,
        escalated: requiresEscalation,
        taskCreated,
        taskId: createdTaskId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[SARVAM-VOICE-WEBHOOK-CRASH]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process Sarvam AI voice webhook",
        message: err.message,
      },
      { status: 500 }
    );
  }
}
