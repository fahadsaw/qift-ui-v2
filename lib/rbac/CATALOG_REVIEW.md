# RBAC Catalog — Review & Reference

Read-only review of the RBAC catalog landed in PR 1 (permissions, roles,
role-permission map) and PR 2 (`hasPermission` backward-compat helper).
This document is descriptive, not prescriptive — it explains the catalog
as it stands, flags concerns, and points to the migration path.

**Status:** documentation only. No runtime behavior changes from this PR.

---

## 1. Permission domains

Permissions are compile-time string constants grouped into eight
domains. Identifiers are dotted (`<scope>.<action>` or
`<scope>.<subject>.<action>`); dots are organizational only and the
authorization layer treats each permission as opaque.

| Domain | Count | Purpose | Example |
|---|---|---|---|
| `ADMIN_PERMISSIONS` | 15 | `/admin` access + moderation (mirrors `lib/opsRoles.ts`) | `admin.access`, `store.review`, `report.resolve` |
| `FINANCE_PERMISSIONS` | 9 | Payouts, reserves, fee / shipping / reserve config | `finance.read_payouts`, `finance.approve_payout` |
| `REVIEW_PERMISSIONS` | 3 | Accountant + legal Stage 10 sign-off | `review.read_status`, `review.sign_off_accountant` |
| `AUDIT_PERMISSIONS` | 2 | Append-only operator-action log | `audit.read`, `audit.export` |
| `FLAG_PERMISSIONS` | 3 | Feature-flag registry + dual-approval gate | `flag.read`, `flag.write_financial` |
| `MERCHANT_PERMISSIONS` | 16 | Per-merchant operational surface | `merchant.products.write`, `merchant.team.write` |
| `MERCHANT_FINANCE_PERMISSIONS` | 2 | Per-merchant financial dashboard | `merchant_finance.read_own` |
| `USER_PERMISSIONS` | 12 | Standard end-user actions | `user.profile.read`, `user.send_gift` |

**62 permissions total.**

### Naming convention

The first segment is the **subject being acted upon**, not the actor.
Examples:
- `user.read` — admin reads a user record (admin is the actor)
- `user.profile.read` — the user reads their own profile (user is the actor)
- `merchant.products.write` — someone on a merchant team writes a product
- `merchant_finance.read_own` — someone on a merchant team reads their
  own merchant's finance data

