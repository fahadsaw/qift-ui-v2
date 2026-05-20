// User-level permission checks — the only RBAC helpers that take an
// AuthUser-shaped input.
//
// CONTRACT
// `hasPermission(user, perm)` answers the question "is this user
// allowed to do X?" by:
//   1. reading `user.role` (the current coarse string field),
//   2. mapping it through `legacyRoleFor()` to a `LegacyRole`, and
//   3. consulting the PR 1 role → permission catalog.
//
// This preserves current behaviour EXACTLY:
//   user.role === 'admin' → legacy_admin → every admin permission
//   user.role === 'store' → legacy_store → every merchant permission
//   user.role === 'user'  → legacy_user  → every user permission
//   null / undefined / unknown → legacy_user (matches the fallback
//   behaviour in lib/roleHome.ts)
//
// BACKWARD COMPATIBILITY
// This helper is the ONE chokepoint where the legacy `user.role`
// string is translated into RBAC checks. When the UserRoleAssignment
// table lands in a later PR, this function gets a second branch:
// "use assignments if present, otherwise fall back to legacyRoleFor".
// Until then, the legacy mapping is the only behaviour.
//
// NOT WIRED YET
// No guard, no endpoint, no UI reads from this module. PR 2 only
// adds the helper; PR 3+ will migrate guards endpoint-by-endpoint
// behind a kill-switch flag. Importing this module has no side
// effects.
//
// SERVER-SAFE
// This file does NOT import the runtime side of lib/auth (which is
// 'use client'). The only auth dependency is a type-only import of
// AuthUser for the drift check at the bottom of the file. The helper
// itself accepts a structural `UserLike` so it works in both client
// and server contexts.

import type { AuthUser } from '../auth'
import {
  type Permission,
} from './permissions'
import { legacyRoleFor } from './roles'
import { permissionsForRoles, roleHasPermission } from './roleMap'

// Structural input type. Anything with an optional `role` string is
// accepted — AuthUser satisfies this, as do server-side user objects
// that carry the same field under a different runtime shape.
export type UserLike = { role?: string | null }

// True iff the given user holds the given permission.
//
// Falsy users (null / undefined) are treated as anonymous and resolve
// to legacy_user permissions, matching the existing roleHome.ts
// fallback. This means callers don't need to null-check before
// calling — passing `null` is safe and returns the user-tier answer.
export function hasPermission(
  user: UserLike | null | undefined,
  permission: Permission,
): boolean {
  const role = legacyRoleFor(user?.role)
  return roleHasPermission(role, permission)
}

// True iff the given user holds AT LEAST ONE of the given permissions.
// Empty array returns false (vacuous "any of nothing" is false).
//
// Builds the user's permission set once, so this is cheaper than
// calling `hasPermission` in a loop when checking multiple options.
export function hasAnyPermission(
  user: UserLike | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (permissions.length === 0) return false
  const set = permissionsForUser(user)
  for (const p of permissions) {
    if (set.has(p)) return true
  }
  return false
}

// True iff the given user holds EVERY one of the given permissions.
// Empty array returns true (vacuous "all of nothing" is true).
export function hasAllPermissions(
  user: UserLike | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (permissions.length === 0) return true
  const set = permissionsForUser(user)
  for (const p of permissions) {
    if (!set.has(p)) return false
  }
  return true
}

// All permissions held by the given user. Returns a fresh Set on
// every call — callers may mutate it freely. Intended for batch
// checks, UI affordance gating, and "what can this user do?" debug
// panels.
export function permissionsForUser(
  user: UserLike | null | undefined,
): Set<Permission> {
  const role = legacyRoleFor(user?.role)
  return permissionsForRoles([role])
}

// ---------------------------------------------------------------------
// Compile-time drift guard.
//
// `legacyRoleFor` handles exactly three legacy role values: 'admin',
// 'store', 'user'. If AuthUser['role'] gains or loses a value (for
// example, a fine-grained backend role lands and starts appearing in
// the field), the assignment below fails to compile — forcing an
// explicit decision on how the new role maps to the RBAC catalog
// instead of silently falling through to legacy_user.
//
// The check uses a strict bidirectional equality on string literals,
// so adding AND removing values both trigger the error.
// ---------------------------------------------------------------------

type _ExpectedAuthRoles = 'user' | 'store' | 'admin'

type _StrictEqual<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false

type _AuthRoleDriftOk = _StrictEqual<
  NonNullable<AuthUser['role']>,
  _ExpectedAuthRoles
>

// Anchors the type-level check at module load. The `void` expression
// consumes the binding so ESLint's no-unused-vars rule passes.
const _authRoleDriftOk: _AuthRoleDriftOk = true
void _authRoleDriftOk
