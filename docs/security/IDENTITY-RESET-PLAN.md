# TRUV LedgerOS — Enterprise Identity Reset & Account Audit Plan

**Document Reference**: `SEC-IDRESET-2026-11`  
**Classification**: Operational Security Protocol  
**Author**: Antigravity Autonomous DevSecOps & Security Architecture Team  
**Status**: COMPLETED & VERIFIED  

---

## 1. Objective & Scope

The identity reset plan governs the controlled sanitization and audit of all user identities in TRUV LedgerOS to ensure that:
1. No unvetted, test, deprecated, or rogue accounts remain in the database.
2. Only verified, authorized enterprise personnel retain platform credentials.
3. Zero loss or corruption occurs to business transactional data (clients, invoices, documents, tasks, ledger entries).
4. A single sovereign root Super Admin identity is established as the baseline for all subsequent invitations.

---

## 2. Account Discovery & Classification

A direct database scan was executed across the `User`, `Membership`, `Tenant`, `Session`, and `Invitation` entities.

### Account Census & Classification Matrix

| Email | User ID | Current Role | Tenant | Classification | Disposition / Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `us7081569@gmail.com` | `cmwnw228b00028nx6xwix1tby` | `FIRM_OWNER` & `SuperAdmin` | `TRUV` (`truv`) | **AUTHORIZED ROOT AUTHORITY** | **PRESERVED & ELEVATED**: Verified founding practice owner; promoted to `isSuperAdmin: true`. |

### Zero Contamination Finding
- The database contained **no test users**, **no unauthorized demo accounts**, and **no legacy external identities**.
- There were 0 stale invitations and 0 orphan password reset tokens.
- Transactional tables (`Client`, `Invoice`, `Task`, `Communication`) contain 0 records, confirming that no test mock data contaminated the production database.

---

## 3. Data Preservation Protocols (Zero-Loss Guarantee)

To guarantee that business records are never harmed during identity maintenance or cleanup:
1. **Explicit Deletion Isolation**:
   - The cleanup engine (`scripts/auth-cleanup.ts`) is architecturally restricted to authentication tables (`Session`, `PasswordResetToken`, `Membership`, `User`).
   - Transactional business tables (`Client`, `Invoice`, `Task`, `Document`, `AuditLog`) are structurally excluded from automated deletion cascades.
2. **Notification Detachment**:
   - If an account is ever deleted, foreign key references in `Notification` records are detached (`userId: null`) rather than cascading deletion, ensuring audit history remains immutable.
3. **Pre-Execution Mandatory Backup**:
   - In production environments, `auth-cleanup.ts` enforces a verified database backup via `pg_dump` and `pg_restore` verification before any record alteration can take place.

---

## 4. Post-Reset Identity Management Policy

With public registration permanently closed, the only legitimate ways an identity can be established in TRUV LedgerOS are:
1. **Root Super Admin Bootstrap**: One-time script-driven creation or elevation via `scripts/auth-bootstrap.ts` or `scripts/setup-admin.ts`.
2. **Administrator Invitation**: An active `FIRM_OWNER` or `FIRM_ADMIN` invites a user through `/team`, generating a cryptographically hashed, time-limited (48h) token.
3. **Platform Godmode Provisioning**: Super Admin creates or invites users directly from `/godmode` under the Enterprise User Access tab.
