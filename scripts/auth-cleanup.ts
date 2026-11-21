import { spawn } from "child_process";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { detectEnvironment } from "./setup-admin";

export interface AuthCleanupUser {
  id: string;
  email: string;
}

export interface AuthCleanupOptions {
  emails: string[];
  execute: boolean;
  backupPath?: string;
  confirmation?: string;
  confirmProduction: boolean;
}

export interface AuthCleanupDependencies {
  isProduction: boolean;
  verifyConnection(): Promise<void>;
  createBackup(backupPath: string): Promise<void>;
  verifyBackup(backupPath: string): Promise<void>;
  findTargets(emails: string[]): Promise<AuthCleanupUser[]>;
  deleteAuthRecords(userIds: string[]): Promise<number>;
  reportTargetCount?(count: number): void;
}

export const authCleanupConfirmation = (count: number) => `DELETE AUTH DATA FOR ${count} USERS`;
export const resetTokenCleanupConfirmation = (count: number) =>
  `DELETE ${count} STALE PASSWORD RESET TOKENS`;

export interface StaleResetTokenStore {
  deleteMany(args: {
    where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lte: Date } }] };
  }): Promise<{ count: number }>;
  clearExpiredLegacyTokens(args: {
    where: { resetToken: { not: null }; resetTokenExpires: { lte: Date } };
    data: { resetToken: null; resetTokenExpires: null };
  }): Promise<{ count: number }>;
}

export async function deleteExpiredOrUsedResetTokens(
  store: StaleResetTokenStore,
  now: Date
): Promise<number> {
  const result = await store.deleteMany({
    where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }] },
  });
  const legacyResult = await store.clearExpiredLegacyTokens({
    where: { resetToken: { not: null }, resetTokenExpires: { lte: now } },
    data: { resetToken: null, resetTokenExpires: null },
  });
  return result.count + legacyResult.count;
}

export interface StaleResetTokenCleanupDependencies {
  isProduction: boolean;
  verifyConnection(): Promise<void>;
  createBackup(backupPath: string): Promise<void>;
  verifyBackup(backupPath: string): Promise<void>;
  countStaleTokens(cutoff: Date): Promise<number>;
  deleteStaleTokens(cutoff: Date): Promise<number>;
  reportTargetCount?(count: number): void;
}

export async function runStaleResetTokenCleanup(options: AuthCleanupOptions, now: Date,
  dependencies: StaleResetTokenCleanupDependencies
): Promise<{ targetCount: number; deletedCount: number }> {
  if (options.execute && dependencies.isProduction && !options.confirmProduction) {
    throw new Error("Production token cleanup requires the --confirm-production flag.");
  }
  if (options.execute && !options.backupPath) {
    throw new Error("Execution requires a new backup path supplied with --backup.");
  }
  await dependencies.verifyConnection();
  if (options.execute) {
    const backupPath = path.resolve(options.backupPath!);
    await dependencies.createBackup(backupPath);
    await dependencies.verifyBackup(backupPath);
  }

  const targetCount = await dependencies.countStaleTokens(now);
  dependencies.reportTargetCount?.(targetCount);
  if (!options.execute || targetCount === 0) {
    return { targetCount, deletedCount: 0 };
  }
  if (options.confirmation !== resetTokenCleanupConfirmation(targetCount)) {
    throw new Error(`Confirmation did not match. Required phrase: ${resetTokenCleanupConfirmation(targetCount)}`);
  }
  const deletedCount = await dependencies.deleteStaleTokens(now);
  return { targetCount, deletedCount };
}

