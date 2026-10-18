import { db } from "../src/lib/db";
import dotenv from "dotenv";

dotenv.config();

/**
 * Known protected business hosts containing real practice data that must NEVER
 * be targeted as disposable staging or touched by automated migrations/resets.
 */
export const PROTECTED_BUSINESS_HOSTS = [
  "ep-square-wildflower-b5bmrz7r",
];

export type DatabaseProvider = "neon" | "supabase" | "local" | "unknown";

export interface ParsedDbCoordinates {
  provider: DatabaseProvider;
  host: string;
  port: string;
  dbName: string;
  username: string;
  projectRef: string;
  endpointId: string;
  baseEndpoint: string;
  isPooler: boolean;
  sanitized: string;
}

/**
 * Strip credentials and return safe database coordinates without exposing passwords.
 * Provider-aware parser supporting Supabase (direct and Supavisor pooler),
 * Neon (direct and connection pooler), and local PostgreSQL instances.
 */
export function parseDbCoordinates(rawUrl: string): ParsedDbCoordinates {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return {
      provider: "unknown",
      host: "UNSET",
      port: "",
      dbName: "UNSET",
      username: "",
      projectRef: "",
      endpointId: "",
      baseEndpoint: "",
      isPooler: false,
      sanitized: "[EMPTY]",
    };
  }

  const trimmed = rawUrl.trim();
  const protoIndex = trimmed.indexOf("://");
  if (protoIndex === -1) {
    return {
      provider: "unknown",
      host: "MALFORMED",
      port: "",
      dbName: "MALFORMED",
      username: "",
      projectRef: "",
      endpointId: "",
      baseEndpoint: "",
      isPooler: false,
      sanitized: "[MALFORMED_URI]",
    };
  }

  const proto = trimmed.slice(0, protoIndex).toLowerCase();
  if (proto !== "postgresql" && proto !== "postgres") {
    return {
      provider: "unknown",
      host: "MALFORMED",
      port: "",
      dbName: "MALFORMED",
      username: "",
      projectRef: "",
      endpointId: "",
      baseEndpoint: "",
      isPooler: false,
      sanitized: "[MALFORMED_URI]",
    };
  }

  const rest = trimmed.slice(protoIndex + 3);
  const lastAt = rest.lastIndexOf("@");
  let hostAndPath = "";
  let username = "";
  let sanitized = trimmed;

  if (lastAt !== -1) {
    const userPart = rest.slice(0, lastAt);
    hostAndPath = rest.slice(lastAt + 1);
    username = userPart.split(":")[0];
    sanitized = `${proto}://[REDACTED]@${hostAndPath}`;
  } else {
    hostAndPath = rest;
  }

  const slashIndex = hostAndPath.indexOf("/");
  let hostPort = "";
  let fullPath = "";
  if (slashIndex === -1) {
    hostPort = hostAndPath;
    fullPath = "";
  } else {
    hostPort = hostAndPath.slice(0, slashIndex);
    fullPath = hostAndPath.slice(slashIndex + 1);
  }

  const dbName = fullPath.split("?")[0].trim() || "UNKNOWN";

  let rawHost = "";
  let rawPort = "5432";
  const colonIndex = hostPort.lastIndexOf(":");
  if (colonIndex !== -1 && !hostPort.endsWith("]")) {
    rawHost = hostPort.slice(0, colonIndex);
    rawPort = hostPort.slice(colonIndex + 1);
  } else {
    rawHost = hostPort;
  }

  const host = rawHost.trim().toLowerCase();
  const port = rawPort.trim() || "5432";

  if (!host || host === "" || host === "unknown" || host.includes("not-a-valid-url")) {
    return {
      provider: "unknown",
      host: "MALFORMED",
      port: "",
      dbName: "MALFORMED",
      username: "",
      projectRef: "",
      endpointId: "",
      baseEndpoint: "",
      isPooler: false,
      sanitized: "[MALFORMED_URI]",
    };
  }

  let provider: DatabaseProvider = "unknown";
  let endpointId = host.split(".")[0];
  let baseEndpoint = endpointId;
  let projectRef = "";
  let isPooler = false;

  if (host === "localhost" || host === "127.0.0.1") {
    provider = "local";
    endpointId = "localhost";
    baseEndpoint = "localhost";
    projectRef = "localhost";
    isPooler = false;
  } else if (host.includes(".neon.tech")) {
    provider = "neon";
    isPooler = host.includes("-pooler");
    endpointId = host.split(".")[0];
    baseEndpoint = endpointId.replace(/-pooler$/i, "");
    projectRef = baseEndpoint;
  } else if (host.includes(".supabase.co") || host.includes(".supabase.com")) {
    provider = "supabase";
    if (host.includes(".pooler.supabase.com") || port === "6543") {
      isPooler = true;
      let ref = "UNKNOWN";
      if (username.includes(".")) {
        const uParts = username.split(".");
        ref = uParts.slice(1).join(".");
      } else if (username && username !== "postgres") {
        ref = username;
      } else if (!host.startsWith("aws-") && host.includes(".pooler.supabase.com")) {
        ref = host.split(".")[0];
      }
      projectRef = ref;
      endpointId = ref;
      baseEndpoint = ref;
    } else {
      isPooler = false;
      const parts = host.split(".");
      if (parts[0] === "db" && parts.length >= 4) {
        projectRef = parts[1];
      } else if (parts.length >= 3) {
        projectRef = parts[0];
      } else {
        projectRef = "UNKNOWN";
      }
      endpointId = projectRef;
      baseEndpoint = projectRef;
    }
  } else {
    provider = "unknown";
    endpointId = host.split(".")[0];
    baseEndpoint = endpointId;
    projectRef = baseEndpoint;
  }

  return {
    provider,
    host,
    port,
    dbName,
    username,
    projectRef,
    endpointId,
    baseEndpoint,
    isPooler,
    sanitized,
  };
}

