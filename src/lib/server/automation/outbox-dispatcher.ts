import {
  processPendingAutomations,
  NativeEngineOptions,
  NativeEngineSummary,
} from "./native-engine";

export interface OutboxDispatchOptions extends NativeEngineOptions {}
export interface OutboxDispatchSummary extends NativeEngineSummary {}

/**
 * Drains the transactional outbox (AutomationEvent table) using the native in-process engine.
 * Completely self-contained within Node.js and PostgreSQL (no external n8n dependencies).
 */
export async function processOutboxQueue(
  options: OutboxDispatchOptions = {}
): Promise<OutboxDispatchSummary> {
  return await processPendingAutomations(options);
}
