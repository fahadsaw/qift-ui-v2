'use client'

// Business console topbar (entry-experience phase). The Business →
// Consumer bridge lives here: an always-visible "Qift Personal"
// switch, so moving between the two worlds is one tap in each
// direction (the consumer side's bridge is the Account-hub row).
// Brand anchors to /org — inside the console, "home" means the
// org hub, not the consumer feed.

import Link from 'next/link'
import Brand from './Brand'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

export default function BusinessTopbar() {
  const { t } = useI18n()
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
          <Brand href="/org" />
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
        </div>
      </div>
    </div>
  )
}
