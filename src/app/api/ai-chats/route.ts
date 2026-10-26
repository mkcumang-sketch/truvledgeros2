import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/session";
import { z } from "zod";
import {
  rateLimiter,
  createRateLimitResponse,
  RATE_LIMIT_TIERS,
} from "@/lib/server/security/rate-limiter";
import { sanitizeStringInput } from "@/lib/server/security/request-validator";
import { generateStructuredJson } from "@/lib/server/ai/gemini-client";
import { db } from "@/lib/db";
import { CommunicationChannel } from "@prisma/client";

const ChatMessageSchema = z.object({
  message: z
    .string()
    .min(1, "Query is required")
    .max(2000, "Query cannot exceed 2000 characters")
    .transform(sanitizeStringInput),
  conversationId: z.string().optional(),
  clientId: z.string().optional(),
});

interface AiChatOutput {
  reply: string;
  citation: string;
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 1. Mandatory Tenant Authentication
    let context;
    try {
      context = await requireTenant();
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Active user session required to access AI advisory." },
        { status: 401 }
      );
    }

    const tenantId = context.membership.tenantId;

    // 2. Per-User Rate Limiting (20 calls per minute)
    const rateStatus = await rateLimiter.check(
      `user:ai:${context.user.id}`,
      RATE_LIMIT_TIERS.AI_API
    );
    if (!rateStatus.allowed) {
      return createRateLimitResponse(rateStatus);
    }

    // 3. Schema & Character Validation
    const rawBody = await req.json().catch(() => ({}));
    const parsed = ChatMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { message, conversationId, clientId } = parsed.data;

    // 4. Retrieve or Create Conversation in DB
    let conversation;
    if (conversationId) {
      conversation = await db.conversation.findFirst({
        where: { id: conversationId, tenantId },
      });
    }

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          tenantId,
          clientId: clientId || null,
          channel: CommunicationChannel.WEB,
          status: "AI_ACTIVE",
          visitorName: context.user.name || context.user.email || "Practice Member",
        },
      });
    }

    // 5. Save incoming Client query to Message table
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "CLIENT",
        senderName: context.user.name || "CA Member",
        content: message,
      },
    });

    // 6. Fetch previous conversation context for multi-turn advisory
    const recentMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: "desc" },
      take: 6,
    });
    recentMessages.reverse();

    const conversationHistory = recentMessages
      .map((m) => `${m.senderType === "CLIENT" ? "User Query" : "Assistant Response"}: ${m.content}`)
      .join("\n");

    // 7. Generate Live CA Advisory Response via Gemini (gemini-3.5-flash)
    const prompt = `You are a Senior Partner Chartered Accountant and Statutory Tax Advisor at an institutional Indian CA practice.
User Query: "${message}"

Recent Conversation Context:
${conversationHistory}

Instructions:
1. Provide an authoritative, legally rigorous, and actionable response covering relevant Indian statutory provisions (Income Tax Act 1961, CGST/SGST Acts 2017, MCA/Companies Act 2013, or ICAI Auditing Standards).
2. If this relates to GST notices (DRC-01, Sec 73/74), Section 43B(h) MSME disallowance, Section 148 reassessments, or TDS reconciliations, provide step-by-step guidance.
3. Provide the primary statutory citation or ICAI reference.

Return JSON in this format:
{
  "reply": "string (formatted with clean markdown bullet points)",
  "citation": "string (e.g. 'Income Tax Act Sec 43B(h) & MSMED Act Sec 15')"
}`;

    const aiOutput = await generateStructuredJson<AiChatOutput>({
      prompt,
      systemInstruction: "You are an expert Indian CA Statutory Tax Co-pilot delivering precise, professional advice.",
      fallback: {
        reply: `Analysis for query: "${message}"\n\nBased on prevailing direct and indirect tax guidelines:\n1. Ensure the transaction is substantiated with appropriate primary documentation (invoices, e-way bills, bank payment vouchers).\n2. Cross-verify whether withholding tax (TDS under Sec 194C/194J/194Q) applies prior to final expense booking.\n3. If this pertains to a statutory notice reply, assemble a point-by-point tabular reconciliation before partner sign-off.`,
        citation: "ICAI Technical Guide & Standard Tax Procedures",
      },
    });

    // 8. Persist AI response to Message table
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "AI",
        senderName: "TRUV AI Copilot",
        content: aiOutput.reply,
        toolInvoked: aiOutput.citation || null,
      },
    });

    // 9. Update Conversation timestamp
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return NextResponse.json({
      reply: aiOutput.reply,
      citation: aiOutput.citation,
      conversationId: conversation.id,
    });
  } catch (error: any) {
    console.error("[AI-CHATS-ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate AI advisory" },
      { status: 500 }
    );
  }
}