Who actually holds the permission is determined by `ROLE_PERMISSIONS`.
See [§ 6 finding F-3](#f-3-user-namespace-overload) — this convention
is consistent but easily confused.

---

## 2. Role groups

Roles are grouped by domain. The catalog defines **21 roles**.

### Legacy roles (3)

Backward-compat for the current `user.role` field. Every existing
account already implicitly holds exactly one of these.

| Role | Maps from `user.role` | Permission set |
|---|---|---|
| `legacy_admin` | `'admin'` | ALL admin-side permissions (≡ `super_admin`) |
| `legacy_store` | `'store'` | ALL merchant-side permissions (≡ `merchant_owner`) |
| `legacy_user` | `'user'`, null, undefined, unknown | ALL user permissions (≡ `user_standard`) |

Kept distinct from `super_admin` / `merchant_owner` / `user_standard`
so that a later migration (legacy_admin → ops_admin, for example) is
observable in the audit log.

### QIFT roles (11)

QIFT-staff roles. First eight mirror `lib/opsRoles.ts` identically
(same names, same permission scope). The last three are new.

| Role | Source | Notes |
|---|---|---|
| `super_admin` | opsRoles.ts | Holds every admin-side permission |
| `operations_manager` | opsRoles.ts | Moderation + diagnostics |
| `finance` | opsRoles.ts | Legacy / current-ops finance role — mirrors `lib/opsRoles.ts` exactly (5 perms + `admin.access`). Holders gain no new rights when guards migrate to permission checks. |
| `merchant_review` | opsRoles.ts | Store approval queue |
| `support` | opsRoles.ts | Read-only with diagnostics |
| `trust_safety` | opsRoles.ts | Reports + suspensions |
| `fulfillment_ops` | opsRoles.ts | Read store detail + diagnostics |
| `analytics_viewer` | opsRoles.ts | Analytics read only |
| `accountant_readonly` | **new** | Backs accountant Stage 10 sign-off (see [§ 6 finding F-2](#f-2-misleading-_readonly-suffix)) |
| `compliance_readonly` | **new** | Backs legal Stage 10 sign-off (see [§ 6 finding F-2](#f-2-misleading-_readonly-suffix)) |
| `finance_admin` | **new** | Expanded Stage 10 finance role — holds reserves, financial-config, payout-overview, reject_payout, audit visibility on top of `finance`. Granted only by explicit assignment in PR 11; never automatic. |

### Merchant roles (6)

Per FRP v1.1 § 9.6.3 + Stage 10 § 19 (W1). Names match the migration
note in `lib/merchantFinanceAccess.ts`.

| Role | Surface |
|---|---|
| `merchant_owner` | Full merchant surface |
| `merchant_owner_delegate` | Identical permissions to owner; distinct for audit-log attribution (see [§ 6 finding F-6](#f-6-merchant_owner_delegate-has-no-permission-distinction)) |
| `merchant_finance` | Orders + analytics read + merchant_finance read/request_review |
| `merchant_accountant_readonly` | Orders + analytics read + merchant_finance.read_own |
| `merchant_manager` | Operational surface (products, orders, theme, coverage, plan, visibility, analytics) — no finance |
| `merchant_staff` | Limited operational (read most, write orders + coverage only) |

### User roles (1)

| Role | Surface |
|---|---|
| `user_standard` | All user-side permissions |

---

## 3. Legacy mapping (current behavior equivalence)

The PR 2 helper `hasPermission(user, perm)` resolves a user's role via
`legacyRoleFor(user?.role)`, then consults `ROLE_PERMISSIONS`.

### Verified equivalences

**`user.role === 'admin'` → `legacy_admin`**

The legacy admin holds every admin-side permission:
- 15 admin / moderation permissions (the full ADMIN_PERMISSIONS set)
- 9 finance permissions (every payout / reserve / config right)
- 3 review permissions (read_status + both sign_off gates)
- 2 audit permissions
- 3 flag permissions

**Equivalent to current behavior**, where any account with
`user.role === 'admin'` can reach every part of `/admin` and every
admin endpoint. ✅ No drift.

> Note: this means every current admin holds `review.sign_off_accountant`,
> `review.sign_off_legal`, `flag.write_financial`, `finance.modify_reserve`,
> and `finance.write_financial_config`. Today this is fine because none of
> these permissions are wired into a real action — the surfaces that
> reference them are mock-only behind feature flags. Once Stage 10
> activates real finance writes, narrowing legacy_admin to a smaller set
> is the FIRST migration step. See [§ 5 migration path](#5-future-migration-path).

**`user.role === 'store'` → `legacy_store`**

Holds all 16 merchant operational permissions + 2 merchant_finance
permissions. Matches `canViewMerchantFinance(user)` in
`lib/merchantFinanceAccess.ts` (gates on `user.role === 'store'`). ✅
No drift.

**`user.role === 'user'` → `legacy_user`**

Holds all 12 user-side permissions. Matches the implicit "every signed-in
user can do user things" behavior of the current codebase. ✅ No drift.

**`null` / `undefined` / unknown role → `legacy_user`**

Fallback matches `roleHome.ts` which treats any unrecognized role as a
standard user. ✅ No drift.

### Behavior preservation table

| Current code pattern | Equivalent RBAC check |
|---|---|
| `user.role === 'admin'` | `hasPermission(user, 'admin.access')` |
| `user.role === 'store'` | `hasPermission(user, 'merchant.access')` |
| `canViewMerchantFinance(user)` | `hasPermission(user, 'merchant_finance.read_own')` |
| Server-side `OpsRoleGuard('finance.read_payouts')` | `hasPermission(user, 'finance.read_payouts')` (once a user holds a role that grants it) |

None of these substitutions has been made in code yet — PR 3+ migrates
guards endpoint-by-endpoint behind a kill-switch flag.

---

## 4. Coverage of current capability surfaces

| Surface | Gate today | Catalog permission |
|---|---|---|
| `/admin` page | `user.role === 'admin'` | `admin.access` |
| `/admin#users` operations | role check only | `user.read`, `user.set_role`, `user.suspend` |
| `/admin#stores` operations | role check only | `store.review`, `store.set_status`, `store.set_featured`, `store.set_plan` |
| `/admin#reports` | role check only | `report.read`, `report.resolve` |
| `/admin#team` | role + `user.assign_ops_role` (server) | `user.assign_ops_role` |
| `/admin#finance` | role check only | `finance.read_payouts`, `finance.record_payout_event`, `finance.approve_payout` |
| `/admin#diagnostics` | role check only | `diagnostics.read`, `diagnostics.run_seed` |
| `/admin#review-status` (mock) | flag + role | `review.read_status` |
| `/admin#financial-config` (mock) | flag + role | `finance.read_financial_config`, `finance.write_financial_config` |
| `/admin#payout-reserve-overview` (mock) | flag + role | `finance.read_payout_overview`, `finance.modify_reserve` |
| `/store-dashboard/*` | `user.role === 'store'` | `merchant.access` + per-section permissions |
| `/store-dashboard/finance` (mock) | flag + `canViewMerchantFinance` | `merchant_finance.read_own` |
| User-facing pages (profile, wishlist, send, etc.) | session only | individual `user.*` permissions |

Every current gate has a catalog permission ready to replace it.

---

## 5. Future migration path

Migration happens endpoint-by-endpoint behind a kill-switch flag. The
catalog is unwired today and shipping it caused no behavior change.

```
PR 1  — catalog (DONE)
PR 2  — hasPermission helper (DONE)
PR 3  — this review (DONE; documentation only)
PR 3a — finance role narrowed; finance_admin introduced (DONE; F-1)
PR 3b — lib/opsRoles.ts identifiers checked against RBAC catalog (DONE; F-9)

— Guard migration —
PR 4  — kill-switch flag rbac.permission_checks_enabled introduced
        (DONE; lib/rbac/permissionChecksFlag.ts; env-var override
        RBAC_PERMISSION_CHECKS_ENABLED; dev/test default ON, prod
        default OFF; UNCONSUMED — first guard migration is PR 5)
PR 5  — migrate one low-risk admin guard (e.g. /admin/system GET)
        behind the flag; verify no regression for ≥1 week in staging
PR 6  — migrate the remaining /admin/* read endpoints
PR 7  — migrate /admin/* mutation endpoints (one at a time, each
        observed for SoD-relevant audit-log signals)
PR 8  — migrate /store-dashboard/* endpoints
PR 9  — populate UserRoleAssignment for every existing account from
        user.role via legacyRoleFor; verify shadow-mode parity
PR 10 — flip rbac.permission_checks_enabled ON in prod
PR 11 — narrow legacy_admin to specific roles (super_admin for current
        super-admins, ops_admin / finance / finance_admin / etc. for
        the rest); identify operators who should hold the broader
        Stage 10 finance scope and assign finance_admin explicitly.
        The ONLY hand-edited migration.
PR 12 — deprecate user.role; treat it as a write-once compat column;
        new accounts get roles only via UserRoleAssignment
```

Each PR is independently revertable. The kill-switch flag is the safety
catch — flipping it OFF returns every guard to the legacy `user.role`
check while leaving the new infrastructure in place.

---

## 6. Findings

Non-blocking. None changes runtime behavior. Each is a documentation
fix or a follow-up worth scheduling but not gating the migration on.

### F-1: `finance` role scope expanded relative to opsRoles — **ADDRESSED (PR 3a)**

**Status:** resolved. The `finance` role now mirrors `lib/opsRoles.ts`
exactly (5 permissions + `admin.access`). The broader Stage 10 finance
set is held by a new role, `finance_admin`, which is granted to no
account by default.

#### Original concern

The PR 1 catalog had granted the `finance` role 13 permissions, eight
more than the legacy presentation catalog in `lib/opsRoles.ts`. When
guards migrated to permission checks (PR 5+), operators currently
holding `finance` would silently gain reserve, financial-config,
payout-overview, reject_payout, and audit rights they do not have
today.

#### Resolution

**`finance` (legacy / current-ops compatible)** — exactly matches
`lib/opsRoles.ts`, plus the new `admin.access` gate:

```
finance:
  - admin.access              (new catalog's /admin gate)
  - finance.read_payouts      (mirrors opsRoles.ts)
  - finance.record_payout_event
  - finance.approve_payout
  - store.read_detail
  - analytics.read
```

Holders gain NO new rights when guards migrate from the legacy role
check to permission checks. This is the safety guarantee that lets the
migration land without operator coordination.

**`finance_admin` (Stage 10 expanded)** — the broader role that
contains everything the PR 1 `finance` role had:

```
finance_admin:
  - admin.access
  - finance.read_payouts
  - finance.record_payout_event
  - finance.approve_payout
  - finance.reject_payout              (new)
  - finance.read_payout_overview       (new)
  - finance.read_reserves              (new)
  - finance.modify_reserve             (new)
  - finance.read_financial_config      (new)
  - finance.write_financial_config     (new)
  - store.read_detail
  - analytics.read
  - audit.read                         (new)
```

Granted to no account by default. Promotion from `finance` to
`finance_admin` is an explicit, audited assignment in PR 11.

The PR 11 migration step (narrow `legacy_admin` to specific roles)
now also includes: identify operators who should hold the broader
Stage 10 finance scope and assign them `finance_admin` explicitly.

### F-2: Misleading `_readonly` suffix on accountant / compliance roles

`accountant_readonly` holds `review.sign_off_accountant` and
`compliance_readonly` holds `review.sign_off_legal`. Both are write
actions. The `_readonly` suffix is contradicted by these permissions.

**Recommendation:** rename to `accountant` and `compliance_reviewer`
(or similar) in a follow-up PR. Catalog identifiers are still unwired,
so renaming is safe up to the day before PR 4.

### F-3: `user.*` namespace overload

The first segment of a permission identifier is the SUBJECT, not the
actor. So `user.read` (admin reads a user record) and
`user.profile.read` (user reads their own profile) are both valid and
consistent — but they are easily confused at a glance.

**Recommendation:** document this convention at the top of
`lib/rbac/permissions.ts` (one-paragraph addition; no rename). The
permission identifiers themselves are aligned with the existing backend
opsRoles catalog and should not be renamed unilaterally.

### F-4: Misleading SoD comment in permissions.ts

The catalog comment near `FINANCE_PERMISSIONS` reads:

> `approve_payout` + `reject_payout` are a SoD pair — held by distinct
> roles, enforced server-side later.

This is incorrect on two counts:
1. `approve_payout` and `reject_payout` are not a SoD pair — they are
   alternative decisions on the same payout, and both are decider
   actions. The role that approves is the same role that rejects.
2. The actual SoD constraint in QIFT payouts is **submitter ≠
   approver** — i.e. a user who recorded a payout event (via
   `finance.record_payout_event`) cannot also approve it. This is a
   runtime check on (actor_id, target_id) pairs, not a role-permission
   constraint.

In `ROLE_PERMISSIONS`, the `finance` role correctly holds all three
permissions (`record_payout_event`, `approve_payout`, `reject_payout`)
— the SoD constraint will be runtime-enforced when the migration
lands.

**Recommendation:** correct the comment in a follow-up PR. The
behavior and structure are correct; only the comment misleads.

### F-5: `merchant.team.write` has no scope concept in the catalog

`merchant.team.write` (held by `merchant_owner`) lets an owner assign
roles to other merchant team members. But scope (Store A's owner only
manages Store A's team) lives at the data layer, not in the catalog —
the catalog cannot express it.

**Impact:** none today. Worth documenting because the absence is
intentional and a future contributor might think they need to add a
scope attribute to permissions.

**Recommendation:** add a note in `permissions.ts` clarifying that
per-merchant scope is enforced at the data layer, not at the
permission level.

### F-6: `merchant_owner_delegate` has no permission distinction

`merchant_owner` and `merchant_owner_delegate` hold identical
permission sets (`ALL_MERCHANT_PERMISSIONS`). The role is intended
to give the audit log a way to distinguish "actions taken by the owner"
from "actions taken by a delegated authority", but the permission set
is the same.

**Impact:** none today. Worth keeping for audit-log granularity once
audit lands. Documenting here so it isn't mistaken for a redundant
role and removed.

### F-7: Granularity questions deferred

| Permission | Concern |
|---|---|
| `finance.modify_reserve` | Covers both `release` and `freeze` — actions with very different risk profiles. Splitting deferred until operations team feels the pain. |
| `finance.write_financial_config` | Covers fees + shipping + reserve rules. Splitting deferred. |
| `user.send_gift` | Covers the entire send/checkout flow. Coarse is fine for now. |
| `user.receive_gift` | "Receive" is something that happens TO a user; the permission gates the recipient-side UI (accept, view receipt, link delivery). Name is slightly off but functional. |

**Recommendation:** no action. Premature granularity is its own bug.

### F-8: Permissions present in the catalog but never granted to any role

Audit confirms every permission in `PERMISSIONS` is held by at least one
role:

- All admin/moderation permissions → `super_admin` + `legacy_admin`
- All finance permissions → `super_admin` + `legacy_admin` + `finance`
- All review permissions → `super_admin` + `legacy_admin` (plus per-role
  subsets in accountant / compliance)
- All audit permissions → `super_admin` + `legacy_admin` (`audit.read`
  also in `finance`, `accountant_readonly`, `compliance_readonly`)
- All flag permissions → `super_admin` + `legacy_admin`
- All merchant + merchant_finance permissions → `merchant_owner` +
  `merchant_owner_delegate` + `legacy_store` (subsets in narrower
  merchant roles)
- All user permissions → `user_standard` + `legacy_user`

**No orphan permissions.** ✅

### F-9: Coupling with `lib/opsRoles.ts` — **ADDRESSED (PR 3b)**

**Status:** resolved. `lib/opsRoles.ts` now depends on
`lib/rbac/permissions.ts` and `lib/rbac/roles.ts` as the source of
truth for identifier spelling.

#### Original concern

`lib/opsRoles.ts` and `lib/rbac/permissions.ts` defined overlapping
permission identifiers (`store.review`, `finance.read_payouts`,
etc.). A contributor editing one without the other could introduce
silent drift on shared strings.

#### Resolution

`lib/opsRoles.ts` was refactored as follows:

1. **`OPS_ROLES`** — now declared with
   `as const satisfies readonly QiftRole[]`, importing `QiftRole`
   from `lib/rbac/roles.ts`. Every role name in `OPS_ROLES` must
   exist in the unified `QIFT_ROLES` catalog; typos or stale names
   fail to compile.

2. **`OpsPermission`** — was a hand-maintained string-literal union.
   It is now DERIVED from a new exported tuple `OPS_PERMISSIONS`
   declared with `as const satisfies readonly Permission[]`,
   importing `Permission` from `lib/rbac/permissions.ts`. Every
   permission identifier in the tuple is verified against the
   unified `PERMISSIONS` catalog at compile time. The exported
   `OpsPermission` type retains its pre-refactor shape (same union
   members), so no consumer is affected. The new `OPS_PERMISSIONS`
   export is parallel to the pre-existing `OPS_ROLES` tuple — same
   pattern, additive only.

3. **`isOpsRole`, `permissionsFor`, `hasOpsPermission`,
   `PERMISSIONS_BY_ROLE`, `SUPER_ADMIN_ALL`** — unchanged in
   structure and behavior. They continue to operate on the same
   types and produce the same outputs.

#### What was deliberately NOT changed

`PERMISSIONS_BY_ROLE` and `SUPER_ADMIN_ALL` are **not** derived from
`lib/rbac/roleMap.ts`. `lib/opsRoles.ts` has a behavioural contract
with the **backend** ops-roles service (`apps/api/src/ops-roles/
ops-roles.ts`), not with the new frontend RBAC catalog. The drift
check eliminates spelling-level drift on shared identifiers, but
the **content** of each role's permission list remains manually
maintained to mirror the backend.

When the backend ops-roles service changes a role's permission set,
both `lib/opsRoles.ts` and `lib/rbac/roleMap.ts` must be updated to
match. This is the same maintenance posture as before PR 3b, just
with an added typecheck safety net.

#### Public API preservation

The only external consumer of `lib/opsRoles.ts` is
`app/admin/_sections/TeamSection.tsx`, which imports `OPS_ROLES`.
That tuple's runtime shape is identical pre- and post-refactor. All
other exports retain their identical type signatures. No import
breaks.

#### Followup

The two catalogs are now coupled at the **identifier** layer. A
future, optional refactor could derive `PERMISSIONS_BY_ROLE` from
`ROLE_PERMISSIONS` once the backend ops-roles service is migrated
to use the new catalog as its source of truth. That work is out of
scope here and is deferred until backend coordination occurs.

### F-10: Permissions missing from the catalog

Real gaps that should be added before the surfaces they would gate are
built. None of these is needed today; flagging now so the next person
adding the surface remembers to add the permission.

| Missing | Use case |
|---|---|
| `review.revoke_sign_off` | Accountant / legal realizing a sign-off was made in error |
| `review.escalate` | Compliance escalating a review item to a senior |
| `user.report` | End user filing a report about another user / store / content |
| `user.block` | End user blocking another user |
| `user.addresses.read`, `user.addresses.write` | If addresses need a tighter gate than `user.profile.*` |
| `merchant.refunds.read`, `merchant.refunds.write` | Merchant refund handling (Stage 10) |
| `merchant_finance.export` | Merchant downloading their own payout CSV |
| `flag.create` | Engineering action; might be code-only and not a runtime permission |

**Recommendation:** no action now. Add each one in the PR that
introduces the surface it gates.

---

## 7. Safety notes

### S-1: Catalog is unwired

Nothing in `lib/rbac/` is consumed by production authorization. The
existing `user.role` field and `lib/opsRoles.ts` continue to govern
real access. Reverting any of PR 1, 2, or 3 has zero user-visible
effect.

### S-2: `legacyRoleFor` is the only bridge

`hasPermission` reads `user.role` exactly once, via `legacyRoleFor`.
Every other consumer of the RBAC layer accepts `Role` values directly.
This isolates the legacy-field translation to one function, making the
PR 9 migration (populate `UserRoleAssignment`, switch to assignment-
based resolution) a one-place change.

### S-3: Compile-time drift guards

Two drift guards are in place:

1. **AuthUser role drift** — `lib/rbac/hasPermission.ts` contains a
   strict bidirectional equality check against `AuthUser['role']`.
   If the auth type ever gains or loses a role value, the check
   fails to compile and forces an explicit mapping decision rather
   than silently falling through to `legacy_user`.

2. **opsRoles ↔ RBAC catalog drift** (PR 3b) —
   `lib/opsRoles.ts` declares its `OPS_ROLES` tuple with
   `satisfies readonly QiftRole[]` and derives `OpsPermission` from
   an internal tuple that `satisfies readonly Permission[]`. Any
   identifier in `lib/opsRoles.ts` that does not exist in the
   unified RBAC catalog fails to compile.

### S-4: Type-level exhaustiveness

`ROLE_PERMISSIONS: Record<Role, readonly Permission[]>` enforces:
- every `Role` has an entry (adding a role without mapping fails to
  compile)
- every entry contains only valid `Permission` identifiers (typos fail
  to compile)

These guards stand in for unit tests; the project has no test runner.

### S-5: Migration is reversible at every step

Each migration PR (PR 5+) is independently revertable. The
`rbac.permission_checks_enabled` kill-switch returns every migrated
guard to the legacy `user.role` check without removing any new
infrastructure.

### S-6: No financial logic touched

The catalog defines permissions for financial actions (payouts,
reserves, financial config, flag flips), but no code in PR 1, 2, or 3
performs any financial operation. Real financial logic is gated on a
separate set of feature flags (`NEXT_PUBLIC_SHOW_FINANCIAL_CONFIG`,
`NEXT_PUBLIC_SHOW_PAYOUT_RESERVE_OVERVIEW`, etc.) and remains
mock-only.

---

## 8. Verified invariants

| Invariant | Verification |
|---|---|
| Every `Role` has a `ROLE_PERMISSIONS` entry | `Record<Role, ...>` typecheck |
| Every entry holds only valid `Permission` identifiers | `readonly Permission[]` typecheck |
| No orphan permissions | Manual audit § F-8 |
| Legacy roles cover current behavior exactly | Manual audit § 3 |
| `legacyRoleFor` covers every `AuthUser['role']` value | `_StrictEqual<...>` compile-time check |
| Catalog imports nothing from runtime auth | Inspection: only type-only `AuthUser` import |
| Catalog is unwired from guards | Inspection: zero callers of `hasPermission` in production code |

---

## 9. References

- `lib/rbac/permissions.ts` — permission catalog
- `lib/rbac/roles.ts` — role catalog + `legacyRoleFor`
- `lib/rbac/roleMap.ts` — `ROLE_PERMISSIONS` + helpers
- `lib/rbac/hasPermission.ts` — user-level helpers + drift guard
- `lib/rbac/index.ts` — barrel
- `lib/opsRoles.ts` — legacy presentation catalog (to be re-exported from
  `lib/rbac/` in a follow-up PR)
- `lib/merchantFinanceAccess.ts` — merchant-finance gate (documents
  future W1 merchant roles)
- `lib/auth.ts` — `AuthUser` type (the legacy `role` field that
  `legacyRoleFor` bridges)
- FRP v1.1 § 9.6.3 — merchant access matrix
- Stage 10 § 19 — W1 RBAC architecture
