'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { createStore } from '@/lib/storesApi'

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
  const [city, setCity] = useState('')
  const [category, setCategory] = useState<string>('flowers')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated === false) router.replace('/login?next=/store-dashboard/new')
  }, [isAuthenticated, router])

  const canSubmit =
    name.trim().length >= 2 && city.trim().length >= 2 && !submitting

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
          <Field
            label={t('store.field_city')}
            placeholder={t('store.field_city_placeholder')}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
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
