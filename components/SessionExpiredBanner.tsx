'use client'

// Banner surfaced when an admin (or, in future, merchant) API call
// returns 401 (expired token) or 403 (forbidden role/permission).
// Renders a distinct UI state from the empty-data placeholder so an
// operator can immediately tell "the data isn't there because my
// session ended" vs "the data isn't there because nothing has been
// created yet". See `lib/apiClient.ts` for the underlying
// discriminated-union result type that feeds this component.
//
// USAGE
// -----
// The owning page tracks an `authState` lifted from its children
// (sections). Each section that fetches via `adminFetch()` reports
// up when it sees `{ kind: 'expired' }` or `{ kind: 'forbidden' }`.
// The page then renders this banner once, above the section content,
// so the user gets one clear call-to-action — not one per section.

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { clearAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

export type AuthErrorKind = 'expired' | 'forbidden'

export function SessionExpiredBanner({
  variant,
  returnTo,
}: {
  variant: AuthErrorKind
  // Path the user came from; passed to /login as ?returnTo= so they
  // land back where they were after re-authenticating. Defaults to
  // /admin which is the only surface that currently uses the banner
  // but exposed as a prop so future merchant surfaces can reuse it.
  returnTo?: string
}) {
  const { t } = useI18n()
  const router = useRouter()

  const handleSignIn = useCallback(() => {
    // Wipe the stale token before redirecting so the login page
    // doesn't briefly think we're still authed. clearAuth() also
    // dispatches the qift:auth-changed event which causes any
    // useAuth subscribers to re-render against the empty snapshot.
    clearAuth()
    const target = `/login${
      returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    }`
    router.replace(target)
  }, [router, returnTo])

  const titleKey =
    variant === 'expired'
      ? 'admin.session_expired_title'
      : 'admin.forbidden_title'
  const bodyKey =
    variant === 'expired'
      ? 'admin.session_expired_body'
      : 'admin.forbidden_body'

  return (
    <div
      role="alert"
      className="my-5 rounded-2xl border p-4"
      style={{
        // Warm-but-not-alarming palette. Borrows the same border-soft
        // style other admin alerts use; tinted with a hint of warning
        // so it doesn't read as decorative.
        borderColor: 'var(--warning, var(--border))',
        background: 'var(--card-soft)',
      }}
    >
      <div
        className="text-sm font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {t(titleKey)}
      </div>
      <div
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t(bodyKey)}
      </div>

      {/* Only "expired" gets the re-login button — "forbidden" needs
          an operator intervention (a role grant), not a re-auth, so
          a sign-in button would be misleading. */}
      {variant === 'expired' && (
        <button
          type="button"
          onClick={handleSignIn}
          className="mt-3 rounded-full border px-4 py-2 text-xs transition-all duration-300 active:scale-95"
          style={{
            borderColor: 'transparent',
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            color: '#fff',
            fontWeight: 600,
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {t('admin.session_expired_signin')}
        </button>
      )}
    </div>
  )
}
