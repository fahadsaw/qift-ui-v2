'use client'

// Customer-facing Privacy surface.
//
// Wave 1 of the closed-beta legal hardening. The flagship section
// (s2 — recipient privacy invariant) is the load-bearing piece:
// "when you send a gift via Qift, the recipient's address is
// never visible to you" is one of the strongest trust signals
// the platform has. The privacy page is the right surface to
// say it clearly.
//
// PDPL framing in s6 references the LEGAL_REVIEW_PACK §13 PDPL
// section; the customer-facing wording is intentionally lighter
// than the legal pack's regulator-facing wording.

import PageContainer from '@/components/PageContainer'
import { useI18n } from '@/lib/i18n'

// 8 sections.
//   s1  The privacy principle — calm opening
//   s2  Recipient privacy invariant (FLAGSHIP) — what senders + merchants
//       can NEVER see
//   s3  What we collect, why, and from whom
//   s4  What each party can see — asymmetric matrix
//   s5  Where data lives + how long we keep it
//   s6  Your rights under Saudi PDPL
//   s7  Closed-beta posture — PDPL applies to sandbox records too
//   s8  Contact for privacy requests
const SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const

export default function PrivacyPage() {
  const { t } = useI18n()
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <h1
          className="text-[2rem] font-extrabold tracking-tight sm:text-[2.4rem]"
          style={{ color: 'var(--ink)' }}
        >
          {t('privacy.title')}
        </h1>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          {t('privacy.updated')}
        </p>

        {/* Closed-beta banner — same shape as the one on /terms so
            the customer recognizes the framing the moment they
            land on either page. */}
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
            {t('privacy.beta_eyebrow')}
          </p>
          <p
            className="mt-1 text-sm leading-relaxed"
            style={{ color: 'var(--ink)' }}
          >
            {t('privacy.beta_body')}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {SECTION_KEYS.map((k) => (
            <article
              key={k}
              className="rounded-2xl border p-5 backdrop-blur-md"
              style={{
                borderColor:
                  k === 's2'
                    ? 'color-mix(in srgb, var(--primary) 38%, var(--border))'
                    : 'var(--border)',
                background:
                  k === 's2'
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent) 0%, var(--card) 100%)'
                    : 'var(--card)',
              }}
            >
              {/* The flagship recipient-privacy section gets a calm
                  primary-accent eyebrow + slightly heavier card
                  treatment so it reads as the load-bearing
                  statement on the page, not just one of eight
                  rows. */}
              {k === 's2' && (
                <p
                  className="text-[0.65rem] font-semibold tracking-[0.18em]"
                  style={{ color: 'var(--primary)' }}
                >
                  {t('privacy.s2_eyebrow')}
                </p>
              )}
              <h2
                className="text-sm font-bold tracking-tight"
                style={{
                  color: 'var(--ink)',
                  marginTop: k === 's2' ? '0.25rem' : undefined,
                }}
              >
                {t(`privacy.${k}_title`)}
              </h2>
              <p
                className="mt-2 text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--text-soft)' }}
              >
                {t(`privacy.${k}_body`)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </PageContainer>
  )
}
