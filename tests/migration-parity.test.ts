import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName}${details ? ` - ${details}` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Migration History & Schema Parity Regression Test");
  console.log("=================================================================\n");

  const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
  const migrationsDir = path.join(__dirname, "../prisma/migrations");

  assert(fs.existsSync(schemaPath), "prisma/schema.prisma exists");
  assert(fs.existsSync(migrationsDir), "prisma/migrations directory exists");

  const schema = fs.readFileSync(schemaPath, "utf8");

  // Read all migrations in chronological order
  const migrationDirs = fs.readdirSync(migrationsDir)
    .filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort();

  console.log(`Found ${migrationDirs.length} migration directories:`, migrationDirs);

  assert(migrationDirs.includes("0_init"), "Baseline migration 0_init exists");
  assert(
    migrationDirs.some((d) => d.includes("add_team_invitations")),
    "Team invitations migration exists in history"
  );

  let cumulativeSql = "";
  for (const dir of migrationDirs) {
    const sqlFile = path.join(migrationsDir, dir, "migration.sql");
    assert(fs.existsSync(sqlFile), `Migration SQL exists for ${dir}`);
    cumulativeSql += "\n" + fs.readFileSync(sqlFile, "utf8");
  }

  // 1. Enum parity
  const schemaEnumRegex = /enum\s+([A-Za-z0-9_]+)\s*\{/g;
  const schemaEnums: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = schemaEnumRegex.exec(schema)) !== null) {
    schemaEnums.push(m[1]);
  }

  const baselineEnumRegex = /CREATE TYPE "([^"]+)" AS ENUM/g;
  const baselineEnums: string[] = [];
  while ((m = baselineEnumRegex.exec(cumulativeSql)) !== null) {
    baselineEnums.push(m[1]);
  }

  const missingEnums = schemaEnums.filter((e) => !baselineEnums.includes(e));
  assert(
    missingEnums.length === 0,
    `100% Enum Parity (Expected 13, Found ${baselineEnums.length})`,
    missingEnums.join(", ")
  );
  assert(baselineEnums.includes("InvitationStatus"), "InvitationStatus enum is created in migration history");

  // 2. Model / Table parity
  const schemaModelRegex = /model\s+([A-Za-z0-9_]+)\s*\{/g;
  const schemaModels: string[] = [];
  while ((m = schemaModelRegex.exec(schema)) !== null) {
    schemaModels.push(m[1]);
  }

  const baselineTableRegex = /CREATE TABLE "([^"]+)"/g;
  const baselineTables: string[] = [];
  while ((m = baselineTableRegex.exec(cumulativeSql)) !== null) {
    baselineTables.push(m[1]);
  }

  const missingModels = schemaModels.filter((mod) => !baselineTables.includes(mod));
  assert(
    missingModels.length === 0,
    `100% Table Parity (Expected 28, Found ${baselineTables.length})`,
    missingModels.join(", ")
  );
  assert(baselineTables.includes("Invitation"), "Invitation table is created in migration history");
  assert(baselineTables.includes("Session"), "Session table is created in migration history");
  assert(baselineTables.includes("PasswordResetToken"), "PasswordResetToken table is created in migration history");

  // 3. Columns check for Invitation
  assert(cumulativeSql.includes('"tokenHash" TEXT NOT NULL'), "Invitation.tokenHash column is defined with NOT NULL");
  assert(cumulativeSql.includes('"invitedById" TEXT NOT NULL'), "Invitation.invitedById column is defined with NOT NULL");
  assert(cumulativeSql.includes('"status" "InvitationStatus" NOT NULL DEFAULT \'PENDING\''), "Invitation.status defaults to PENDING");
  assert(cumulativeSql.includes('ALTER TABLE "Membership" ADD COLUMN "permissions" JSONB'), "Membership.permissions column is added in migration");

  // 4. Foreign key integrity
  assert(
    cumulativeSql.includes('FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")'),
    "Invitation foreign key to Tenant is defined"
  );
  assert(
    cumulativeSql.includes('FOREIGN KEY ("invitedById") REFERENCES "User"("id")'),
    "Invitation foreign key to User is defined"
  );

  console.log("\n-----------------------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("-----------------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
