import readline from "readline";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

const EmailSchema = z.string().trim().toLowerCase().max(254).email("Invalid email format");
const PasswordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

interface SetupConfig {
  email: string;
  password?: string;
  name?: string;
  role: Role;
  isSuperAdmin: boolean;
  tenantSlug?: string;
  resetExisting: boolean;
  execute: boolean;
}

function detectEnvironment(): { target: "PRODUCTION" | "STAGING" | "LOCAL"; description: string } {
  const dbUrl = process.env.DATABASE_URL || "";
  try {
    const url = new URL(dbUrl);
    const host = url.hostname.toLowerCase();
    if (host.includes("localhost") || host === "127.0.0.1") {
      return { target: "LOCAL", description: "Local PostgreSQL instance (localhost)" };
    }
    if (host.includes("neon.tech")) {
      return { target: "PRODUCTION", description: "Remote Neon PostgreSQL (Cloud Managed)" };
    }
    return { target: "STAGING", description: `Remote PostgreSQL (${host})` };
  } catch {
    return { target: "LOCAL", description: "Unknown database target (format unparseable)" };
  }
}

function askQuestion(query: string, hideInput = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hideInput && process.stdin.isTTY) {
      // Password masking
      process.stdout.write(query);
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
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function main() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Secure Admin Account Setup & Recovery CLI");
  console.log("==================================================================");

  const env = detectEnvironment();
  console.log(`Target Database Environment: [${env.target}] - ${env.description}`);

  // CLI Arguments
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute") || args.includes("--confirm");
  const isReset = args.includes("--reset") || process.env.RESET_EXISTING === "true";
  const isSuperAdminFlag = args.includes("--superadmin");
  const tenantSlugArg = args.find((a) => a.startsWith("--tenant="))?.split("=")[1] || process.env.TENANT_SLUG;
  const roleArg = (args.find((a) => a.startsWith("--role="))?.split("=")[1]?.toUpperCase() as Role) || Role.FIRM_ADMIN;

  let email = (process.env.ADMIN_EMAIL || args.find((a) => a.startsWith("--email="))?.split("=")[1] || "").trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let name = process.env.ADMIN_NAME || "System Administrator";

  if (!email) {
    email = (await askQuestion("Enter Administrator Email: ")).toLowerCase();
  }

  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    console.error(`❌ Validation Error: ${parsedEmail.error.errors[0].message}`);
    process.exit(1);
  }

  // Check if account already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: { tenant: true },
      },
    },
  });

  if (existingUser) {
    console.log(`\nℹ️ Account found in database:`);
    console.log(`  - User ID: ${existingUser.id}`);
    console.log(`  - Name: ${existingUser.name}`);
    console.log(`  - Active: ${existingUser.active}`);
    console.log(`  - Platform Superadmin: ${existingUser.isSuperAdmin}`);
    console.log(`  - Password Set: ${Boolean(existingUser.passwordHash)}`);
    console.log(`  - Practice Memberships: ${existingUser.memberships.length}`);

    for (const m of existingUser.memberships) {
      console.log(`    • Tenant: "${m.tenant.name}" (${m.tenant.slug}) | Role: ${m.role} | Status: ${m.status}`);
    }

    if (!isReset) {
      console.log("\n⚠️ Existing user account will NOT be overwritten without explicit authorization.");
      console.log("If you wish to update this administrator's password, run this command with `--reset`:");
      console.log(`  npx ts-node -r tsconfig-paths/register scripts/setup-admin.ts --email=${email} --reset --execute`);
      process.exit(0);
    }

    console.log("\n⚠️ PASSWORD RESET REQUESTED for existing account.");
  } else {
    console.log(`\n✨ Account does not exist. New administrator creation will be prepared.`);
  }

  // Obtain password securely
  if (!password) {
    password = await askQuestion("Enter New Password (min 8 chars): ", true);
  }

  const parsedPassword = PasswordSchema.safeParse(password);
  if (!parsedPassword.success) {
    console.error(`❌ Validation Error: ${parsedPassword.error.errors[0].message}`);
    process.exit(1);
  }

  // Pre-calculate bcrypt hash
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Tenant resolution for new users
  let tenantIdToLink: string | null = null;
  let selectedTenantName = "";

  if (!existingUser) {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, active: true },
    });

    if (tenants.length === 0 && !isSuperAdminFlag) {
      console.error("❌ No tenants exist in database. Must flag as --superadmin or create tenant first.");
      process.exit(1);
    }

    if (tenantSlugArg) {
      const match = tenants.find((t) => t.slug === tenantSlugArg);
      if (!match) {
        console.error(`❌ Tenant with slug "${tenantSlugArg}" not found.`);
        process.exit(1);
      }
      tenantIdToLink = match.id;
      selectedTenantName = match.name;
    } else if (tenants.length > 0) {
      // Default to first active tenant
      const activeTenant = tenants.find((t) => t.active) || tenants[0];
      tenantIdToLink = activeTenant.id;
      selectedTenantName = activeTenant.name;
    }
  }

  console.log("\n------------------------------------------------------------------");
  console.log("PROPOSED DATABASE OPERATIONS:");
  console.log(`Target: [${env.target}] Database`);
  if (existingUser) {
    console.log(`Action: PASSWORD_UPDATE & SESSION_REVOCATION`);
    console.log(`User Email: ${email}`);
    console.log(`Bcrypt Salt Rounds: ${SALT_ROUNDS}`);
    console.log(`Active Sessions to Invalidate: (all current sessions for this user)`);
  } else {
    console.log(`Action: USER_CREATION & TENANT_MEMBERSHIP_LINK`);
    console.log(`User Email: ${email}`);
    console.log(`Display Name: ${name}`);
    console.log(`Superadmin: ${isSuperAdminFlag}`);
    if (tenantIdToLink) {
      console.log(`Tenant Membership: "${selectedTenantName}" (${tenantSlugArg || "default"})`);
      console.log(`Role: ${roleArg}`);
    }
  }
  console.log("------------------------------------------------------------------");

  if (!isExecute) {
    console.log("\n🔒 DRY RUN COMPLETE. No database writes were performed.");
    console.log("To execute this change, rerun with the `--execute` flag:");
    console.log(`  npx ts-node -r tsconfig-paths/register scripts/setup-admin.ts --email=${email} ${isReset ? "--reset " : ""}--execute\n`);
    process.exit(0);
  }

  console.log("\nExecuting database operations...");

  if (existingUser) {
    await prisma.$transaction(async (tx) => {
      // 1. Update password hash
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          active: true,
        },
      });

      // 2. Invalidate active sessions
      await tx.session.deleteMany({
        where: { userId: existingUser.id },
      });

      // 3. Log audit event
      await tx.auditLog.create({
        data: {
          userId: existingUser.id,
          action: "ADMIN_PASSWORD_RESET_CLI",
          entityType: "USER",
          entityId: existingUser.id,
        },
      }).catch(() => null);
    });

    console.log(`\n✅ SUCCESS: Password updated securely for ${email}.`);
    console.log(`Existing sessions have been revoked.`);
  } else {
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          isSuperAdmin: isSuperAdminFlag,
          active: true,
        },
      });

      if (tenantIdToLink) {
        await tx.membership.create({
          data: {
            tenantId: tenantIdToLink,
            userId: newUser.id,
            role: roleArg,
            status: "ACTIVE",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          tenantId: tenantIdToLink ?? undefined,
          action: "ADMIN_CREATED_CLI",
          entityType: "USER",
          entityId: newUser.id,
        },
      }).catch(() => null);
    });

    console.log(`\n✅ SUCCESS: Created new administrator ${email}.`);
    if (tenantIdToLink) {
      console.log(`Linked to tenant "${selectedTenantName}" with role ${roleArg}.`);
    }
  }

  console.log("\n==================================================================");
  console.log("LOGIN VERIFICATION PROCEDURE:");
  console.log("1. Open the application login page: /login");
  console.log(`2. Enter Email: ${email}`);
  console.log("3. Enter your configured password.");
  console.log("4. Expected Redirect:");
  if (isSuperAdminFlag && !tenantIdToLink && (!existingUser || existingUser.memberships.length === 0)) {
    console.log("   -> /godmode (Platform Administrator Console)");
  } else {
    console.log("   -> /dashboard (Practice CRM Dashboard)");
  }
  console.log("==================================================================\n");
}

main()
  .catch((err) => {
    console.error("❌ Fatal Error:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
