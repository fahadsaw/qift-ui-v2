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
  // PR 10 drift fix: these two existed in the backend catalog but
  // were missing from this mirror — exactly the class of skew the
  // server-computed /admin/me/ops-roles endpoint guards against.
  | 'user.restore'
  | 'user.purge'
  | 'user.assign_ops_role'
  | 'finance.read_payouts'
  | 'finance.record_payout_event'
  | 'finance.approve_payout'
  // Ledger reconciliation (Track B2 / PE-11). Mirrors the backend
  // catalog entry in apps/api/src/ops-roles/ops-roles.ts.
  | 'finance.reconcile'
  // VAT-facts maker-checker (Track B3 / PE-12). SoD (maker != checker)
  // is enforced server-side; the UI only mirrors it.
  | 'finance.vat_facts'
  // SETTLE-1 (Track C PR 2): payment receipts, receivables aging,
  // §5 eligibility, payout-identity verification. Mirrors the backend
  // catalog; the authoritative gate is server-side.
  | 'finance.receipts'
  // SETTLE-2 (Track C PR 3): the §33.1 approval/execution separation —
  // two distinct permissions; executor ∉ approvers is enforced
  // server-side on identity. Mirror is presentational only.
  | 'finance.settlement_approve'
  | 'finance.settlement_execute'
  | 'diagnostics.read'
  | 'diagnostics.run_seed'
  | 'report.read'
  | 'report.resolve'
  | 'analytics.read'
  // Closed Beta Gate management — create/disable invite codes +
  // curate the email / phone allowlist. Held by super_admin (via
  // SUPER_ADMIN_ALL) and operations_manager. Mirrors the backend
  // catalog entry added in apps/api/src/ops-roles/ops-roles.ts.
  | 'beta.manage'

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
    'beta.manage',
  ],
  finance: [
    'finance.read_payouts',
    'finance.record_payout_event',
    'finance.approve_payout',
    'finance.reconcile',
    'finance.vat_facts',
    'finance.receipts',
    'finance.settlement_approve',
    'finance.settlement_execute',
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
    // Backend grants trust_safety restore alongside suspend (but
    // never purge — that stays super_admin-only).
    'user.restore',
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
  'user.restore',
  'user.purge',
  'user.assign_ops_role',
  'finance.read_payouts',
  'finance.record_payout_event',
  'finance.approve_payout',
  'diagnostics.read',
  'diagnostics.run_seed',
  'report.read',
  'report.resolve',
  'analytics.read',
  'beta.manage',
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

// ── Self-introspection (PR 10 — permission-aware admin UI) ─────────
//
// Fetches the viewer's roles + SERVER-computed effective permission
// set from GET /admin/me/ops-roles. The server's answer wins over
// the local catalog above (which exists for labels/pickers) so a
// catalog-drift bug can never render the wrong buttons.
//
// Returns null on ANY failure (network, 401, old backend without
// the endpoint). Callers treat null as "unknown" and FAIL OPEN —
// show everything and let the server's guards 403 — because hiding
// a button the operator is actually allowed to use is the worse
// failure for an ops tool.

export type MyOpsAccess = {
  roles: string[]
  permissions: string[]
}

export async function fetchMyOpsAccess(
  apiBase: string,
  accessToken: string,
): Promise<MyOpsAccess | null> {
  try {
    const res = await fetch(`${apiBase}/admin/me/ops-roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      roles?: unknown
      permissions?: unknown
    }
    if (!Array.isArray(data.roles) || !Array.isArray(data.permissions)) {
      return null
    }
    return {
      roles: data.roles.filter((r): r is string => typeof r === 'string'),
      permissions: data.permissions.filter(
        (p): p is string => typeof p === 'string',
      ),
    }
  } catch {
    return null
  }
}
