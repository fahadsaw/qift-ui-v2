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
