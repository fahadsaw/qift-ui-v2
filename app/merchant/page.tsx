'use client'

import Link from 'next/link'
import { useState } from 'react'
import AddressForm, { type AddressValue } from '@/components/AddressForm'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { schemaFor } from '@/lib/addresses'
import { useI18n } from '@/lib/i18n'

export default function MerchantPage() {
  const { t } = useI18n()
  const [form, setForm] = useState({
    storeName: '',
    owner: '',
    cr: '',
    email: '',
    phone: '',
    website: '',
  })
  const [address, setAddress] = useState<AddressValue>({
    country: 'SA',
    details: {},
  })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const schema = schemaFor(address.country)
  const addressFilled =
    !!schema &&
    schema.fields
      .filter((f) => !f.optional)
      .every((f) => (address.details[f.key] ?? '').trim().length > 0)

  const canSubmit =
    form.storeName.trim().length >= 2 &&
    form.owner.trim().length >= 2 &&
    form.cr.trim().length >= 4 &&
    form.email.includes('@') &&
    form.phone.trim().length >= 6 &&
    addressFilled &&
    !submitting

  if (submitted) {
    return (
      <PageContainer>
        <section className="pt-6">
          <PageHeading
            badge={<Badge>{t('merchant.badge')}</Badge>}
            line1={t('merchant.title_1')}
            gradient={t('merchant.title_2')}
            subtitle={t('merchant.success')}
          />
          <div className="mt-6">
            <PrimaryButton href="/">{t('notfound.cta')}</PrimaryButton>
          </div>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('merchant.badge')}</Badge>}
          line1={t('merchant.title_1')}
          gradient={t('merchant.title_2')}
          subtitle={t('merchant.subtitle')}
          size="sm"
        />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSubmit) return
            setSubmitting(true)
            setTimeout(() => {
              setSubmitting(false)
              setSubmitted(true)
            }, 700)
          }}
          className="mt-5 flex flex-col gap-6"
        >
          <fieldset className="flex flex-col gap-3.5">
            <SectionLabel>{t('login.merchant_title')}</SectionLabel>
            <Field
              label={t('merchant.store_name')}
              value={form.storeName}
              onChange={update('storeName')}
            />
            <Field
              label={t('merchant.owner')}
              value={form.owner}
              onChange={update('owner')}
              autoComplete="name"
            />
            <Field
              label={t('merchant.cr')}
              value={form.cr}
              onChange={update('cr')}
              dirOverride="ltr"
            />
            <Field
              label={t('merchant.email')}
              type="email"
              value={form.email}
              onChange={update('email')}
              dirOverride="ltr"
              autoComplete="email"
            />
            <Field
              label={t('merchant.phone')}
              type="tel"
              value={form.phone}
              onChange={update('phone')}
              dirOverride="ltr"
              autoComplete="tel"
            />
            <Field
              label={t('merchant.website')}
              optional={t('merchant.website_optional')}
              placeholder="https://"
              type="url"
              value={form.website}
              onChange={update('website')}
              dirOverride="ltr"
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3.5">
            <SectionLabel>{t('merchant.store_address_section')}</SectionLabel>
            <AddressForm value={address} onChange={setAddress} />
          </fieldset>

          <PrimaryButton type="submit" disabled={!canSubmit} loading={submitting}>
            {t('merchant.submit')}
          </PrimaryButton>
        </form>

        <p
          className="mt-4 text-center text-[0.8rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('merchant.have_account')}{' '}
          <Link
            href="/login"
            className="font-medium underline-offset-4 hover:underline"
            style={{ color: 'var(--ink)' }}
          >
            {t('merchant.login_link')}
          </Link>
        </p>
      </section>
    </PageContainer>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold tracking-[0.3em]"
      style={{ color: 'var(--primary)' }}
    >
      {children}
    </h2>
  )
}
