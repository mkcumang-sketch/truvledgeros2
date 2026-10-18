import readline from "readline";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient, Role } from "@prisma/client";
import { parseDbCoordinates, PROTECTED_BUSINESS_HOSTS } from "./db-readiness";

let prisma: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

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

export type AdminSetupEnvironmentTarget = "PRODUCTION" | "STAGING" | "LOCAL" | "UNVERIFIED";

export interface AdminSetupEnvironment {
  target: AdminSetupEnvironmentTarget;
  description: string;
  isVerified: boolean;
}

export interface AdminSetupSafetyResult {
  allowed: boolean;
  env: AdminSetupEnvironment;
  blockReason?: string;
}

/**
 * Detects the database environment and verifies URL parity.
 * If DIRECT_URL is present, it validates provider, project identity, and DB name parity.
 * If DIRECT_URL is absent (optional for standard app operation), verification proceeds using DATABASE_URL alone.
 */
export function detectEnvironment(customDbUrl?: string, customDirectUrl?: string): AdminSetupEnvironment {
  const isCustomCall = customDbUrl !== undefined;
  const dbUrl = isCustomCall ? customDbUrl : (process.env.DATABASE_URL || "");
  const directUrl = customDirectUrl !== undefined ? customDirectUrl : (isCustomCall ? "" : (process.env.DIRECT_URL || ""));

  try {
    const coords = parseDbCoordinates(dbUrl);
    const host = coords.host.toLowerCase();

    if (coords.host === "UNSET" || coords.host === "MALFORMED" || !coords.host) {
      return {
        target: "UNVERIFIED",
        description: `Unparseable or missing database URL (${coords.sanitized})`,
        isVerified: false,
      };
    }

    // 0. Parse DIRECT_URL (when present)
    // DIRECT_URL is optional; when legitimately absent from the environment, parity check is skipped.
    const directCoords = directUrl && directUrl.trim() !== "" ? parseDbCoordinates(directUrl) : undefined;
    if (directCoords) {
      if (directCoords.host === "UNSET" || directCoords.host === "MALFORMED" || !directCoords.host) {
        return {
          target: "UNVERIFIED",
          description: `DIRECT_URL is malformed or invalid (${directCoords.sanitized}). Admin operations blocked.`,
          isVerified: false,
        };
      }
    }

    // 1. Blacklisted Protected Business Database (DATABASE_URL or DIRECT_URL)
    // Blacklist check takes absolute priority over staging classification and parity
    const isProtectedDb = PROTECTED_BUSINESS_HOSTS.some(
      (h) => host.includes(h) || coords.baseEndpoint.includes(h) || (coords.projectRef && coords.projectRef.includes(h))
    );
    const isProtectedDirect = directCoords && PROTECTED_BUSINESS_HOSTS.some(
      (h) => directCoords.host.includes(h) || directCoords.baseEndpoint.includes(h) || (directCoords.projectRef && directCoords.projectRef.includes(h))
    );

    if (isProtectedDb || isProtectedDirect) {
      return {
        target: "PRODUCTION",
        description: `Protected Production Database (${coords.provider})`,
        isVerified: true,
      };
    }

    // 2. DIRECT_URL Parity Check (when present)
    if (directCoords) {
      // Provider parity
      if (coords.provider !== directCoords.provider) {
        return {
          target: "UNVERIFIED",
          description: `PROVIDER MISMATCH: DATABASE_URL ('${coords.provider}') and DIRECT_URL ('${directCoords.provider}') target different providers. Admin operations blocked.`,
          isVerified: false,
        };
      }

      // Project/endpoint identity parity
      const dbProject = (coords.projectRef || coords.baseEndpoint || "").toLowerCase();
      const directProject = (directCoords.projectRef || directCoords.baseEndpoint || "").toLowerCase();
      if (!dbProject || dbProject === "unknown" || !directProject || directProject === "unknown" || dbProject !== directProject) {
        return {
          target: "UNVERIFIED",
          description: `ENDPOINT/PROJECT MISMATCH: DATABASE_URL ('${coords.baseEndpoint}') and DIRECT_URL ('${directCoords.baseEndpoint}') resolve to different identities. Admin operations blocked.`,
          isVerified: false,
        };
      }

      // Database name parity
      if (coords.dbName.toLowerCase() !== directCoords.dbName.toLowerCase()) {
        return {
          target: "UNVERIFIED",
          description: `DATABASE NAME MISMATCH: DATABASE_URL database ('${coords.dbName}') does not match DIRECT_URL database ('${directCoords.dbName}'). Admin operations blocked.`,
          isVerified: false,
        };
      }
    }

    // 2. Localhost / Local Dev
    if (coords.provider === "local" || host === "localhost" || host === "127.0.0.1") {
      return {
        target: "LOCAL",
        description: "Local PostgreSQL instance (localhost)",
        isVerified: true,
      };
    }

    // 3. Supabase Provider (Strict Staging Identity)
    // A Supabase target is classified as STAGING only when its project reference matches SUPABASE_STAGING_PROJECT_REF.
    // Staging database name alone or STAGING_PROJECT_NAME is NOT a substitute.
    if (coords.provider === "supabase") {
      const expectedProjectRef = (process.env.SUPABASE_STAGING_PROJECT_REF || "").trim().toLowerCase();

      if (!coords.projectRef || coords.projectRef === "UNKNOWN" || coords.projectRef === "") {
        return {
          target: "UNVERIFIED",
          description: `Supabase project reference could not be parsed from '${coords.sanitized}'. Admin operations blocked.`,
          isVerified: false,
        };
      }

      const currentProjectRef = coords.projectRef.toLowerCase();

      if (expectedProjectRef !== "") {
        if (currentProjectRef === expectedProjectRef) {
          return {
            target: "STAGING",
            description: `Supabase Staging Database (${coords.isPooler ? "Pooled" : "Direct"} - Project: ${coords.projectRef})`,
            isVerified: true,
          };
        } else {
          // Explicit project reference mismatch fails closed
          return {
            target: "UNVERIFIED",
            description: `Supabase project reference mismatch: target is '${coords.projectRef}', expected staging is '${expectedProjectRef}'. Admin operations blocked.`,
            isVerified: false,
          };
        }
      }

      // If SUPABASE_STAGING_PROJECT_REF is NOT configured:
      // Any staging naming claim (db name "staging", host "staging", etc.) fails closed as UNVERIFIED.
      const hasStagingNaming =
        host.includes("-staging") ||
        host.includes("staging-") ||
        host.includes(".staging.") ||
        coords.dbName.toLowerCase() === "staging" ||
        coords.dbName.toLowerCase() === "truv_staging" ||
        coords.dbName.toLowerCase().endsWith("_staging") ||
        coords.dbName.toLowerCase().endsWith("_test");

      if (hasStagingNaming) {
        return {
          target: "UNVERIFIED",
          description: `Supabase target has staging naming ('${coords.dbName}') but SUPABASE_STAGING_PROJECT_REF is not configured. Admin operations blocked.`,
          isVerified: false,
        };
      }

      // Standard remote Supabase production target (requires interactive operator confirmation)
      return {
        target: "PRODUCTION",
        description: `Supabase Cloud PostgreSQL (${coords.isPooler ? "Pooled" : "Direct"} - Project: ${coords.projectRef})`,
        isVerified: true,
      };
    }

    // 4. Neon Provider (Legacy)
    if (coords.provider === "neon") {
      const hasStagingNaming =
        host.includes("-staging") ||
        coords.dbName.toLowerCase() === "staging" ||
        coords.dbName.toLowerCase() === "truv_staging" ||
        process.env.STAGING_PROJECT_NAME === "truvca-staging";

      return {
        target: hasStagingNaming ? "STAGING" : "PRODUCTION",
        description: `Neon Cloud PostgreSQL (${coords.isPooler ? "Pooled" : "Direct"} - Endpoint: ${coords.baseEndpoint})`,
        isVerified: true,
      };
    }

    // 5. Unknown / Unverified External Host -> FAIL CLOSED!
    return {
      target: "UNVERIFIED",
      description: `Unknown or unverified external host (${coords.host}). Admin operations blocked.`,
      isVerified: false,
    };
  } catch {
    return {
      target: "UNVERIFIED",
      description: "Database URL parsing failure. Admin operations blocked.",
      isVerified: false,
    };
  }
}

