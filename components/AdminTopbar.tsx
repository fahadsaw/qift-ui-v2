'use client'

// Admin-shell top bar.
//
// Replaces the consumer <Header> when the viewer is in admin mode
// (on /admin/*). Same shape as MerchantTopbar but tuned for the
// operational control-centre vibe:
//
//   - Brand mark → /admin (admin home)
//   - "Admin" tag — small tracked-out label adjacent to the brand
//     so the operator can never confuse this view with the consumer
//     app (admins use the same login as everyone else).
//   - Notification bell (same component as consumer; admins receive
//     ops notifications too).
//   - Language + theme toggles (kept — ops sometimes test the AR/EN
//     experience from inside the admin surface).
//   - Account link → /settings (cross-role settings; admins don't
//     have a /profile concept either).
//
// Notably absent:
//   - "View storefront" (admins don't own a store)
//   - Search (the existing /admin page has its own GlobalSearch
//     section; surfacing it again in the topbar would duplicate it)
//   - "Become a merchant" or any consumer CTA
//
// The header sits sticky with the same blurred background as the
// consumer Header so the chrome density is consistent — only the
// routing differs.

import Link from 'next/link'
import Brand from './Brand'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import { useI18n } from '@/lib/i18n'

export default function AdminTopbar() {
  const { t } = useI18n()
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 80%, transparent) 0%, color-mix(in srgb, var(--bg-base) 50%, transparent) 100%)',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-6 sm:max-w-2xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <Brand href="/admin" />
          <span
            className="hidden text-[0.55rem] font-semibold tracking-[0.18em] sm:inline-block"
            style={{ color: 'var(--muted)' }}
          >
            {t('shell.admin_mode_tag')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationBell />
          <Link
            href="/settings"
            className="inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
            style={{
              background: 'var(--ink)',
              color: 'var(--bg-base)',
            }}
          >
            {t('shell.account')}
          </Link>
        </div>
      </div>
    </header>
  )
}