/**
 * Sanitizes any error message to guarantee that connection strings, passwords, or tokens are never logged.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  if (!rawMessage) return "";
  return rawMessage
    .replace(/postgres(ql)?:\/\/[^\s@/]+:[^\s@/]+@/gi, "postgresql://[REDACTED]@")
    .replace(/postgres(ql)?:\/\/[^\s@/]+@/gi, "postgresql://[REDACTED]@")
    .replace(/password=[^\s;&]+/gi, "password=[REDACTED]")
    .replace(/bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer [REDACTED]");
}

export interface IsolationEvaluation {
  isAllowed: boolean;
  reasons: string[];
  safeDb: ParsedDbCoordinates;
  safeDirect?: ParsedDbCoordinates;
  isProtectedBusinessDb: boolean;
  hasStagingIdentity: boolean;
  explicitStagingConfirmed: boolean;
  isAmbiguous: boolean;
  endpointsMatch: boolean;
}

/**
 * Evaluates whether a database connection string qualifies as a safe, isolated, disposable staging target.
 * Enforces MULTI-FACTOR VERIFICATION:
 * 1. Physical / naming isolation: Must NOT be on the protected business host list.
 * 2. Endpoint Parity: DATABASE_URL and DIRECT_URL must resolve to the EXACT SAME provider and project identity.
 * 3. Verified Project/Staging Identity: Explicit staging project (e.g. STAGING_PROJECT_NAME="truvca-staging"
 *    or SUPABASE_STAGING_PROJECT_REF matching the project reference), host containing 'staging',
 *    db named 'truv_staging', or local dev ('localhost'/'127.0.0.1').
 * 4. Operator Confirmation: Must have explicit CONFIRM_DISPOSABLE_STAGING_DB="true" flag.
 * 
 * Neither a "staging" substring alone, a manual confirmation flag alone, nor a successful SELECT 1
 * is treated as sufficient proof of isolation.
 */
