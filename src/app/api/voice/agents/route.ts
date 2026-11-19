import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { PRESET_AGENT_PERSONAS, AgentPersona } from "@/lib/server/voice/agent-personas";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory fallback tenant persona overrides when database is in standby
const inMemoryPersonas: Record<string, AgentPersona[]> = {};

/**
 * GET /api/voice/agents
 * Returns available AI agent personas (presets + custom firm personas).
 */
export async function GET() {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    const presets = Object.values(PRESET_AGENT_PERSONAS);
    const custom = inMemoryPersonas[tenantId] || [];

    return NextResponse.json({
      success: true,
      personas: [...presets, ...custom],
      activePersonaId: presets[0].id,
    });
  } catch (err: any) {
    if (err.message?.includes("UNAUTHENTICATED") || err.message?.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to load agent personas" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/voice/agents
 * Creates or updates a custom AI agent persona for the firm.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;
    const body = await req.json();

    if (!body.name || !body.systemPrompt) {
      return NextResponse.json(
        { error: "Name and system prompt are required to create an agent persona." },
        { status: 400 }
      );
    }

    const newPersona: AgentPersona = {
      id: body.id || `custom_agent_${Date.now()}`,
      name: body.name.trim(),
      title: body.title?.trim() || "Practice AI Associate",
      role: body.role || "CUSTOM",
      language: body.language || "HINGLISH",
      gender: body.gender || "FEMALE",
      tone: body.tone || "CUSTOM",
      systemPrompt: body.systemPrompt.trim(),
      voiceSettings: {
        pitch: typeof body.voiceSettings?.pitch === "number" ? body.voiceSettings.pitch : 1.0,
        rate: typeof body.voiceSettings?.rate === "number" ? body.voiceSettings.rate : 1.0,
        langCode: body.voiceSettings?.langCode || "hi-IN",
        voiceNamePreference: body.voiceSettings?.voiceNamePreference || ["default"],
      },
      dispositionRules: {
        escalateDisputesToPartner: body.dispositionRules?.escalateDisputesToPartner ?? true,
        autoScheduleCallbacks: body.dispositionRules?.autoScheduleCallbacks ?? true,
        maxTurnsPerCall: body.dispositionRules?.maxTurnsPerCall || 8,
        mandatoryDisclaimer:
          body.dispositionRules?.mandatoryDisclaimer ||
          "This is an automated advisory call from TRUV Advisory on a recorded line.",
      },
      active: true,
    };

    if (!inMemoryPersonas[tenantId]) {
      inMemoryPersonas[tenantId] = [];
    }
    const existingIdx = inMemoryPersonas[tenantId].findIndex((p) => p.id === newPersona.id);
    if (existingIdx !== -1) {
      inMemoryPersonas[tenantId][existingIdx] = newPersona;
    } else {
      inMemoryPersonas[tenantId].push(newPersona);
    }

    return NextResponse.json({
      success: true,
      persona: newPersona,
      message: `Agent persona "${newPersona.name}" saved successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save agent persona" },
      { status: 500 }
    );
  }
}
