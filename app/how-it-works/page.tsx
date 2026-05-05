'use client'

import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'

export default function HowItWorksPage() {
  const { t } = useI18n()

  const steps = [
    { n: '01', title: t('how.step1_title'), body: t('how.step1_body') },
    { n: '02', title: t('how.step2_title'), body: t('how.step2_body') },
    { n: '03', title: t('how.step3_title'), body: t('how.step3_body') },
    { n: '04', title: t('how.step4_title'), body: t('how.step4_body') },
    { n: '05', title: t('how.step5_title'), body: t('how.step5_body') },
  ]

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('how.badge')}</Badge>}
          line1={t('how.title_1')}
          gradient={t('how.title_2')}
          subtitle={t('how.subtitle')}
          size="sm"
        />

        <ol className="mt-6 flex flex-col gap-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="flex items-start gap-4 rounded-3xl border p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--primary)',
                }}
              >
                {s.n}
              </span>
              <div>
                <h3
                  className="text-base font-bold tracking-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-7">
          <PrimaryButton href="/register">{t('how.cta')}</PrimaryButton>
        </div>
      </section>
    </PageContainer>
  )
}