/**
 * Validates whether admin setup operations are permitted to proceed.
 * Fails closed if the database target is unverified, malformed, or parity is broken.
 */
export function verifyAdminSetupSafety(
  customDbUrl?: string,
  customDirectUrl?: string
): AdminSetupSafetyResult {
  const env = detectEnvironment(customDbUrl, customDirectUrl);

  if (env.target === "UNVERIFIED" || !env.isVerified) {
    return {
      allowed: false,
      env,
      blockReason: `The configured database target is unverified: ${env.description}`,
    };
  }

  return {
    allowed: true,
    env,
  };
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

  const safety = verifyAdminSetupSafety();
  const env = safety.env;
  console.log(`Target Database Environment: [${env.target}] - ${env.description}`);

  if (!safety.allowed) {
    console.error("\n❌ ADMIN SETUP BLOCKED BY SAFETY GATE:");
    console.error(safety.blockReason);
    console.error("Admin setup cannot execute against unverified or unknown infrastructure.");
    process.exit(1);
  }

  prisma = getPrismaClient();

  // CLI Arguments
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute") || args.includes("--confirm");
  const isReset = args.includes("--reset") || process.env.RESET_EXISTING === "true";
  const isSuperAdminFlag = args.includes("--superadmin");
  const tenantSlugArg = args.find((a) => a.startsWith("--tenant="))?.split("=")[1] || process.env.TENANT_SLUG;
  const roleArg = (args.find((a) => a.startsWith("--role="))?.split("=")[1]?.toUpperCase() as Role) || Role.FIRM_ADMIN;

  if (env.target === "PRODUCTION" && isExecute) {
    console.warn("\n⚠️ CAUTION: TARGETING PRODUCTION DATABASE ENVIRONMENT.");
    const confirm = await askQuestion("Type 'CONFIRM_PRODUCTION' to proceed with production admin setup: ");
    if (confirm !== "CONFIRM_PRODUCTION") {
      console.error("❌ Production admin setup aborted by operator.");
      process.exit(1);
    }
  }

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

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("❌ Fatal Error:", err.message);
      process.exit(1);
    })
    .finally(async () => {
      if (prisma) {
        await prisma.$disconnect();
      }
    });
}
