const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log("Finding current active tenant...");
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "demo-firm" },
  });

  if (!tenant) {
    console.error("Tenant 'demo-firm' not found. Run fix-auth.js first.");
    return;
  }

  console.log(`Seeding demo clients for tenant: ${tenant.name} (${tenant.id})`);

  const demoClients = [
    {
      name: "Apex Global Technologies Pvt Ltd",
      businessName: "Apex Global",
      gstin: "07AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      email: "finance@apexglobal.io",
      phone: "+91 9811002233",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110001",
      planName: "Comprehensive Retainer",
      monthlyFee: 25000.0,
      active: true,
    },
    {
      name: "Sunrise Retail Ventures LLP",
      businessName: "Sunrise Retails",
      gstin: "09BBBBB1111B1Z2",
      pan: "BBBBB1111B",
      email: "accounts@sunriseretail.in",
      phone: "+91 9922003344",
      city: "Kanpur",
      state: "Uttar Pradesh",
      pincode: "208001",
      planName: "GST & Compliance Only",
      monthlyFee: 15000.0,
      active: true,
    },
    {
      name: "Kavita Logistics & Supply Chain",
      businessName: "Kavita Logistics",
      gstin: "27CCCCC2222C1Z8",
      pan: "CCCCC2222C",
      email: "director@kavitalogistics.com",
      phone: "+91 9733004455",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      planName: "Virtual CFO Retainer",
      monthlyFee: 45000.0,
      active: true,
    },
  ];

  for (const item of demoClients) {
    const client = await prisma.client.create({
      data: {
        ...item,
        tenantId: tenant.id,
        contacts: {
          create: {
            tenantId: tenant.id,
            name: `${item.businessName} Accounts Head`,
            email: item.email,
            phone: item.phone,
            isPrimary: true,
          },
        },
        gstProfile: {
          create: {
            tenantId: tenant.id,
            gstin: item.gstin,
            legalName: item.name,
            tradeName: item.businessName,
            filingFrequency: "MONTHLY",
          },
        },
      },
    });

    console.log(`Created Client: ${client.name} (ID: ${client.id})`);
  }

  console.log("\nAll demo clients seeded successfully!");
}

run()
  .catch((e) => console.error("Client seed error:", e))
  .finally(() => prisma.$disconnect());