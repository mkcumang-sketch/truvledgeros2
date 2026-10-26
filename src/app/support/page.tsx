"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Paperclip,
  Scale,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  timestamp: string;
  text: string;
  citation?: string;
}

const presetPrompts = [
  "Draft response to GST DRC-01 for ITC mismatch",
  "Compute Section 43B(h) MSME payment disallowance rules",
  "Check applicability of Form 10F and TRC for foreign remittances",
];

export default function SupportDeskPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "assistant",
      timestamp: "Just now",
      text: "Hello CA Priya. I am your TRUV AI Practice Co-pilot trained on the Income Tax Act, GSTN circulars, and ICAI auditing standards. How can I assist you with your filings or client advisories today?",
    },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const query = customText || inputMessage;
    if (!query.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, conversationId }),
      });

      const data = await res.json();
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: data.reply || "Failed to process advisory response.",
        citation: data.citation,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "Error communicating with AI service. Please verify your connection.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-8">
      {/* Header */}
      <div className="flex flex-col gap-1 pb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Support Desk & Practice Co-pilot
            </h1>
            <p className="text-sm text-slate-500">
              Direct tax jurisprudence, GST circulars, and instant reply drafting.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Chips */}
      <div className="flex flex-wrap gap-2 py-3">
        {presetPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(undefined, prompt)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-teal-500 hover:bg-teal-50/50 hover:text-teal-700"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex max-w-3xl gap-3 ${
              msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold ${
                msg.sender === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-teal-100 text-teal-700"
              }`}
            >
              {msg.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>

            <div
              className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.sender === "user"
                  ? "bg-teal-600 text-white"
                  : "border border-slate-100 bg-slate-50 text-slate-800"
              }`}
            >
              <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

              {msg.citation && (
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs">
                  <span className="flex items-center gap-1 font-semibold text-teal-700">
                    <Scale className="h-3 w-3" /> {msg.citation}
                  </span>
                  <button
                    onClick={() => copyToClipboard(msg.id, msg.text)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
              )}

              <span
                className={`mt-1 block text-[10px] ${
                  msg.sender === "user" ? "text-teal-200" : "text-slate-400"
                }`}
              >
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span>Consulting statutory provisions...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={(e) => handleSend(e)} className="pt-4">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-teal-500">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask a query regarding sections, GST notices, or drafting replies..."
            className="flex-1 bg-transparent px-2 text-sm text-slate-900 outline-none"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white transition hover:bg-teal-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}