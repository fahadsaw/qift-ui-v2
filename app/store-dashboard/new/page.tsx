'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { createStore } from '@/lib/storesApi'
import {
  COUNTRIES_LIST,
  getLocationConfig,
  getTierOptions,
} from '@/lib/locations'

// Categories that drive product/store classification. Mirrors backend's
// `StoreCategory` (see lib/sampleData.ts) so the same labels render
// across the storefront and the dashboard.
const CATEGORY_OPTIONS: { code: string; labelKey: string }[] = [
  { code: 'flowers', labelKey: 'store.cat_flowers' },
  { code: 'chocolate', labelKey: 'store.cat_chocolate' },
  { code: 'cake', labelKey: 'store.cat_cake' },
  { code: 'perishable', labelKey: 'store.cat_perishable' },
  { code: 'perfume', labelKey: 'store.cat_perfume' },
  { code: 'gifts', labelKey: 'store.cat_gifts' },
  { code: 'other', labelKey: 'store.cat_other' },
]

export default function CreateStorePage() {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()

  const [name, setName] = useState('')
  // Location is captured as a structured (country, region, city) tuple
  // so the merchant's store appears in the same dropdowns the buyer
  // uses to filter /stores. The backend's /stores POST currently
  // accepts a single `city` string; we pass the catalog-selected city
  // there and keep region client-side until the backend grows
  // dedicated columns. See lib/locations.ts BACKEND_LOCATION_FIELDS
  // for the full target schema.
  const [country, setCountry] = useState<string>('SA')
  const [region, setRegion] = useState<string>('')
  const [city, setCity] = useState<string>('')
  const [category, setCategory] = useState<string>('flowers')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated === false) router.replace('/login?next=/store-dashboard/new')
  }, [isAuthenticated, router])

  const locationConfig = useMemo(() => getLocationConfig(country), [country])
  // For the create-store flow we surface the top two tiers (region
  // + city). The deeper district/area filter lives on /stores itself
  // so buyers can narrow within a city; merchants only need to tell
  // us where the storefront IS.
  const tier1Field = locationConfig?.tiers[0]
  const tier2Field = locationConfig?.tiers[1]
  const tier1Options = locationConfig
    ? getTierOptions(country, 1, {})
    : []
  const tier2Options = locationConfig && region
    ? getTierOptions(country, 2, { tier1: region })
    : []

  const canSubmit =
    name.trim().length >= 2 &&
    city.trim().length >= 2 &&
    !!region &&
    !submitting

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !accessToken) return
    setSubmitting(true)
    try {
      await createStore(accessToken, {
        name: name.trim(),
        city: city.trim(),
        category,
      })
      toast.show(t('store.create_success'))
      router.push('/store-dashboard')
    } catch {
      toast.show(t('store.create_failed'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('store.badge')}</Badge>}
          line1={t('store.create_title_1')}
          gradient={t('store.create_title_2')}
          subtitle={t('store.create_subtitle')}
          size="sm"
        />

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3.5">
          <Field
            label={t('store.field_name')}
            placeholder={t('store.field_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
          />
          {/* Structured location pickers. Merchant picks country first
              then region (or emirate / governorate / municipality —
              the label adapts per country) and finally city. The
              dropdowns are populated from the unified location
              catalog (lib/locations.ts), the same source the buyer's
              /stores filter and the address book read from — so
              merchants and buyers see the same vocabulary. When a
              country has no catalog entries (the OTHER country)
              the city falls back to free text. */}
          <div>
            <span
              className="mb-2 block text-xs font-semibold tracking-[0.2em]"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('register.country_label')}
            </span>
            <div className="-mx-1 flex flex-wrap gap-2">
              {COUNTRIES_LIST.filter((c) => c.code !== 'OTHER').map((c) => {
                const active = c.code === country
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      setCountry(c.code)
                      setRegion('')
                      setCity('')
                    }}
                    className="rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                    style={{
                      borderColor: active ? 'transparent' : 'var(--border)',
                      background: active
                        ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                        : 'var(--card-soft)',
                      color: active ? '#fff' : 'var(--text-soft)',
                      fontWeight: active ? 600 : 500,
                      boxShadow: active ? 'var(--shadow-soft)' : undefined,
                    }}
                  >
                    {c.flag} {c.name.ar}
                  </button>
                )
              })}
            </div>
          </div>
          {tier1Field && (
            <LocationSelect
              label={t(tier1Field.labelKey)}
              value={region}
              options={tier1Options}
              onChange={(v) => {
                setRegion(v)
                setCity('')
              }}
              placeholder={t('stores.choose')}
            />
          )}
          {tier2Field && (
            <LocationSelect
              label={t(tier2Field.labelKey)}
              value={city}
              options={tier2Options}
              onChange={setCity}
              placeholder={
                tier2Options.length === 0
                  ? t('stores.select_region_first')
                  : t('stores.choose')
              }
              disabled={tier2Options.length === 0}
            />
          )}
          <div>
            <span
              className="mb-2 block text-xs font-semibold tracking-[0.2em]"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('store.field_category')}
            </span>
            <div className="-mx-1 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => {
                const active = c.code === category
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCategory(c.code)}
                    className="rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                    style={{
                      borderColor: active ? 'transparent' : 'var(--border)',
                      background: active
                        ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                        : 'var(--card-soft)',
                      color: active ? '#fff' : 'var(--text-soft)',
                      fontWeight: active ? 600 : 500,
                      boxShadow: active ? 'var(--shadow-soft)' : undefined,
                    }}
                  >
                    {t(c.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          <PrimaryButton
            type="submit"
            disabled={!canSubmit}
            loading={submitting}
            className="mt-2"
          >
            {t('store.create_submit')}
          </PrimaryButton>
        </form>
      </section>
    </PageContainer>
  )
}

function LocationSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span
        className="mb-2 block text-xs font-semibold tracking-[0.2em]"
        style={{ color: disabled ? 'var(--muted-2)' : 'var(--text-soft)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-2xl border bg-[var(--card)] px-5 py-[1.05rem] text-base font-medium backdrop-blur-md transition-colors focus:outline-none disabled:cursor-not-allowed"
        style={{
          borderColor: 'var(--border-strong)',
          color: value ? 'var(--text)' : 'var(--placeholder)',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <option value="">{placeholder ?? '—'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
