"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  ShieldCheck,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  X,
  Radio,
  Send,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrowserVoiceCallingModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  recipientPhone?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount?: number;
  dueDate?: string;
  reason?: "PAYMENT_RECOVERY" | "DOCUMENT_COLLECTION" | "GST_DEADLINE" | "CLIENT_CHECKIN" | "INBOUND_SUPPORT";
  direction?: "OUTBOUND" | "INBOUND";
  personaId?: string;
  ollamaModel?: string;
  customOllamaHost?: string;
  onCallCompleted?: (summary: any) => void;
}

export function BrowserVoiceCallingModal({
  isOpen,
  onClose,
  clientName,
  clientId,
  recipientPhone,
  invoiceId,
  invoiceNumber,
  amount,
  dueDate,
  reason = "PAYMENT_RECOVERY",
  direction = "OUTBOUND",
  personaId = "PRIYA",
  ollamaModel,
  customOllamaHost,
  onCallCompleted,
}: BrowserVoiceCallingModalProps) {
  // Call States: "connecting" | "active" | "ended"
  const [callState, setCallState] = useState<"connecting" | "active" | "ended">("connecting");
  const [sessionId, setSessionId] = useState<string>("");
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [manualTextInput, setManualTextInput] = useState<string>("");
  const [micStatus, setMicStatus] = useState<"active" | "denied" | "unsupported" | "standby">("standby");

  const [activePersona, setActivePersona] = useState<any>({
    name: "Priya Sharma",
    title: "Senior Payment Recovery Specialist",
    voiceSettings: { pitch: 1.05, rate: 1.0, langCode: "hi-IN" },
  });

  // Transcript state
  const [transcript, setTranscript] = useState<
    Array<{ speaker: "agent" | "client"; text: string; time: string }>
  >([]);
  const [currentUtterance, setCurrentUtterance] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Audio / Speech Recognition Refs
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 1. Initialize Call Session
  useEffect(() => {
    if (!isOpen) return;

    setCallState("connecting");
    setDuration(0);
    setTranscript([]);
    setCurrentUtterance("");
    setAnalysisResult(null);
    setIsPaused(false);
    setIsMuted(false);

    async function initSession() {
      try {
        const res = await fetch("/api/voice/live-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            clientName,
            clientId,
            invoiceId,
            invoiceNumber,
            amount,
            dueDate,
            reason,
            direction,
            personaId,
            ollamaModel,
            customOllamaHost,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setSessionId(data.sessionId);
          if (data.persona) setActivePersona(data.persona);

          // Initial greeting
          const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setTranscript([{ speaker: "agent", text: data.greetingText, time: nowStr }]);
          setCallState("active");

          // Speak initial greeting via browser speech
          speakAgentUtterance(data.greetingText, data.persona?.voiceSettings);

          // Start Timer
          startTimer();

          // Start Microphone & Audio Waveform
          startMicrophone();
        }
      } catch (err) {
        console.error("Failed to start live calling session:", err);
        setCallState("active");
        startTimer();
      }
    }

    initSession();

    return () => {
      cleanupAudio();
    };
  }, [isOpen]);

  function startTimer() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }

  // Scroll to bottom of transcript automatically
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, currentUtterance]);

  // 2. Browser Speech Synthesis (TTS - Zero Cost)
  function speakAgentUtterance(text: string, voiceSettings?: any) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = voiceSettings?.pitch || activePersona.voiceSettings?.pitch || 1.05;
    utterance.rate = voiceSettings?.rate || activePersona.voiceSettings?.rate || 1.0;
    utterance.lang = voiceSettings?.langCode || activePersona.voiceSettings?.langCode || "hi-IN";

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang.includes("IN") ||
        v.name.includes("India") ||
        v.name.includes("Aditi") ||
        v.name.includes("Ravi") ||
        v.name.includes("Swara")
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsAgentSpeaking(true);
    utterance.onend = () => {
      setIsAgentSpeaking(false);
      if (!isPaused && !isMuted) restartRecognition();
    };
    utterance.onerror = () => setIsAgentSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  // Interrupt Agent Speech
  function interruptAgent() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsAgentSpeaking(false);
    restartRecognition();
  }

  // 3. Browser Speech Recognition (STT - Zero Cost)
  function startMicrophone() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicStatus("unsupported");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = activePersona.voiceSettings?.langCode || "en-IN";

      recognition.onstart = () => {
        setIsUserSpeaking(false);
        setMicStatus("active");
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        // If agent was speaking and user speaks, auto-interrupt agent
        if (isAgentSpeaking) {
          interruptAgent();
        }

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript) {
          setIsUserSpeaking(true);
          setCurrentUtterance(interimTranscript);
        }

        if (finalTranscript.trim()) {
          setIsUserSpeaking(false);
          setCurrentUtterance("");
          handleUserFinishedSpeaking(finalTranscript.trim());
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setMicStatus("denied");
        } else if (e.error !== "no-speech") {
          console.warn("Speech recognition notice:", e.error);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Speech recognition init error:", err);
      setMicStatus("denied");
    }

    // Initialize Waveform Canvas
    initVisualizerCanvas();
  }

  function restartRecognition() {
    if (recognitionRef.current && !isMuted && !isPaused) {
      try {
        recognitionRef.current.start();
      } catch {
        // Already active
      }
    }
  }

  // 4. Handle User Turn Submission & Fetch Next Agent Reply
  async function handleUserFinishedSpeaking(userText: string) {
    if (!userText || isPaused) return;

    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updatedHistory = [...transcript, { speaker: "client" as const, text: userText, time: nowStr }];
    setTranscript(updatedHistory);

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const res = await fetch("/api/voice/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "turn",
          sessionId,
          clientUtterance: userText,
          history: updatedHistory.map((h) => ({ speaker: h.speaker, text: h.text })),
          clientName,
          amount,
          invoiceNumber,
          reason,
          personaId: activePersona.id,
          ollamaModel,
          customOllamaHost,
        }),
      });

      const data = await res.json();
      if (data.success && data.replyText) {
        const agentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setTranscript((prev) => [
          ...prev,
          { speaker: "agent", text: data.replyText, time: agentTime },
        ]);

        // Speak the agent's reply
        speakAgentUtterance(data.replyText);

        if (data.shouldEndCall) {
          setTimeout(() => endCall(), 4000);
        }
      }
    } catch (err) {
      console.error("Failed to process conversation turn:", err);
      restartRecognition();
    }
  }

  // 5. Audio Waveform Canvas Visualizer
  function initVisualizerCanvas() {
    if (!navigator.mediaDevices?.getUserMedia || !canvasRef.current) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function drawWaveform() {
          if (!ctx || !canvas) return;
          animationFrameRef.current = requestAnimationFrame(drawWaveform);
          analyser.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = (canvas.width / dataArray.length) * 2;
          let x = 0;

          for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = isAgentSpeaking ? "#F59E0B" : "#10B981";
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
          }
        }

        drawWaveform();
      })
      .catch(() => {
        setMicStatus("denied");
      });
  }

  // 6. End Call & Save Outcome
  async function endCall() {
    cleanupAudio();
    setCallState("ended");

    try {
      const res = await fetch("/api/voice/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          sessionId,
          clientName,
          clientId,
          invoiceId,
          reason,
          durationSeconds: duration,
          history: transcript,
          recipientPhone,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.analysis);
        if (onCallCompleted) onCallCompleted(data);
      }
    } catch (err) {
      console.error("Failed to end call session:", err);
    }
  }

  function restartCall() {
    cleanupAudio();
    setDuration(0);
    setTranscript([]);
    setCurrentUtterance("");
    setAnalysisResult(null);
    setIsPaused(false);
    setCallState("connecting");

    // Re-trigger start
    fetch("/api/voice/live-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        clientName,
        clientId,
        invoiceId,
        invoiceNumber,
        amount,
        dueDate,
        reason,
        direction,
        personaId,
        ollamaModel,
        customOllamaHost,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSessionId(data.sessionId);
          const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setTranscript([{ speaker: "agent", text: data.greetingText, time: nowStr }]);
          setCallState("active");
          speakAgentUtterance(data.greetingText, data.persona?.voiceSettings);
          startTimer();
          startMicrophone();
        }
      });
  }

  function cleanupAudio() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    } else if (!nextMuted) {
      restartRecognition();
    }
  }

  function togglePause() {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (nextPaused) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    } else {
      startTimer();
      restartRecognition();
    }
  }

  function formatTimer(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function downloadTranscript() {
    const text = transcript
      .map((t) => `[${t.time}] ${t.speaker === "agent" ? activePersona.name : clientName}: ${t.text}`)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TRUV_Call_Transcript_${clientName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Radio className="w-5 h-5 animate-pulse text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {direction === "INBOUND" ? "Simulated Inbound Session" : "Outbound AI Call Studio"}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Zero-PSTN Web Audio
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Contact: <span className="font-semibold text-slate-700 dark:text-slate-300">{clientName}</span>{" "}
                {recipientPhone ? `(${recipientPhone})` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTimer(duration)}</span>
            </div>
            <button
              onClick={() => {
                cleanupAudio();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Call Banner & Compliance Notice */}
        <div className="px-5 py-2.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200/50 dark:border-amber-900/30 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              Autonomous Agent: <strong>{activePersona.name}</strong> ({activePersona.title})
            </span>
          </div>
          <span className="text-[11px] opacity-80 hidden sm:inline">TRAI Consent & Recording Disclosed</span>
        </div>

        {/* Mic Warning if Denied or Unsupported */}
        {micStatus === "denied" && (
          <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
            <span>Microphone access blocked. You can still test conversation turns by typing in the input box below.</span>
          </div>
        )}

        {/* Main Body */}
        {callState !== "ended" ? (
          <div className="flex-1 flex flex-col p-4 sm:p-5 overflow-hidden">
            {/* Live Dual-Color Transcript Feed */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-3.5 pr-1 min-h-[200px] max-h-[320px] p-2"
            >
              {transcript.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    item.speaker === "agent" ? "items-start" : "items-end"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium text-slate-400">
                    {item.speaker === "agent" ? (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {activePersona.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {clientName}
                        </span>
                        <User className="w-3 h-3 text-emerald-500" />
                      </>
                    )}
                    <span>• {item.time}</span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                      item.speaker === "agent"
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-sm border border-slate-200 dark:border-slate-700"
                        : "bg-emerald-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {item.text}
                  </div>
                </div>
              ))}

              {/* Interim Live Utterance Bubble */}
              {currentUtterance && (
                <div className="flex flex-col items-end animate-pulse">
                  <div className="text-[11px] font-medium text-emerald-500 mb-1">
                    Speaking now...
                  </div>
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                    {currentUtterance}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Typing Input Fallback for Full Turn Verification */}
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={manualTextInput}
                onChange={(e) => setManualTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualTextInput.trim()) {
                    handleUserFinishedSpeaking(manualTextInput.trim());
                    setManualTextInput("");
                  }
                }}
                placeholder="Type client response (e.g. 'We already paid TDS' or 'Will pay Friday')..."
                className="flex-1 h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (manualTextInput.trim()) {
                    handleUserFinishedSpeaking(manualTextInput.trim());
                    setManualTextInput("");
                  }
                }}
                disabled={!manualTextInput.trim() || isAgentSpeaking}
                className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </Button>
            </div>

            {/* Audio Waveform Canvas & Live Indicator */}
            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isAgentSpeaking
                      ? "bg-amber-500 animate-ping"
                      : isUserSpeaking
                      ? "bg-emerald-500 animate-ping"
                      : "bg-slate-300 dark:bg-slate-700"
                  }`}
                />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAgentSpeaking
                    ? `${activePersona.name} is speaking...`
                    : isUserSpeaking
                    ? "Listening to your voice..."
                    : isPaused
                    ? "Call session paused."
                    : "Speak or type client responses"}
                </span>

                {isAgentSpeaking && (
                  <button
                    onClick={interruptAgent}
                    className="ml-2 text-[11px] text-amber-500 hover:text-amber-400 underline font-medium"
                  >
                    Interrupt Agent
                  </button>
                )}
              </div>

              {/* Mini Audio Visualizer Canvas */}
              <canvas
                ref={canvasRef}
                width={100}
                height={20}
                className="rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            {/* Interactive Call Action Bar */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleMute}
                  className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs ${
                    isMuted ? "border-rose-500 text-rose-600" : ""
                  }`}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMuted ? "Unmute" : "Mute"}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePause}
                  className="min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isPaused ? "Resume" : "Pause"}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={restartCall}
                  className="min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={endCall}
                  className="min-h-[40px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 text-xs"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Call</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Post-Call Summary & Outcome Disposition Screen */
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Voice Call Completed & Logged to Ledger
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Total Session Duration: <strong>{duration} seconds</strong> ({transcript.length} turns recorded)
                </p>
              </div>
            </div>

            {analysisResult && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Call Disposition
                  </span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {analysisResult.disposition}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Client Sentiment
                  </span>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {analysisResult.sentiment}
                  </div>
                </div>

                <div className="sm:col-span-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Executive Summary
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                    {analysisResult.summary}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTranscript}
                className="min-h-[44px] rounded-xl flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Export Transcript (.txt)</span>
              </Button>

              <Button
                size="sm"
                onClick={onClose}
                className="min-h-[44px] px-6 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
