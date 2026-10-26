/**
 * TRUV LedgerOS — Persistent In-Process Automation Worker Daemon
 * Runs continuously in the background, polling and processing pending AutomationEvents
 * directly in Node.js against PostgreSQL with zero external orchestrator dependencies.
 */
import { processPendingAutomations } from "../src/lib/server/automation/native-engine";

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000", 10);
let isRunning = true;
let activeCycle = false;

console.log("==================================================================");
console.log("TRUV LedgerOS — Native In-Process Automation Daemon Initialized");
console.log(`Polling Interval: ${POLL_INTERVAL_MS}ms`);
console.log(`Node Environment: ${process.env.NODE_ENV || "development"}`);
console.log("Engine: 100% Native In-Process PostgreSQL Worker");
console.log("==================================================================\n");

async function tick() {
  if (!isRunning || activeCycle) return;
  activeCycle = true;

  try {
    const summary = await processPendingAutomations({
      batchSize: 25,
      forceDispatch: false,
    });

    if (summary.processed > 0) {
      console.log(
        `[NATIVE-WORKER ${new Date().toISOString()}] Processed: ${summary.processed} | Succeeded: ${summary.succeeded} | Retried: ${summary.retried} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`
      );
    }
  } catch (err: any) {
    console.error(`[NATIVE-WORKER-ERROR ${new Date().toISOString()}]`, err.message || err);
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
  console.log(`\n[NATIVE-WORKER] Received ${signal}. Shutting down worker gracefully...`);
  isRunning = false;
  clearInterval(timer);

  // Allow in-flight tick to finish
  const checkInterval = setInterval(() => {
    if (!activeCycle) {
      clearInterval(checkInterval);
      console.log("[NATIVE-WORKER] Worker terminated cleanly.");
      process.exit(0);
    }
  }, 200);

  // Force exit after 5 seconds if hung
  setTimeout(() => {
    console.warn("[NATIVE-WORKER] Forcefully exiting after timeout.");
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
