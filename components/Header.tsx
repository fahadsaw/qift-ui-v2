'use client'

import Link from 'next/link'
import Brand from './Brand'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'

export default function Header() {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  // World-switch pill — ALWAYS visible, logged in or out (entry-
  // point correction: the Business door must not live behind
  // login/account). This header only renders on consumer pages —
  // /business and /org live in the business shell — so the pill
  // always points at the business world. Compact label on mobile,
  // full wording from sm: up.
  const switchHref = '/business'
  const switchShort = t('nav.business_short')
  const switchFull = t('nav.business_full')
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
        <Brand />
        <div className="flex items-center gap-2">
          <Link
            href={switchHref}
            className="inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--primary) 45%, var(--border))',
              color: 'var(--primary)',
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            }}
          >
            <span className="sm:hidden">{switchShort}</span>
            <span className="hidden sm:inline">{switchFull}</span>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationBell />
          <Link
            href={isAuthenticated ? '/profile' : '/login'}
            className="inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
            style={{
              background: 'var(--ink)',
              color: 'var(--bg-base)',
            }}
          >
            {isAuthenticated ? t('nav.profile') : t('nav.login')}
          </Link>
        </div>
      </div>
    </header>
  )
}
