# TRUV LedgerOS — Super Admin (Godmode) Bootstrap Architecture

**Document Reference**: `SEC-BOOTSTRAP-2026-11`  
**Classification**: System Administration & Disaster Recovery Guide  
**Author**: Antigravity Autonomous DevSecOps & Security Architecture Team  
**Status**: ACTIVE STANDARD  

---

## 1. Single Sovereign Root Model

TRUV LedgerOS enforces a **Single Sovereign Root Authority** security model:
- Exactly one root Super Admin (`isSuperAdmin: true`) exists at any given time.
- The root Super Admin holds global platform sovereignty across all tenants and workspaces.
- Access to the `/godmode` control plane requires either `isSuperAdmin: true` or an active `Role.GODMODE_ADMIN` membership in an active, un-suspended tenant.
- No self-promotion is possible: regular firm owners and administrators cannot elevate themselves or others to Super Admin.

---

## 2. Verified Root Super Admin Identity

The active production root authority has been verified and established:
- **Identifier**: `cmwnw228b00028nx6xwix1tby`
- **Email**: `us7081569@gmail.com`
- **Name**: `Umang sharma`
- **Platform Authority**: `isSuperAdmin: true`
- **Tenant Scope**: `TRUV` (`truv`)
- **Tenant Role**: `FIRM_OWNER`
- **Audit Verification**: `SUPERADMIN_ESTABLISHED` recorded in immutable `AuditLog` table.

---

## 3. Bootstrap & Recovery Tooling

TRUV LedgerOS provides two audited, repeat-safe CLI utilities for administrative management:

### 3.1 `scripts/auth-bootstrap.ts` (Clean-Slate Bootstrap)
Designed for cold-start database provisioning:
- **Serializable Isolation**: Runs inside a `Serializable` transaction to prevent race conditions.
- **Single-Admin Invariant**: Refuses execution if any user with `isSuperAdmin: true` already exists.
- **Hidden Input / Environment Sourcing**: Accepts credentials via masked CLI prompt (`ask()`) or environment variables (`TRUV_BOOTSTRAP_ADMIN_EMAIL`, `TRUV_BOOTSTRAP_ADMIN_PASSWORD`).
- **Never Commits Secrets**: Zero default credentials in source code.

```bash
# Dry Run (Validates environment & parameters without writing)
npx ts-node -r tsconfig-paths/register scripts/auth-bootstrap.ts

# Production Execution
npx ts-node -r tsconfig-paths/register scripts/auth-bootstrap.ts --execute
```

### 3.2 `scripts/setup-admin.ts` (Existing Account Setup & Recovery)
Designed for account recovery, password resets, and existing user privilege assignment:
- **Parity Gate**: Automatically verifies database host against production blacklists.
- **Interactive Safeguard**: Enforces typing `"CONFIRM_PRODUCTION"` when targeting production environments.
- **Session Revocation**: Automatically wipes all active sessions upon password reset or privilege change.
- **Audit Event**: Records `ADMIN_SETUP_CLI` or `ADMIN_PASSWORD_RESET` audit event.

```bash
# Promote existing account to Super Admin
ADMIN_EMAIL="us7081569@gmail.com" npx ts-node -r tsconfig-paths/register scripts/setup-admin.ts --superadmin --execute
```

---

## 4. Security Invariants Enforced

1. **Password Standards**: Minimum 16 characters for bootstrap, bcrypt salted with 12 rounds.
2. **Session Termination**: Any modification to administrator credentials immediately flushes all active sessions from the database.
3. **Audit Trail**: Every elevation or password alteration is permanently recorded with timestamp, target ID, and actor identity.
