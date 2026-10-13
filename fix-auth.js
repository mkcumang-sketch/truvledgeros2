const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function run() {
  console.log("Connecting to database...");
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-firm" },
    update: {},
    create: {
      name: "TRUV Advisory & Tax Partners",
      slug: "demo-firm",
      email: "contact@truv.in",
      phone: "+91 9876543210",
      active: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "us7081569@gmail.com" },
    update: {
      passwordHash: passwordHash,
      active: true,
    },
    create: {
      email: "us7081569@gmail.com",
      name: "Umang Sharma",
      passwordHash: passwordHash,
      active: true,
      isSuperAdmin: true,
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: {
      role: "FIRM_OWNER",
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: "FIRM_OWNER",
    },
  });

  console.log("=== SUCCESS: USER & TENANT SEEDED CLEANLY ===");
  console.log("Email: us7081569@gmail.com");
  console.log("Password: Password123!");
}

run()
  .catch((e) => console.error("Error seeding user:", e))
  .finally(() => prisma.$disconnect());