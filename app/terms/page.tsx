'use client'

import PageContainer from '@/components/PageContainer'
import { useI18n } from '@/lib/i18n'

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

        <div
          className="mt-4 rounded-2xl border p-3.5 text-xs leading-relaxed"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('legal.disclaimer')}
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
                className="mt-2 text-sm leading-relaxed"
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
