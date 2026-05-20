// Access + flag helpers for the merchant financial dashboard.
//
// SINGLE SOURCE OF TRUTH for:
//   1. The feature flag that controls whether the dashboard is
//      reachable at all (NEXT_PUBLIC_SHOW_MERCHANT_FINANCE).
//   2. The role gate that controls who can view the dashboard
//      once it's reachable.
//
// Both checks live in this module so the page, the nav link, and
// any future cross-references all consult the same logic. Toggling
// the flag or extending the role set is a one-line change here.

import type { AuthUser } from './auth'
import { arePermissionChecksEnabled, hasPermission } from './rbac'

// Opt-in flag. Default OFF. Inlined at build time by Next.js
// (NEXT_PUBLIC_* prefix). Reading it in a top-level const means
// the dashboard route, the nav link, and the redirect logic all
// agree on the same value for the lifetime of the runtime.
export const MERCHANT_FINANCE_ENABLED: boolean =
  process.env.NEXT_PUBLIC_SHOW_MERCHANT_FINANCE === '1'

// Role gate for the merchant financial dashboard.
//
// W1 RBAC CONTEXT
// Stage 10 § 19 + FRP v1.1 § 9.6.3 define the fine-grained
// merchant-side roles that hold financial visibility:
//   - merchant_owner                    (full)
//   - merchant_owner_delegate           (full, delegated)
//   - merchant_finance                  (finance + read-only ops)
//   - merchant_accountant_readonly      (read-only finance)
// And the two roles intentionally excluded — operational only:
//   - merchant_manager
//   - merchant_staff
//
// The W1 access matrix is reflected in lib/rbac/roleMap.ts: each of
// the four roles above holds `merchant_finance.read_own`, and the
// two operational roles do not.
//
// PR 6 — KILL-SWITCH PROTECTED MIGRATION
// This helper now has two paths, selected at call time by
// arePermissionChecksEnabled() from lib/rbac/permissionChecksFlag.ts:
//   - flag OFF (default in prod): legacy `user.role === 'store'`
//     check — preserves current behaviour exactly.
//   - flag ON  (default in dev/test): hasPermission(user,
//     'merchant_finance.read_own') — consults the unified RBAC
//     catalog and the W1 access matrix.
//
// Both branches resolve to the same boolean for every current
// account: every `user.role === 'store'` account maps via
// legacyRoleFor to legacy_store, which holds the full
// ALL_MERCHANT_PERMISSIONS bundle (includes merchant_finance.read_own).
// The dual path lets us flip back to the legacy branch via env var
// if anything drifts in the new path.
//
// CLIENT-SIDE UX GATE, NOT A SECURITY BOUNDARY.
// Real merchant-finance authorization lives server-side in apps/api.
// This helper gates surfacing only — page render and nav-link
// visibility. The flag helper is server-intended; consuming it
// here means production builds without an explicit override fall
// back to the legacy branch (NODE_ENV=production → flag OFF),
// preserving today's behaviour exactly.
export function canViewMerchantFinance(
  user: AuthUser | null | undefined,
): boolean {
  if (!user) return false
  if (arePermissionChecksEnabled()) {
    return hasPermission(user, 'merchant_finance.read_own')
  }
  return user.role === 'store'
}
