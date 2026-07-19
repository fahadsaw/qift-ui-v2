// Centralised role → account-hub link list.
//
// Why this file exists
// ─────────────────────
// Phase-1 of the operational-UI cleanup introduced an inline
// `isMerchant ? [...] : isAdmin ? [...] : [...]` ternary inside
// app/settings/page.tsx that decided which Account-hub links to
// render. That fix landed on the phase-1 branch but a downstream
// branch was created off origin/main BEFORE the fix's follow-up
// commits made it through PR review. The result: the same
// consumer-only links (Preferences, Wishlist, Occasions, Linked
// social accounts) kept rendering in /settings for merchant +
// admin viewers because nobody had ported the inline ternary to
// the new base.
//
// This helper centralises the per-role link-list decision so any
// future surface that wants to render an account-hub (sidebar,
// drawer, future operational menu, etc.) imports a single source
// of truth. A future regression — like dropping the ternary in
// a merge conflict — fails the unit test in
// lib/accountHubLinks.spec.ts before it can ship.
//
// Contract
// ────────
// Three mutually-exclusive link lists, one per role. Returned
// shape is array-of-shortcut so the caller can render whichever
// chrome it wants (cards, list rows, drawer items, etc.) without
// having to know about the discriminator inside.
//
// SAFETY
// Authoritative role enforcement remains server-side
// (StoreGuard / AdminGuard / OpsRoleGuard). This helper is a
// PURE UX selector — a tampered local role couldn't reach a
// non-consumer surface through here, but the helper still
// returns the role-appropriate set so the chrome doesn't render
// confusing cross-role shortcuts.

import type { Role } from './roleHome'

// One shortcut entry. `labelKey` + `hintKey` are translate() keys
// (no raw strings here so the helper stays locale-agnostic). The
// caller passes them through useI18n.t() at render time.
export type AccountShortcut = {
  href: string
  labelKey: string
  hintKey: string
}

// Consumer (role = 'user'). The legacy four-link Account hub.
// These cover the consumer-social surfaces only; merchant + admin
// modes never render any of these.
const CONSUMER_LINKS: ReadonlyArray<AccountShortcut> = [
  {
    // Track A.5 PR 7: the buyer's purchase record, keyed by QP refs.
    href: '/account/orders',
    labelKey: 'settings.link_orders',
    hintKey: 'settings.link_orders_hint',
  },
  {
    href: '/preferences',
    labelKey: 'settings.link_preferences',
    hintKey: 'settings.link_preferences_hint',
  },
  {
    href: '/wishlist',
    labelKey: 'settings.link_wishlist',
    hintKey: 'settings.link_wishlist_hint',
  },
  {
    href: '/occasions',
    labelKey: 'settings.link_occasions',
    hintKey: 'settings.link_occasions_hint',
  },
  {
    href: '/social-accounts',
    labelKey: 'settings.link_social',
    hintKey: 'settings.link_social_hint',
  },
] as const

// Consumer → Business bridge: the official in-app door to Qift
// Business, for EVERY role — merchants and admins are the most
// likely company owners, so the row must never be role-filtered
// away. Appended in accountHubLinksFor (not in the per-role lists,
// which stay disjoint for the URL-overlap assertion).
const BUSINESS_LINK: AccountShortcut = {
  href: '/business',
  labelKey: 'settings.link_business',
  hintKey: 'settings.link_business_hint',
}

// Merchant (role = 'store'). Settings-flavoured shortcuts into
// the store dashboard's sub-pages — the merchant operational
// settings the store owner actually configures from /settings.
// The /store-dashboard sub-routes are already operational + auth-
// gated; this hub just provides the discoverable entry point.
const MERCHANT_LINKS: ReadonlyArray<AccountShortcut> = [
  {
    href: '/store-dashboard',
    labelKey: 'settings.link_store_dashboard',
    hintKey: 'settings.link_store_dashboard_hint',
  },
  {
    href: '/store-dashboard/coverage',
    labelKey: 'settings.link_store_coverage',
    hintKey: 'settings.link_store_coverage_hint',
  },
  {
    href: '/store-dashboard/documents',
    labelKey: 'settings.link_store_documents',
    hintKey: 'settings.link_store_documents_hint',
  },
  {
    href: '/store-dashboard/theme',
    labelKey: 'settings.link_store_theme',
    hintKey: 'settings.link_store_theme_hint',
  },
  {
    href: '/store-dashboard/visibility',
    labelKey: 'settings.link_store_visibility',
    hintKey: 'settings.link_store_visibility_hint',
  },
  {
    href: '/store-dashboard/plan',
    labelKey: 'settings.link_store_plan',
    hintKey: 'settings.link_store_plan_hint',
  },
] as const

