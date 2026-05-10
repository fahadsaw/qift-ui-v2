'use client'

// Live merchant delivery-coverage editor.
//
// Replaces the "coming soon" placeholder with a real editor: each
// owned store gets its own zone list and a save button that PATCHes
// the same { city, districts? } payload as the onboarding flow.
//
// PRIVACY: this is the merchant's own data — coverage is configured
// by the store owner only (StoreGuard enforces ownership server-side).
// No customer-facing surface.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import Skeleton from '@/components/Skeleton'
import ZoneEditor from '@/components/ZoneEditor'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  getOwnerStore,
  listMyStores,
  patchStore,
  type ApiStore,
  type OwnerStore,
} from '@/lib/storesApi'
import {
  buildZonePayload,
  hydrateZoneDrafts,
  newZoneDraft,
  type ZoneDraft,
} from '@/lib/zoneDraft'

export default function CoveragePage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [stores, setStores] = useState<ApiStore[] | null>(null)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/coverage')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) return
      const list = await listMyStores(accessToken)
      if (!cancelled) setStores(list)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('coverage.title_1')}
          gradient={t('coverage.title_2')}
          subtitle={t('coverage.subtitle')}
          size="sm"
        />

        <div className="mt-3">
          <Link
            href="/store-dashboard"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('coverage.back')}
          </Link>
        </div>

        {stores === null ? (
          <Card className="mt-5">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-3 h-24 w-full" rounded="2xl" />
          </Card>
        ) : stores.length === 0 ? (
          <Card className="mt-5">
            <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
              {t('coverage.no_stores')}
            </p>
            <div className="mt-3">
              <PrimaryButton href="/store-dashboard/new">
                {t('coverage.create_store_cta')}
              </PrimaryButton>
            </div>
          </Card>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {stores.map((s) => (
              <CoverageStoreEditor
                key={s.id}
                store={s}
                accessToken={accessToken!}
              />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  )
}

// One store's coverage card. Lazy-loads the rich OwnerStore shape
// so we have the persisted zones to seed the editor.
function CoverageStoreEditor({
  store,
  accessToken,
}: {
  store: ApiStore
  accessToken: string
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [owner, setOwner] = useState<OwnerStore | null>(null)
  const [zones, setZones] = useState<ZoneDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const o = await getOwnerStore(accessToken, store.id)
      if (cancelled) return
      setOwner(o)
      const drafts = hydrateZoneDrafts(o?.deliveryZones ?? null, 'SA')
      setZones(drafts.length ? drafts : [newZoneDraft('SA')])
      setDirty(false)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, store.id])

  const onSave = async () => {
    if (saving) return
    const validZones = buildZonePayload(zones)
    if (validZones.length === 0) {
      setError(t('coverage.error_no_zones'))
      return
    }
    setError(null)
    setSaving(true)
    try {
      await patchStore(accessToken, store.id, { deliveryZones: validZones })
      setDirty(false)
      toast.show(t('coverage.saved_toast'))
    } catch {
      setError(t('coverage.error_save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {store.name}
        </h2>
        <span
          className="text-[0.65rem] font-medium uppercase tracking-[0.16em]"
          style={{ color: 'var(--muted)' }}
        >
          {store.city}
        </span>
      </div>

      {owner === null ? (
        <Skeleton className="mt-3 h-24 w-full" rounded="2xl" />
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p
            className="text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('coverage.editor_intro')}
          </p>
          {zones.map((z, idx) => (
            <ZoneEditor
              key={z.key}
              zone={z}
              canRemove={zones.length > 1}
              onChange={(next) => {
                const copy = zones.slice()
                copy[idx] = next
                setZones(copy)
                setDirty(true)
              }}
              onRemove={() => {
                setZones(zones.filter((_, i) => i !== idx))
                setDirty(true)
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setZones([...zones, newZoneDraft('SA')])
              setDirty(true)
            }}
            className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--primary)',
            }}
          >
            + {t('merchant.add_zone')}
          </button>

          {error && (
            <p className="text-[0.7rem]" style={{ color: '#D55B6E' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || !dirty}
              className="qift-press rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {saving ? t('coverage.saving') : t('coverage.save')}
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
