'use client'

// Business topbar — the ONLY chrome on business pages (/business +
// /org/*). The Business → Consumer bridge lives here: an always-
// visible "Qift Personal" pill, so moving between the two worlds is
// one tap in each direction. Brand anchors to /business — inside
// the business world, "home" means the business front door, never
// the consumer feed. Login renders only when logged out (the /org
// pages gate themselves; this is the convenience entry). Business
// pages NEVER inherit consumer search/explore/send navigation.

import Link from 'next/link'
import Brand from './Brand'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

export default function BusinessTopbar() {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  return (
    <div
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
      }}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <Brand href="/business" />
          <span
            className="rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.15em]"
            style={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            {t('biz.shell_tag')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--primary) 45%, var(--border))',
              color: 'var(--primary)',
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            }}
          >
            <span className="sm:hidden">{t('nav.personal_short')}</span>
            <span className="hidden sm:inline">{t('nav.personal_full')}</span>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          {!isAuthenticated && (
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--bg-base)' }}
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
