// Internal ops-role catalog — frontend mirror of
// apps/api/src/ops-roles/ops-roles.ts. Keep codes + permission
// names in sync with the backend.
//
// Purpose today: UI presentation only (admin role pickers, badge
// labels). Authorization is enforced server-side by OpsRoleGuard —
// the frontend never depends on these values for security, only for
// surfacing.
//
// SOURCE-OF-TRUTH INVARIANTS (PR 3b)
// This module no longer maintains a separate string-literal universe
// for identifiers. Instead:
//   - `OPS_ROLES` satisfies `readonly QiftRole[]` from
//     lib/rbac/roles.ts — every role name here must exist in the
//     unified RBAC role catalog (a typo or stale name fails to
//     compile).
//   - `OpsPermission` is derived from `OPS_PERMISSION_TUPLE`, which
//     satisfies `readonly Permission[]` from lib/rbac/permissions.ts
//     — every permission identifier here is verified against the
//     unified RBAC permission catalog.
// Drift between this file and the RBAC catalog on shared identifiers
// is therefore impossible.
//
// CONTENT REMAINS MANUALLY MAINTAINED
// `PERMISSIONS_BY_ROLE` and `SUPER_ADMIN_ALL` are not derived from
// lib/rbac/roleMap.ts. opsRoles.ts has a behavioural contract with
// the BACKEND (apps/api), not with the frontend RBAC catalog. The
// drift check covers identifier spelling, not role content. When
// the backend ops-roles service changes a role's permission set,
// update both this file and lib/rbac/roleMap.ts to match.

import type { Permission } from './rbac/permissions'
import type { QiftRole } from './rbac/roles'

export const OPS_ROLES = [
  'super_admin',
  'operations_manager',
  'finance',
  'merchant_review',
  'support',
  'trust_safety',
  'fulfillment_ops',
  'analytics_viewer',
] as const satisfies readonly QiftRole[]

export type OpsRole = (typeof OPS_ROLES)[number]

export function isOpsRole(value: string): value is OpsRole {
  return (OPS_ROLES as readonly string[]).includes(value)
}

// Source-of-truth tuple for OpsPermission. Every identifier is
// verified at compile time against the unified RBAC Permission
// catalog via `satisfies readonly Permission[]`. Parallel to
// `OPS_ROLES` above: the tuple is the runtime value, the type is
// derived from it.
export const OPS_PERMISSIONS = [
  'store.review',
  'store.set_plan',
  'store.set_featured',
  'store.set_status',
  'store.read_detail',
  'user.read',
  'user.set_role',
  'user.suspend',
  'user.assign_ops_role',
  'finance.read_payouts',
  'finance.record_payout_event',
  'finance.approve_payout',
  'diagnostics.read',
  'diagnostics.run_seed',
  'report.read',
  'report.resolve',
  'analytics.read',
] as const satisfies readonly Permission[]

export type OpsPermission = (typeof OPS_PERMISSIONS)[number]

const PERMISSIONS_BY_ROLE: Record<
  Exclude<OpsRole, 'super_admin'>,
  OpsPermission[]
> = {
  operations_manager: [
    'store.review',
    'store.set_status',
    'store.set_featured',
    'store.read_detail',
    'user.read',
    'diagnostics.read',
    'diagnostics.run_seed',
    'report.read',
    'analytics.read',
  ],
  finance: [
    'finance.read_payouts',
    'finance.record_payout_event',
    'finance.approve_payout',
    'store.read_detail',
    'analytics.read',
  ],
  merchant_review: ['store.review', 'store.read_detail', 'store.set_status'],
  support: [
    'store.read_detail',
    'user.read',
    'diagnostics.read',
    'report.read',
  ],
  trust_safety: [
    'user.read',
    'user.suspend',
    'report.read',
    'report.resolve',
    'store.set_status',
  ],
  fulfillment_ops: ['store.read_detail', 'diagnostics.read'],
  analytics_viewer: ['analytics.read'],
}

const SUPER_ADMIN_ALL: readonly OpsPermission[] = [
  'store.review',
  'store.set_plan',
  'store.set_featured',
  'store.set_status',
  'store.read_detail',
  'user.read',
  'user.set_role',
  'user.suspend',
  'user.assign_ops_role',
  'finance.read_payouts',
  'finance.record_payout_event',
  'finance.approve_payout',
  'diagnostics.read',
  'diagnostics.run_seed',
  'report.read',
  'report.resolve',
  'analytics.read',
]

export function permissionsFor(
  roles: readonly string[],
): Set<OpsPermission> {
  const out = new Set<OpsPermission>()
  for (const raw of roles) {
    if (!isOpsRole(raw)) continue
    if (raw === 'super_admin') {
      for (const p of SUPER_ADMIN_ALL) out.add(p)
      continue
    }
    for (const p of PERMISSIONS_BY_ROLE[raw]) out.add(p)
  }
  return out
}

export function hasOpsPermission(
  roles: readonly string[],
  permission: OpsPermission,
): boolean {
  return permissionsFor(roles).has(permission)
}
