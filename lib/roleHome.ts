// Role-based home routing.
//
// Single source of truth for "where does this role live in the app?"
// Used by:
//   - /login post-submit redirect
//   - /  (root) redirect for logged-in users
//   - /profile redirect for non-user roles
//   - BottomNav tab list selection
//   - Header logo click target
//
// CONTRACT
// Each role has exactly one canonical home. Merchants belong on the
// store dashboard (operational), admins on the control center
// (operational), users on the social home (discovery). Everything
// else (settings, gifts hub, etc.) sits under the role's home — but
// the home itself is the rallying point.
//
// SAFETY
// Frontend-only routing. Real authorization stays on the backend
// (StoreGuard / AdminGuard). A user with a tampered local role
// might *land* on /admin, but the API calls there will fail and the
// page renders empty / forbidden states.

import type { AuthUser } from './auth'

export type Role = 'user' | 'store' | 'admin'

// Canonical home path per role. The `user` home is `/` because the
// home page already renders the social discovery feed for logged-in
// users; merchants and admins get redirected away from `/` to their
// operational hub.
const HOME: Record<Role, string> = {
  user: '/',
  store: '/store-dashboard',
  admin: '/admin',
}

// Read the role from a possibly-undefined AuthUser. Defaults to
// 'user' so unauthenticated and pre-hydration views land on the
// social home — same behaviour the app had before role-aware
// routing.
export function roleOf(user: AuthUser | null | undefined): Role {
  const r = user?.role
  if (r === 'store' || r === 'admin') return r
  return 'user'
}

export function homeForRole(role: Role | undefined | null): string {
  if (role === 'store' || role === 'admin') return HOME[role]
  return HOME.user
}

// Should the current path be replaced by the role's home? Used by
// pages that aren't appropriate for the role (e.g. a merchant
// landing on /profile). Returns the destination, or null when the
// current path is fine.
//
// Rules:
//   - merchants get redirected from `/` and `/profile` to
//     /store-dashboard.
//   - admins get redirected from `/` and `/profile` to /admin.
//   - users stay where they are.
//   - other paths (everywhere else) are never auto-redirected — the
//     user can deliberately navigate to /settings, /gifts, etc.
//
// This deliberately does NOT redirect from /send / /checkout / etc.
// — a merchant might want to send a gift to a customer; an admin
// might be QA-ing the gift flow. Only the role-incongruent
// "general" pages get redirected.
export function shouldRedirectToRoleHome(
  pathname: string,
  user: AuthUser | null | undefined,
): string | null {
  const role = roleOf(user)
  if (role === 'user') return null
  // Only redirect from these "user-flavoured" pages. Other routes
  // remain accessible — see comment above.
  const SOCIAL_PATHS = new Set(['/', '/profile'])
  if (!SOCIAL_PATHS.has(pathname)) return null
  return HOME[role]
}
