'use client'

import Link from 'next/link'
import { useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const canSubmit = email.includes('@') && !submitting

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('forgot.badge')}</Badge>}
          line1={t('forgot.title_1')}
          gradient={t('forgot.title_2')}
          subtitle={t('forgot.subtitle')}
        />

        {sent ? (
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
              {t('forgot.success')}
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!canSubmit) return
              setSubmitting(true)
              setTimeout(() => {
                setSubmitting(false)
                setSent(true)
                toast.show(t('toast.reset_link_sent'))
              }, 700)
            }}
            className="mt-6 flex flex-col gap-3.5"
          >
            <Field
              label={t('forgot.email_label')}
              placeholder={t('forgot.email_placeholder')}
              type="email"
              dirOverride="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <PrimaryButton
              type="submit"
              disabled={!canSubmit}
              loading={submitting}
              className="mt-1.5"
            >
              {t('forgot.submit')}
            </PrimaryButton>
          </form>
        )}

        <p className="mt-5 text-center text-[0.8rem]">
          <Link
            href="/login"
            className="font-medium underline-offset-4 hover:underline"
            style={{ color: 'var(--ink)' }}
          >
            {t('forgot.back_to_login')}
          </Link>
        </p>
      </section>
    </PageContainer>
  )
}
