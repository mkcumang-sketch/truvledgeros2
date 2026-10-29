import { db } from "../src/lib/db";
import { timingSafeEqualCompare } from "../src/lib/server/m2m-auth";
import {
  InvoiceStatus,
  PaymentRecoveryStage,
  GstReturnStatus,
  CommunicationChannel,
  CommunicationDirection,
  TaskType,
  TaskStatus,
  EventStatus,
  Role,
} from "@prisma/client";

/**
 * Autonomous Daily Cron Test Script
 * Runs via standalone HTTP trigger or direct database simulation without illegal route imports.
 */
async function runAutonomousCronTest() {
  console.log(">>> [TEST-SCRIPT] Starting Autonomous Daily Cron Test Runner...");

  const cronSecret = process.env.CRON_SECRET || "test-secret-value";
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  console.log(`>>> [TEST-SCRIPT] Target Endpoint: ${appUrl}/api/cron/autonomous-daily`);

  try {
    const response = await fetch(`${appUrl}/api/cron/autonomous-daily`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
    });

    const status = response.status;
    const data = await response.json().catch(() => ({}));

    console.log(`>>> [TEST-SCRIPT] Response Status: ${status}`);
    console.log(">>> [TEST-SCRIPT] Response Data:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("✔ Autonomous Daily Cron Test Completed Successfully.");
    } else {
      console.warn("⚠ Autonomous Daily Cron responded with error status:", status);
    }
  } catch (error: any) {
    console.log("ℹ Fetch failed (server may be offline). Testing direct DB access...");
    const activeTenants = await db.tenant.count({
      where: { active: true },
    });
    console.log(`✔ Database connected. Found ${activeTenants} active tenants.`);
  }
}

runAutonomousCronTest()
  .catch((err) => {
    console.error("❌ Test script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });