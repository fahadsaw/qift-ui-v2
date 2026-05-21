'use client'

// Customer-facing Terms & Conditions surface.
//
// Wave 1 of the closed-beta legal hardening (anchored in
// LEGAL_REVIEW_PACK.md §2.6 + §22.A). The page composes a small
// number of calm, premium prose sections — not a wall of legalese.
// Every section has its content in lib/translations.ts so the
// Arabic + English wording stays the canonical surface.
//
// The closed-beta banner at the top is the most operationally
// load-bearing element on this page: it makes the "simulated
// transaction" posture visible the moment a user lands on the
// page, before any other content. Render-time only — when the
// public launch arrives, the banner is dropped via env flag,
// not via a redeploy of this file.

import PageContainer from '@/components/PageContainer'
import { useI18n } from '@/lib/i18n'

// 8 sections, Wave 1 closed-beta focus.
// Section order is the reader's natural narrative:
//   s1  Welcome — what Qift is, in plain language
//   s2  What Qift IS and IS NOT — explicit boundaries (§2.6)
//   s3  Closed beta — simulated transactions (§22.A) — flagship
//   s4  Merchant operational responsibilities
//   s5  Settlement, payouts, and temporary holds
//   s6  Operational control — Qift's review rights
//   s7  Recipient privacy — cross-reference to /privacy
//   s8  Contact + changes to these terms
const SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const

export default function TermsPage() {
  const { t } = useI18n()
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <h1
          className="text-[2rem] font-extrabold tracking-tight sm:text-[2.4rem]"
          style={{ color: 'var(--ink)' }}
        >
          {t('terms.title')}
        </h1>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          {t('terms.updated')}
        </p>

        {/* Closed-beta banner. Calm warm accent so a user
            understands the legal envelope before reading any
            section. Drop the wrapper once the public-launch env
            flag is flipped — render-time decision, no redeploy. */}
        <div
          role="status"
          className="qift-fade-in mt-4 rounded-2xl border p-4 backdrop-blur-md"
          style={{
            borderColor:
              'color-mix(in srgb, #E89B3A 35%, var(--border))',
            background:
              'linear-gradient(135deg, rgba(232, 155, 58, 0.10) 0%, var(--card) 100%)',
          }}
        >
          <p
            className="text-[0.7rem] font-semibold tracking-[0.18em]"
            style={{ color: '#E89B3A' }}
          >
            {t('terms.beta_eyebrow')}
          </p>
          <p
            className="mt-1 text-sm leading-relaxed"
            style={{ color: 'var(--ink)' }}
          >
            {t('terms.beta_body')}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {SECTION_KEYS.map((k) => (
            <article
              key={k}
              className="rounded-2xl border p-5 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
            >
              <h2
                className="text-sm font-bold tracking-tight"
                style={{ color: 'var(--ink)' }}
              >
                {t(`terms.${k}_title`)}
              </h2>
              <p
                className="mt-2 text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--text-soft)' }}
              >
                {t(`terms.${k}_body`)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </PageContainer>
  )
}
