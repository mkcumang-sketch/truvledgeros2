import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TaskType, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

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
    let mappedCommStatus = "SENT";

    if (status === "completed" || status === "answered") {
      mappedCommStatus = "ANSWERED";
    } else if (status === "no-answer") {
      mappedCommStatus = "NO_ANSWER";
    } else if (status === "busy") {
      mappedCommStatus = "BUSY";
    } else {
      mappedCommStatus = "FAILED";
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
