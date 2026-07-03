'use client'

import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'

// Track A6 / PE-07: this page previously rendered a contact FORM whose
// submit was a 700ms setTimeout — the message went nowhere while the
// user saw "received, thank you". Until a real intake path exists
// (ticketing or a backend endpoint), the honest version is a direct
// channel: the support mailbox, stated plainly. No fake success states.
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@qift.net'

export default function ContactPage() {
  const { t } = useI18n()

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('contact.badge')}</Badge>}
          line1={t('contact.title_1')}
          gradient={t('contact.title_2')}
          subtitle={t('contact.subtitle')}
        />

        <div
          className="mt-8 rounded-3xl border p-6 text-center backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <p
            className="text-base font-medium leading-relaxed"
            style={{ color: 'var(--ink)' }}
          >
            {t('contact.direct_note')}
          </p>

          <p className="mt-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {t('contact.email')}
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            dir="ltr"
            className="mt-1 inline-block select-all text-lg font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            {SUPPORT_EMAIL}
          </a>

          <p
            className="mt-4 text-sm leading-relaxed"
            style={{ color: 'var(--ink-soft)' }}
          >
            {t('contact.response_note')}
          </p>

          <PrimaryButton href={`mailto:${SUPPORT_EMAIL}`} className="mt-5">
            {t('contact.email_button')}
          </PrimaryButton>
        </div>
      </section>
    </PageContainer>
  )
}
