/**
 * TRUV LedgerOS — Set Admin User Script
 * Creates or updates user us7907us@gmail.com with known credentials,
 * active superadmin rights, and FIRM_OWNER role in the primary practice tenant.
 */

const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const TARGET_EMAIL = process.env.TARGET_EMAIL || "us7907us@gmail.com";
const TARGET_PASSWORD = process.env.TARGET_PASSWORD || "AdminPass123!";
const SALT_ROUNDS = 12;

async function main() {
  console.log("==================================================================");
  console.log(`Setting Admin User for TRUV LedgerOS: ${TARGET_EMAIL}`);
  console.log("==================================================================\n");

  // 1. Hash the password
  console.log(`[1/4] Hashing password with bcrypt (rounds: ${SALT_ROUNDS})...`);
  const passwordHash = await bcrypt.hash(TARGET_PASSWORD, SALT_ROUNDS);

  // 2. Locate primary tenant ('truv-demo-ca' or first active practice)
  console.log("[2/4] Locating primary practice tenant...");
  let primaryTenant = await prisma.tenant.findUnique({
    where: { slug: "truv-demo-ca" },
  });

  if (!primaryTenant) {
    primaryTenant = await prisma.tenant.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!primaryTenant) {
    throw new Error("No active practice tenant found in the database!");
  }

  console.log(`   Found Tenant: ${primaryTenant.name} (id: ${primaryTenant.id}, slug: ${primaryTenant.slug})`);

  // 3. Upsert User
  console.log(`[3/4] Upserting user record for ${TARGET_EMAIL}...`);
  const existingUser = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
  });

  let user;
  if (existingUser) {
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        active: true,
        isSuperAdmin: true,
      },
    });
    console.log(`   Updated existing user ID: ${user.id}`);
  } else {
    user = await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        name: "Umang Sharma",
        passwordHash,
        active: true,
        isSuperAdmin: true,
      },
    });
    console.log(`   Created new user ID: ${user.id}`);
  }

  // 4. Ensure ACTIVE Membership in primary tenant
  console.log(`[4/4] Ensuring ACTIVE FIRM_OWNER membership in tenant ${primaryTenant.slug}...`);
  const existingMembership = await prisma.membership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: primaryTenant.id,
        userId: user.id,
      },
    },
  });

  let membership;
  if (existingMembership) {
    membership = await prisma.membership.update({
      where: { id: existingMembership.id },
      data: {
        role: Role.FIRM_OWNER,
        status: "ACTIVE",
      },
    });
    console.log(`   Updated membership ID: ${membership.id} (role: ${membership.role}, status: ${membership.status})`);
  } else {
    membership = await prisma.membership.create({
      data: {
        tenantId: primaryTenant.id,
        userId: user.id,
        role: Role.FIRM_OWNER,
        status: "ACTIVE",
      },
    });
    console.log(`   Created membership ID: ${membership.id} (role: ${membership.role}, status: ${membership.status})`);
  }

  // Also ensure any other memberships for this user are ACTIVE
  await prisma.membership.updateMany({
    where: { userId: user.id },
    data: { status: "ACTIVE" },
  });

  // Verify password comparison
  const isMatch = await bcrypt.compare(TARGET_PASSWORD, user.passwordHash);
  if (!isMatch) {
    throw new Error("Password verification sanity check failed!");
  }

  console.log("\n==================================================================");
  console.log(" SUCCESS: Admin User Configured & Verified");
  console.log("==================================================================");
  console.log(` Email:        ${user.email}`);
  console.log(` Password:     ${TARGET_PASSWORD}`);
  console.log(` User ID:      ${user.id}`);
  console.log(` Active:       ${user.active}`);
  console.log(` SuperAdmin:   ${user.isSuperAdmin}`);
  console.log(` Primary Firm: ${primaryTenant.name} (${primaryTenant.slug})`);
  console.log(` Firm Role:    ${membership.role}`);
  console.log("==================================================================\n");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in set-admin-user:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
