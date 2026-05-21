'use client'

// Merchant-shell top bar.
//
// Replaces the consumer <Header> when the viewer is in merchant
// mode (on /store-dashboard/*). The consumer Header points the
// brand mark at `/` and the account link at `/profile` — both are
// consumer surfaces a merchant should never bounce into. This
// topbar:
//
//   - Brand mark → /store-dashboard (the merchant's home)
//   - "View storefront" → /stores/<their-store-id>, opens in a new
//     tab so the operator can compare their dashboard view with the
//     public storefront side-by-side. Hidden when the merchant has
//     no published store yet.
//   - Notification bell (same component as consumer — every role
//     receives notifications, the bell's behaviour is role-agnostic).
//   - Language + theme toggles (same as consumer; the operator may
//     genuinely want to switch).
//   - Account link → /settings (the cross-role settings surface;
//     merchants don't have a /profile concept).
//
// Notably absent:
//   - "Become a merchant" CTA (the operator already is one)
//   - Search bar (merchants don't need to find users/products in
//     this chrome — they use the /admin search if they're an
//     admin too)
//
// The visual treatment mirrors the consumer Header (sticky, blurred
// background, hairline border) so the chrome density feels
// consistent across roles — only the routing differs.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Brand from './Brand'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { listMyStores, type ApiStore } from '@/lib/storesApi'

export default function MerchantTopbar() {
  const { t } = useI18n()
  const { accessToken, isAuthenticated } = useAuth()
  // First store id, resolved once at mount, used to wire the
  // "view storefront" link. Pre-onboarding merchants (zero stores)
  // see no link. Multi-store merchants get the first store —
  // the picker for multi-store viewers is a Phase-3 polish item.
  const [primaryStoreId, setPrimaryStoreId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (isAuthenticated !== true || !accessToken) {
        if (!cancelled) setPrimaryStoreId(null)
        return
      }
      const stores: ApiStore[] = await listMyStores(accessToken)
      if (cancelled) return
      // Prefer an approved store; fall back to the first one of any
      // status so the link still works during pending review.
      const approved = stores.find((s) => s.status === 'approved')
      setPrimaryStoreId(approved?.id ?? stores[0]?.id ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, isAuthenticated])

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
          <Brand href="/store-dashboard" />
          {/* Operational-mode label: a tiny tracked-out tag next to
              the wordmark so the merchant can tell at a glance that
              they're in the operating system, not the public app.
              Hidden on the narrowest screens so the brand keeps the
              full width it needs. */}
          <span
            className="hidden text-[0.55rem] font-semibold tracking-[0.18em] sm:inline-block"
            style={{ color: 'var(--muted)' }}
          >
            {t('shell.merchant_mode_tag')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {primaryStoreId && (
            <Link
              href={`/stores/${primaryStoreId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center rounded-full border px-3 text-[0.7rem] font-semibold sm:inline-flex"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-soft)',
                background: 'var(--card-soft)',
              }}
            >
              {t('shell.view_storefront')}
            </Link>
          )}
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
