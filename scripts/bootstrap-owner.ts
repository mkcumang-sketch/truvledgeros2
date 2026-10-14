import { PrismaClient, Role, InvitationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import readline from "readline";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export const INTENDED_OWNER_EMAIL = "us7907us@gmail.com";

function askPassword(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdout.write(promptText);
      let input = "";
      process.stdin.setRawMode?.(true);
      process.stdin.resume();

      const onData = (charBuffer: Buffer) => {
        const char = charBuffer.toString();
        if (char === "\n" || char === "\r" || char === "\u0004") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(input.trim());
        } else if (char === "\u0008" || char === "\x7f") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (char === "\u0003") {
          process.exit(1);
        } else {
          input += char;
          process.stdout.write("*");
        }
      };

      process.stdin.on("data", onData);
    } else {
      rl.question(promptText, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function main() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Intended Owner Setup & Bootstrap Utility");
  console.log("==================================================================");

  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const isGenerateInvite = args.includes("--invite");
  const tenantSlug = args.find((a) => a.startsWith("--tenant="))?.split("=")[1] || "demo-firm";

  console.log(`\nVerified Intended Owner Email: [${INTENDED_OWNER_EMAIL}]`);

  // 1. Inspect existing state for intended owner
  const existingUser = await prisma.user.findUnique({
    where: { email: INTENDED_OWNER_EMAIL },
    include: {
      memberships: {
        include: { tenant: true },
      },
    },
  });

  if (existingUser) {
    console.log("\nStatus: User account ALREADY EXISTS in database.");
    console.log(`  - User ID: ${existingUser.id}`);
    console.log(`  - Display Name: ${existingUser.name}`);
    console.log(`  - Active: ${existingUser.active}`);
    console.log(`  - Platform Superadmin: ${existingUser.isSuperAdmin}`);
    console.log(`  - Password Set: ${Boolean(existingUser.passwordHash)}`);
    console.log(`  - Practice Memberships: ${existingUser.memberships.length}`);
    for (const m of existingUser.memberships) {
      console.log(`    • Tenant: "${m.tenant.name}" (${m.tenant.slug}) | Role: ${m.role}`);
    }
  } else {
    console.log("\nStatus: User account DOES NOT EXIST in database (Fresh setup required).");
  }

  // 2. Identify target tenant
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { slug: tenantSlug },
        { active: true },
      ],
    },
  });

  if (!tenant) {
    console.error("❌ Error: No practice tenant found in database to attach the owner to.");
    process.exit(1);
  }

  console.log(`\nTarget Firm Organization: "${tenant.name}" (${tenant.slug})`);

  // 3. Mode Selection
  if (isGenerateInvite) {
    console.log("\nMode: Secure Single-Use Onboarding Invitation Link");
    console.log("------------------------------------------------------------------");
    console.log("This will generate a cryptographic 48-hour onboarding invitation link.");
    console.log("The intended owner will open the link and set their own password in their browser.");
    console.log("No password will ever be transmitted or visible to the administrator.");

    if (!isExecute) {
      console.log("\n🔒 DRY RUN COMPLETE. No database records were written.");
      console.log("To generate the live invitation, rerun with `--execute`:");
      console.log(`  npx ts-node -r tsconfig-paths/register scripts/bootstrap-owner.ts --invite --execute\n`);
      process.exit(0);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Look for an existing system inviter, or use a platform identity
    const anyOwner = await prisma.membership.findFirst({
      where: { role: Role.FIRM_OWNER },
      select: { userId: true },
    });
    const inviterId = anyOwner?.userId || (await prisma.user.findFirst({ select: { id: true } }))?.id;

    if (!inviterId) {
      console.error("❌ Error: Cannot establish an inviter record.");
      process.exit(1);
    }

    const invitation = await prisma.invitation.create({
      data: {
        tenantId: tenant.id,
        email: INTENDED_OWNER_EMAIL,
        role: Role.FIRM_OWNER,
        tokenHash,
        invitedById: inviterId,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://truvledgeros2.vercel.app";
    const setupUrl = `${appUrl}/accept-invite?token=${rawToken}`;

    console.log("\n==================================================================");
    console.log("✅ OWNER ONBOARDING INVITATION CREATED SUCCESSFULLY");
    console.log("==================================================================");
    console.log(`Invitation ID: ${invitation.id}`);
    console.log(`Target Email: ${INTENDED_OWNER_EMAIL}`);
    console.log(`Role: FIRM_OWNER`);
    console.log(`Expires: ${expiresAt.toISOString()} (48 hours)`);
    console.log("\nDeliver this private, single-use onboarding URL to the owner:");
    console.log(`🔗 Setup Link: ${setupUrl}`);
    console.log("\nThe owner will set their own independent application password upon visiting.");
    console.log("==================================================================\n");
    process.exit(0);
  }

  // CLI Direct Password Setup Mode
  console.log("\nMode: Direct Terminal Password Setup (Zero-Cloud Intermediary)");
  console.log("------------------------------------------------------------------");
  console.log("Enter an independent application password for this account.");
  console.log("NOTE: Never enter the user's Google/Gmail account password.");

  if (!isExecute) {
    console.log("\n🔒 DRY RUN: Verified prerequisites.");
    console.log("Options:");
    console.log("1. To generate a secure web onboarding link: run with `--invite --execute`");
    console.log("2. To set password directly in terminal: run with `--execute`");
    console.log(`\nCommand: npx ts-node -r tsconfig-paths/register scripts/bootstrap-owner.ts --execute\n`);
    process.exit(0);
  }

  const password = await askPassword("Enter Application Password (min 8 chars): ");
  if (password.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: INTENDED_OWNER_EMAIL } });

    if (user) {
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isSuperAdmin: true,
          active: true,
        },
      });
      // Invalidate existing sessions
      await tx.session.deleteMany({ where: { userId: user.id } });
    } else {
      user = await tx.user.create({
        data: {
          email: INTENDED_OWNER_EMAIL,
          name: "Umang Sharma (Owner)",
          passwordHash,
          isSuperAdmin: true,
          active: true,
        },
      });
    }

    // Upsert membership as FIRM_OWNER
    await tx.membership.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id,
        },
      },
      update: {
        role: Role.FIRM_OWNER,
        status: "ACTIVE",
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role: Role.FIRM_OWNER,
        status: "ACTIVE",
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        action: "OWNER_BOOTSTRAP_CLI",
        entityType: "USER",
        entityId: user.id,
      },
    }).catch(() => null);
  });

  console.log("\n==================================================================");
  console.log("✅ OWNER ACCOUNT CONFIGURED & VERIFIED SUCCESSFULLY");
  console.log("==================================================================");
  console.log(`Email: ${INTENDED_OWNER_EMAIL}`);
  console.log(`Role: FIRM_OWNER & Superadmin`);
  console.log(`Firm Organization: ${tenant.name}`);
  console.log("Sign in at: /login");
  console.log("==================================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Error during owner bootstrap:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
