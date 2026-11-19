/**
 * TRUV LedgerOS — Zero-Budget Autonomous Voice & Calling Provider Engine
 * 
 * Multi-Provider Abstraction:
 * 1. LOCAL OLLAMA (Free, 100% Offline, Privacy Preserving - Llama 3.2, Gemma 4, Llama 3)
 * 2. GOOGLE GEMINI FREE TIER (Fallback Cloud LLM)
 * 3. BROWSER SPEECH ENGINE (Web Speech API STT + SpeechSynthesis TTS - 0 PSTN Cost)
 * 4. MOCK SIMULATOR (Deterministic Testing & Headless Verification)
 * 5. CARRIER GATEWAY (Twilio / Exotel / Sarvam - Active ONLY when explicitly configured)
 */

import { AgentPersona, getAgentPersona } from "./agent-personas";
import { formatInrAmount, formatDueDateDDMMYYYY } from "./sarvam-telephony";

export type VoiceProviderType =
  | "OLLAMA_LOCAL"
  | "GEMINI_FREE"
  | "BROWSER_WEBRTC"
  | "CARRIER_PSTN"
  | "MOCK_SIMULATOR";

export interface ProviderStatus {
  id: VoiceProviderType;
  name: string;
  isFree: boolean;
  isOperational: boolean;
  description: string;
  activeModel?: string;
  latencyMs?: number;
}

export interface VoiceTurnParams {
  tenantId: string;
  clientName: string;
  firmName?: string;
  personaId?: string;
  reason: "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN" | "INBOUND_SUPPORT";
  invoiceNumber?: string;
  amount?: number;
  dueDate?: string;
  history: Array<{ speaker: "agent" | "client"; text: string }>;
  clientUtterance: string;
  preferredProvider?: VoiceProviderType;
}

export interface CallAnalysisResult {
  sentiment: "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE";
  disposition:
    | "PROMISED_TO_PAY"
    | "PAID_ALREADY"
    | "DISPUTE_RAISED"
    | "CALLBACK_REQUESTED"
    | "UNREACHABLE"
    | "WRONG_NUMBER"
    | "RESOLVED"
    | "FOLLOW_UP_REQUIRED";
  summary: string;
  promisedDate?: string | null;
  promisedAmount?: number | null;
  callbackTime?: string | null;
  partnerTaskRequired: boolean;
  escalationReason?: string | null;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const PREFERRED_OLLAMA_MODELS = ["llama3.2:3b", "gemma4:12b", "llama3:latest", "llama3", "mistral"];

/**
 * Probes and detects all available zero-cost and configured voice providers.
 */
export async function detectVoiceProviders(): Promise<ProviderStatus[]> {
  const providers: ProviderStatus[] = [];

  // 1. Check Local Ollama
  let ollamaOperational = false;
  let activeOllamaModel = "";
  let ollamaLatency = 0;

  try {
    const start = Date.now();
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(1800),
    });
    if (res.ok) {
      const data = await res.json();
      const installedModels = (data.models || []).map((m: any) => m.name || m.model);
      ollamaOperational = installedModels.length > 0;
      ollamaLatency = Date.now() - start;

      // Select best matching local model
      activeOllamaModel =
        PREFERRED_OLLAMA_MODELS.find((m) => installedModels.some((im: string) => im.startsWith(m))) ||
        installedModels[0] ||
        "llama3.2:3b";
    }
  } catch {
    ollamaOperational = false;
  }

  providers.push({
    id: "OLLAMA_LOCAL",
    name: "Local Ollama (Zero Cost / On-Device)",
    isFree: true,
    isOperational: ollamaOperational,
    description: ollamaOperational
      ? `Active local model: ${activeOllamaModel} (${ollamaLatency}ms latency, 100% private, 0 tokens billed).`
      : "Ollama not running locally on http://localhost:11434. Start Ollama for free local voice intelligence.",
    activeModel: activeOllamaModel || undefined,
    latencyMs: ollamaLatency || undefined,
  });

  // 2. Check Browser Web Speech / Audio Studio
  providers.push({
    id: "BROWSER_WEBRTC",
    name: "Browser Voice Studio (Zero Cost / Client Audio)",
    isFree: true,
    isOperational: true,
    description:
      "Direct browser two-way voice using Web Speech API STT and Web Audio SpeechSynthesis. No paid telephony trunk needed.",
    activeModel: "WebSpeechAPI + HTML5 Audio",
    latencyMs: 12,
  });

  // 3. Check Google Gemini Free Tier
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10);
  providers.push({
    id: "GEMINI_FREE",
    name: "Google Gemini (Free Tier)",
    isFree: true,
    isOperational: hasGemini,
    description: hasGemini
      ? "Google Gemini 1.5/2.0 API configured with free-tier rate limits."
      : "GEMINI_API_KEY not configured in environment.",
    activeModel: hasGemini ? "gemini-1.5-flash / gemini-2.0-flash" : undefined,
  });

  // 4. Mock Simulator (Always available for testing)
  providers.push({
    id: "MOCK_SIMULATOR",
    name: "High-Fidelity Voice Simulator",
    isFree: true,
    isOperational: true,
    description:
      "Deterministic simulation engine for automated test suites, CI pipelines, and offline verification.",
    activeModel: "TRUV-VoiceSim-v2",
    latencyMs: 5,
  });

  // 5. Carrier Gateway (Twilio / Exotel / PSTN)
  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
  const hasExotel = Boolean(process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN);

  providers.push({
    id: "CARRIER_PSTN",
    name: "Commercial PSTN Carrier Gateway",
    isFree: false,
    isOperational: hasTwilio || hasExotel,
    description: (hasTwilio || hasExotel)
      ? "Live PSTN carrier configured (Twilio/Exotel). Real phone calls incur standard carrier charges."
      : "No commercial carrier configured. All calls default to Zero-Budget Browser & Local modes.",
    activeModel: hasTwilio ? "Twilio Voice" : hasExotel ? "Exotel PSTN" : undefined,
  });

  return providers;
}

