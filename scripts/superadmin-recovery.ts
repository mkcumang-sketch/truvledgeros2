import readline from "readline";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { detectEnvironment } from "./setup-admin";

const SALT_ROUNDS = 12;

const EmailSchema = z.string().trim().toLowerCase().max(254).email("Invalid email format");
const PasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters for administrator accounts")
  .max(128, "Password must not exceed 128 characters");

function askHidden(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(promptText);
    let value = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    const onData = (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(value.trim());
      } else if (char === "\u0003") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        rl.close();
        process.exit(1);
      } else if (char === "\u0008" || char === "\x7f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        value += char;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

async function main() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Super Admin One-Time Password Recovery CLI");
  console.log("==================================================================");

  const env = detectEnvironment();
  console.log(`Database Target: [${env.target}] - ${env.description}`);

  if (env.target === "UNVERIFIED" || !env.isVerified) {
    console.error("❌ Recovery blocked: unverified database target.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const isConfirmedProd =
    args.includes("--confirm-production") || process.env.CONFIRM_PRODUCTION === "CONFIRM_PRODUCTION";

  if (env.target === "PRODUCTION" && isExecute && !isConfirmedProd) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("Type 'CONFIRM_PRODUCTION' to proceed with production password reset: ", (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
    if (answer !== "CONFIRM_PRODUCTION") {
      console.error("❌ Production recovery aborted by operator.");
      process.exit(1);
    }
  }

  const email = (
    process.env.ADMIN_EMAIL ||
    args.find((a) => a.startsWith("--email="))?.split("=")[1] ||
    "us7081569@gmail.com"
  ).trim().toLowerCase();

  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    console.error(`❌ Invalid email: ${parsedEmail.error.errors[0].message}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: parsedEmail.data },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!user) {
      console.error(`❌ Blocker: Account '${parsedEmail.data}' does not exist in the database.`);
      process.exit(1);
    }

    if (!user.isSuperAdmin) {
      console.error(`❌ Blocker: Account '${parsedEmail.data}' is not a verified Super Admin.`);
      process.exit(1);
    }

    console.log(`\nVerified Target Account:`);
    console.log(`  - User ID: ${user.id}`);
    console.log(`  - Name: ${user.name}`);
    console.log(`  - Platform Super Admin: ${user.isSuperAdmin}`);
    console.log(`  - Account Active: ${user.active}`);
    console.log(`  - Tenant Memberships: ${user.memberships.length}`);

    let newPassword = process.env.NEW_PASSWORD || process.env.ADMIN_PASSWORD;
    if (!newPassword) {
      newPassword = await askHidden("Enter New Administrator Password (min 12 chars): ");
    }

    const parsedPassword = PasswordSchema.safeParse(newPassword);
    if (!parsedPassword.success) {
      console.error(`❌ Password Strength Error: ${parsedPassword.error.errors[0].message}`);
      process.exit(1);
    }

    if (!isExecute) {
      console.log("\n🔒 DRY RUN COMPLETE. No database writes were performed.");
      console.log("To execute the password reset, rerun with the `--execute` flag:");
      console.log("  $env:CONFIRM_PRODUCTION='CONFIRM_PRODUCTION'; npx tsx scripts/superadmin-recovery.ts --execute");
      return;
    }

    console.log("\nHashing password securely with bcrypt (12 rounds)...");
    const passwordHash = await bcrypt.hash(parsedPassword.data, SALT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      // 1. Update password and activate user
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          active: true,
          resetToken: null,
          resetTokenExpires: null,
        },
      });

      // 2. Invalidate all active sessions across devices
      const delSessions = await tx.session.deleteMany({
        where: { userId: user.id },
      });

      // 3. Invalidate all outstanding reset tokens
      const delTokens = await tx.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      // 4. Record audit event
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "SUPERADMIN_PASSWORD_RECOVERED",
          entityType: "USER",
          entityId: user.id,
        },
      });

      console.log(`Invalidated ${delSessions.count} active session(s).`);
      console.log(`Invalidated ${delTokens.count} outstanding reset token(s).`);
    });

    console.log(`\n✅ SUCCESS: Password securely updated for Super Admin '${user.email}'.`);
    console.log("Audit log 'SUPERADMIN_PASSWORD_RECOVERED' recorded successfully.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Super Admin recovery failed:", err);
  process.exit(1);
});
