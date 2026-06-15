'use client'

// Qift Business landing (entry-experience phase).
//
// Structure per the approved pre-pilot review:
//   hero → dual-pillar band → how it works (4 steps) → privacy
//   deep-dive → smart purchasing (terms table) → governance →
//   merchant strip → FAQ → final CTA.
//
// Copy discipline: the smart-purchasing pillar is written to be
// TRUE in concierge mode ("assembled by Qift in one place") — no
// self-serve comparison promise until B3 ships. The merchant CTA is
// talk-to-us (self-serve apply is B5). The company CTA goes to /org,
// which gates login itself and shows existing orgs to returning
// owners.

import Link from 'next/link'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'

const panel = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
} as const

function SectionLabel({ children }: { children: string }) {
  return (
    <p
      className="text-xs font-semibold tracking-[0.2em]"
      style={{ color: 'var(--muted)' }}
    >
      {children}
    </p>
  )
}

export default function BusinessLanding() {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  // Auth-aware primary CTA (business-onboarding fix). A NEW owner is
  // the dominant audience for this marketing page, so logged-out
  // visitors get "create your company account" → /register?next=/org
  // (the create path, not a login wall). Returning owners go straight
  // to /org, which lists their companies. Sign-in is demoted to a
  // secondary link, clearly for existing users.
  const primaryHref = isAuthenticated ? '/org' : '/register?next=/org'
  const primaryLabel = isAuthenticated
    ? t('biz.cta_company')
    : t('biz.cta_create_account')

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-2xl pb-20 pt-6">
        {/* ── Hero ── */}
        <PageHeading
          badge={<Badge>{t('biz.badge')}</Badge>}
          line1={t('biz.hero_1')}
          gradient={t('biz.hero_2')}
          subtitle={t('biz.hero_sub')}
          size="lg"
        />
        <div className="mt-6 flex flex-col gap-2">
          <PrimaryButton href={primaryHref}>{primaryLabel}</PrimaryButton>
          <SecondaryButton href="/contact">{t('biz.cta_talk')}</SecondaryButton>
          {!isAuthenticated ? (
            <p className="mt-1 text-center text-xs" style={{ color: 'var(--muted)' }}>
              {t('biz.cta_login_pre')}{' '}
              <Link
                href="/login?next=/org"
                className="font-semibold underline-offset-2 hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                {t('biz.cta_login')}
              </Link>
            </p>
          ) : null}
        </div>

        {/* ── Dual pillars ── */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl p-5" style={panel}>
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
              {t('biz.pillar_privacy_title')}
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
              {t('biz.pillar_privacy_body')}
            </p>
          </div>
          <div className="rounded-2xl p-5" style={panel}>
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
              {t('biz.pillar_smart_title')}
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
              {t('biz.pillar_smart_body')}
            </p>
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="mt-12">
          <SectionLabel>{t('biz.how_label')}</SectionLabel>
          <div className="mt-3 flex flex-col gap-3">
            {([1, 2, 3, 4] as const).map((n) => (
              <div key={n} className="flex items-start gap-3 rounded-2xl p-4" style={panel}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                    color: 'var(--primary)',
                  }}
                >
                  {n}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                  {t(`biz.step_${n}`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Privacy deep-dive ── */}
        <div className="mt-12">
          <SectionLabel>{t('biz.privacy_label')}</SectionLabel>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl p-5" style={panel}>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t('biz.privacy_employee_caption')}
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                {t('biz.privacy_employee_body')}
              </p>
            </div>
            <div className="rounded-2xl p-5" style={panel}>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t('biz.privacy_company_caption')}
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                {t('biz.privacy_company_body')}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--muted-2)' }}>
            {t('biz.privacy_retention')}
          </p>
        </div>

        {/* ── Smart purchasing ── */}
        <div className="mt-12">
          <SectionLabel>{t('biz.smart_label')}</SectionLabel>
          <div className="mt-3 overflow-hidden rounded-2xl" style={panel}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  {(['merchant', 'price', 'qty', 'lead'] as const).map((h) => (
                    <th key={h} className="px-3 py-2.5 text-start text-[0.7rem] font-semibold">
                      {t(`biz.table_${h}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-soft)' }}>
                {([1, 2] as const).map((r) => (
                  <tr key={r} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2.5">{t(`biz.table_r${r}_merchant`)}</td>
                    <td className="px-3 py-2.5">{t(`biz.table_r${r}_price`)}</td>
                    <td className="px-3 py-2.5">{t(`biz.table_r${r}_qty`)}</td>
                    <td className="px-3 py-2.5">{t(`biz.table_r${r}_lead`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {t('biz.smart_caption')}
          </p>
          <p
            className="mt-3 rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
              color: 'var(--text-soft)',
            }}
          >
            {t('biz.smart_110')}
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted-2)' }}>
            {t('biz.smart_soon')}
          </p>
        </div>

        {/* ── Governance ── */}
        <div className="mt-12 rounded-2xl p-5" style={panel}>
          <SectionLabel>{t('biz.gov_label')}</SectionLabel>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
            {t('biz.gov_body')}
          </p>
        </div>

        {/* ── Merchant strip ── */}
        <div
          className="mt-12 rounded-2xl p-5"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid var(--border)',
          }}
        >
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
            {t('biz.merchant_title')}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
            {t('biz.merchant_body')}
          </p>
          <div className="mt-4">
            <SecondaryButton href="/contact">{t('biz.merchant_cta')}</SecondaryButton>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mt-12">
          <SectionLabel>{t('biz.faq_label')}</SectionLabel>
          <div className="mt-3 flex flex-col gap-2">
            {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) => (
              <details key={n} className="rounded-2xl p-4" style={panel}>
                <summary
                  className="cursor-pointer text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {t(`biz.faq_q${n}`)}
                </summary>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                  {t(`biz.faq_a${n}`)}
                </p>
              </details>
            ))}
          </div>
        </div>

        {/* ── Final CTA ── */}
        <div className="mt-12 text-center">
          <PageHeading line1={t('biz.final_1')} gradient={t('biz.final_2')} size="sm" />
          <div className="mt-5 flex flex-col gap-2">
            <PrimaryButton href={primaryHref}>{primaryLabel}</PrimaryButton>
            <SecondaryButton href="/contact">{t('biz.cta_talk')}</SecondaryButton>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
