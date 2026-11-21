import {
  authCleanupConfirmation,
  deleteExpiredOrUsedResetTokens,
  deleteAuthRecordsOnly,
  resetTokenCleanupConfirmation,
  runAuthCleanup,
  runStaleResetTokenCleanup,
  type AuthCleanupDependencies,
  type AuthRecordDeletionTransaction,
  type StaleResetTokenStore,
} from "../scripts/auth-cleanup";
import {
  createInitialSuperAdmin,
  type BootstrapStore,
  type BootstrapTransaction,
} from "../scripts/auth-bootstrap";
import { detectEnvironment } from "../scripts/setup-admin";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

function makeBootstrapStore(existingSuperAdmin: { id: string } | null = null) {
  let created: Parameters<BootstrapTransaction["createUser"]>[0] | undefined;
  const transaction: BootstrapTransaction = {
    findSuperAdmin: async () => existingSuperAdmin,
    findUserByEmail: async () => null,
    createUser: async (input) => {
      created = input;
      return { id: "created-user" };
    },
    createAuditLog: async () => undefined,
  };
  const store: BootstrapStore = {
    transaction: async (callback) => callback(transaction),
  };
  return { store, getCreated: () => created };
}

async function testBootstrap(): Promise<void> {
  const { store, getCreated } = makeBootstrapStore();
  const user = await createInitialSuperAdmin(
    store,
    "  ADMIN@EXAMPLE.COM ",
    "A sufficiently long bootstrap password",
    async (password) => `hashed:${password}`
  );
  const created = getCreated();
  assert(user.id === "created-user", "bootstrap creates one account through the supplied transaction");
  assert(
    created?.email === "admin@example.com" &&
      created.passwordHash.startsWith("hashed:") &&
      created.active &&
      created.isSuperAdmin,
    "bootstrap normalizes email, hashes the password, and marks the account active superadmin"
  );

  const existing = makeBootstrapStore({ id: "existing-admin" });
  let refused = false;
  try {
    await createInitialSuperAdmin(
      existing.store,
      "next@example.com",
      "A sufficiently long bootstrap password",
      async () => "unused"
    );
  } catch (error) {
    refused = error instanceof Error && error.message.includes("already exists");
  }
  assert(refused && !existing.getCreated(), "bootstrap refuses to create a second superadmin");
}

function testRailwayEnvironmentClassification(): void {
  const databaseUrl = "postgresql://test:test@acela.proxy.rlwy.net:35942/railway?sslmode=no-verify";
  const environment = detectEnvironment(databaseUrl, databaseUrl);
  assert(
    environment.target === "PRODUCTION" && environment.isVerified,
    "Railway public PostgreSQL proxy is identified as production for protected admin-operation gates"
  );
}

function makeCleanupDependencies(overrides: Partial<AuthCleanupDependencies> = {}) {
  const calls: string[] = [];
  let selectedEmails: string[] = [];
  const deps: AuthCleanupDependencies = {
    isProduction: false,
    verifyConnection: async () => { calls.push("connection"); },
    createBackup: async () => { calls.push("backup"); },
    verifyBackup: async () => { calls.push("verify-backup"); },
    findTargets: async () => {
      calls.push("count");
      return [{ id: "approved-user", email: "approved@example.com" }];
    },
    deleteAuthRecords: async () => {
      calls.push("delete-auth");
      return 1;
    },
    ...overrides,
  };
  const originalFindTargets = deps.findTargets;
  deps.findTargets = async (emails) => {
    selectedEmails = emails;
    return originalFindTargets(emails);
  };
  return { deps, calls, getSelectedEmails: () => selectedEmails };
}

