/**
 * TRUV LedgerOS — Persistent Transactional Outbox Worker
 * Runs continuously in the background, polling and draining pending AutomationEvents
 * using atomic claims, HMAC signed HTTP dispatch, and bounded backoff.
 */
import { processOutboxQueue } from "../src/lib/server/automation/outbox-dispatcher";

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000", 10);
let isRunning = true;
let activeCycle = false;

console.log("==================================================================");
console.log("TRUV LedgerOS — Persistent Outbox Worker Daemon Initialized");
console.log(`Polling Interval: ${POLL_INTERVAL_MS}ms`);
console.log(`Node Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`Target n8n Engine: ${process.env.N8N_BASE_URL || "Standby / Local"}`);
console.log("==================================================================\n");

async function tick() {
  if (!isRunning || activeCycle) return;
  activeCycle = true;

  try {
    const summary = await processOutboxQueue({
      batchSize: 25,
      forceDispatch: false,
    });

    if (summary.processed > 0) {
      console.log(
        `[OUTBOX-WORKER ${new Date().toISOString()}] Processed: ${summary.processed} | Succeeded: ${summary.succeeded} | Retried: ${summary.retried} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`
      );
    }
  } catch (err: any) {
    console.error(`[OUTBOX-WORKER-ERROR ${new Date().toISOString()}]`, err.message || err);
  } finally {
    activeCycle = false;
  }
}

// Start continuous polling loop
const timer = setInterval(tick, POLL_INTERVAL_MS);

// Initial immediate run
tick();

// Graceful shutdown handling
function shutdown(signal: string) {
  console.log(`\n[OUTBOX-WORKER] Received ${signal}. Shutting down worker gracefully...`);
  isRunning = false;
  clearInterval(timer);

  // Allow in-flight tick to finish
  const checkInterval = setInterval(() => {
    if (!activeCycle) {
      clearInterval(checkInterval);
      console.log("[OUTBOX-WORKER] Worker terminated cleanly.");
      process.exit(0);
    }
  }, 200);

  // Force exit after 5 seconds if hung
  setTimeout(() => {
    console.warn("[OUTBOX-WORKER] Forcefully exiting after timeout.");
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
