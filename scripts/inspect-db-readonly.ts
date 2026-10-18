import { db } from "../src/lib/db";
import { parseDbCoordinates, PROTECTED_BUSINESS_HOSTS } from "./db-readiness";
import dotenv from "dotenv";

dotenv.config();

/**
 * TRUVCA LedgerOS — Safe Read-Only Database Inspection Tool
 * 
 * Strict Guarantees:
 * 1. Read-only queries strictly against information_schema and pg_catalog / pg_stat.
 * 2. Enforces session-level read-only mode (SET default_transaction_read_only = on).
 * 3. Never prints credentials, passwords, or tokens.
 * 4. Fails closed if pointing to blacklisted protected business endpoint.
 * 5. Evaluates endpoint parity between DATABASE_URL and DIRECT_URL.
 */
async function inspectDatabaseReadOnly() {
  console.log("=================================================================");
  console.log("TRUVCA LedgerOS — Safe Read-Only Database Inspection");
  console.log("=================================================================\n");

  const rawDbUrl = process.env.DATABASE_URL || "";
  const rawDirectUrl = process.env.DIRECT_URL || "";

  const safeDb = parseDbCoordinates(rawDbUrl);
  const safeDirect = rawDirectUrl ? parseDbCoordinates(rawDirectUrl) : undefined;

  console.log("--- [1] Connection Target & Endpoint Parity ---");
  console.log(`DATABASE_URL Host       : \x1b[36m${safeDb.host}\x1b[0m`);
  console.log(`DATABASE_URL Port       : \x1b[36m${safeDb.port}\x1b[0m`);
  console.log(`DATABASE_URL Database   : \x1b[36m${safeDb.dbName}\x1b[0m`);
  console.log(`DATABASE_URL Endpoint ID: \x1b[36m${safeDb.baseEndpoint}\x1b[0m`);
  console.log(`DATABASE_URL Pooled     : \x1b[36m${safeDb.host.includes("-pooler")}\x1b[0m`);

  if (safeDirect) {
    console.log(`DIRECT_URL Host         : \x1b[36m${safeDirect.host}\x1b[0m`);
    console.log(`DIRECT_URL Port         : \x1b[36m${safeDirect.port}\x1b[0m`);
    console.log(`DIRECT_URL Database     : \x1b[36m${safeDirect.dbName}\x1b[0m`);
    console.log(`DIRECT_URL Endpoint ID  : \x1b[36m${safeDirect.baseEndpoint}\x1b[0m`);
    const endpointsMatch = safeDb.baseEndpoint === safeDirect.baseEndpoint;
    const dbNamesMatch = safeDb.dbName === safeDirect.dbName;
    console.log(`Endpoint Parity Match   : ${endpointsMatch ? "\x1b[32mMATCHED\x1b[0m" : "\x1b[31mMISMATCHED\x1b[0m"}`);
    console.log(`Database Name Match     : ${dbNamesMatch ? "\x1b[32mMATCHED\x1b[0m" : "\x1b[31mMISMATCHED\x1b[0m"}`);
  } else {
    console.log(`DIRECT_URL              : \x1b[33mUNSET in environment\x1b[0m (Required for Prisma Migrate)`);
  }

  // Safety Gate: Permanent Blacklist Protection
  const isProtectedDb = PROTECTED_BUSINESS_HOSTS.some(
    (h) => safeDb.host.includes(h) || safeDb.baseEndpoint.includes(h)
  );
  const isProtectedDirect = safeDirect && PROTECTED_BUSINESS_HOSTS.some(
    (h) => safeDirect.host.includes(h) || safeDirect.baseEndpoint.includes(h)
  );

  if (isProtectedDb || isProtectedDirect) {
    console.error("\n\x1b[31m✖ TARGET DATABASE IS ON THE PROTECTED BUSINESS BLACKLIST:\x1b[0m");
    console.error(`Endpoint matches protected host. Inspection aborted for safety.`);
    process.exit(1);
  }

  console.log(`Blacklist Lockout Check : \x1b[32mPASSED\x1b[0m (Not on protected business host list)`);
  console.log(`Credentials Protection  : \x1b[32mREDACTED\x1b[0m (Zero secrets or passwords displayed)\n`);

  try {
    // Enforce read-only at session level
    await (db as any).$executeRawUnsafe("SET default_transaction_read_only = on;");

    // Query 1: Schemas
    console.log("--- [2] Non-System Schemas ---");
    const schemas: { schema_name: string }[] = await (db as any).$queryRaw`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name ASC;
    `;

    if (schemas.length === 0) {
      console.log("No custom schemas found.");
    } else {
      schemas.forEach((s, idx) => {
        console.log(`  ${idx + 1}. \x1b[33m${s.schema_name}\x1b[0m`);
      });
    }

    // Query 2: Tables and Views per Schema
    console.log("\n--- [3] Tables & Views Inventory (by Schema) ---");
    const tables: {
      table_schema: string;
      table_name: string;
      table_type: string;
    }[] = await (db as any).$queryRaw`
      SELECT 
        table_schema, 
        table_name, 
        table_type 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY table_schema ASC, table_name ASC;
    `;

    if (tables.length === 0) {
      console.log("\x1b[32mNo tables or views found (Completely empty database).\x1b[0m");
    } else {
      const bySchema: Record<string, { name: string; type: string }[]> = {};
      for (const t of tables) {
        if (!bySchema[t.table_schema]) {
          bySchema[t.table_schema] = [];
        }
        bySchema[t.table_schema].push({ name: t.table_name, type: t.table_type });
      }

      for (const [schema, tbls] of Object.entries(bySchema)) {
        console.log(`Schema [\x1b[33m${schema}\x1b[0m] (${tbls.length} objects):`);
        for (const tbl of tbls) {
          console.log(`  - ${tbl.name} \x1b[90m(${tbl.type})\x1b[0m`);
        }
      }
    }

    // Query 3: Approximate Row Counts
    console.log("\n--- [4] Approximate Row Counts (pg_stat_user_tables) ---");
    const statTables: {
      schemaname: string;
      relname: string;
      n_live_tup: bigint | number;
    }[] = await (db as any).$queryRaw`
      SELECT 
        schemaname, 
        relname, 
        n_live_tup
      FROM pg_stat_user_tables
      ORDER BY schemaname ASC, relname ASC;
    `;

    if (statTables.length === 0) {
      console.log("No user table statistics recorded.");
    } else {
      for (const st of statTables) {
        console.log(`  - ${st.schemaname}.${st.relname}: ~${st.n_live_tup} rows`);
      }
    }

    // Query 4: Custom Enum Types
    console.log("\n--- [5] Custom Enum Types ---");
    const enums: {
      schema_name: string;
      enum_name: string;
      enum_values: string;
    }[] = await (db as any).$queryRaw`
      SELECT 
        n.nspname AS schema_name,
        t.typname AS enum_name,
        array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ', ') AS enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname, t.typname;
    `;

    if (enums.length === 0) {
      console.log("No custom enum types found.");
    } else {
      for (const e of enums) {
        console.log(`  - ${e.schema_name}.${e.enum_name} [${e.enum_values}]`);
      }
    }

    console.log("\n=================================================================");
    console.log("\x1b[32m✔ Inspection completed successfully using read-only SQL queries.\x1b[0m");
    console.log("=================================================================");
  } catch (error: any) {
    console.error("\n\x1b[31m✖ READ-ONLY INSPECTION FAILED:\x1b[0m", error.message || error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  inspectDatabaseReadOnly();
}
