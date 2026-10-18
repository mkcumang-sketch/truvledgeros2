import { db } from "@/lib/db";

export interface FeatureFlagState {
  aiCopilotV2: boolean;
  gstnSandboxMock: boolean;
  autoWhatsAppCron: boolean;
  killSwitchGlobalRegistration: boolean;
  enforceM2MSignatureAuth: boolean;
  bulkCsvImportStrictSanitization: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlagState = {
  aiCopilotV2: true,
  gstnSandboxMock: true,
  autoWhatsAppCron: true,
  killSwitchGlobalRegistration: false,
  enforceM2MSignatureAuth: true,
  bulkCsvImportStrictSanitization: true,
};

// In-memory runtime cache for hot-reload performance
let inMemoryFlags: FeatureFlagState = { ...DEFAULT_FEATURE_FLAGS };
let isInitialized = false;

/**
 * Initializes feature flags by checking the most recent PLATFORM_FLAG_TOGGLED audit logs.
 */
export async function initializeFeatureFlags(): Promise<FeatureFlagState> {
  if (isInitialized) {
    return inMemoryFlags;
  }

  try {
    const recentFlagLogs = await db.auditLog.findMany({
      where: {
        action: "PLATFORM_FLAG_TOGGLED",
        entityType: "FEATURE_FLAG",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const activeState: Partial<FeatureFlagState> = {};
    for (const log of recentFlagLogs) {
      const flagKey = log.entityId as keyof FeatureFlagState;
      if (flagKey in DEFAULT_FEATURE_FLAGS && activeState[flagKey] === undefined) {
        const payload = log.newValue as any;
        if (payload && typeof payload.enabled === "boolean") {
          activeState[flagKey] = payload.enabled;
        }
      }
    }

    inMemoryFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...activeState,
    };
    isInitialized = true;
  } catch {
    inMemoryFlags = { ...DEFAULT_FEATURE_FLAGS };
  }

  return inMemoryFlags;
}

/**
 * Checks whether a specific platform feature flag is currently active.
 */
export async function isFeatureFlagEnabled(flagKey: keyof FeatureFlagState): Promise<boolean> {
  if (!isInitialized) {
    await initializeFeatureFlags();
  }
  return inMemoryFlags[flagKey] ?? DEFAULT_FEATURE_FLAGS[flagKey] ?? false;
}

/**
 * Returns all feature flags with their current operational state.
 */
export async function getAllFeatureFlags(): Promise<FeatureFlagState> {
  return await initializeFeatureFlags();
}

/**
 * Mutates an in-memory flag and ensures future reads reflect the change immediately.
 */
export function setRuntimeFeatureFlag(flagKey: keyof FeatureFlagState, enabled: boolean): void {
  inMemoryFlags[flagKey] = enabled;
  isInitialized = true;
}
