// Kill-switch flag for the RBAC permission-check migration.
//
// PURPOSE
// Future PRs (PR 5 onward) will migrate guards from the legacy
// `user.role === 'admin'` check to `hasPermission(user, perm)` from
// lib/rbac/hasPermission.ts. Each migrated guard will read
// `arePermissionChecksEnabled()` at request time and:
//   - when true  → route through the new permission check
//   - when false → fall back to the legacy role check (current
//                  behaviour)
//
// This dual-path approach lets us migrate guards one at a time,
// verify behaviour in dev / staging, and flip back to the legacy
// path instantly if anything drifts. The new code path stays in
// place even when the flag is OFF, so re-enabling does not require
// a follow-up deploy — only an env-var flip and a restart.
//
// PR 4 ONLY ADDS THIS HELPER.
// No guard reads from it yet. Importing this module has no side
// effects. The first guard migration lands in PR 5 behind this
// flag.
//
// FLAG IDENTIFIER
// Conceptual flag name: `rbac.permission_checks_enabled` (this is
// the entry that will appear in the future feature-flag registry
// when it lands; see CATALOG_REVIEW.md § 5 migration path).
// Environment override: `RBAC_PERMISSION_CHECKS_ENABLED`.
//   Truthy: '1' or 'true'
//   Falsy:  '0' or 'false'
// Any other value (including unset) falls back to the NODE_ENV
// default below.
//
// DEFAULTS
//   development → ON  (dev exercises the new path automatically)
//   test        → ON  (so any future test runs hit the new path)
//   production  → OFF (safe — guards keep the legacy check until
//                      the operator explicitly opts in)
//   anything else / undefined → OFF (conservative)
//
// STAGING DETECTION
// Next.js sets NODE_ENV to 'production' in staging deployments by
// default. The codebase has no established deploy-environment env
// var convention today (no DEPLOY_ENV / VERCEL_ENV / APP_ENV is
// read elsewhere in lib/). Staging builds therefore default to OFF
// unless the operator sets `RBAC_PERMISSION_CHECKS_ENABLED=1`
// explicitly on the staging environment. When a deploy-env
// convention is established in the future, extend this helper to
// default ON for the staging signal.
//
// SERVER-SAFE BUT INTENDED FOR SERVER USE
// The helper reads `process.env` and is callable from both server
// (route handlers, middleware) and client (browser) contexts. On
// the client, `process.env.RBAC_PERMISSION_CHECKS_ENABLED` is
// `undefined` because Next.js only inlines NEXT_PUBLIC_* vars, so
// the client result depends solely on NODE_ENV. Guard logic runs
// server-side, so this discrepancy is theoretical — but it means a
// production build where the operator has flipped the explicit
// override would see the server return one value and the client
// the NODE_ENV-only default. Use this helper from server contexts
// only.

export function arePermissionChecksEnabled(): boolean {
  const explicit = process.env.RBAC_PERMISSION_CHECKS_ENABLED
  if (explicit === '1' || explicit === 'true') return true
  if (explicit === '0' || explicit === 'false') return false

  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv === 'development' || nodeEnv === 'test') return true

  return false
}