// Admin (role = 'admin'). Currently a single entry — /admin
// itself owns its own tabbed surface (users / stores / gifts /
// reports / finance / diagnostics) so a deep operational link
// list would duplicate the BottomNav admin tabs without adding
// value. Future admin-specific preference sub-pages
// (moderation defaults, ops-only notification controls) plug
// into this list.
const ADMIN_LINKS: ReadonlyArray<AccountShortcut> = [
  {
    href: '/admin',
    labelKey: 'settings.link_admin',
    hintKey: 'settings.link_admin_hint',
  },
] as const

// Resolve the link list for the viewer's role. Pure function;
// the role is passed in so the caller controls the timing
// (typically guarded behind a mount/role-resolved flag to avoid
// flashing the consumer set during SSR + first paint — see
// app/settings/page.tsx for the usage pattern).
//
// Unknown roles fall through to the consumer list. This matches
// the project's `roleOf` convention (lib/roleHome.ts): anything
// that isn't 'store' or 'admin' is treated as 'user'.
export function accountHubLinksFor(
  role: Role,
): ReadonlyArray<AccountShortcut> {
  if (role === 'store') return [...MERCHANT_LINKS, BUSINESS_LINK]
  if (role === 'admin') return [...ADMIN_LINKS, BUSINESS_LINK]
  return [...CONSUMER_LINKS, BUSINESS_LINK]
}

// Predicate exported so other surfaces can ask "is the Privacy
// card appropriate for this role?" without re-deriving the rule.
// Privacy controls govern consumer-social discoverability only;
// merchant + admin modes hide the card entirely.
export function showsConsumerPrivacyCard(role: Role): boolean {
  return role === 'user'
}

// Internal export for the unit test only. Not for runtime
// consumption — production callers should always go through
// accountHubLinksFor() so the role discrimination stays
// centralised. Importing these constants from production code
// would silently leak the wrong-role set if the discriminator
// logic ever changes.
export const __INTERNAL_FOR_TESTS = {
  CONSUMER_LINKS,
  MERCHANT_LINKS,
  ADMIN_LINKS,
} as const

// Dev-mode runtime invariant: the three role-sets must not share
// any URL. If a future contributor accidentally drops a consumer
// URL (e.g. '/wishlist') into the merchant or admin list, this
// assertion fires on first import (which happens on every
// /settings render). Production strips the check via the
// NODE_ENV gate, so the cost is zero outside development.
//
// The check is intentionally URL-only — labelKey/hintKey overlaps
// are fine (a future role might surface the same label with
// different routing) but URL overlaps mean the cross-role
// boundary just leaked.
if (process.env.NODE_ENV !== 'production') {
  const consumerSet = new Set(CONSUMER_LINKS.map((l) => l.href))
  const merchantSet = new Set(MERCHANT_LINKS.map((l) => l.href))
  const adminSet = new Set(ADMIN_LINKS.map((l) => l.href))
  const collide = (a: Set<string>, b: Set<string>): string | null => {
    for (const v of a) if (b.has(v)) return v
    return null
  }
  const a = collide(consumerSet, merchantSet)
  const b = collide(consumerSet, adminSet)
  const c = collide(merchantSet, adminSet)
  if (a || b || c) {
    console.error(
      `[accountHubLinks] role-set URL overlap detected (consumer/merchant: ${a}, consumer/admin: ${b}, merchant/admin: ${c}). One of the role-specific link arrays leaked a URL from another role.`,
    )
  }
}