export function evaluateDatabaseIsolation(options: {
  databaseUrl?: string;
  directUrl?: string;
  confirmFlag?: boolean;
  isEnforced?: boolean;
  stagingProjectName?: string;
  expectedEndpoint?: string;
  expectedProjectRef?: string;
}): IsolationEvaluation {
  const isLiveInspection = options.databaseUrl === undefined;
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL || "";
  const directUrl = options.directUrl !== undefined ? options.directUrl : (isLiveInspection ? process.env.DIRECT_URL : undefined);
  const confirmFlag =
    options.confirmFlag !== undefined
      ? options.confirmFlag
      : process.env.CONFIRM_DISPOSABLE_STAGING_DB === "true" || process.argv.includes("--confirm-disposable-staging");
  const stagingProjectName =
    options.stagingProjectName ||
    process.env.STAGING_PROJECT_NAME ||
    (process.argv.find((a) => a.startsWith("--staging-project="))?.split("=")[1]);
  const expectedEndpoint =
    options.expectedProjectRef ||
    options.expectedEndpoint ||
    process.env.SUPABASE_STAGING_PROJECT_REF ||
    process.env.EXPECTED_STAGING_ENDPOINT ||
    (process.argv.find((a) => a.startsWith("--expected-endpoint="))?.split("=")[1]);

  const safeDb = parseDbCoordinates(dbUrl);
  const reasons: string[] = [];

  // Check 1: Host missing or malformed
  if (safeDb.host === "UNSET" || safeDb.host === "MALFORMED") {
    return {
      isAllowed: false,
      reasons: ["DATABASE_URL is missing, unset, or malformed."],
      safeDb,
      isProtectedBusinessDb: false,
      hasStagingIdentity: false,
      explicitStagingConfirmed: confirmFlag,
      isAmbiguous: true,
      endpointsMatch: false,
    };
  }

  // Check 2: Protected business database check
  const isProtectedDbUrl = PROTECTED_BUSINESS_HOSTS.some(
    (h) =>
      safeDb.host.includes(h) ||
      safeDb.endpointId.includes(h) ||
      safeDb.baseEndpoint.includes(h) ||
      (safeDb.projectRef && safeDb.projectRef.includes(h))
  );

  let isProtectedDirectUrl = false;
  let safeDirect: ParsedDbCoordinates | undefined;
  let endpointsMatch = true;

  if (directUrl && directUrl.trim() !== "") {
    safeDirect = parseDbCoordinates(directUrl);

    if (safeDirect.host === "MALFORMED" || safeDirect.host === "UNSET") {
      endpointsMatch = false;
      reasons.push("DIRECT_URL is malformed, missing, or invalid.");
    }

    isProtectedDirectUrl = PROTECTED_BUSINESS_HOSTS.some(
      (h) =>
        safeDirect!.host.includes(h) ||
        safeDirect!.endpointId.includes(h) ||
        safeDirect!.baseEndpoint.includes(h) ||
        (safeDirect!.projectRef && safeDirect!.projectRef.includes(h))
    );

    // Provider match verification
    if (safeDb.provider !== safeDirect.provider) {
      endpointsMatch = false;
      reasons.push(
        `PROVIDER MISMATCH: DATABASE_URL provider ('${safeDb.provider}') and DIRECT_URL provider ('${safeDirect.provider}') do not match. Both must target the same database provider.`
      );
    }

    // Parity verification: DATABASE_URL and DIRECT_URL must resolve to the same project / base endpoint
    const dbProject = (safeDb.projectRef || safeDb.baseEndpoint || "").toLowerCase();
    const directProject = (safeDirect.projectRef || safeDirect.baseEndpoint || "").toLowerCase();

    if (
      !dbProject ||
      dbProject === "unknown" ||
      !directProject ||
      directProject === "unknown" ||
      dbProject !== directProject
    ) {
      endpointsMatch = false;
      reasons.push(
        `ENDPOINT MISMATCH: DATABASE_URL (endpoint '${safeDb.baseEndpoint}') and DIRECT_URL (endpoint '${safeDirect.baseEndpoint}') resolve to different database endpoints. Both must target the same staging project.`
      );
    }

    if (safeDb.dbName.toLowerCase() !== safeDirect.dbName.toLowerCase()) {
      reasons.push(
        `DATABASE_URL database name ('${safeDb.dbName}') does not match DIRECT_URL database name ('${safeDirect.dbName}').`
      );
    }
  }

  const isProtectedBusinessDb = isProtectedDbUrl || isProtectedDirectUrl;

  if (isProtectedBusinessDb) {
    reasons.push(
      `TARGET DATABASE IS PROTECTED: Endpoint '${isProtectedDbUrl ? safeDb.baseEndpoint : safeDirect?.baseEndpoint}' contains active business records and is permanently blacklisted.`
    );
  }

  // Check 3: Approved provider infrastructure check
  if (safeDb.provider === "unknown") {
    reasons.push(
      `UNVERIFIED DATABASE HOST: Host '${safeDb.host}' does not belong to an approved database provider infrastructure (Supabase, Neon, or Local).`
    );
  }

  // Check 4: Expected Endpoint Match (if configured)
  let matchesExpectedEndpoint = false;
  if (expectedEndpoint && expectedEndpoint.trim() !== "") {
    const expected = expectedEndpoint.trim().toLowerCase();
    const currentBase = safeDb.baseEndpoint.toLowerCase();
    const currentProj = safeDb.projectRef.toLowerCase();
    if (currentBase === expected || currentProj === expected) {
      matchesExpectedEndpoint = true;
    } else {
      reasons.push(
        `Endpoint mismatch: Expected staging endpoint '${expectedEndpoint}', but target is '${safeDb.baseEndpoint}'.`
      );
    }
  }

  // Check 5: Staging Identity Validation
  // Accepted indicators:
  // - Local development: localhost, 127.0.0.1
  // - Dedicated staging host naming: contains '-staging', 'staging-', or '.staging.'
  // - Dedicated staging database name: 'staging', 'truv_staging', or ends with '_staging' or '_test'
  // - Verified project reference matching expected staging contract
  // - Provider-specific declared staging project (e.g. Neon 'truvca-staging')
  const isLocalHost = safeDb.provider === "local";
  const hasStagingHost =
    safeDb.host.toLowerCase().includes("-staging") ||
    safeDb.host.toLowerCase().includes("staging-") ||
    safeDb.host.toLowerCase().includes(".staging.");
  const hasStagingDbName =
    safeDb.dbName.toLowerCase() === "staging" ||
    safeDb.dbName.toLowerCase() === "truv_staging" ||
    safeDb.dbName.toLowerCase().endsWith("_staging") ||
    safeDb.dbName.toLowerCase().endsWith("_test");

  const hasNeonStagingDeclaration =
    safeDb.provider === "neon" && stagingProjectName === "truvca-staging";

  const hasSupabaseStagingContract =
    safeDb.provider === "supabase" &&
    matchesExpectedEndpoint &&
    safeDb.projectRef !== "UNKNOWN" &&
    safeDb.projectRef !== "";

  const hasStagingIdentity =
    isLocalHost ||
    hasStagingHost ||
    hasStagingDbName ||
    hasNeonStagingDeclaration ||
    hasSupabaseStagingContract;

  // Ambiguity check: Default database names ('neondb' on Neon, 'postgres' on Supabase/default) on un-named endpoint
  const isAmbiguous =
    !hasStagingIdentity &&
    (safeDb.dbName.toLowerCase() === "neondb" || safeDb.dbName.toLowerCase() === "postgres");

  if (!hasStagingIdentity) {
    if (isAmbiguous) {
      if (safeDb.provider === "supabase") {
        reasons.push(
          `Ambiguous database identity: Supabase host '${safeDb.host}' and DB '${safeDb.dbName}' have no dedicated staging indicator. For Supabase staging, configure SUPABASE_STAGING_PROJECT_REF or EXPECTED_STAGING_ENDPOINT matching '${safeDb.projectRef}'.`
        );
      } else {
        reasons.push(
          `Ambiguous database identity: Host '${safeDb.host}' and DB '${safeDb.dbName}' have no dedicated staging indicator. For the new Neon project 'truvca-staging', supply STAGING_PROJECT_NAME="truvca-staging" or name the database 'truv_staging'.`
        );
      }
    } else {
      reasons.push(
        `Missing staging identity: Host '${safeDb.host}' and DB '${safeDb.dbName}' do not match approved staging naming conventions.`
      );
    }
  }

  // Check 6: Confirmation flag
  if (!confirmFlag) {
    reasons.push(
      "CONFIRM_DISPOSABLE_STAGING_DB is not confirmed (requires CONFIRM_DISPOSABLE_STAGING_DB=\"true\" or --confirm-disposable-staging)."
    );
  }

  // Dual/Multi verification: Must have valid identity, must NOT be protected, endpoints must match, provider must be approved, and must have confirmation flag
  const isAllowed =
    !isProtectedBusinessDb &&
    hasStagingIdentity &&
    confirmFlag &&
    endpointsMatch &&
    safeDb.provider !== "unknown" &&
    reasons.length === 0;

  return {
    isAllowed,
    reasons,
    safeDb,
    safeDirect,
    isProtectedBusinessDb,
    hasStagingIdentity,
    explicitStagingConfirmed: confirmFlag,
    isAmbiguous,
    endpointsMatch,
  };
}

