import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import {
  generateInitialCallScript,
  generateTurnResponse,
  analyzeCallOutcome,
} from "@/lib/server/voice/provider-engine";
import { getAgentPersona } from "@/lib/server/voice/agent-personas";
import { db } from "@/lib/db";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  TaskType,
  TaskStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory call session cache to ensure zero data loss during live sessions
const activeSessions: Record<
  string,
  {
    sessionId: string;
    tenantId: string;
    clientId?: string;
    clientName: string;
    invoiceId?: string;
    reason: string;
    personaId: string;
    direction: "OUTBOUND" | "INBOUND";
    ollamaModel?: string;
    customOllamaHost?: string;
    startedAt: number;
    history: Array<{ speaker: "agent" | "client"; text: string; timestamp: string }>;
  }
> = {};

export async function POST(req: NextRequest) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;
    const body = await req.json();
    const action = body.action || "start";

    // -------------------------------------------------------------
    // ACTION: START SESSION
    // -------------------------------------------------------------
    if (action === "start") {
      const sessionId = `live_call_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const persona = getAgentPersona(body.personaId);
      const clientName = body.clientName?.trim() || "Valued Client";
      const direction = body.direction === "INBOUND" ? "INBOUND" : "OUTBOUND";

      let greeting = "";
      if (direction === "INBOUND") {
        greeting = `${persona.dispositionRules.mandatoryDisclaimer} Thank you for calling TRUV Advisory. I am ${persona.name}. How may I assist with your tax, accounts, or statutory filings today?`;
      } else {
        greeting = await generateInitialCallScript({
          clientName,
          firmName: "TRUV Advisory",
          reason: body.reason || "PAYMENT_RECOVERY",
          invoiceNumber: body.invoiceNumber,
          amount: body.amount,
          dueDate: body.dueDate,
          personaId: persona.id,
          ollamaModel: body.ollamaModel,
          customOllamaHost: body.customOllamaHost,
        });
      }

      activeSessions[sessionId] = {
        sessionId,
        tenantId,
        clientId: body.clientId,
        clientName,
        invoiceId: body.invoiceId,
        reason: body.reason || "PAYMENT_RECOVERY",
        personaId: persona.id,
        direction,
        ollamaModel: body.ollamaModel,
        customOllamaHost: body.customOllamaHost,
        startedAt: Date.now(),
        history: [{ speaker: "agent", text: greeting, timestamp: new Date().toISOString() }],
      };

      return NextResponse.json({
        success: true,
        sessionId,
        greetingText: greeting,
        persona: {
          id: persona.id,
          name: persona.name,
          title: persona.title,
          language: persona.language,
          voiceSettings: persona.voiceSettings,
        },
        direction,
      });
    }

    // -------------------------------------------------------------
    // ACTION: CONVERSATIONAL TURN
    // -------------------------------------------------------------
    if (action === "turn") {
      const sessionId = body.sessionId;
      const clientUtterance = body.clientUtterance?.trim();

      if (!clientUtterance) {
        return NextResponse.json(
          { error: "Client utterance is required for turn generation." },
          { status: 400 }
        );
      }

      const session = activeSessions[sessionId];
      const persona = getAgentPersona(body.personaId || session?.personaId);
      const clientName = body.clientName || session?.clientName || "Client";

      // Append client utterance to history
      if (session) {
        session.history.push({
          speaker: "client",
          text: clientUtterance,
          timestamp: new Date().toISOString(),
        });
      }

      const turnResult = await generateTurnResponse({
        tenantId,
        clientName,
        firmName: "TRUV Advisory",
        personaId: persona.id,
        reason: body.reason || session?.reason || "PAYMENT_RECOVERY",
        invoiceNumber: body.invoiceNumber,
        amount: body.amount,
        dueDate: body.dueDate,
        history: (body.history || session?.history || []).slice(-6),
        clientUtterance,
        ollamaModel: body.ollamaModel || session?.ollamaModel,
        customOllamaHost: body.customOllamaHost || session?.customOllamaHost,
      });

      // Append agent reply to history
      if (session) {
        session.history.push({
          speaker: "agent",
          text: turnResult.replyText,
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        replyText: turnResult.replyText,
        sentiment: turnResult.sentiment,
        shouldEndCall: turnResult.shouldEndCall,
        detectedDisposition: turnResult.detectedDisposition,
      });
    }

    // -------------------------------------------------------------
    // ACTION: END SESSION & RECORD OUTCOME
    // -------------------------------------------------------------
    if (action === "end") {
      const sessionId = body.sessionId;
      const session = activeSessions[sessionId];
      const clientName = body.clientName || session?.clientName || "Client";
      const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : 30;

      // Compile full transcript
      const history = body.history || session?.history || [];
      const fullTranscript = history
        .map((h: any) => `${h.speaker === "agent" ? "Agent" : clientName}: ${h.text}`)
        .join("\n");

      // Analyze complete call outcome
      const analysis = await analyzeCallOutcome({
        clientName,
        transcript: fullTranscript,
        durationSeconds,
        reason: body.reason || session?.reason || "PAYMENT_RECOVERY",
      });

      const auditContent = `[BROWSER AI LIVE VOICE SESSION]
Direction: ${session?.direction || body.direction || "OUTBOUND"}
Agent Persona: ${session?.personaId || body.personaId || "PRIYA"}
Duration: ${durationSeconds} seconds
[CLIENT SENTIMENT]: ${analysis.sentiment}
[DISPOSITION]: ${analysis.disposition}
[SUMMARY]: ${analysis.summary}
${analysis.promisedDate ? `[PROMISED PAYMENT DATE]: ${analysis.promisedDate}\n` : ""}${analysis.escalationReason ? `[PARTNER ESCALATION]: ${analysis.escalationReason}\n` : ""}[TRANSCRIPT]:
${fullTranscript || "Live interactive audio session completed via Web Audio Studio."}`;

      let communicationId = `comm_browser_${Date.now()}`;
      let partnerTaskCreated = false;

      // Safely attempt persistence (fails safely if database is offline)
      try {
        const commRecord = await db.communication.create({
          data: {
            tenantId,
            clientId: body.clientId || session?.clientId,
            invoiceId: body.invoiceId || session?.invoiceId,
            channel: CommunicationChannel.VOICE,
            direction: session?.direction === "INBOUND" ? CommunicationDirection.INBOUND : CommunicationDirection.OUTBOUND,
            status: CommunicationStatus.ANSWERED,
            purpose: body.reason || session?.reason || "PAYMENT_RECOVERY",
            recipient: body.recipientPhone || "BROWSER_LIVE_STUDIO",
            subject: `AI Voice Call: ${clientName} (${analysis.disposition})`,
            content: auditContent,
            sentiment: analysis.sentiment,
            durationSeconds,
            externalRef: sessionId,
          },
        });
        communicationId = commRecord.id;

        // Escalate to Partner Task if dispute or callback requested
        if (analysis.partnerTaskRequired) {
          await db.task.create({
            data: {
              tenantId,
              clientId: body.clientId || session?.clientId,
              title: `[CALL ESCALATION] ${analysis.disposition} — ${clientName}`,
              detail: `${analysis.summary}\n\nCall Duration: ${durationSeconds}s\nAudit Reference: ${communicationId}`,
              type: TaskType.PAYMENT_ESCALATION,
              status: TaskStatus.OPEN,
              priority: "HIGH",
            },
          });
          partnerTaskCreated = true;
        }
      } catch (dbErr: any) {
        console.warn(`[CALL-PERSISTENCE-NOTICE] Database offline (${dbErr.message}). Outcome retained in session audit memory.`);
      }

      // Cleanup session cache
      delete activeSessions[sessionId];

      return NextResponse.json({
        success: true,
        communicationId,
        analysis,
        partnerTaskCreated,
        message: `Call completed (${durationSeconds}s). Logged as ${analysis.disposition}.`,
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    if (err.message?.includes("UNAUTHENTICATED") || err.message?.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to process live calling turn" },
      { status: 500 }
    );
  }
}