/**
 * Generates an initial outbound speech script based on practice context.
 */
export async function generateInitialCallScript(params: {
  clientName: string;
  firmName?: string;
  reason: "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN";
  invoiceNumber?: string;
  amount?: number;
  dueDate?: string;
  personaId?: string;
}): Promise<string> {
  const persona = getAgentPersona(params.personaId);
  const firm = params.firmName || "TRUV Advisory";
  const formattedAmount = params.amount ? formatInrAmount(params.amount) : "₹15,000";
  const formattedDate = params.dueDate ? formatDueDateDDMMYYYY(params.dueDate) : "the due date";

  // Prompt Construction
  const prompt = `Generate the opening 2-sentence spoken greeting for an automated voice call:
Agent: ${persona.name} (${persona.title})
Client Name: ${params.clientName}
Firm: ${firm}
Purpose: ${params.reason}
Invoice: ${params.invoiceNumber || "INV-001"}
Amount: ${formattedAmount}
Due Date: ${formattedDate}
Language: ${persona.language}

Rules:
1. Speak naturally as ${persona.name}. Keep it under 35 words.
2. State the firm name and purpose clearly.
3. No emojis, asterisks, or markdown formatting. Output plain spoken text only.`;

  // 1. Try Local Ollama
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        prompt: `${persona.systemPrompt}\n\n${prompt}`,
        stream: false,
      }),
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      const text = cleanSpokenText(data.response);
      if (text.length > 20) return text;
    }
  } catch {
    // Fallback to next provider
  }

  // 2. Try Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const { generateGeminiContent } = await import("@/lib/server/ai/gemini-client");
      const geminiRes = await generateGeminiContent({
        prompt,
        systemInstruction: persona.systemPrompt,
        maxOutputTokens: 120,
        temperature: 0.6,
      });
      const text = cleanSpokenText(geminiRes);
      if (text.length > 20) return text;
    } catch {
      // Fallback to deterministic
    }
  }

  // 3. High-Quality Deterministic Swiss-Fintech Script Fallback
  if (params.reason === "PAYMENT_RECOVERY") {
    return `Namaste ${params.clientName} ji, I am ${persona.name} calling from ${firm}. This is a quick courtesy reminder regarding invoice ${params.invoiceNumber || "for accounting services"} of ${formattedAmount}, which was due on ${formattedDate}. Could you please confirm if this payment has been scheduled?`;
  }
  if (params.reason === "GST_DEADLINE") {
    return `Hello ${params.clientName}, I am ${persona.name} from ${firm}. We are preparing your statutory GST return before the upcoming filing deadline. Could you please confirm if all sales and purchase invoices have been uploaded to your document vault?`;
  }
  if (params.reason === "DOCUMENT_COLLECTION") {
    return `Namaste ${params.clientName} ji, ${persona.name} here from ${firm}. We require your updated bank statements and GST data to close your quarterly accounts. Please let us know when you can share these documents.`;
  }
  return `Hello ${params.clientName}, I am ${persona.name} from ${firm} following up on your accounting and tax compliance status. Do you have two minutes to speak with us today?`;
}

