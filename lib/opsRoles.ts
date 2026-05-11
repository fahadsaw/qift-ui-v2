// Internal ops-role catalog — frontend mirror of
// apps/api/src/ops-roles/ops-roles.ts. Keep codes + permission
// names in sync.
//
// Purpose today: UI presentation only (admin role pickers,
// badge labels). Authorization is enforced server-side by
// OpsRoleGuard — the frontend never depends on these values for
// security, only for surfacing.

export const OPS_ROLES = [
  'super_admin',
  'operations_manager',
  'finance',
  'merchant_review',
  'support',
  'trust_safety',
  'fulfillment_ops',
  'analytics_viewer',
] as const

export type OpsRole = (typeof OPS_ROLES)[number]

export function isOpsRole(value: string): value is OpsRole {
  return (OPS_ROLES as readonly string[]).includes(value)
}

export type OpsPermission =
  | 'store.review'
  | 'store.set_plan'
  | 'store.set_featured'
  | 'store.set_status'
  | 'store.read_detail'
  | 'user.read'
  | 'user.set_role'
  | 'user.suspend'
  | 'user.assign_ops_role'
  | 'finance.read_payouts'
  | 'finance.record_payout_event'
  | 'finance.approve_payout'
  | 'diagnostics.read'
  | 'diagnostics.run_seed'
  | 'report.read'
  | 'report.resolve'
  | 'analytics.read'

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
