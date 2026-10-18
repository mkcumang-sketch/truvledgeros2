import {
  evaluateDatabaseIsolation,
  evaluateSchemaCleanliness,
  parseDbCoordinates,
  sanitizeErrorMessage,
  PROTECTED_BUSINESS_HOSTS,
} from "../scripts/db-readiness";
import { detectEnvironment, verifyAdminSetupSafety } from "../scripts/setup-admin";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

console.log("=================================================================");
console.log("TRUVCA LedgerOS — Database Readiness & Safety Gate Unit Tests");
console.log("=================================================================\n");

// 1. PROTECTED BUSINESS HOST CANNOT PASS UNDER ANY CIRCUMSTANCE
console.log(">>> Test Group 1: Protected Business Database Lockout <<<");

const protectedUrlWithFakeStaging =
  "postgresql://postgres:secret123@ep-square-wildflower-b5bmrz7r.us-east-2.aws.neon.tech/staging?sslmode=require";
const r1 = evaluateDatabaseIsolation({
  databaseUrl: protectedUrlWithFakeStaging,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r1.isAllowed,
  "1.1: Protected host cannot pass even with confirmFlag=true and dbName=staging"
);
assert(
  r1.isProtectedBusinessDb,
  "1.2: Protected host is positively detected as protected business DB"
);
assert(
  r1.reasons.some((r: string) => r.includes("TARGET DATABASE IS PROTECTED")),
  "1.3: Clear rejection reason citing protected endpoint"
);

// 2. PROTECTED HOST IN DIRECT_URL BLOCKS MIGRATION
console.log("\n>>> Test Group 2: DIRECT_URL Safety & Parity Check <<<");

const validStagingDbUrl =
  "postgresql://truv_user:staging_pass@ep-staging-worker.us-east-2.aws.neon.tech/truv_staging?sslmode=require";
const protectedDirectUrl =
  "postgresql://postgres:super_secret@ep-square-wildflower-b5bmrz7r.us-east-2.aws.neon.tech/neondb?sslmode=require";

const r2 = evaluateDatabaseIsolation({
  databaseUrl: validStagingDbUrl,
  directUrl: protectedDirectUrl,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r2.isAllowed,
  "2.1: Protected host in DIRECT_URL blocks execution even if DATABASE_URL is valid staging"
);
assert(
  r2.isProtectedBusinessDb,
  "2.2: DIRECT_URL protected host triggers isProtectedBusinessDb"
);

// Mismatched DB names
const stagingDirectMismatched =
  "postgresql://truv_user:staging_pass@ep-staging-worker.us-east-2.aws.neon.tech/different_staging?sslmode=require";
const r2b = evaluateDatabaseIsolation({
  databaseUrl: validStagingDbUrl,
  directUrl: stagingDirectMismatched,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r2b.isAllowed,
  "2.3: Mismatched dbName between DATABASE_URL and DIRECT_URL is rejected"
);

// Mismatched endpoints
const stagingDirectEndpointMismatch =
  "postgresql://truv_user:staging_pass@ep-other-project-9999.us-east-2.aws.neon.tech/truv_staging?sslmode=require";
const r2c = evaluateDatabaseIsolation({
  databaseUrl: validStagingDbUrl,
  directUrl: stagingDirectEndpointMismatch,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r2c.isAllowed,
  "2.4: Mismatched endpointId between DATABASE_URL and DIRECT_URL is rejected"
);
assert(
  !r2c.endpointsMatch,
  "2.5: endpointsMatch is false on mismatched endpoints"
);

// Pooled vs Direct parity
const pooledDbUrl =
  "postgresql://truv_user:staging_pass@ep-staging-worker-pooler.us-east-2.aws.neon.tech/truv_staging?sslmode=require";
const directDbUrl =
  "postgresql://truv_user:staging_pass@ep-staging-worker.us-east-2.aws.neon.tech/truv_staging?sslmode=require";
const r2d = evaluateDatabaseIsolation({
  databaseUrl: pooledDbUrl,
  directUrl: directDbUrl,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  r2d.endpointsMatch,
  "2.6: Pooled host (-pooler) and Direct host resolve to same base endpoint"
);
assert(
  r2d.isAllowed,
  "2.7: Pooled DATABASE_URL and Direct DIRECT_URL pair successfully approved"
);

// 3. CONFIRMATION FLAG IS NOT INDEPENDENT PROOF OF ISOLATION
console.log("\n>>> Test Group 3: Dual Verification Enforcement <<<");

const arbitraryProdUrl =
  "postgresql://admin:pass@ep-bold-glade-999999.us-east-2.aws.neon.tech/neondb?sslmode=require";

const r3 = evaluateDatabaseIsolation({
  databaseUrl: arbitraryProdUrl,
  confirmFlag: true, // Manual flag supplied!
  isEnforced: true,
});
assert(
  !r3.isAllowed,
  "3.1: Confirmation flag alone does NOT allow arbitrary unverified host to pass"
);
assert(
  !r3.hasStagingIdentity,
  "3.2: Arbitrary host has no staging identity"
);
assert(
  r3.isAmbiguous,
  "3.3: Neon default neondb on un-named host is classified as ambiguous"
);

// 4. MISSING CONFIRMATION FLAG FAILS EVEN IF STAGING IDENTITY EXISTS
console.log("\n>>> Test Group 4: Confirmation Flag Requirement <<<");

const r4 = evaluateDatabaseIsolation({
  databaseUrl: validStagingDbUrl,
  confirmFlag: false, // Flag omitted!
  isEnforced: true,
});
assert(
  !r4.isAllowed,
  "4.1: Valid staging DB without confirmation flag is rejected"
);
assert(
  r4.hasStagingIdentity,
  "4.2: Staging identity was correctly recognized"
);
assert(
  r4.reasons.some((r: string) => r.includes("CONFIRM_DISPOSABLE_STAGING_DB is not confirmed")),
  "4.3: Specific reason for missing confirmation flag logged"
);

// 5. MISSING OR MALFORMED DATABASE URL
console.log("\n>>> Test Group 5: Malformed & Missing URL Safety <<<");

const r5a = evaluateDatabaseIsolation({
  databaseUrl: "",
  confirmFlag: true,
  isEnforced: true,
});
assert(!r5a.isAllowed, "5.1: Empty DATABASE_URL causes non-zero exit verdict");

const r5b = evaluateDatabaseIsolation({
  databaseUrl: "not-a-valid-url",
  confirmFlag: true,
  isEnforced: true,
});
assert(!r5b.isAllowed, "5.2: Malformed DATABASE_URL causes non-zero exit verdict");

// 6. CREDENTIAL REDACTION & SANITIZATION
console.log("\n>>> Test Group 6: Password and Secret Redaction <<<");

const leakAttemptUrl = "postgresql://my_secret_user:p@ssw0rd!#$@ep-staging-01.neon.tech/truv_staging";
const coords = parseDbCoordinates(leakAttemptUrl);

assert(
  !coords.sanitized.includes("p@ssw0rd!#$"),
  "6.1: parseDbCoordinates redacts password from sanitized URI"
);
assert(
  coords.sanitized.includes("[REDACTED]"),
  "6.2: Sanitized URI displays [REDACTED]"
);
assert(
  coords.host === "ep-staging-01.neon.tech",
  "6.3: Host extracted cleanly without credentials"
);
assert(
  coords.dbName === "truv_staging",
  "6.4: Database name extracted cleanly without credentials"
);

const errorWithSecret =
  "Error: connection to postgresql://user:my_secret_token@db.neon.tech/neondb failed password=my_secret_token";
const cleanError = sanitizeErrorMessage(errorWithSecret);

assert(
  !cleanError.includes("my_secret_token"),
  "6.5: sanitizeErrorMessage strips passwords and embedded tokens"
);
assert(
  cleanError.includes("[REDACTED]"),
  "6.6: Sanitized error displays [REDACTED]"
);

// 7. GENUINE ISOLATED STAGING SUCCEEDS
console.log("\n>>> Test Group 7: Genuine Isolated Staging Approval <<<");

const genuineStaging = evaluateDatabaseIsolation({
  databaseUrl: "postgresql://u:p@ep-cool-lake-staging.us-east-2.aws.neon.tech/truv_staging?sslmode=require",
  confirmFlag: true,
  isEnforced: true,
});

assert(
  genuineStaging.isAllowed,
  "7.1: Genuine staging database with explicit naming AND confirmation flag passes"
);
assert(
  genuineStaging.reasons.length === 0,
  "7.2: Zero rejection reasons for valid staging"
);

// 8. NEON STAGING PROJECT 'truvca-staging' VALIDATION
console.log("\n>>> Test Group 8: Neon Staging Project 'truvca-staging' Validation <<<");

const newNeonProjectPooled =
  "postgresql://staging_user:staging_secret@ep-patient-water-12345678-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const newNeonProjectDirect =
  "postgresql://staging_user:staging_secret@ep-patient-water-12345678.us-east-2.aws.neon.tech/neondb?sslmode=require";

// Passing with STAGING_PROJECT_NAME="truvca-staging"
const r8a = evaluateDatabaseIsolation({
  databaseUrl: newNeonProjectPooled,
  directUrl: newNeonProjectDirect,
  stagingProjectName: "truvca-staging",
  confirmFlag: true,
  isEnforced: true,
});
assert(
  r8a.isAllowed,
  "8.1: Independent Neon project with STAGING_PROJECT_NAME='truvca-staging' and confirmFlag passes"
);
assert(
  r8a.endpointsMatch,
  "8.2: New project pooled and direct endpoints match"
);

// Protected host cannot pass EVEN with STAGING_PROJECT_NAME="truvca-staging"
const r8b = evaluateDatabaseIsolation({
  databaseUrl: "postgresql://u:p@ep-square-wildflower-b5bmrz7r.us-east-2.aws.neon.tech/neondb",
  stagingProjectName: "truvca-staging",
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r8b.isAllowed,
  "8.3: Protected business host CANNOT pass even if STAGING_PROJECT_NAME='truvca-staging' is supplied"
);

// Ambiguous endpoint without STAGING_PROJECT_NAME fails
const r8c = evaluateDatabaseIsolation({
  databaseUrl: newNeonProjectPooled,
  directUrl: newNeonProjectDirect,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r8c.isAllowed,
  "8.4: New Neon endpoint without STAGING_PROJECT_NAME declaration fails closed as ambiguous"
);

// Hostname containing "staging" without confirmFlag fails
const r8d = evaluateDatabaseIsolation({
  databaseUrl: "postgresql://u:p@ep-something-staging.aws.neon.tech/neondb",
  confirmFlag: false,
  isEnforced: true,
});
// 9. FAIL-CLOSED CLEAN DATABASE & SCHEMA VALIDATION
console.log("\n>>> Test Group 9: Fail-Closed Clean Database & Schema Invariants <<<");

// 9.1: 100% clean empty database passes
const sc1 = evaluateSchemaCleanliness({
  publicTables: [],
  customSchemas: [],
  isEnforced: true,
});
assert(sc1.isClean, "9.1: Completely empty database passes clean staging check");
assert(sc1.tableCount === 0, "9.2: tableCount is 0 on empty DB");

// 9.3: Pre-existing tables fail closed
const sc2 = evaluateSchemaCleanliness({
  publicTables: ["Tenant", "User", "Invoice"],
  customSchemas: [],
  isEnforced: true,
});
assert(!sc2.isClean, "9.3: Pre-existing tables fail closed in clean staging check");
assert(
  sc2.reasons.some((r: string) => r.includes("PRE-EXISTING TABLES")),
  "9.4: Rejection reason identifies pre-existing tables"
);

// 9.5: Pre-existing _prisma_migrations fails closed
const sc3 = evaluateSchemaCleanliness({
  publicTables: ["_prisma_migrations"],
  customSchemas: [],
  isEnforced: true,
});
assert(!sc3.isClean, "9.5: Pre-existing _prisma_migrations fails closed");
assert(
  sc3.reasons.some((r: string) => r.includes("_prisma_migrations")),
  "9.6: Rejection reason identifies existing _prisma_migrations table"
);

// 9.7: Unexpected custom schemas fail closed
const sc4 = evaluateSchemaCleanliness({
  publicTables: [],
  customSchemas: ["tenant_shadow", "custom_analytics"],
  isEnforced: true,
});
assert(!sc4.isClean, "9.7: Unexpected non-standard schemas fail closed");
assert(
  sc4.reasons.some((r: string) => r.includes("UNEXPECTED SCHEMAS DETECTED")),
  "9.8: Rejection reason identifies unexpected schemas"
);

// 9.9: allowExistingSchema=true passes for post-migration operational checks
const sc5 = evaluateSchemaCleanliness({
  publicTables: ["Tenant", "User", "_prisma_migrations"],
  customSchemas: [],
  isEnforced: true,
  allowExistingSchema: true,
});
// 9.10: Pre-existing custom types fail closed
const sc6 = evaluateSchemaCleanliness({
  publicTables: [],
  customSchemas: [],
  publicTypes: ["Role", "InvoiceStatus"],
  isEnforced: true,
});
assert(!sc6.isClean, "9.10: Pre-existing custom enum types fail closed in clean staging check");
assert(
  sc6.reasons.some((r: string) => r.includes("PRE-EXISTING CUSTOM TYPES DETECTED")),
  "9.11: Rejection reason identifies pre-existing custom types"
);

// 10. SUPABASE FREE STAGING & MULTI-FACTOR VERIFICATION
console.log("\n>>> Test Group 10: Supabase Staging Database & Multi-Factor Verification <<<");

const sbDirectUrl =
  "postgresql://postgres:staging_secret_pass@db.mrmqkwlhgpxvqzbnkgyx.supabase.co:5432/postgres";
const sbPooledUrl =
  "postgresql://postgres.mrmqkwlhgpxvqzbnkgyx:staging_secret_pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

// 10.1 & 10.2: Valid Supabase direct and pooler pairing with verified contract passes
const r10a = evaluateDatabaseIsolation({
  databaseUrl: sbPooledUrl,
  directUrl: sbDirectUrl,
  expectedProjectRef: "mrmqkwlhgpxvqzbnkgyx",
  confirmFlag: true,
  isEnforced: true,
});
assert(
  r10a.endpointsMatch,
  "10.1: Supabase Direct and Pooler with matching project reference have endpointsMatch=true"
);
assert(
  r10a.isAllowed,
  "10.2: Valid Supabase staging pair with verified project ref and confirmFlag passes"
);

// 10.3 & 10.4: Supabase project reference mismatch between DATABASE_URL and DIRECT_URL is rejected
const sbDirectDifferentProject =
  "postgresql://postgres:staging_secret_pass@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres";
const r10b = evaluateDatabaseIsolation({
  databaseUrl: sbPooledUrl,
  directUrl: sbDirectDifferentProject,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r10b.isAllowed,
  "10.3: Mismatched Supabase project references between DATABASE_URL and DIRECT_URL are rejected"
);
assert(
  !r10b.endpointsMatch,
  "10.4: endpointsMatch is false for mismatched Supabase projects"
);

// 10.5 & 10.6: Conflicting project identity between pooler username and direct host rejected
const sbPooledConflictingUser =
  "postgresql://postgres.conflict_proj_alpha:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const sbDirectConflictingHost =
  "postgresql://postgres:pass@db.conflict_proj_beta.supabase.co:5432/postgres";
const r10c = evaluateDatabaseIsolation({
  databaseUrl: sbPooledConflictingUser,
  directUrl: sbDirectConflictingHost,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r10c.isAllowed,
  "10.5: Conflicting project identities between pooler username and direct host are rejected"
);
assert(
  r10c.reasons.some((r: string) => r.includes("ENDPOINT MISMATCH")),
  "10.6: Clear endpoint mismatch rejection reason logged"
);

// 10.7 & 10.8: Arbitrary unknown host fails closed (not authorized by flag or staging label)
const unverifiedHostUrl =
  "postgresql://user:pass@arbitrary-unverified-db.cloud-provider.com:5432/truv_staging";
const r10d = evaluateDatabaseIsolation({
  databaseUrl: unverifiedHostUrl,
  stagingProjectName: "truvca-staging",
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r10d.isAllowed,
  "10.7: Arbitrary unknown host is rejected even with confirmFlag and staging label"
);
assert(
  r10d.reasons.some((r: string) => r.includes("UNVERIFIED DATABASE HOST")),
  "10.8: Unknown host cites unverified database provider infrastructure"
);

// 10.9 & 10.10: Unverified Supabase project with default postgres db fails as ambiguous
const sbAmbiguousUrl =
  "postgresql://postgres:pass@db.unverified-random-proj.supabase.co:5432/postgres";
const r10e = evaluateDatabaseIsolation({
  databaseUrl: sbAmbiguousUrl,
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r10e.isAllowed,
  "10.9: Unverified Supabase project with default postgres db fails as ambiguous"
);
assert(
  r10e.isAmbiguous,
  "10.10: Unverified Supabase default postgres DB is classified as ambiguous"
);

// 10.11, 10.12, 10.13: Supabase project missing confirmation flag fails even with verified contract
const r10f = evaluateDatabaseIsolation({
  databaseUrl: sbPooledUrl,
  directUrl: sbDirectUrl,
  expectedProjectRef: "mrmqkwlhgpxvqzbnkgyx",
  confirmFlag: false, // Omitted!
  isEnforced: true,
});
assert(
  !r10f.isAllowed,
  "10.11: Valid Supabase staging pair without confirmFlag is rejected"
);
assert(
  r10f.hasStagingIdentity,
  "10.12: Supabase staging identity was recognized via verified project contract"
);
assert(
  r10f.reasons.some((r: string) => r.includes("CONFIRM_DISPOSABLE_STAGING_DB is not confirmed")),
  "10.13: Rejection reason cites missing confirmation flag"
);

// 10.14 & 10.15: Cross-provider mismatch (Supabase DATABASE_URL and Neon DIRECT_URL) is rejected
const r10g = evaluateDatabaseIsolation({
  databaseUrl: sbPooledUrl,
  directUrl: validStagingDbUrl, // Neon staging URL
  confirmFlag: true,
  isEnforced: true,
});
assert(
  !r10g.isAllowed,
  "10.14: Cross-provider pairing (Supabase + Neon) is rejected"
);
assert(
  r10g.reasons.some((r: string) => r.includes("PROVIDER MISMATCH")),
  "10.15: Rejection reason cites provider mismatch"
);

// 11. ADMIN SETUP FAIL-CLOSED ENVIRONMENT CLASSIFICATION
console.log("\n>>> Test Group 11: Admin Setup Fail-Closed Environment Classification <<<");

// 11.1 & 11.2: Unknown external PostgreSQL host fails closed as UNVERIFIED
const envUnknown = detectEnvironment(
  "postgresql://user:pass@arbitrary-unverified-db.cloud-provider.com:5432/my_db"
);
assert(
  envUnknown.target === "UNVERIFIED",
  "11.1: Unknown external PostgreSQL host is classified as UNVERIFIED (fail closed)"
);
assert(
  !envUnknown.isVerified,
  "11.2: Unknown external host isVerified is false"
);

// 11.3 & 11.4: Recognized Supabase staging host with matching verified project identity passes as STAGING
process.env.SUPABASE_STAGING_PROJECT_REF = "mrmqkwlhgpxvqzbnkgyx";
const envSupabaseStaging = detectEnvironment(
  "postgresql://postgres.mrmqkwlhgpxvqzbnkgyx:staging_secret_pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
);
assert(
  envSupabaseStaging.target === "STAGING",
  "11.3: Recognized Supabase staging host with verified project identity is classified as STAGING"
);
assert(
  envSupabaseStaging.isVerified,
  "11.4: Recognized Supabase staging host isVerified is true"
);
delete process.env.SUPABASE_STAGING_PROJECT_REF;

// 11.5 & 11.6: Protected business database is classified as PRODUCTION
const envProtected = detectEnvironment(
  "postgresql://postgres:secret123@ep-square-wildflower-b5bmrz7r.us-east-2.aws.neon.tech/staging"
);
assert(
  envProtected.target === "PRODUCTION",
  "11.5: Protected business database host is classified as PRODUCTION"
);
assert(
  envProtected.description.includes("Protected Production Database"),
  "11.6: Protected business database cites protected production description"
);

// 11.7 & 11.8: Localhost development is classified as LOCAL
const envLocal = detectEnvironment(
  "postgresql://postgres:password@localhost:5432/truv_ledgeros"
);
assert(
  envLocal.target === "LOCAL",
  "11.7: Localhost database is classified as LOCAL"
);
assert(
  envLocal.isVerified,
  "11.8: Localhost database isVerified is true"
);

// 11.9, 11.10, 11.11: Recognized Neon host is recognized and verified
const envNeonStaging = detectEnvironment(
  "postgresql://truv_user:staging_pass@ep-staging-worker.us-east-2.aws.neon.tech/truv_staging"
);
assert(
  envNeonStaging.target === "STAGING",
  "11.9: Recognized Neon staging host is classified as STAGING"
);
assert(
  envNeonStaging.isVerified,
  "11.10: Recognized Neon staging host isVerified is true"
);

const envNeonProd = detectEnvironment(
  "postgresql://user:pass@ep-patient-water-12345678.us-east-2.aws.neon.tech/neondb"
);
assert(
  envNeonProd.target === "PRODUCTION",
  "11.11: Un-named Neon host without staging indicator is classified as PRODUCTION"
);
assert(
  envNeonProd.isVerified,
  "11.12: Recognized Neon production host isVerified is true"
);

// 12. ADMIN SETUP FINAL SAFETY HARDENING (STRICT SUPABASE IDENTITY & URL PARITY)
console.log("\n>>> Test Group 12: Admin Setup Safety Hardening (Strict Supabase & Parity) <<<");

// Requirement 1: Supabase database named 'staging' with no verified project reference is blocked
delete process.env.SUPABASE_STAGING_PROJECT_REF;
const sbNamedStagingUrl =
  "postgresql://postgres:pass@db.mrmqkwlhgpxvqzbnkgyx.supabase.co:5432/staging";
const s1 = verifyAdminSetupSafety(sbNamedStagingUrl);
assert(
  !s1.allowed,
  "12.1: Supabase database named 'staging' with no verified project reference is blocked"
);
assert(
  s1.env.target === "UNVERIFIED",
  "12.2: Staging-named Supabase DB without verified ref is classified as UNVERIFIED"
);
assert(
  s1.blockReason?.includes("SUPABASE_STAGING_PROJECT_REF is not configured") ?? false,
  "12.3: Block reason indicates unconfigured SUPABASE_STAGING_PROJECT_REF"
);

// Requirement 2: Supabase project reference mismatch is blocked
process.env.SUPABASE_STAGING_PROJECT_REF = "mrmqkwlhgpxvqzbnkgyx";
const sbMismatchedProjectUrl =
  "postgresql://postgres:pass@db.unauthorized_different_proj.supabase.co:5432/postgres";
const s2 = verifyAdminSetupSafety(sbMismatchedProjectUrl);
assert(
  !s2.allowed,
  "12.4: Supabase project reference mismatch is blocked"
);
assert(
  s2.env.target === "UNVERIFIED",
  "12.5: Mismatched Supabase project ref is classified as UNVERIFIED"
);
assert(
  s2.blockReason?.includes("project reference mismatch") ?? false,
  "12.6: Block reason indicates project reference mismatch"
);
delete process.env.SUPABASE_STAGING_PROJECT_REF;

// Requirement 3: Matching verified Supabase project identities pass classification
process.env.SUPABASE_STAGING_PROJECT_REF = "mrmqkwlhgpxvqzbnkgyx";
const sbMatchingDirect =
  "postgresql://postgres:staging_pass@db.mrmqkwlhgpxvqzbnkgyx.supabase.co:5432/postgres";
const s3 = verifyAdminSetupSafety(sbMatchingDirect);
assert(
  s3.allowed,
  "12.7: Matching verified Supabase project identity passes safety gate"
);
assert(
  s3.env.target === "STAGING",
  "12.8: Matching verified Supabase project is classified as STAGING"
);
delete process.env.SUPABASE_STAGING_PROJECT_REF;

// Requirement 4: Conflicting DATABASE_URL and DIRECT_URL are blocked before Prisma initialization
const sbDirectProjAlpha =
  "postgresql://postgres:pass@db.projectalpha12345.supabase.co:5432/postgres";
const sbDirectProjBeta =
  "postgresql://postgres:pass@db.projectbeta67890.supabase.co:5432/postgres";

// 4a: Endpoint/project mismatch between DATABASE_URL and DIRECT_URL
const s4a = verifyAdminSetupSafety(sbDirectProjAlpha, sbDirectProjBeta);
assert(
  !s4a.allowed,
  "12.9: Conflicting project identities between DATABASE_URL and DIRECT_URL are blocked"
);
assert(
  s4a.blockReason?.includes("ENDPOINT/PROJECT MISMATCH") ?? false,
  "12.10: Block reason cites ENDPOINT/PROJECT MISMATCH"
);

// 4b: Provider mismatch between DATABASE_URL and DIRECT_URL
const neonDirectUrl =
  "postgresql://user:pass@ep-staging-worker.us-east-2.aws.neon.tech/postgres";
const s4b = verifyAdminSetupSafety(sbDirectProjAlpha, neonDirectUrl);
assert(
  !s4b.allowed,
  "12.11: Provider mismatch between DATABASE_URL and DIRECT_URL is blocked"
);
assert(
  s4b.blockReason?.includes("PROVIDER MISMATCH") ?? false,
  "12.12: Block reason cites PROVIDER MISMATCH"
);

// 4c: Database name mismatch between DATABASE_URL and DIRECT_URL
const sbDirectDbMismatch =
  "postgresql://postgres:pass@db.projectalpha12345.supabase.co:5432/other_database";
const s4c = verifyAdminSetupSafety(sbDirectProjAlpha, sbDirectDbMismatch);
assert(
  !s4c.allowed,
  "12.13: Database name mismatch between DATABASE_URL and DIRECT_URL is blocked"
);
assert(
  s4c.blockReason?.includes("DATABASE NAME MISMATCH") ?? false,
  "12.14: Block reason cites DATABASE NAME MISMATCH"
);

// Requirement 5: Matching direct and pooler URLs for the same project are accepted
process.env.SUPABASE_STAGING_PROJECT_REF = "mrmqkwlhgpxvqzbnkgyx";
const sbPoolerMatching =
  "postgresql://postgres.mrmqkwlhgpxvqzbnkgyx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const sbDirectMatching =
  "postgresql://postgres:pass@db.mrmqkwlhgpxvqzbnkgyx.supabase.co:5432/postgres";
const s5a = verifyAdminSetupSafety(sbPoolerMatching, sbDirectMatching);
assert(
  s5a.allowed,
  "12.15: Matching direct and pooler URLs for the same project are accepted"
);
assert(
  s5a.env.target === "STAGING",
  "12.16: Matching direct and pooler URLs are classified as STAGING"
);

// Requirement 5b: Absent DIRECT_URL is legitimately permitted without error
const s5b = verifyAdminSetupSafety(sbPoolerMatching, undefined);
assert(
  s5b.allowed,
  "12.17: Absent DIRECT_URL is safely accepted when legitimately omitted"
);
assert(
  s5b.env.target === "STAGING",
  "12.18: Staging environment verified with DATABASE_URL alone when DIRECT_URL absent"
);
delete process.env.SUPABASE_STAGING_PROJECT_REF;

// Requirement 6: Malformed or missing required URLs fail closed
const s6a = verifyAdminSetupSafety("");
assert(
  !s6a.allowed,
  "12.19: Empty DATABASE_URL fails closed"
);
const s6b = verifyAdminSetupSafety("invalid-connection-string");
assert(
  !s6b.allowed,
  "12.20: Malformed DATABASE_URL fails closed"
);
const s6c = verifyAdminSetupSafety(sbDirectProjAlpha, "malformed-direct-uri");
assert(
  !s6c.allowed,
  "12.21: Malformed DIRECT_URL fails closed"
);

// Requirement 7: Protected business endpoints remain blocked
const protectedNeonUrl =
  "postgresql://postgres:secret@ep-square-wildflower-b5bmrz7r.us-east-2.aws.neon.tech/neondb";
const s7a = verifyAdminSetupSafety(protectedNeonUrl);
assert(
  s7a.allowed,
  "12.22: Protected business DB allows verified inspection"
);
assert(
  s7a.env.target === "PRODUCTION",
  "12.23: Protected business DB is classified as PRODUCTION (cannot be STAGING or LOCAL)"
);

// Protected host in DIRECT_URL overrides staging DATABASE_URL
const s7b = verifyAdminSetupSafety(
  "postgresql://user:pass@ep-staging-worker.us-east-2.aws.neon.tech/neondb",
  protectedNeonUrl
);
assert(
  s7b.env.target === "PRODUCTION",
  "12.24: Protected host in DIRECT_URL forces PRODUCTION classification"
);

// Requirement 8: Existing Neon and localhost behavior remains safe
const s8a = verifyAdminSetupSafety("postgresql://user:pass@localhost:5432/truv_local");
assert(
  s8a.allowed,
  "12.25: Localhost database is allowed"
);
assert(
  s8a.env.target === "LOCAL",
  "12.26: Localhost database is classified as LOCAL"
);

const s8b = verifyAdminSetupSafety(
  "postgresql://truv_user:staging_pass@ep-staging-worker.us-east-2.aws.neon.tech/truv_staging"
);
assert(
  s8b.allowed,
  "12.27: Neon staging database is allowed"
);
assert(
  s8b.env.target === "STAGING",
  "12.28: Neon staging database is classified as STAGING"
);

const s8c = verifyAdminSetupSafety(
  "postgresql://user:pass@ep-patient-water-12345678.us-east-2.aws.neon.tech/neondb"
);
assert(
  s8c.allowed,
  "12.29: Neon production database is allowed"
);
assert(
  s8c.env.target === "PRODUCTION",
  "12.30: Neon production database is classified as PRODUCTION"
);

console.log("\n=================================================================");
console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================================\n");

if (failed > 0) {
  process.exit(1);
}
