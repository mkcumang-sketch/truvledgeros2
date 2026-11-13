# TRUV LedgerOS documentation index

## Current release authority

- PRODUCTION_READINESS_STATUS.md — current release status, exact remediation changes, mandatory configuration, migration safety and remaining release gates.
- TRUVCA_DEPLOYMENT_RUNBOOK.md — historical operator runbook; cross-check every command against the current release status before use.
- TRUVCA_ENV_CONFIGURATION_MATRIX.md — historical environment matrix; the current mandatory production variables are defined in PRODUCTION_READINESS_STATUS.md and enforced by src/lib/server/env.ts.

## Architecture and product documentation

- architecture.md — historical architecture overview.
- DESIGN_SYSTEM.md — UI tokens and component design direction.
- development-phases.md — historical phase plan.
- FEATURE_IMPLEMENTATION_MATRIX.md — historical feature inventory; verify each feature against current code and provider status.
- N8N_DEPLOYMENT_GUIDE.md — automation deployment notes; activate only after the core outbox and cron checks pass.

## Security, migration and operations evidence

- PROJECT_TRUTH_AUDIT.md — historical project audit.
- TRUV_LEDGEROS_PHASE2A_REPORT.md through TRUV_LEDGEROS_PHASE2K_3_TENANT_AUTH_REPORT.md — phase-specific historical audit records.
- TRUVCA_P0_REMEDIATION_REPORT.md and TRUVCA_SECURITY_AND_TENANT_ISOLATION_QA.md — historical security evidence; not substitutes for current CI.
- TRUVCA_DATABASE_DEPLOYMENT_READINESS.md and TRUVCA_RELEASE_BLOCKERS.md — historical release assessments.

## Historical evidence policy

Phase reports and QA summaries are retained for traceability. Their dates, test counts, routes, environment assumptions and deployment statuses describe the state at the time they were written. They must not be interpreted as current green release gates unless re-run and re-verified against the exact commit being released.