async function testCleanupGates(): Promise<void> {
  const dryRun = makeCleanupDependencies();
  const dryRunResult = await runAuthCleanup(
    {
      emails: [" Approved@Example.com "],
      execute: false,
      confirmProduction: false,
    },
    dryRun.deps
  );
  assert(
    dryRunResult.targetCount === 1 &&
      dryRunResult.deletedCount === 0 &&
      !dryRun.calls.includes("delete-auth") &&
    !dryRun.calls.includes("backup") &&
    dryRun.getSelectedEmails().join(",") === "approved@example.com",
    "cleanup dry run counts approved accounts without deleting or creating a backup"
  );

  const missingBackup = makeCleanupDependencies();
  let backupRequired = false;
  try {
    await runAuthCleanup(
      { emails: ["approved@example.com"], execute: true, confirmProduction: false },
      missingBackup.deps
    );
  } catch (error) {
    backupRequired = error instanceof Error && error.message.includes("backup path");
  }
  assert(backupRequired && !missingBackup.calls.includes("delete-auth"), "cleanup execution requires a backup path");

  const missingConfirmation = makeCleanupDependencies();
  let confirmationRequired = false;
  try {
    await runAuthCleanup(
      {
        emails: ["approved@example.com"],
        execute: true,
        backupPath: "C:\\secure\\auth-backup.dump",
        confirmProduction: false,
      },
      missingConfirmation.deps
    );
  } catch (error) {
    confirmationRequired = error instanceof Error && error.message.includes(authCleanupConfirmation(1));
  }
  assert(
    confirmationRequired &&
      missingConfirmation.calls.includes("verify-backup") &&
      !missingConfirmation.calls.includes("delete-auth"),
    "cleanup verifies backup and requires the exact account-count confirmation before deletion"
  );

  const failedBackup = makeCleanupDependencies({
    verifyBackup: async () => { throw new Error("invalid backup"); },
  });
  let rejectedBackup = false;
  try {
    await runAuthCleanup(
      {
        emails: ["approved@example.com"],
        execute: true,
        backupPath: "C:\\secure\\auth-backup.dump",
        confirmation: authCleanupConfirmation(1),
        confirmProduction: false,
      },
      failedBackup.deps
    );
  } catch {
    rejectedBackup = true;
  }
  assert(rejectedBackup && !failedBackup.calls.includes("delete-auth"), "cleanup stops if backup verification fails");

  const unavailableDatabase = makeCleanupDependencies({
    verifyConnection: async () => {
      unavailableDatabase.calls.push("connection");
      throw new Error("database unavailable");
    },
  });
  let connectionRefused = false;
  try {
    await runAuthCleanup(
      {
        emails: ["approved@example.com"],
        execute: true,
        backupPath: "C:\\secure\\auth-backup.dump",
        confirmation: authCleanupConfirmation(1),
        confirmProduction: false,
      },
      unavailableDatabase.deps
    );
  } catch {
    connectionRefused = true;
  }
  assert(
    connectionRefused &&
      unavailableDatabase.calls.join(",") === "connection" &&
      !unavailableDatabase.calls.includes("delete-auth"),
    "cleanup verifies database connectivity before backup or deletion"
  );

  const production = makeCleanupDependencies({ isProduction: true });
  let productionRefused = false;
  try {
    await runAuthCleanup(
      {
        emails: ["approved@example.com"],
        execute: true,
        backupPath: "C:\\secure\\auth-backup.dump",
        confirmation: authCleanupConfirmation(1),
        confirmProduction: false,
      },
      production.deps
    );
  } catch {
    productionRefused = true;
  }
  assert(productionRefused && production.calls.length === 0, "production cleanup requires its explicit confirmation flag");
}

async function testAuthOnlyDeletion(): Promise<void> {
  const operations: string[] = [];
  const transaction: AuthRecordDeletionTransaction = {
    detachNotificationUsers: async () => { operations.push("detach-notifications"); },
    deletePasswordResetTokens: async () => { operations.push("reset-tokens"); },
    deleteSessions: async () => { operations.push("sessions"); },
    deleteMemberships: async () => { operations.push("memberships"); },
    deleteSentInvitations: async () => { operations.push("sent-invitations"); },
    deleteUsers: async () => {
      operations.push("users");
      return 1;
    },
  };
  const count = await deleteAuthRecordsOnly(transaction, ["approved-user"]);
  assert(count === 1, "cleanup returns the deleted authentication account count");
  assert(
    operations.join(",") === "detach-notifications,reset-tokens,sessions,memberships,sent-invitations,users",
    "cleanup touches only auth records and detaches notifications to preserve them"
  );
}

async function testResetTokenCleanup(): Promise<void> {
  const now = new Date("2026-11-01T12:00:00.000Z");
  let where: Parameters<StaleResetTokenStore["deleteMany"]>[0]["where"] | undefined;
  let legacyWhere: Parameters<StaleResetTokenStore["clearExpiredLegacyTokens"]>[0] | undefined;
  const store: StaleResetTokenStore = {
    deleteMany: async (criteria) => {
      where = criteria.where;
      return { count: 3 };
    },
    clearExpiredLegacyTokens: async (criteria) => {
      legacyWhere = criteria;
      return { count: 2 };
    },
  };
  const deletedCount = await deleteExpiredOrUsedResetTokens(store, now);
  assert(
    deletedCount === 5 &&
      where?.OR[0].usedAt.not === null &&
      where.OR[1].expiresAt.lte === now &&
      legacyWhere?.where.resetTokenExpires.lte === now &&
      legacyWhere.data.resetToken === null,
    "stale-token cleanup removes used/expired ledger tokens and clears expired legacy tokens"
  );

  const calls: string[] = [];
  const result = await runStaleResetTokenCleanup(
    {
      emails: [],
      execute: true,
      backupPath: "C:\\secure\\auth-backup.dump",
      confirmation: resetTokenCleanupConfirmation(2),
      confirmProduction: false,
    },
    now,
    {
      isProduction: false,
      verifyConnection: async () => { calls.push("connection"); },
      createBackup: async () => { calls.push("backup"); },
      verifyBackup: async () => { calls.push("verify-backup"); },
      countStaleTokens: async () => { calls.push("count"); return 2; },
      deleteStaleTokens: async () => { calls.push("delete"); return 2; },
    }
  );
  assert(result.deletedCount === 2 && calls.includes("delete"), "stale-token cleanup requires verified backup and count confirmation");
}

async function main(): Promise<void> {
  await testBootstrap();
  testRailwayEnvironmentClassification();
  await testCleanupGates();
  await testAuthOnlyDeletion();
  await testResetTokenCleanup();
  console.log(`Auth admin-operation tests: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(() => {
  console.error("Auth admin-operation tests failed.");
  process.exit(1);
});