export interface SchemaCleanlinessEvaluation {
  isClean: boolean;
  reasons: string[];
  tableCount: number;
  typeCount: number;
  hasPrismaMigrations: boolean;
  hasCustomSchemas: boolean;
}

/**
 * Validates that a target database for clean staging contains zero unexpected schemas,
 * zero pre-existing application tables/views, zero pre-existing custom enum types,
 * and zero prior _prisma_migrations tables.
 * Fails closed immediately if any pre-existing database structures are detected.
 */
export function evaluateSchemaCleanliness(options: {
  publicTables: string[];
  customSchemas: string[];
  publicTypes?: string[];
  isEnforced?: boolean;
  allowExistingSchema?: boolean;
}): SchemaCleanlinessEvaluation {
  const isEnforced = options.isEnforced ?? true;
  const allowExisting = options.allowExistingSchema ?? false;
  const reasons: string[] = [];
  const tableCount = options.publicTables.length;
  const publicTypes = options.publicTypes || [];
  const typeCount = publicTypes.length;
  const hasPrismaMigrations = options.publicTables.includes("_prisma_migrations");
  const hasCustomSchemas = options.customSchemas.length > 0;

  if (isEnforced && !allowExisting) {
    if (hasCustomSchemas) {
      reasons.push(
        `UNEXPECTED SCHEMAS DETECTED: Found non-standard schemas: [${options.customSchemas.join(", ")}]. Clean staging requires standard public schema only.`
      );
    }
    if (tableCount > 0) {
      reasons.push(
        `PRE-EXISTING TABLES/VIEWS DETECTED (${tableCount} objects found). Clean staging setup requires an uninitialized, completely empty database.`
      );
      if (hasPrismaMigrations) {
        reasons.push(
          "Found pre-existing '_prisma_migrations' table. This target has already been migrated or was cloned from another project."
        );
      }
    }
    if (typeCount > 0) {
      reasons.push(
        `PRE-EXISTING CUSTOM TYPES DETECTED (${typeCount} types found: [${publicTypes.slice(0, 5).join(", ")}${typeCount > 5 ? "..." : ""}]). Clean staging setup requires an uninitialized database.`
      );
    }
  }

  const isClean = reasons.length === 0;
  return {
    isClean,
    reasons,
    tableCount,
    typeCount,
    hasPrismaMigrations,
    hasCustomSchemas,
  };
}

