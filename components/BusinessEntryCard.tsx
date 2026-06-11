'use client'

// Qift Business entry card (entry-experience fix). Renders on the
// PERSONAL account page (/profile) for EVERY role — the original
// placement was a /settings hub row that the role-aware helper
// filtered away for merchants and admins, which made it invisible
// to exactly the people most likely to own companies. This card is
// role-independent and prominent: account page, above the tabs.
// Links to /business (the positioning page); owners with an
// existing org are one tap further (/org lists their companies).

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

export default function BusinessEntryCard() {
  const { t } = useI18n()
  return (
    <Link
      href="/business"
      className="mt-4 flex items-center justify-between gap-3 rounded-2xl border p-4 transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary) 35%, var(--border))',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--card)) 0%, var(--card) 70%)',
      }}
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-xl text-base"
          style={{
            background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
          }}
        >
          💼
        </span>
        <span>
          <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {t('settings.link_business')}
          </span>
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
            {t('settings.link_business_hint')}
          </span>
        </span>
      </span>
      <span aria-hidden className="text-sm" style={{ color: 'var(--primary)' }}>
        ←
      </span>
    </Link>
  )
}
