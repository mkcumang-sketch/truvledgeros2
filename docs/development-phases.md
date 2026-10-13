# TRUV LedgerOS — 9-Phase Development Roadmap

This document outlines the structured phasing strategy for building **TRUV LedgerOS** into an enterprise-grade, multi-tenant SaaS platform for Indian CA and accounting practices.

---

## Phase Breakdown

### Phase 1: Foundation (Current Phase)
* **Goal**: Establish the production foundation, Next.js App Router scaffolding, 25-model Prisma schema, compound multi-tenant indexes, seed system, environment templates, and SaaS layout shell.
* **Deliverables**:
  - Full project scaffolding (Next.js, TypeScript, Tailwind CSS, Prisma, Zod, Lucide).
  - 25 normalized database models in `prisma/schema.prisma`.
  - Comprehensive seed fixtures in `prisma/seed.ts` (Godmode admin, demo CA firm, staff roles, clients, invoices, GST returns, tasks).
  - Clean application shell with sidebar, topbar, tenant context chip, and placeholder module routes.
  - Architecture documentation.

### Phase 2: Multi-Tenancy & RBAC Engine
* **Goal**: Implement server-side tenant resolution, session-based context, and role-based access control.
* **Scope**:
  - NextAuth / Auth.js session handling with secure HTTP-only cookies.
  - 7 practice roles (`GODMODE_ADMIN`, `FIRM_OWNER`, `FIRM_ADMIN`, `PARTNER`, `MANAGER`, `EXECUTIVE`, `CLIENT`).
  - Automated cross-tenant read/write/delete isolation tests.

### Phase 3: CRM, Billing & Payment Recovery
* **Goal**: Build Client 360, Invoicing with approval thresholds, and Payment Recovery ladder.
* **Scope**:
  - Client directory with GSTIN validation and financial balance tracking.
  - Sequential GST invoicing, multi-rate tax calculations, partner approval limit (`approvalThreshold`), and accounting sync.
  - Overdue aging ladder (Gentle, Firm, Final Notice, Partner Escalation) and promise-to-pay logging.

### Phase 4: GST Compliance & Document Collection
* **Goal**: Operationalize return pipeline and document chasing workflows.
* **Scope**:
  - GSTR-1 and GSTR-3B monthly cycles, data intake verification, net tax liability calculation, and client sign-off (reply YES).
  - Customizable document checklists, reminder counter, and team call escalations.

### Phase 5: AI Support Desk & Indic Language Engine
* **Goal**: Multi-channel support assistant with tenant-isolated knowledge retrieval.
* **Scope**:
  - Web chat, WhatsApp, and Sarvam AI voice integration.
  - Indic language detection (Hindi, Hinglish, English).
  - Live invoice and tax status database tool calling.
  - Human handoff queue with task creation for out-of-scope/legal queries.

### Phase 6: Central n8n Automation Bridge
* **Goal**: Bi-directional event integration with external n8n workflow engine.
* **Scope**:
  - Event bus (`automation_events`) with retry-safe idempotency keys.
  - Outbound webhook dispatcher with HMAC-SHA256 signature verification.
  - Authenticated internal callback API `/api/v1/internal/automation-callback`.

### Phase 7: Godmode Administration & SaaS Billing
* **Goal**: Platform-level fleet governance and subscription management.
* **Scope**:
  - Superadmin dashboard for multi-firm fleet telemetry and tenant lifecycle management.
  - Subscription tiers (`TRIAL`, `STARTER`, `PROFESSIONAL`, `ENTERPRISE`) with resource metering.

### Phase 8: Settings, Security Hardening & Credential Vault
* **Goal**: Firm configuration and encryption vault.
* **Scope**:
  - AES-256-GCM encrypted storage for third-party API credentials.
  - Practice branding, notification preferences, and audit logs.
  - Security headers, rate limiting, and input sanitization.

### Phase 9: Production Hardening & Verification
* **Goal**: End-to-end quality assurance and deployment readiness.
* **Scope**:
  - Automated test suites (cross-tenant isolation, IDOR resistance, signature verification).
  - Performance tuning and load testing.
  - Final production build verification.
