# TRUV LedgerOS — Enterprise RBAC & Authorization Architecture

**Document Reference**: `SEC-RBAC-2026-11`  
**Classification**: System Architecture Specification  
**Author**: Antigravity Autonomous DevSecOps & Security Architecture Team  
**Status**: ACTIVE STANDARD  

---

## 1. Overview & Principles

TRUV LedgerOS enforces a **Defense-in-Depth, Deny-by-Default** Role-Based Access Control (RBAC) model.
- **Server Authoritative**: Client UI state, cookie parameters, or query strings never grant permissions. Every action, mutation, and sensitive query validates permissions at the server layer.
- **Deny-by-Default**: Any role or permission not explicitly defined is strictly rejected.
- **Tenant Scoping**: All operations require an authenticated tenant context (`requireTenant()`). Cross-tenant access is structurally impossible.

---

## 2. Role Taxonomy & Hierarchy

```
       [ GODMODE_ADMIN / Platform Super Admin ]
                         │
                   [ FIRM_OWNER ]
                         │
                   [ FIRM_ADMIN ]
                         │
                    [ PARTNER ]
                         │
                    [ MANAGER ]
                         │
                   [ EXECUTIVE ]
                         │
                    [ CLIENT ]
```

### Role Descriptions
1. **`GODMODE_ADMIN`**: Global platform administrator. Has unrestricted `*` wildcard access across all platform configurations, tenants, feature flags, and administrative controls.
2. **`FIRM_OWNER`**: Managing Partner / Founding Owner of the practice firm tenant. Has unrestricted `*` access within their tenant scope, including subscription billing, partner demotion, and firm destruction.
3. **`FIRM_ADMIN`**: Operational practice administrator. Manages team members, practice settings, automations, and operational data, but cannot demote or alter the `FIRM_OWNER`.
4. **`PARTNER`**: Senior practicing Chartered Accountant. Can approve institutional invoices, manage high-value clients, and access practice-wide reports.
5. **`MANAGER`**: Engagement lead / Senior Associate. Assigns tasks, approves workflows, initiates client calling campaigns, and prepares filings.
6. **`EXECUTIVE`**: Associate / Articled Assistant. Executes assigned tasks, prepares draft invoices and GST returns, and uploads working paper documents.
7. **`CLIENT`**: External corporate client user. Restricted strictly to the Client Portal for viewing approved invoices, payments, and uploading requested documents.

---

## 3. Resource & Action Permission Matrix

The 15 protected resource domains:
`dashboard`, `clients`, `invoices`, `payments`, `gst`, `tasks`, `documents`, `reports`, `team`, `settings`, `automations`, `audit_logs`, `subscription`, `calling`, `security`.

| Resource | Action | GODMODE / OWNER | FIRM_ADMIN | PARTNER | MANAGER | EXECUTIVE | CLIENT |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`dashboard`** | `view` | Full | Full | Full | Full | Full | Denied |
| **`clients`** | `view` | Full | Full | Full | Full | Assigned | Denied |
| | `create` / `edit` | Full | Full | Full | Full | Denied | Denied |
| | `export` / `delete` | Full | Full | Export | Denied | Denied | Denied |
| **`invoices`** | `view` | Full | Full | Full | Full | Full | Portal Only |
| | `create` / `edit` | Full | Full | Full | Full | Create | Denied |
| | `approve` | Full | Full | Full | Denied | Denied | Denied |
| | `delete` | Full | Full | Denied | Denied | Denied | Denied |
| **`tasks`** | `view` | Full | Full | Full | Full | Assigned | Denied |
| | `create` / `edit` | Full | Full | Full | Full | Edit Assigned | Denied |
| | `approve` | Full | Full | Full | Full | Denied | Denied |
| **`calling`** | `view` | Full | Full | Full | Full | Full | Denied |
| | `create` / `trigger` | Full | Full | Full | Full | Denied | Denied |
| | `manage_campaigns` | Full | Full | Full | Denied | Denied | Denied |
| **`security`** | `view_logs` | Full | Full | Full | Denied | Denied | Denied |
| | `revoke_sessions` | Full | Full | Denied | Denied | Denied | Denied |
| **`team`** | `view` | Full | Full | Full | Full | Denied | Denied |
| | `invite` / `edit` | Full | Full | Denied* | Denied | Denied | Denied |
| **`settings`** | `manage` | Full | Full | Denied | Denied | Denied | Denied |

*\* Can be granted via custom permission override.*

---

## 4. Custom Granular Permissions Engine

Every `Membership` record supports a JSON column `permissions: Json?` (e.g., `{"team:invite": true, "invoices:delete": false}`).
- When evaluated by `hasPermission(role, resource, action, { customPermissions })`:
  1. An explicit boolean `false` immediately revokes the capability (even if the role naturally has it).
  2. An explicit boolean `true` grants the capability to that specific individual.
  3. Otherwise, the standard role default applies.

---

## 5. Privilege Escalation Defense Matrix

Enforced in `canManageMemberRole(actorRole, targetCurrentRole, targetNewRole)`:

| Actor Role | Target Current Role | Requested New Role | Allowed? | Enforced Security Rule |
| :--- | :--- | :--- | :---: | :--- |
| Any non-Godmode | Any | `GODMODE_ADMIN` | **NO** | Only Platform Super Admin can grant Godmode |
| Any non-Godmode | `GODMODE_ADMIN` | Any | **NO** | Only Platform Super Admin can alter Godmode |
| `FIRM_ADMIN` | `FIRM_OWNER` | Any | **NO** | Firm Admin cannot alter or demote Firm Owner |
| `FIRM_ADMIN` | `PARTNER` | `FIRM_OWNER` | **NO** | Only Firm Owner can transfer or grant Owner privileges |
| `FIRM_ADMIN` | `EXECUTIVE` | `MANAGER` | **YES** | Firm Admin can manage practice staff |
| `MANAGER` / `EXEC` | Any | Any | **NO** | Non-administrative roles cannot manage team members |