export async function runAuthCleanup(
  options: AuthCleanupOptions,
  dependencies: AuthCleanupDependencies
): Promise<{ targetCount: number; deletedCount: number }> {
  const emails = [...new Set(options.emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (emails.length === 0) {
    throw new Error("Specify at least one approved account email with --email.");
  }
  if (options.execute && dependencies.isProduction && !options.confirmProduction) {
    throw new Error("Production cleanup requires the --confirm-production flag.");
  }
  if (options.execute && !options.backupPath) {
    throw new Error("Execution requires a new backup path supplied with --backup.");
  }

  await dependencies.verifyConnection();

  if (!options.execute) {
    const targets = await dependencies.findTargets(emails);
    dependencies.reportTargetCount?.(targets.length);
    return { targetCount: targets.length, deletedCount: 0 };
  }

  const backupPath = path.resolve(options.backupPath!);
  await dependencies.createBackup(backupPath);
  await dependencies.verifyBackup(backupPath);

  const targets = await dependencies.findTargets(emails);
  dependencies.reportTargetCount?.(targets.length);
  if (targets.length === 0) {
    return { targetCount: 0, deletedCount: 0 };
  }

  if (options.confirmation !== authCleanupConfirmation(targets.length)) {
    throw new Error(`Confirmation did not match. Required phrase: ${authCleanupConfirmation(targets.length)}`);
  }

  const deletedCount = await dependencies.deleteAuthRecords(targets.map((target) => target.id));
  return { targetCount: targets.length, deletedCount };
}

export interface AuthRecordDeletionTransaction {
  detachNotificationUsers(userIds: string[]): Promise<void>;
  deletePasswordResetTokens(userIds: string[]): Promise<void>;
  deleteSessions(userIds: string[]): Promise<void>;
  deleteMemberships(userIds: string[]): Promise<void>;
  deleteSentInvitations(userIds: string[]): Promise<void>;
  deleteUsers(userIds: string[]): Promise<number>;
}

export async function deleteAuthRecordsOnly(
  transaction: AuthRecordDeletionTransaction,
  userIds: string[]
): Promise<number> {
  if (userIds.length === 0) return 0;
  await transaction.detachNotificationUsers(userIds);
  await transaction.deletePasswordResetTokens(userIds);
  await transaction.deleteSessions(userIds);
  await transaction.deleteMemberships(userIds);
  await transaction.deleteSentInvitations(userIds);
  return transaction.deleteUsers(userIds);
}

function runCommand(executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: "ignore" });
    child.once("error", () => reject(new Error(`${path.basename(executable)} could not be started.`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

function getPostgresConnectionOptions(): { args: string[]; env: NodeJS.ProcessEnv } {
  const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL must be configured.");

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("The configured PostgreSQL connection URL is invalid.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname || !database || !url.username) {
    throw new Error("The configured PostgreSQL connection URL is incomplete.");
  }

  const args = [
    "--host", url.hostname,
    "--port", url.port || "5432",
    "--username", decodeURIComponent(url.username),
    "--dbname", database,
  ];
  const env = { ...process.env };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  env.PGCONNECT_TIMEOUT = "10";
  return { args, env };
}

async function createDatabaseBackup(backupPath: string): Promise<void> {
  const directory = path.dirname(backupPath);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error("The backup directory must already exist.");
  }
  try {
    const descriptor = fs.openSync(backupPath, "wx", 0o600);
    fs.closeSync(descriptor);
  } catch {
    throw new Error("The backup path already exists or cannot be created; choose a new path.");
  }

  const connection = getPostgresConnectionOptions();
  await runCommand(
    "pg_dump",
    [...connection.args, "--format=custom", "--no-owner", "--no-acl", "--file", backupPath],
    connection.env
  );
}

async function verifyDatabaseBackup(backupPath: string): Promise<void> {
  const backup = fs.statSync(backupPath);
  if (!backup.isFile() || backup.size === 0) {
    throw new Error("The database backup is empty or invalid.");
  }
  await runCommand("pg_restore", ["--list", backupPath], process.env);
}

function createPrismaDependencies(prisma: PrismaClient, isProduction: boolean): AuthCleanupDependencies {
  return {
    isProduction,
    verifyConnection: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    createBackup: createDatabaseBackup,
    verifyBackup: verifyDatabaseBackup,
    findTargets: (emails) =>
      prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      }),
    deleteAuthRecords: (userIds) =>
      prisma.$transaction(async (tx) =>
        deleteAuthRecordsOnly(
          {
            detachNotificationUsers: async (ids) => {
              await tx.notification.updateMany({
                where: { userId: { in: ids } },
                data: { userId: null },
              });
            },
            deletePasswordResetTokens: async (ids) => {
              await tx.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
            },
            deleteSessions: async (ids) => {
              await tx.session.deleteMany({ where: { userId: { in: ids } } });
            },
            deleteMemberships: async (ids) => {
              await tx.membership.deleteMany({ where: { userId: { in: ids } } });
            },
            deleteSentInvitations: async (ids) => {
              await tx.invitation.deleteMany({ where: { invitedById: { in: ids } } });
            },
            deleteUsers: async (ids) => {
              const result = await tx.user.deleteMany({ where: { id: { in: ids } } });
              return result.count;
            },
          },
          userIds
        )
      ),
  };
}

function createStaleResetTokenDependencies(
  prisma: PrismaClient,
  isProduction: boolean
): StaleResetTokenCleanupDependencies {
  const staleWhere = (cutoff: Date) => ({
    OR: [{ usedAt: { not: null } }, { expiresAt: { lte: cutoff } }],
  });
  return {
    isProduction,
    verifyConnection: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    createBackup: createDatabaseBackup,
    verifyBackup: verifyDatabaseBackup,
    countStaleTokens: async (cutoff) => {
      const [ledgerCount, legacyCount] = await Promise.all([
        prisma.passwordResetToken.count({ where: staleWhere(cutoff) }),
        prisma.user.count({
          where: {
            resetToken: { not: null },
            resetTokenExpires: { lte: cutoff },
          },
        }),
      ]);
      return ledgerCount + legacyCount;
    },
    deleteStaleTokens: (cutoff) =>
      prisma.$transaction((tx) =>
        deleteExpiredOrUsedResetTokens(
          {
            deleteMany: (args) => tx.passwordResetToken.deleteMany(args),
            clearExpiredLegacyTokens: (args) => tx.user.updateMany(args),
          },
          cutoff
        )
      ),
    reportTargetCount: (count) => console.log(`Stale token count: ${count}`),
  };
}

function readOption(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const safety = detectEnvironment();
  if (safety.target === "UNVERIFIED" || !safety.isVerified) {
    throw new Error(`Cleanup blocked because the database target is unverified: ${safety.description}`);
  }

  const requestedEmails = process.argv
    .filter((argument) => argument.startsWith("--email="))
    .map((argument) => argument.slice("--email=".length));
  const configuredEmails = process.env.TRUV_AUTH_CLEANUP_EMAILS
    ?.split(",")
    .map((email) => email.trim())
    .filter(Boolean) || [];
  const execute = process.argv.includes("--execute");
  const backupPath = readOption("--backup");
  const confirmation = readOption("--confirmation");
  const pruneStaleResetTokens = process.argv.includes("--prune-stale-reset-tokens");

  const prisma = new PrismaClient();
  try {
    console.log(`Database target: ${safety.description}`);
    if (pruneStaleResetTokens) {
      const result = await runStaleResetTokenCleanup(
        {
          emails: [],
          execute,
          backupPath,
          confirmation,
          confirmProduction: process.argv.includes("--confirm-production"),
        },
        new Date(),
        createStaleResetTokenDependencies(prisma, safety.target === "PRODUCTION")
      );
      if (!execute) {
        console.log("Dry run only. No reset tokens were deleted.");
        console.log(`For execution, use --confirmation="${resetTokenCleanupConfirmation(result.targetCount)}".`);
        return;
      }
      console.log(`Expired/used password reset tokens removed: ${result.deletedCount}.`);
      return;
    }

    const result = await runAuthCleanup(
      {
        emails: [...requestedEmails, ...configuredEmails],
        execute,
        backupPath,
        confirmation,
        confirmProduction: process.argv.includes("--confirm-production"),
      },
      {
        ...createPrismaDependencies(prisma, safety.target === "PRODUCTION"),
        reportTargetCount: (count) => console.log(`Approved account count: ${count}`),
      }
    );
    if (!execute) {
      console.log("Dry run only. No records were deleted.");
      console.log("For execution, first create a backup destination, then supply --execute, --backup, and:");
      console.log(`--confirmation="${authCleanupConfirmation(result.targetCount)}"`);
      if (safety.target === "PRODUCTION") console.log("Production execution also requires --confirm-production.");
      return;
    }
    console.log(`Authentication accounts removed: ${result.deletedCount}. Business records were not targeted.`);
    console.log("Next, manually run `npm run auth:bootstrap -- --execute` to create the new superadmin.");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Cleanup blocked because",
      "Specify at least one approved account email",
      "Production cleanup requires",
      "Production token cleanup requires",
      "Execution requires a new backup path",
      "Confirmation did not match.",
      "The backup directory must already exist.",
      "The backup path already exists",
      "DIRECT_URL or DATABASE_URL must be configured.",
      "The configured PostgreSQL connection URL",
      "pg_dump could not be started.",
      "pg_dump failed with exit code",
      "pg_restore could not be started.",
      "pg_restore failed with exit code",
      "The database backup is empty or invalid.",
    ];
    const message = safeMessages.some((prefix) => rawMessage.startsWith(prefix))
      ? rawMessage
      : "Unexpected failure. Database and account details were omitted.";
    console.error(`Auth cleanup failed: ${message}`);
    process.exitCode = 1;
  });
}
