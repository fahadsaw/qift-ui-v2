'use client'

// useRoleGate — redirect a user away from a page that's not
// appropriate for their role.
//
// This is the consumer-page sibling of `shouldRedirectToRoleHome`
// (lib/roleHome.ts) which only handled `/` and `/profile`. Phase-1
// of the operational-UI cleanup extends the role-aware routing to
// every consumer surface the audit flagged as "merchants and
// admins shouldn't even see this":
//
//   /explore       — consumer discovery feed
//   /wishlist      — consumer wishlist
//   /preferences   — consumer preference form (clothing sizes,
//                    perfume notes, etc.)
//   /search        — consumer-style user/store search
//   /u/[username]  — public consumer profile
//   /p/[slug]      — public consumer gift post
//
// Behaviour:
//   - role ∈ allowed → no-op (page renders normally)
//   - role ∉ allowed → router.replace(homeForRole(role))
//
// We use `router.replace` rather than `router.push` so the
// disallowed URL never enters browser history. A merchant tapping
// the back button after an accidental URL-paste shouldn't return
// to a consumer surface they couldn't reach in the first place.
//
// SAFETY
// Frontend-only. Backend privacy is unaffected — these pages don't
// expose anything sensitive, the gate is purely a UX redirect to
// keep operational users out of consumer surfaces. A tampered local
// role state could still LAND on the page, but the surrounding UX
// would feel out of place and the user would naturally find their
// way back to their own dashboard via the BottomNav.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth'
import { homeForRole, roleOf, type Role } from './roleHome'

// Returns nothing — the hook fires its redirect as a side effect
// inside useEffect, and renders happen normally during the brief
// window before the redirect completes. Pages that want to render
// a calm placeholder during the window can read `isAuthenticated`
// from useAuth themselves and gate their content render on that
// — the gate hook is intentionally render-agnostic.
export function useRoleGate(allowed: ReadonlyArray<Role>): void {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  useEffect(() => {
    // Pre-hydration (isAuthenticated === false during the brief
    // window before AuthProvider populates) is treated as
    // "user role" — the page renders normally for unauthenticated
    // visitors. Once the role resolves, if it's not allowed, we
    // bounce to the role's canonical home.
    if (!isAuthenticated) return
    const role = roleOf(user)
    if (allowed.includes(role)) return
    router.replace(homeForRole(role))
  }, [allowed, isAuthenticated, router, user])
}
