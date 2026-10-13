import { PrismaClient, Role, InvoiceStatus, PaymentRecoveryStage, GstReturnType, GstReturnStatus, DocumentStatus, CommunicationChannel, CommunicationDirection, TaskType, TaskStatus, SubscriptionTier, EventStatus } from "@prisma/client";

const prisma = new PrismaClient();
declare const process: any;
async function main() {
  console.log("🌱 Seeding TRUV LedgerOS Multi-Tenant Production Foundation...");
  

  // 1. GODMODE PLATFORM SUPERADMIN
  const godmodeUser = await prisma.user.upsert({
    where: { email: "godmode@truvtech.com" },
    update: {},
    create: {
      name: "TRUVTECH Platform Admin",
      email: "godmode@truvtech.com",
      phone: "+919999900000",
      isSuperAdmin: true,
      active: true,
    },
  });

  // 2. DEMO CA FIRM TENANT
  const demoFirm = await prisma.tenant.upsert({
    where: { slug: "truv-demo-ca" },
    update: {},
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
    },
  });

  // 3. FIRM USERS & MEMBERSHIPS
  const usersData = [
    {
      name: "Priya Kulkarni, FCA",
      email: "priya.kulkarni@truvdemo.in",
      phone: "+919820011001",
      role: Role.FIRM_OWNER,
    },
    {
      name: "Rajesh Iyer, FCA",
      email: "rajesh.iyer@truvdemo.in",
      phone: "+919820011002",
      role: Role.PARTNER,
    },
    {
      name: "Ananya Mehta, ACA",
      email: "ananya.mehta@truvdemo.in",
      phone: "+919820011003",
      role: Role.MANAGER,
    },
    {
      name: "Karan Desai",
      email: "karan.desai@truvdemo.in",
      phone: "+919820011004",
      role: Role.EXECUTIVE,
    },
    {
      name: "Rajesh Sharma (Client Rep)",
      email: "rajesh@sharma-traders.example.com",
      phone: "+919820011101",
      role: Role.CLIENT,
    },
  ];

  const createdUsers: Record<string, string> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        phone: u.phone,
        active: true,
      },
    });

    createdUsers[u.role] = user.id;

    await prisma.membership.upsert({
      where: {
        tenantId_userId: {
          tenantId: demoFirm.id,
          userId: user.id,
        },
      },
      update: { role: u.role },
      create: {
        tenantId: demoFirm.id,
        userId: user.id,
        role: u.role,
      },
    });
  }

  // 4. DEMO CLIENTS & CONTACTS
  const clientsData = [
    {
      name: "Sharma Traders Pvt Ltd",
      businessName: "Sharma Traders Private Limited",
      gstin: "27AAACS0000F1ZK",
      pan: "AAACS0000F",
      email: "accounts@sharma-traders.example.com",
      phone: "+919820011101",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      planName: "Bookkeeping + GST + Payroll",
      monthlyFee: 75000,
      contact: {
        name: "Rajesh Sharma",
        designation: "Managing Director",
        email: "rajesh@sharma-traders.example.com",
        phone: "+919820011101",
      },
    },
    {
      name: "Mehta Textiles LLP",
      businessName: "Mehta Textiles LLP",
      gstin: "24AABCM0000K1Z2",
      pan: "AABCM0000K",
      email: "accounts@mehta-textiles.example.com",
      phone: "+919825022202",
      city: "Surat",
      state: "Gujarat",
      pincode: "395002",
      planName: "Bookkeeping + GST",
      monthlyFee: 36000,
      contact: {
        name: "Hetal Mehta",
        designation: "Partner",
        email: "accounts@mehta-textiles.example.com",
        phone: "+919825022202",
      },
    },
    {
      name: "Patel Foods Private Limited",
      businessName: "Patel Foods Pvt Ltd",
      gstin: "24AAFFP0000L1ZQ",
      pan: "AAFFP0000L",
      email: "finance@patel-foods.example.com",
      phone: "+919824033303",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380009",
      planName: "Full Compliance",
      monthlyFee: 100000,
      contact: {
        name: "Jignesh Patel",
        designation: "Director - Finance",
        email: "finance@patel-foods.example.com",
        phone: "+919824033303",
      },
    },
    {
      name: "Joshi Engineering Works",
      businessName: "Joshi Engineering Works",
      gstin: "27AABCJ0000M1Z8",
      pan: "AABCJ0000M",
      email: "admin@joshi-eng.example.com",
      phone: "+919822044404",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411004",
      planName: "Bookkeeping + GST + TDS",
      monthlyFee: 54000,
      contact: {
        name: "Anil Joshi",
        designation: "Proprietor",
        email: "admin@joshi-eng.example.com",
        phone: "+919822044404",
      },
    },
    {
      name: "Verma Retail Enterprises",
      businessName: "Verma Retail Private Limited",
      gstin: "07AAGFV0000R1ZD",
      pan: "AAGFV0000R",
      email: "owner@verma-retail.example.com",
      phone: "+919811055505",
      city: "Delhi",
      state: "Delhi",
      pincode: "110001",
      planName: "Bookkeeping + Audit",
      monthlyFee: 77000,
      contact: {
        name: "Sunil Verma",
        designation: "Managing Director",
        email: "owner@verma-retail.example.com",
        phone: "+919811055505",
      },
    },
  ];

  const clientMap: Record<string, string> = {};

  for (const c of clientsData) {
    const client = await prisma.client.create({
      data: {
        tenantId: demoFirm.id,
        name: c.name,
        businessName: c.businessName,
        gstin: c.gstin,
        pan: c.pan,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        planName: c.planName,
        monthlyFee: c.monthlyFee,
        contacts: {
          create: {
            tenantId: demoFirm.id,
            name: c.contact.name,
            designation: c.contact.designation,
            email: c.contact.email,
            phone: c.contact.phone,
            isPrimary: true,
          },
        },
        gstProfile: {
          create: {
            tenantId: demoFirm.id,
            gstin: c.gstin,
            legalName: c.businessName,
            tradeName: c.name,
            filingFrequency: "MONTHLY",
          },
        },
      },
    });

    clientMap[c.name] = client.id;
  }

  // 5. DEMO INVOICES & PAYMENTS
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
  const daysAhead = (days: number) => new Date(now.getTime() + days * 86400000);

  const invoicesData = [
    {
      invoiceNumber: "INV-202627-0001",
      clientName: "Sharma Traders Pvt Ltd",
      serviceDescription: "Monthly Bookkeeping & GST Filing - Aug 2026",
      subtotal: 75000,
      issuedDate: daysAgo(40),
      dueDate: daysAgo(25),
      status: InvoiceStatus.PAID,
      paidAt: daysAgo(22),
    },
    {
      invoiceNumber: "INV-202627-0002",
      clientName: "Sharma Traders Pvt Ltd",
      serviceDescription: "Monthly Bookkeeping & GST Filing - Sep 2026",
      subtotal: 75000,
      issuedDate: daysAgo(2),
      dueDate: daysAhead(13),
      status: InvoiceStatus.AWAITING_APPROVAL, // > 50,000 threshold
    },
    {
      invoiceNumber: "INV-202627-0003",
      clientName: "Mehta Textiles LLP",
      serviceDescription: "Monthly Bookkeeping - Aug 2026",
      subtotal: 36000,
      issuedDate: daysAgo(18),
      dueDate: daysAgo(3),
      status: InvoiceStatus.OVERDUE,
      lastRecoveryStage: PaymentRecoveryStage.GENTLE,
      lastReminderAt: daysAgo(2),
    },
    {
      invoiceNumber: "INV-202627-0004",
      clientName: "Patel Foods Private Limited",
      serviceDescription: "Quarterly GST & TDS Compliance Services",
      subtotal: 100000,
      issuedDate: daysAgo(30),
      dueDate: daysAgo(15),
      status: InvoiceStatus.OVERDUE,
      lastRecoveryStage: PaymentRecoveryStage.FIRM,
      lastReminderAt: daysAgo(4),
    },
    {
      invoiceNumber: "INV-202627-0005",
      clientName: "Joshi Engineering Works",
      serviceDescription: "Annual Accounts Finalisation Support",
      subtotal: 54000,
      issuedDate: daysAgo(45),
      dueDate: daysAgo(25),
      status: InvoiceStatus.OVERDUE,
      lastRecoveryStage: PaymentRecoveryStage.FINAL_NOTICE,
      lastReminderAt: daysAgo(9),
    },
    {
      invoiceNumber: "INV-202627-0006",
      clientName: "Verma Retail Enterprises",
      serviceDescription: "Retail Bookkeeping & Inventory Audit Support",
      subtotal: 77000,
      issuedDate: daysAgo(75),
      dueDate: daysAgo(47),
      status: InvoiceStatus.OVERDUE,
      lastRecoveryStage: PaymentRecoveryStage.PARTNER_ESCALATION,
      lastReminderAt: daysAgo(17),
    },
  ];

  for (const inv of invoicesData) {
    const clientId = clientMap[inv.clientName];
    const gstRate = 18.0;
    const gstAmt = (inv.subtotal * gstRate) / 100;
    const cgst = gstAmt / 2;
    const sgst = gstAmt / 2;
    const total = inv.subtotal + gstAmt;

    const createdInv = await prisma.invoice.create({
      data: {
        tenantId: demoFirm.id,
        clientId,
        invoiceNumber: inv.invoiceNumber,
        serviceDescription: inv.serviceDescription,
        subtotal: inv.subtotal,
        gstRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: 0,
        totalAmount: total,
        issuedDate: inv.issuedDate,
        dueDate: inv.dueDate,
        status: inv.status,
        paidAt: inv.paidAt,
        lastRecoveryStage: inv.lastRecoveryStage,
        lastReminderAt: inv.lastReminderAt,
        syncedToBooks: true,
        accountingRefId: `ZOHO-${inv.invoiceNumber}`,
        items: {
          create: {
            description: inv.serviceDescription,
            hsnSacCode: "998311",
            quantity: 1,
            unitPrice: inv.subtotal,
            total: inv.subtotal,
          },
        },
      },
    });

    if (inv.status === InvoiceStatus.PAID) {
      await prisma.payment.create({
        data: {
          tenantId: demoFirm.id,
          invoiceId: createdInv.id,
          amount: total,
          paymentMode: "NEFT",
          referenceNo: `UTR-2026-${inv.invoiceNumber.slice(-4)}`,
          receivedAt: inv.paidAt || new Date(),
          notes: "Full payment received via bank transfer",
        },
      });
    }
  }

  // 6. DEMO GST RETURNS
  const gstReturnsData = [
    {
      clientName: "Sharma Traders Pvt Ltd",
      returnType: GstReturnType.GSTR_3B,
      period: "Sep 2026",
      financialYear: "2026-2027",
      dueDate: daysAhead(14),
      dataReceived: true,
      outputTax: 245000,
      inputTaxCredit: 168000,
      netPayable: 77000,
      status: GstReturnStatus.AWAITING_CLIENT_APPROVAL,
    },
    {
      clientName: "Patel Foods Private Limited",
      returnType: GstReturnType.GSTR_1,
      period: "Sep 2026",
      financialYear: "2026-2027",
      dueDate: daysAhead(5),
      dataReceived: false,
      outputTax: 0,
      inputTaxCredit: 0,
      netPayable: 0,
      status: GstReturnStatus.DATA_PENDING,
    },
    {
      clientName: "Joshi Engineering Works",
      returnType: GstReturnType.GSTR_3B,
      period: "Sep 2026",
      financialYear: "2026-2027",
      dueDate: daysAhead(14),
      dataReceived: true,
      outputTax: 96000,
      inputTaxCredit: 101500,
      netPayable: -5500, // Credit forward
      status: GstReturnStatus.READY_FOR_REVIEW,
    },
    {
      clientName: "Mehta Textiles LLP",
      returnType: GstReturnType.GSTR_1,
      period: "Sep 2026",
      financialYear: "2026-2027",
      dueDate: daysAhead(5),
      dataReceived: false,
      outputTax: 0,
      inputTaxCredit: 0,
      netPayable: 0,
      status: GstReturnStatus.DATA_PENDING,
    },
  ];

  for (const gr of gstReturnsData) {
    const clientId = clientMap[gr.clientName];
    await prisma.gstReturn.create({
      data: {
        tenantId: demoFirm.id,
        clientId,
        returnType: gr.returnType,
        period: gr.period,
        financialYear: gr.financialYear,
        dueDate: gr.dueDate,
        dataReceived: gr.dataReceived,
        outputTax: gr.outputTax,
        inputTaxCredit: gr.inputTaxCredit,
        netPayable: gr.netPayable,
        status: gr.status,
      },
    });
  }

  // 7. DEMO DOCUMENT REQUESTS & DOCUMENTS
  const docReq1 = await prisma.documentRequest.create({
    data: {
      tenantId: demoFirm.id,
      clientId: clientMap["Mehta Textiles LLP"],
      title: "Monthly GST Filing Documents - Sep 2026",
      description: "Please provide monthly bank statements and purchase invoices.",
      reminderCount: 1,
      lastReminderAt: daysAgo(4),
      status: DocumentStatus.PENDING,
      documents: {
        create: [
          {
            tenantId: demoFirm.id,
            clientId: clientMap["Mehta Textiles LLP"],
            name: "Bank Statement (Sep 2026)",
            category: "Bank Statement",
            status: DocumentStatus.PENDING,
          },
          {
            tenantId: demoFirm.id,
            clientId: clientMap["Mehta Textiles LLP"],
            name: "Purchase Invoices Register (Sep 2026)",
            category: "Purchase Register",
            status: DocumentStatus.PENDING,
          },
        ],
      },
    },
  });

  const docReq2 = await prisma.documentRequest.create({
    data: {
      tenantId: demoFirm.id,
      clientId: clientMap["Patel Foods Private Limited"],
      title: "Quarterly TDS & GST Audit Records",
      description: "Urgent pending documents for tax filing.",
      reminderCount: 3, // Escalation threshold reached
      lastReminderAt: daysAgo(4),
      status: DocumentStatus.PENDING,
      documents: {
        create: [
          {
            tenantId: demoFirm.id,
            clientId: clientMap["Patel Foods Private Limited"],
            name: "TDS Form 16A Certificates",
            category: "TDS",
            status: DocumentStatus.PENDING,
          },
          {
            tenantId: demoFirm.id,
            clientId: clientMap["Patel Foods Private Limited"],
            name: "Sales Register Export",
            category: "Sales Register",
            status: DocumentStatus.PENDING,
          },
        ],
      },
    },
  });

  // 8. DEMO TASKS
  await prisma.task.createMany({
    data: [
      {
        tenantId: demoFirm.id,
        type: TaskType.INVOICE_APPROVAL,
        title: "Approve High-Value Invoice INV-202627-0002",
        detail: "Sharma Traders Pvt Ltd · ₹88,500 exceeds the ₹50,000 partner threshold.",
        status: TaskStatus.OPEN,
        priority: "HIGH",
        assignedToId: createdUsers[Role.PARTNER],
        dueDate: daysAhead(2),
      },
      {
        tenantId: demoFirm.id,
        type: TaskType.PAYMENT_ESCALATION,
        title: "Call Verma Retail Enterprises Personally",
        detail: "Invoice INV-202627-0006 is 47 days overdue (₹90,860). Partner intervention required.",
        status: TaskStatus.OPEN,
        priority: "URGENT",
        assignedToId: createdUsers[Role.PARTNER],
        dueDate: daysAhead(1),
      },
      {
        tenantId: demoFirm.id,
        type: TaskType.DOCUMENT_CALL,
        title: "Call Patel Foods LLP Regarding Pending Documents",
        detail: "Client has been reminded 3 times for TDS certificates and sales register.",
        status: TaskStatus.OPEN,
        priority: "HIGH",
        assignedToId: createdUsers[Role.MANAGER],
        dueDate: daysAhead(1),
      },
      {
        tenantId: demoFirm.id,
        type: TaskType.AI_HANDOFF,
        title: "Follow up with Visitor on Mutual Fund Query",
        detail: "Visitor asked legal/investment question outside standard knowledge base scope.",
        status: TaskStatus.OPEN,
        priority: "NORMAL",
        assignedToId: createdUsers[Role.EXECUTIVE],
      },
    ],
  });

  // 9. DEMO KNOWLEDGE BASE
  await prisma.knowledgeBase.createMany({
    data: [
      {
        tenantId: demoFirm.id,
        title: "GSTR-3B Due Date Policy",
        keywords: "gstr-3b, due date, deadline, filing date",
        content: "GSTR-3B is due on the 20th of every month for normal monthly taxpayers.",
        category: "GST",
      },
      {
        tenantId: demoFirm.id,
        title: "GSTR-1 Due Date Policy",
        keywords: "gstr-1, sales return, due date",
        content: "GSTR-1 monthly return is due on the 11th of every month.",
        category: "GST",
      },
      {
        tenantId: demoFirm.id,
        title: "Standard Monthly Bookkeeping Packages",
        keywords: "pricing, cost, fee, charges, bookkeeping price",
        content: "Our monthly bookkeeping packages start at ₹5,000/month based on turnover and transaction volume.",
        category: "PRICING",
      },
      {
        tenantId: demoFirm.id,
        title: "Document Requirements for GST Filing",
        keywords: "documents, bank statement, sales register, purchase register",
        content: "For monthly GST filing, we require your monthly bank statement, GSTR-1 sales register, purchase register, and any credit/debit notes.",
        category: "DOCUMENTS",
      },
    ],
  });

  // 10. DEMO AUTOMATIONS
  const automations = [
    {
      code: "INVOICE",
      name: "Invoice Generation & Approval Automation",
      description: "Calculates GST, syncs to accounting software, routes > ₹50,000 for partner signoff, and delivers via WhatsApp and Email.",
      cronSchedule: "EVENT_DRIVEN",
      totalRuns: 48,
      lastRunAt: daysAgo(2),
    },
    {
      code: "RECOVERY",
      name: "Payment Recovery Automation",
      description: "Runs daily at 10:00 AM. Staged escalations across Gentle, Firm, Final Notice with partner copy, and Partner voice escalation.",
      cronSchedule: "0 10 * * *",
      totalRuns: 112,
      lastRunAt: daysAgo(1),
    },
    {
      code: "GST",
      name: "GST Compliance & Return Pipeline",
      description: "Monthly cycle on 1st at 09:00 AM. Dispatches missing register requests and approval summaries for GSTR-1 and GSTR-3B.",
      cronSchedule: "0 9 1 * *",
      totalRuns: 14,
      lastRunAt: daysAgo(5),
    },
    {
      code: "DOCS",
      name: "Document Collection Chase",
      description: "Runs weekly on Monday at 10:00 AM. Reminds clients of missing documents and alerts team after 3 failed attempts.",
      cronSchedule: "0 10 * * 1",
      totalRuns: 36,
      lastRunAt: daysAgo(4),
    },
    {
      code: "SUPPORT",
      name: "AI Multi-Channel Practice Assistant",
      description: "24/7 web chat, WhatsApp, and Sarvam AI voice integration answering client queries in Hindi, Hinglish, and English.",
      cronSchedule: "ALWAYS_ON",
      totalRuns: 236,
      lastRunAt: daysAgo(1),
    },
  ];

  for (const a of automations) {
    await prisma.automation.create({
      data: {
        tenantId: demoFirm.id,
        code: a.code,
        name: a.name,
        description: a.description,
        cronSchedule: a.cronSchedule,
        totalRuns: a.totalRuns,
        lastRunAt: a.lastRunAt,
        enabled: true,
      },
    });
  }

  // 11. DEMO SUBSCRIPTION
  await prisma.subscription.create({
    data: {
      tenantId: demoFirm.id,
      tier: SubscriptionTier.PROFESSIONAL,
      status: "ACTIVE",
      currentPeriodStart: daysAgo(15),
      currentPeriodEnd: daysAhead(15),
      maxUsers: 15,
      maxClients: 250,
      maxAiRuns: 5000,
      maxVoiceMinutes: 500,
      maxWhatsAppMsgs: 5000,
    },
  });

  console.log("✅ Seed completed successfully.");
  console.log(`🏢 Tenant: ${demoFirm.name} (${demoFirm.slug})`);
  console.log(`👑 Godmode Admin: ${godmodeUser.email}`);
  console.log(`👥 Seeded ${usersData.length} team members and ${clientsData.length} clients with invoices, GST returns, and tasks.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
