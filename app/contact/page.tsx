'use client'

import { useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

export default function ContactPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const update =
    (key: keyof typeof form) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.email.includes('@') &&
    form.message.trim().length >= 4 &&
    !submitting

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('contact.badge')}</Badge>}
          line1={t('contact.title_1')}
          gradient={t('contact.title_2')}
          subtitle={t('contact.subtitle')}
        />

        {done ? (
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
              {t('contact.success')}
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
                setDone(true)
                toast.show(t('toast.message_sent'))
              }, 700)
            }}
            className="mt-6 flex flex-col gap-3.5"
          >
            <Field
              label={t('contact.name')}
              value={form.name}
              onChange={update('name') as React.ChangeEventHandler<HTMLInputElement>}
              autoComplete="name"
            />
            <Field
              label={t('contact.email')}
              type="email"
              dirOverride="ltr"
              value={form.email}
              onChange={update('email') as React.ChangeEventHandler<HTMLInputElement>}
              autoComplete="email"
            />
            <Field
              label={t('contact.subject')}
              value={form.subject}
              onChange={update('subject') as React.ChangeEventHandler<HTMLInputElement>}
            />
            <Field
              label={t('contact.message')}
              value={form.message}
              onChange={update('message') as React.ChangeEventHandler<HTMLTextAreaElement>}
              multiline
              rows={5}
            />

            <PrimaryButton
              type="submit"
              disabled={!canSubmit}
              loading={submitting}
              className="mt-1.5"
            >
              {t('contact.submit')}
            </PrimaryButton>
          </form>
        )}
      </section>
    </PageContainer>
  )
}