/**
 * Generates the next conversational AI agent turn during a live voice call.
 */
export async function generateTurnResponse(params: VoiceTurnParams): Promise<{
  replyText: string;
  sentiment: "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE";
  shouldEndCall: boolean;
  detectedDisposition?: string;
}> {
  const persona = getAgentPersona(params.personaId);
  const firm = params.firmName || "TRUV Advisory";
  const formattedAmount = params.amount ? formatInrAmount(params.amount) : "the invoice amount";

  // Build conversational context
  const dialogTranscript = params.history
    .map((h) => `${h.speaker === "agent" ? persona.name : params.clientName}: "${h.text}"`)
    .join("\n");

  const prompt = `${persona.systemPrompt}

Client Name: ${params.clientName}
Firm Name: ${firm}
Reason for Call: ${params.reason}
Invoice Reference: ${params.invoiceNumber || "N/A"} (${formattedAmount})

Conversation History:
${dialogTranscript}
${params.clientName}: "${params.clientUtterance}"

Generate ${persona.name}'s next immediate spoken reply.
CRITICAL CLASSIFICATION RULES:
1. If the client states the amount is incorrect, wrong, disputes charges, or claims missing TDS/advance deduction: YOU MUST set "sentiment": "DISPUTING" and "detectedDisposition": "DISPUTE_RAISED".
2. If the client commits to pay or states payment was initiated/scheduled: set "sentiment": "PROMISED_TO_PAY" and "detectedDisposition": "PROMISED_TO_PAY".
3. If the client requests a callback or is busy: set "detectedDisposition": "CALLBACK_REQUESTED".

Output JSON strictly in this format:
{
  "reply": "Spoken text (maximum 2-3 sentences)",
  "sentiment": "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE",
  "shouldEndCall": boolean,
  "detectedDisposition": "PROMISED_TO_PAY" | "PAID_ALREADY" | "DISPUTE_RAISED" | "CALLBACK_REQUESTED" | "RESOLVED" | "IN_PROGRESS"
}`;

  // 1. Try Local Ollama
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        prompt,
        format: "json",
        stream: false,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data.response);
      if (parsed.reply) {
        return {
          replyText: cleanSpokenText(parsed.reply),
          sentiment: normalizeSentiment(parsed.sentiment, params.clientUtterance),
          shouldEndCall: Boolean(parsed.shouldEndCall),
          detectedDisposition: parsed.detectedDisposition,
        };
      }
    }
  } catch {
    // Fallback to Gemini or deterministic heuristic
  }

  // 2. Try Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const { generateGeminiContent } = await import("@/lib/server/ai/gemini-client");
      const geminiRes = await generateGeminiContent({
        prompt,
        responseMimeType: "application/json",
        maxOutputTokens: 250,
      });
      const parsed = JSON.parse(geminiRes);
      if (parsed.reply) {
        return {
          replyText: cleanSpokenText(parsed.reply),
          sentiment: normalizeSentiment(parsed.sentiment, params.clientUtterance),
          shouldEndCall: Boolean(parsed.shouldEndCall),
          detectedDisposition: parsed.detectedDisposition,
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fallback Heuristic Turn Engine
  return generateDeterministicTurn(params, persona);
}

/**
 * Analyzes complete call transcript to yield authoritative audit disposition and summary.
 */
export async function analyzeCallOutcome(params: {
  clientName: string;
  transcript: string;
  durationSeconds: number;
  reason: string;
}): Promise<CallAnalysisResult> {
  const text = params.transcript || "";
  const lower = text.toLowerCase();

  let sentiment: CallAnalysisResult["sentiment"] = "COOPERATIVE";
  let disposition: CallAnalysisResult["disposition"] = "RESOLVED";
  let partnerTaskRequired = false;
  let escalationReason: string | null = null;
  let promisedDate: string | null = null;

  if (lower.includes("dispute") || lower.includes("wrong amount") || lower.includes("not paying") || lower.includes("overcharge")) {
    sentiment = "DISPUTING";
    disposition = "DISPUTE_RAISED";
    partnerTaskRequired = true;
    escalationReason = `Client disputed invoice charges during call. Immediate partner review needed.`;
  } else if (lower.includes("already paid") || lower.includes("paid yesterday") || lower.includes("done via rtgs") || lower.includes("transferred")) {
    sentiment = "PROMISED_TO_PAY";
    disposition = "PAID_ALREADY";
    partnerTaskRequired = true;
    escalationReason = `Client claims payment already executed. Bank ledger verification needed.`;
  } else if (lower.includes("will pay") || lower.includes("by friday") || lower.includes("next week") || lower.includes("tomorrow") || lower.includes("promise")) {
    sentiment = "PROMISED_TO_PAY";
    disposition = "PROMISED_TO_PAY";
    promisedDate = "Within 7 Days";
  } else if (lower.includes("call later") || lower.includes("busy right now") || lower.includes("call back")) {
    sentiment = "COOPERATIVE";
    disposition = "CALLBACK_REQUESTED";
    partnerTaskRequired = true;
    escalationReason = "Client requested callback at a later time.";
  } else if (params.durationSeconds < 10) {
    sentiment = "UNRESPONSIVE";
    disposition = "UNREACHABLE";
    partnerTaskRequired = false;
  }

  const summary = `Voice session with ${params.clientName} (${params.durationSeconds}s): Outcome recorded as ${disposition} with ${sentiment} sentiment. ${escalationReason || "No further escalation required."}`;

  return {
    sentiment,
    disposition,
    summary,
    promisedDate,
    partnerTaskRequired,
    escalationReason,
  };
}

/**
 * Deterministic fallback conversational turn logic when LLMs are momentarily offline.
 */
function generateDeterministicTurn(
  params: VoiceTurnParams,
  persona: AgentPersona
): {
  replyText: string;
  sentiment: "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE";
  shouldEndCall: boolean;
  detectedDisposition?: string;
} {
  const text = params.clientUtterance.toLowerCase();

  // 1. Check Dispute first (e.g. client says "amount is incorrect, we paid TDS and your bill is wrong")
  if (
    text.includes("dispute") ||
    text.includes("wrong") ||
    text.includes("incorrect") ||
    text.includes("why so much") ||
    text.includes("not satisfied") ||
    text.includes("not reflect") ||
    text.includes("discrepancy") ||
    text.includes("overcharge")
  ) {
    return {
      replyText: `I completely understand your concern. I am marking this for immediate personal review by our managing partner, who will contact you with the complete ledger breakdown. Thank you for bringing this to our attention.`,
      sentiment: "DISPUTING",
      shouldEndCall: true,
      detectedDisposition: "DISPUTE_RAISED",
    };
  }

  // 2. Check Payment already executed
  if (text.includes("already paid") || text.includes("payment done") || text.includes("rtgs") || text.includes("transferred")) {
    return {
      replyText: `Thank you for confirming that! Could you please share the UTR or UPI transaction reference so our accounts team can reconcile it against the bank ledger right away?`,
      sentiment: "PROMISED_TO_PAY",
      shouldEndCall: false,
      detectedDisposition: "PAID_ALREADY",
    };
  }

  if (text.includes("will pay") || text.includes("tomorrow") || text.includes("friday") || text.includes("monday") || text.includes("next week")) {
    return {
      replyText: `Understood, we have logged your commitment to settle the account. We will share the UPI and bank transfer details to your registered WhatsApp. Thank you, and have a wonderful day!`,
      sentiment: "PROMISED_TO_PAY",
      shouldEndCall: true,
      detectedDisposition: "PROMISED_TO_PAY",
    };
  }

  if (text.includes("busy") || text.includes("driving") || text.includes("call back") || text.includes("later")) {
    return {
      replyText: `Apologies for interrupting your schedule. We will reschedule this call for a more convenient time today between 10 AM and 6 PM. Thank you!`,
      sentiment: "COOPERATIVE",
      shouldEndCall: true,
      detectedDisposition: "CALLBACK_REQUESTED",
    };
  }

  // Default natural turn
  return {
    replyText: `Thank you, ${params.clientName}. We appreciate your ongoing partnership with our firm. Is there any particular query regarding your tax filings or statement that I can assist you with right now?`,
    sentiment: "COOPERATIVE",
    shouldEndCall: false,
    detectedDisposition: "IN_PROGRESS",
  };
}

function cleanSpokenText(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\*+/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/["']/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSentiment(raw?: string, clientUtterance?: string): "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE" {
  const s = (raw || "").toUpperCase();
  const u = (clientUtterance || "").toLowerCase();
  if (
    s.includes("DISPUT") ||
    u.includes("incorrect") ||
    u.includes("dispute") ||
    u.includes("wrong amount") ||
    u.includes("discrepancy") ||
    u.includes("overcharge")
  ) {
    return "DISPUTING";
  }
  if (s.includes("PROMISE") || s.includes("PAY")) return "PROMISED_TO_PAY";
  if (s.includes("UNRESPONSIVE") || s.includes("SILENT")) return "UNRESPONSIVE";
  return "COOPERATIVE";
}
