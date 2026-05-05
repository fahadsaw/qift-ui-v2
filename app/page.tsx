'use client'

import Badge from '@/components/Badge'
import GradientText from '@/components/GradientText'
import PageContainer from '@/components/PageContainer'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useI18n } from '@/lib/i18n'

export default function Page() {
  const { t } = useI18n()

  const features = [
    {
      n: '01',
      title: t('home.feature_1_title'),
      body: t('home.feature_1_body'),
    },
    {
      n: '02',
      title: t('home.feature_2_title'),
      body: t('home.feature_2_body'),
    },
    {
      n: '03',
      title: t('home.feature_3_title'),
      body: t('home.feature_3_body'),
    },
  ]

  return (
    <PageContainer>
      <section className="flex flex-col pt-6">
        <Badge>{t('home.badge')}</Badge>

        <h1
          className="mt-4 text-[2.6rem] font-extrabold leading-[1.15] tracking-tight sm:text-[3.2rem]"
          style={{ color: 'var(--ink)' }}
        >
          {t('home.headline_1')}
          <br />
          <GradientText>{t('home.headline_2')}</GradientText>
          <br />
          {t('home.headline_3')}
        </h1>

        <p
          className="mt-3 max-w-md text-base leading-relaxed sm:text-lg"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('home.subtitle')}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <PrimaryButton href="/login">
            {t('home.cta_primary')}
          </PrimaryButton>
          <SecondaryButton href="/how-it-works">
            {t('home.cta_secondary')}
          </SecondaryButton>
        </div>
      </section>

      <section
        id="how"
        className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border sm:grid-cols-3"
        style={{
          borderColor: 'var(--border-soft)',
          background: 'var(--border-soft)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {features.map((f) => (
          <div
            key={f.n}
            className="p-6 transition-colors"
            style={{ background: 'var(--surface)' }}
          >
            <span
              className="text-xs font-semibold tracking-widest"
              style={{ color: 'var(--primary)' }}
            >
              {f.n}
            </span>
            <h3
              className="mt-3 text-base font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {f.title}
            </h3>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </section>
    </PageContainer>
  )
}
