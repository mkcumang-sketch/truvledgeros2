import dotenv from "dotenv";
dotenv.config();

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "admin@truvtech.com";
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_DEFAULT_PASSWORD || "Admin12345!";

/**
 * Self-healing admin seed procedure:
 * Idempotently verifies or creates the fallback admin user, ensures correct
 * permissions (isSuperAdmin: true, active: true, FIRM_OWNER role),
 * and links to the canonical practice tenant.
 */
export async function seedAdmin() {
  console.log("🌱 Executing Self-Healing Admin Seed Check...");

  // 1. Verify or create canonical practice tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: "truv-demo-ca" },
    update: { active: true },
    create: {
      name: "TRUV Demo Chartered Accountants",
      slug: "truv-demo-ca",
      gstin: "27AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      email: "practice@truvdemo.in",
      phone: "+912240001200",
      address: "Suite 401, Nariman Point Business Center",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400021",
      approvalThreshold: 50000.0,
      defaultGstRate: 18.0,
      defaultDueDays: 15,
      recoveryGentleDays: 7,
      recoveryFirmDays: 15,
      recoveryFinalDays: 30,
      docReminderLimit: 3,
      paymentLinkBase: "https://pay.truvdemo.in/pay",
      uploadLinkBase: "https://upload.truvdemo.in",
      accountingSoftware: "ZOHO_BOOKS",
      active: true,
    },
  });

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, SALT_ROUNDS);
  const shouldReset = process.argv.includes("--reset") || process.env.RESET_ADMIN === "true";

  // 2. Self-healing fallback admin account
  let admin = await prisma.user.findUnique({
    where: { email: DEFAULT_ADMIN_EMAIL },
  });

  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: process.env.ADMIN_NAME || "System Administrator",
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        isSuperAdmin: true,
        active: true,
      },
    });
    console.log(`✅ Generated new fallback admin: ${DEFAULT_ADMIN_EMAIL}`);
  } else {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        active: true,
        isSuperAdmin: true,
        ...(shouldReset || !admin.passwordHash ? { passwordHash } : {}),
      },
    });
    console.log(`✅ Self-healed existing fallback admin: ${DEFAULT_ADMIN_EMAIL} (active: true, superadmin: true)`);
  }

  // 3. Ensure practice tenant membership
  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: defaultTenant.id,
        userId: admin.id,
      },
    },
    update: {
      role: Role.FIRM_OWNER,
      status: "ACTIVE",
    },
    create: {
      tenantId: defaultTenant.id,
      userId: admin.id,
      role: Role.FIRM_OWNER,
      status: "ACTIVE",
    },
  });

  // 4. Also verify Godmode platform account
  const godmodeEmail = "godmode@truvtech.com";
  let godmode = await prisma.user.findUnique({ where: { email: godmodeEmail } });
  if (!godmode) {
    godmode = await prisma.user.create({
      data: {
        name: "TRUV Platform Administrator",
        email: godmodeEmail,
        passwordHash,
        isSuperAdmin: true,
        active: true,
      },
    });
  } else if (!godmode.active || !godmode.isSuperAdmin) {
    await prisma.user.update({
      where: { id: godmode.id },
      data: { active: true, isSuperAdmin: true },
    });
  }

  console.log("\n==================================================================");
  console.log("TRUV LedgerOS — Fallback Admin Credentials Ready");
  console.log("==================================================================");
  console.log(`Email:       ${DEFAULT_ADMIN_EMAIL}`);
  console.log(`Password:    ${DEFAULT_ADMIN_PASSWORD}`);
  console.log(`SuperAdmin:  true`);
  console.log(`Role:        FIRM_OWNER`);
  console.log(`Tenant:      ${defaultTenant.name} (${defaultTenant.slug})`);
  console.log(`Login URL:   /login`);
  console.log("==================================================================\n");

  return { admin, defaultTenant };
}

if (require.main === module) {
  seedAdmin()
    .catch((err) => {
      console.error("❌ Admin seed failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
