'use client'

// Quick links grid — the Merchant OS hub. 2×2 tile layout:
// Coverage · Payouts · Plan · Add product. Replaces the older
// FastActions row + three stacked entry cards with a single
// scannable block. Plan tile carries a tier badge showing the
// lowest tier across the merchant's stores at a glance.

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { MERCHANT_FINANCE_ENABLED } from '@/lib/merchantFinanceAccess'
import type { ApiStore } from '@/lib/storesApi'

export function QuickLinksGrid({
  firstStoreId,
  onAddProduct,
  stores,
}: {
  firstStoreId: string | null
  onAddProduct: () => void
  stores: ApiStore[]
}) {
  const { t } = useI18n()
  // Lowest plan across the merchant's stores wins for the plan
  // tile badge — surface the worst case so the merchant sees
  // gating at a glance.
  const order = ['starter', 'pro', 'enterprise'] as const
  const lowestPlan = stores.reduce<(typeof order)[number]>((acc, s) => {
    const plan = (s.plan ?? 'starter') as (typeof order)[number]
    return order.indexOf(plan) < order.indexOf(acc) ? plan : acc
  }, 'enterprise')
  return (
    <section className="mt-6">
      <h2
        className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('store.quick_links_section')}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <QuickLinkTile
          href="/store-dashboard/coverage"
          labelKey="store.quick_link_coverage"
          glyph={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          }
        />
        <QuickLinkTile
          href="/store-dashboard/payouts"
          labelKey="store.quick_link_payouts"
          glyph={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M3 10h18" />
              <path d="M7 14h6" />
            </svg>
          }
        />
        <QuickLinkTile
          href="/store-dashboard/plan"
          labelKey="store.quick_link_plan"
          chip={t(`plan.tier_${lowestPlan}`)}
          chipTone={
            lowestPlan === 'enterprise'
              ? 'accent'
              : lowestPlan === 'pro'
                ? 'primary'
                : 'muted'
          }
          glyph={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 2l2.4 5.4 5.6.6-4.2 4 1.2 5.8L12 14.9 6.9 17.8 8.1 12 4 8l5.6-.6L12 2z" />
            </svg>
          }
        />
        <QuickLinkTile
          labelKey="store.quick_link_add_product"
          onClick={firstStoreId ? onAddProduct : undefined}
          href={firstStoreId ? null : '/store-dashboard/new'}
          glyph={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          }
        />
        {/* Merchant financial dashboard — flag-gated entry point.
            Appears only when NEXT_PUBLIC_SHOW_MERCHANT_FINANCE=1; the
            new dashboard page itself also redirects out when the
            flag is off, so a deep-link to /store-dashboard/finance
            doesn't bypass this gate. */}
        {MERCHANT_FINANCE_ENABLED && (
          <QuickLinkTile
            href="/store-dashboard/finance"
            labelKey="store.quick_link_finance"
            glyph={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
              </svg>
            }
          />
        )}
      </div>
    </section>
  )
}

function QuickLinkTile({
  labelKey,
  href,
  onClick,
  glyph,
  chip,
  chipTone,
}: {
  labelKey: string
  href?: string | null
  onClick?: () => void
  glyph: React.ReactNode
  chip?: string
  chipTone?: 'accent' | 'primary' | 'muted'
}) {
  const { t } = useI18n()
  const chipPalette =
    chipTone === 'accent'
      ? {
          bg: 'color-mix(in srgb, var(--accent) 18%, transparent)',
          fg: 'var(--accent)',
        }
      : chipTone === 'primary'
        ? {
            bg: 'color-mix(in srgb, var(--primary) 14%, transparent)',
            fg: 'var(--primary)',
          }
        : { bg: 'var(--ring)', fg: 'var(--text-soft)' }
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          }}
        >
          {glyph}
        </span>
        <span
          className="min-w-0 truncate text-[0.78rem] font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {t(labelKey)}
        </span>
      </div>
      {chip && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em]"
          style={{ background: chipPalette.bg, color: chipPalette.fg }}
        >
          {chip}
        </span>
      )}
    </>
  )
  const className =
    'qift-press flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 backdrop-blur-md transition-all hover:-translate-y-0.5'
  const style = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    boxShadow: 'var(--shadow-soft)',
  } as const
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} w-full text-start`}
      style={style}
    >
      {body}
    </button>
  )
}
