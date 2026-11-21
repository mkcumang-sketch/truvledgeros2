import readline from "readline";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/lib/auth/password";
import { verifyAdminSetupSafety } from "./setup-admin";

const EmailSchema = z.string().trim().toLowerCase().max(254).email();
const PasswordSchema = z.string().min(16).max(128);

export interface BootstrapTransaction {
  findSuperAdmin(): Promise<{ id: string } | null>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUser(input: {
    email: string;
    passwordHash: string;
    active: true;
    isSuperAdmin: true;
  }): Promise<{ id: string }>;
  createAuditLog(userId: string): Promise<void>;
}

export interface BootstrapStore {
  transaction<T>(callback: (transaction: BootstrapTransaction) => Promise<T>): Promise<T>;
}

export async function createInitialSuperAdmin(
  store: BootstrapStore,
  email: string,
  password: string,
  hash: (password: string) => Promise<string> = hashPassword
): Promise<{ id: string }> {
  const parsedEmail = EmailSchema.safeParse(email);
  const parsedPassword = PasswordSchema.safeParse(password);
  if (!parsedEmail.success || !parsedPassword.success) {
    throw new Error("Bootstrap credentials do not meet the required format.");
  }

  const normalizedEmail = parsedEmail.data;
  const passwordHash = await hash(parsedPassword.data);

  return store.transaction(async (transaction) => {
    if (await transaction.findSuperAdmin()) {
      throw new Error("A superadmin already exists; bootstrap stopped without changes.");
    }
    if (await transaction.findUserByEmail(normalizedEmail)) {
      throw new Error("The requested account already exists; bootstrap stopped without changes.");
    }

    const user = await transaction.createUser({
      email: normalizedEmail,
      passwordHash,
      active: true,
      isSuperAdmin: true,
    });
    await transaction.createAuditLog(user.id);
    return user;
  });
}

function createPrismaStore(prisma: PrismaClient): BootstrapStore {
  return {
    transaction: (callback) =>
      prisma.$transaction(
        (tx) =>
          callback({
            findSuperAdmin: () =>
              tx.user.findFirst({
                where: { isSuperAdmin: true },
                select: { id: true },
              }),
            findUserByEmail: (email) =>
              tx.user.findUnique({
                where: { email },
                select: { id: true },
              }),
            createUser: ({ email, passwordHash, active, isSuperAdmin }) =>
              tx.user.create({
                data: {
                  name: "Platform Administrator",
                  email,
                  passwordHash,
                  active,
                  isSuperAdmin,
                },
                select: { id: true },
              }),
            createAuditLog: async (userId) => {
              await tx.auditLog.create({
                data: {
                  userId,
                  action: "SUPERADMIN_BOOTSTRAP",
                  entityType: "USER",
                  entityId: userId,
                },
              });
            },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      ),
  };
}

function ask(promptText: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!hidden || !process.stdin.isTTY) {
    return new Promise((resolve) => rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    }));
  }

  return new Promise((resolve) => {
    process.stdout.write(promptText);
    let value = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    const onData = (chunk: Buffer) => {
      const character = chunk.toString();
      if (character === "\n" || character === "\r" || character === "\u0004") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
      } else if (character === "\u0003") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        rl.close();
        process.exitCode = 1;
        resolve("");
      } else if (character === "\u0008" || character === "\x7f") {
        value = value.slice(0, -1);
        process.stdout.write("\b \b");
      } else {
        value += character;
        process.stdout.write("*");
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const safety = verifyAdminSetupSafety();
  if (!safety.allowed) {
    throw new Error(`Bootstrap blocked: ${safety.blockReason}`);
  }
  const execute = process.argv.includes("--execute");
  if (execute && safety.env.target === "PRODUCTION") {
    if (!process.stdin.isTTY || (await ask("Type CONFIRM_PRODUCTION_BOOTSTRAP to continue: ")) !== "CONFIRM_PRODUCTION_BOOTSTRAP") {
      throw new Error("Production bootstrap requires interactive confirmation.");
    }
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const email = process.env.TRUV_BOOTSTRAP_ADMIN_EMAIL?.trim() || (await ask("Superadmin email: "));
    const password = execute
      ? process.env.TRUV_BOOTSTRAP_ADMIN_PASSWORD || (await ask("Superadmin password (minimum 16 characters): ", true))
      : undefined;

    const parsedEmail = EmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      throw new Error("A valid bootstrap email is required.");
    }
    console.log(`Database target: ${safety.env.description}`);
    console.log("Bootstrap email validated.");
    if (!execute) {
      console.log("Dry run only. No account was created.");
      console.log("Rerun with --execute and provide the password through a hidden prompt or TRUV_BOOTSTRAP_ADMIN_PASSWORD.");
      return;
    }
    if (!password) {
      throw new Error("A password is required through a hidden prompt or TRUV_BOOTSTRAP_ADMIN_PASSWORD.");
    }

    const user = await createInitialSuperAdmin(createPrismaStore(prisma), parsedEmail.data, password);
    console.log(`Created one active superadmin account (id: ${user.id}). No tenant membership was needed.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Bootstrap blocked:",
      "A superadmin already exists;",
      "The requested account already exists;",
      "Bootstrap credentials do not meet",
      "A valid bootstrap email is required.",
      "Production bootstrap requires",
      "A password is required through",
    ];
    const message = safeMessages.some((prefix) => rawMessage.startsWith(prefix))
      ? rawMessage
      : "Unexpected failure. Database and credential details were omitted.";
    console.error(`Superadmin bootstrap failed: ${message}`);
    process.exitCode = 1;
  });
}
