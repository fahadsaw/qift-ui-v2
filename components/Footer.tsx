'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

export default function Footer() {
  const { t } = useI18n()
  const links = [
    { href: '/privacy', key: 'footer.privacy' },
    { href: '/terms', key: 'footer.terms' },
    { href: '/contact', key: 'footer.contact' },
    { href: '/merchant', key: 'footer.merchant' },
  ]
  return (
    <footer
      className="mt-16 backdrop-blur-md"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-7 sm:max-w-2xl sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--text-soft)' }}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <div
          className="flex items-center justify-between gap-6 text-[0.7rem] font-medium sm:justify-end"
          style={{ color: 'var(--muted)' }}
        >
          <span>{t('brand.copyright')}</span>
          <span className="tracking-[0.3em]">{t('brand.tagline')}</span>
        </div>
      </div>
    </footer>
  )
}