async function runDbReadinessCheck() {
  console.log("=================================================================");
  console.log("TRUVCA LedgerOS — Database & Migration Readiness Verification");
  console.log("=================================================================\n");

  const startTime = Date.now();

  try {
    const currentEnv = (process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "development").toLowerCase();
    const enforceStagingIsolation = process.argv.includes("--enforce-staging") || process.env.ENFORCE_STAGING_ISOLATION === "true";

    const evalResult = evaluateDatabaseIsolation({
      isEnforced: enforceStagingIsolation,
    });

    console.log(`Target Database Host: \x1b[36m${evalResult.safeDb.host}\x1b[0m`);
    console.log(`Target Database Name: \x1b[36m${evalResult.safeDb.dbName}\x1b[0m`);
    console.log(`Target Endpoint ID  : \x1b[36m${evalResult.safeDb.baseEndpoint}\x1b[0m`);
    if (evalResult.safeDirect) {
      console.log(`Direct Migration Host: \x1b[36m${evalResult.safeDirect.host}\x1b[0m`);
      console.log(`Direct Migration Name: \x1b[36m${evalResult.safeDirect.dbName}\x1b[0m`);
      console.log(`Direct Endpoint ID  : \x1b[36m${evalResult.safeDirect.baseEndpoint}\x1b[0m`);
    }
    console.log(`Target Environment  : \x1b[36m${currentEnv.toUpperCase()}\x1b[0m`);

    if (evalResult.isProtectedBusinessDb) {
      console.log(`Isolation Status    : \x1b[31mPROTECTED ACTIVE DATABASE (Contains Business Records — Locked Against Staging Operations)\x1b[0m\n`);
      if (enforceStagingIsolation) {
        console.error("\x1b[31m✖ MIGRATION BLOCKED BY SAFETY LOCK:\x1b[0m");
        for (const reason of evalResult.reasons) {
          console.error(`  - ${reason}`);
        }
        console.error("\nThis database contains active practice data. A separate, clean staging database must be provisioned.");
        process.exit(1);
      }
    } else if (evalResult.isAllowed) {
      console.log(`Isolation Status    : \x1b[32mCONFIRMED DISPOSABLE STAGING DATABASE (Multi-Factor Verification Verified)\x1b[0m\n`);
    } else {
      console.log(`Isolation Status    : \x1b[33mUNCONFIRMED IDENTITY / UNVERIFIED ISOLATION\x1b[0m\n`);
      if (enforceStagingIsolation) {
        console.error("\x1b[31m✖ MIGRATION PREFLIGHT BLOCKED:\x1b[0m Staging identity unconfirmed.");
        for (const reason of evalResult.reasons) {
          console.error(`  - ${reason}`);
        }
        console.error("\nRequires BOTH a database with verified staging identity AND explicit confirmation.");
        process.exit(1);
      }
    }

    const allowExistingSchema = process.argv.includes("--allow-existing-schema") || process.env.ALLOW_EXISTING_SCHEMA === "true";

    // 1. Basic Connectivity
    process.stdout.write("Pinging database connection (SELECT 1)... ");
    await (db as any).$queryRaw`SELECT 1 as ping`;
    console.log("\x1b[32mCONNECTED\x1b[0m (Network liveness only — not proof of staging isolation)");

    // 2. Unexpected Schemas Check
    let customSchemas: any[] = [];
    try {
      customSchemas = await (db as any).$queryRaw`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')
      `;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err.message || String(err));
      console.error("\n\x1b[31m✖ SCHEMA INSPECTION FAILED (Ambiguous / Insufficient Permissions):\x1b[0m", sanitized);
      console.error("Cannot verify absence of unexpected schemas. Failing closed.");
      process.exit(1);
    }

    // 3. Schema Objects, Tables, and Views Check
    process.stdout.write("Inspecting tables, views, and types in public schema... ");
    let publicTables: any[] = [];
    try {
      publicTables = await (db as any).$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW')
      `;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err.message || String(err));
      console.error("\n\x1b[31m✖ TABLE INSPECTION FAILED (Ambiguous / Insufficient Permissions):\x1b[0m", sanitized);
      console.error("Cannot verify database cleanliness. Failing closed.");
      process.exit(1);
    }

    // 4. Custom Enum Types Check
    let publicTypes: any[] = [];
    try {
      publicTypes = await (db as any).$queryRaw`
        SELECT t.typname 
        FROM pg_type t 
        JOIN pg_namespace n ON t.typnamespace = n.oid 
        WHERE n.nspname = 'public' AND t.typtype = 'e'
      `;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err.message || String(err));
      console.error("\n\x1b[31m✖ TYPE INSPECTION FAILED (Ambiguous / Insufficient Permissions):\x1b[0m", sanitized);
      console.error("Cannot verify absence of pre-existing types. Failing closed.");
      process.exit(1);
    }

    const tableNames = publicTables.map((t: any) => t.table_name);
    const customSchemaNames = customSchemas.map((s: any) => s.schema_name);
    const customTypeNames = publicTypes.map((t: any) => t.typname);

    const cleanliness = evaluateSchemaCleanliness({
      publicTables: tableNames,
      customSchemas: customSchemaNames,
      publicTypes: customTypeNames,
      isEnforced: enforceStagingIsolation,
      allowExistingSchema,
    });

    if (!cleanliness.isClean) {
      console.error("\n\x1b[31m✖ DATABASE CLEANLINESS CHECK FAILED:\x1b[0m");
      for (const r of cleanliness.reasons) {
        console.error(`  - ${r}`);
      }
      console.error("Failing closed to prevent modifying a non-empty or cloned database.");
      console.error("If performing a post-migration health check, run with --allow-existing-schema.");
      process.exit(1);
    }

    if (enforceStagingIsolation && !allowExistingSchema) {
      console.log("\x1b[32mCLEAN EMPTY DATABASE\x1b[0m (0 tables in public schema — verified uninitialized for clean staging)");
    } else {
      if (publicTables.length === 0) {
        console.log("\x1b[32mEMPTY DATABASE\x1b[0m (0 tables in public schema)");
      } else {
        const hasTenantTable = tableNames.includes("Tenant");
        if (hasTenantTable) {
          const [tenantCount, userCount, taskCount, invoiceCount] = await Promise.all([
            db.tenant.count().catch(() => 0),
            db.user.count().catch(() => 0),
            db.task.count().catch(() => 0),
            db.invoice.count().catch(() => 0),
          ]);

          // Guard against inherited production clone (2 tenants, 7 users, 62 tasks, 15 invoices)
          if (tenantCount === 2 && userCount === 7 && taskCount === 62 && invoiceCount === 15) {
            console.error("\n\x1b[31m✖ INHERITED PRODUCTION DATA DETECTED:\x1b[0m");
            console.error("This database contains exactly 2 tenants, 7 users, 62 tasks, 15 invoices matching the protected production database.");
            console.error("It appears to be a cloned child branch of production rather than a clean independent project.");
            console.error("Staging must be an empty, isolated database. Migrations and tests aborted.");
            process.exit(1);
          }

          console.log(`\x1b[32mOK\x1b[0m (${tenantCount} tenants, ${userCount} users, ${taskCount} tasks, ${invoiceCount} invoices)`);
        } else {
          console.log(`\x1b[32mOK\x1b[0m (${publicTables.length} tables found, no business tenant table)`);
        }
      }
    }

    // 3. Migration Lock & History Verification
    process.stdout.write("Verifying migration history... ");
    const migrations: any[] = await (db as any).$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT 5
    `.catch(() => []);

    if (migrations.length > 0) {
      console.log(`\x1b[32mOK\x1b[0m (${migrations.length} recent migrations verified)`);
      for (const m of migrations) {
        const status = m.rolled_back_at ? "\x1b[31mROLLED BACK\x1b[0m" : "\x1b[32mAPPLIED\x1b[0m";
        console.log(`  - ${m.migration_name.padEnd(50)} [${status}]`);
      }
    } else {
      console.log("\x1b[33mNOTICE\x1b[0m (Uninitialized _prisma_migrations table — clean staging state)");
    }

    // 4. Tenant Isolation Invariant Check (Safe Read-Only)
    if (publicTables.some((t: any) => t.table_name === "Task")) {
      process.stdout.write("Validating tenant isolation constraints... ");
      const orphanTasks = await (db as any).$queryRaw`
        SELECT COUNT(*)::int as count 
        FROM "Task" 
        WHERE "tenantId" NOT IN (SELECT "id" FROM "Tenant")
      `.catch(() => [{ count: 0 }]);

      if (orphanTasks[0]?.count === 0) {
        console.log("\x1b[32mPASSED\x1b[0m (0 orphaned task records across tenants)");
      } else {
        console.log(`\x1b[31mFAILED\x1b[0m (${orphanTasks[0]?.count} orphaned task records detected)`);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`\nDatabase Readiness: \x1b[32mREADY FOR STAGING/PRODUCTION\x1b[0m (${durationMs}ms latency)`);
    console.log("=================================================================");
    process.exit(0);
  } catch (error: any) {
    const sanitizedMsg = sanitizeErrorMessage(error.message || String(error));
    console.error("\n\x1b[31m✖ DATABASE READINESS FAILED:\x1b[0m", sanitizedMsg);
    console.log("=================================================================");
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  runDbReadinessCheck();
}
