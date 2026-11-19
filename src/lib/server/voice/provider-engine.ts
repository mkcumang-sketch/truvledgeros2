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
  installedModels?: string[];
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
  ollamaModel?: string;
  customOllamaHost?: string;
}

export interface CallAnalysisResult {
  sentiment: "COOPERATIVE" | "PROMISED_TO_PAY" | "DISPUTING" | "UNRESPONSIVE";
  disposition:
    | "PROMISED_TO_PAY"
    | "PAID_ALREADY"
    | "DISPUTE_RAISED"
    | "CALLBACK_REQUESTED"
    | "DO_NOT_CALL"
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

export const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const PREFERRED_OLLAMA_MODELS = ["llama3.2:3b", "gemma4:12b", "llama3:latest", "llama3", "mistral"];

/**
 * Probes and queries local Ollama tags API for installed models.
 */
export async function getInstalledOllamaModels(customHost?: string): Promise<{
  available: boolean;
  models: string[];
  host: string;
  latencyMs: number;
}> {
  const host = customHost || DEFAULT_OLLAMA_HOST;
  const start = Date.now();
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map((m: any) => m.name || m.model);
      return {
        available: models.length > 0,
        models,
        host,
        latencyMs: Date.now() - start,
      };
    }
  } catch {
    // Unreachable or offline
  }
  return {
    available: false,
    models: [],
    host,
    latencyMs: Date.now() - start,
  };
}

/**
 * Probes and detects all available zero-cost and configured voice providers.
 */
export async function detectVoiceProviders(customOllamaHost?: string): Promise<ProviderStatus[]> {
  const providers: ProviderStatus[] = [];

  // 1. Check Local Ollama
  const ollamaInfo = await getInstalledOllamaModels(customOllamaHost);
  let activeOllamaModel = "";
  if (ollamaInfo.available) {
    activeOllamaModel =
      PREFERRED_OLLAMA_MODELS.find((m) =>
        ollamaInfo.models.some((im: string) => im.startsWith(m))
      ) ||
      ollamaInfo.models[0] ||
      "llama3.2:3b";
  }

  providers.push({
    id: "OLLAMA_LOCAL",
    name: "Local Ollama (Zero Cost / On-Device)",
    isFree: true,
    isOperational: ollamaInfo.available,
    description: ollamaInfo.available
      ? `Active local model: ${activeOllamaModel} (${ollamaInfo.latencyMs}ms latency, 100% private, 0 tokens billed).`
      : `Ollama not reachable on ${ollamaInfo.host}. Start Ollama ('ollama serve') for free on-device intelligence.`,
    activeModel: activeOllamaModel || undefined,
    latencyMs: ollamaInfo.available ? ollamaInfo.latencyMs : undefined,
    installedModels: ollamaInfo.models,
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
  ollamaModel?: string;
  customOllamaHost?: string;
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
1. Start with an Indian greeting appropriate to ${persona.language} ("Namaste", "Hello").
2. Clearly introduce yourself and the firm.
3. State the purpose in 1-2 conversational sentences.
4. Keep under 35 spoken words.
5. Return ONLY the spoken words with no quotes or metadata.`;

  // 1. Try Local Ollama if running
  const ollamaHost = params.customOllamaHost || DEFAULT_OLLAMA_HOST;
  const targetModel = params.ollamaModel || "llama3.2:3b";

  try {
    const res = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      const text = cleanSpokenText(data.response);
      if (text.length > 20) return text;
    }
  } catch {
    // Fallback to Gemini or deterministic
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
    return `Namaste ${params.clientName}, this is ${persona.name} from ${firm}. We are conducting our quarterly audit review and require your updated bank statements. Please let us know if you can upload them today.`;
  }
  return `Namaste ${params.clientName}, I am ${persona.name} from ${firm}. Reaching out for your periodic accounting and tax advisory check-in. How are your operations running this month?`;
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
  const clientText = (params.clientUtterance || "").toLowerCase();

  // 0. TRAI Opt-Out / DND Handling (Instant Rule Enforcement)
  if (
    clientText.includes("do not call") ||
    clientText.includes("stop calling") ||
    clientText.includes("remove my number") ||
    clientText.includes("dnd") ||
    clientText.includes("opt out") ||
    clientText.includes("unsubscribe") ||
    clientText.includes("don't call")
  ) {
    return {
      replyText: `Understood. We have logged your request and removed your contact number from our automated calling list. You will not receive further automated reminders from ${firm}. Dhanyawad.`,
      sentiment: "COOPERATIVE",
      shouldEndCall: true,
      detectedDisposition: "DO_NOT_CALL",
    };
  }

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
  const ollamaHost = params.customOllamaHost || DEFAULT_OLLAMA_HOST;
  const targetModel = params.ollamaModel || "llama3.2:3b";

  try {
    const res = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
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
      // Fallback to deterministic
    }
  }

  // 3. High-Fidelity Deterministic Fallback
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

  // 0. TRAI Opt-Out / DND check
  if (lower.includes("do not call") || lower.includes("stop calling") || lower.includes("remove my number") || lower.includes("dnd") || lower.includes("opt out")) {
    sentiment = "COOPERATIVE";
    disposition = "DO_NOT_CALL";
    partnerTaskRequired = true;
    escalationReason = "Client explicitly requested Do-Not-Call (DND) opt-out. Update CRM contact status to DO_NOT_CALL.";
  } else if (lower.includes("dispute") || lower.includes("wrong amount") || lower.includes("not paying") || lower.includes("overcharge") || lower.includes("incorrect")) {
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

  // 1. Check Dispute first
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

  // 3. Check Commitment to Pay
  if (text.includes("will pay") || text.includes("tomorrow") || text.includes("friday") || text.includes("monday") || text.includes("next week") || text.includes("by ")) {
    return {
      replyText: `Understood, we have logged your commitment to settle the account. We will share the UPI and bank transfer details to your registered WhatsApp. Thank you, and have a wonderful day!`,
      sentiment: "PROMISED_TO_PAY",
      shouldEndCall: true,
      detectedDisposition: "PROMISED_TO_PAY",
    };
  }

  // 4. Check Busy / Callback request
  if (text.includes("busy") || text.includes("call later") || text.includes("driving") || text.includes("in a meeting")) {
    return {
      replyText: `No problem at all. We will schedule a callback during our standard office hours between 10 AM and 6 PM. Thank you for your time.`,
      sentiment: "COOPERATIVE",
      shouldEndCall: true,
      detectedDisposition: "CALLBACK_REQUESTED",
    };
  }

  // Default natural acknowledgement
  return {
    replyText: `Noted. I have updated our records with your feedback. If you have any questions regarding your invoice or tax filing, feel free to reach back out to our office. Dhanyawad!`,
    sentiment: "COOPERATIVE",
    shouldEndCall: false,
    detectedDisposition: "IN_PROGRESS",
  };
}

function cleanSpokenText(text: string): string {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, "")
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
