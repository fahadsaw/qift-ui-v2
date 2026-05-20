// Role catalog — single source of truth for every named role in QIFT.
//
// GROUPS
// - LEGACY roles   = the three values currently stored in `user.role`
//                    ('admin' / 'store' / 'user'), expressed as W1
//                    roles for backward compatibility. Every existing
//                    account already implicitly holds exactly one of
//                    these.
// - QIFT roles     = operational / financial / compliance roles for
//                    QIFT staff. First eight names mirror
//                    lib/opsRoles.ts so the two catalogs can be
//                    unified later. `accountant_readonly` and
//                    `compliance_readonly` are new — they back the
//                    review-status surface (Stage 10 sign-off).
// - MERCHANT roles = per-merchant roles per FRP v1.1 § 9.6.3 +
//                    Stage 10 § 19 (W1). Names match the comment in
//                    lib/merchantFinanceAccess.ts so the migration
//                    path stays unambiguous.
// - USER roles     = end-user roles. Only one for now
//                    (`user_standard`); the catalog leaves room for
//                    later differentiation if needed.
//
// NAMING NOTE
// This module exports a `Role` type. lib/roleHome.ts ALSO exports a
// `Role` type — that older type is the coarse `user.role` string
// ('user' | 'store' | 'admin'). The two are conceptually distinct:
// the RBAC Role here is the unified W1 role identifier, while
// roleHome.ts's Role is the legacy storage field. Code that needs
// both should alias on import (e.g. `import type { Role as LegacyRoleField }
// from '@/lib/roleHome'`).
//
// BACKWARD COMPATIBILITY
// `legacyRoleFor(rawRole)` is the ONLY bridge between the legacy
// `user.role` string and this catalog. Every other code path should
// consume `Role` values directly.

// ---------------------------------------------------------------------
// LEGACY (backward-compat, derived from current user.role values)
// ---------------------------------------------------------------------

export const LEGACY_ROLES = [
  'legacy_admin',
  'legacy_store',
  'legacy_user',
] as const

export type LegacyRole = (typeof LEGACY_ROLES)[number]

// ---------------------------------------------------------------------
// QIFT-SIDE (admin / operations / finance / compliance)
// First eight mirror lib/opsRoles.ts identically (same names, same
// permission scope). The last three are introduced here:
//   - accountant_readonly + compliance_readonly back the Stage 10
//     review-status surface (sign-off rights only).
//   - finance_admin is the EXPANDED Stage 10 finance role — it holds
//     reserves, financial-config, payout-overview, and audit
//     visibility on top of the legacy `finance` set. The legacy
//     `finance` role mirrors lib/opsRoles.ts EXACTLY so that
//     operators currently holding it never silently gain new rights
//     when a guard migrates from `user.role === 'admin'` to a
//     permission check. Promotion from `finance` to `finance_admin`
//     is an explicit assignment, never automatic.
// ---------------------------------------------------------------------

export const QIFT_ROLES = [
  'super_admin',
  'operations_manager',
  'finance',
  'merchant_review',
  'support',
  'trust_safety',
  'fulfillment_ops',
  'analytics_viewer',
  'accountant_readonly',
  'compliance_readonly',
  'finance_admin',
] as const

export type QiftRole = (typeof QIFT_ROLES)[number]

// ---------------------------------------------------------------------
// MERCHANT-SIDE
// FRP v1.1 § 9.6.3 + Stage 10 § 19 (W1). Names match the migration
// note in lib/merchantFinanceAccess.ts.
// ---------------------------------------------------------------------

export const MERCHANT_ROLES = [
  'merchant_owner',
  'merchant_finance',
  'merchant_accountant_readonly',
  'merchant_manager',
  'merchant_staff',
  'merchant_owner_delegate',
] as const

export type MerchantRole = (typeof MERCHANT_ROLES)[number]

// ---------------------------------------------------------------------
// USER-SIDE
// ---------------------------------------------------------------------

export const USER_ROLES = ['user_standard'] as const

export type UserRole = (typeof USER_ROLES)[number]

// ---------------------------------------------------------------------
// UNION
// ---------------------------------------------------------------------

export type Role = LegacyRole | QiftRole | MerchantRole | UserRole

export const ROLES: readonly Role[] = [
  ...LEGACY_ROLES,
  ...QIFT_ROLES,
  ...MERCHANT_ROLES,
  ...USER_ROLES,
]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------
// BACKWARD-COMPAT BRIDGE
// Derive the legacy W1 role from the current AuthUser.role field. This
// is the ONLY function that translates from the coarse `user.role`
// string to the catalog — every other code path should consume Role
// values directly.
//
// Unknown / undefined values fall back to legacy_user, matching the
// existing behaviour of role-aware code in roleHome.ts (any unknown
// role string is treated as the standard user role).
// ---------------------------------------------------------------------

export function legacyRoleFor(
  rawRole: string | null | undefined,
): LegacyRole {
  switch (rawRole) {
    case 'admin':
      return 'legacy_admin'
    case 'store':
      return 'legacy_store'
    case 'user':
      return 'legacy_user'
    default:
      return 'legacy_user'
  }
}
