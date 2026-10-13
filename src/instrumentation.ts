/**
 * Next.js Server Runtime Instrumentation Hook
 * Invoked once when the Next.js Node.js server starts up.
 * If ENABLE_INPROCESS_OUTBOX_WORKER is true, spins up a gentle periodic background timer
 * to drain the transactional outbox queue.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const isWorkerEnabled = process.env.ENABLE_INPROCESS_OUTBOX_WORKER === "true";
    if (isWorkerEnabled) {
      console.log("[INSTRUMENTATION] Initializing In-Process Outbox Worker timer...");
      const { processOutboxQueue } = await import("@/lib/server/automation/outbox-dispatcher");

      const intervalMs = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "10000", 10);
      setInterval(async () => {
        try {
          await processOutboxQueue({ batchSize: 20, forceDispatch: false });
        } catch (err: any) {
          console.error("[INPROCESS-OUTBOX-ERROR]", err.message || err);
        }
      }, intervalMs);
    }
  }
}
