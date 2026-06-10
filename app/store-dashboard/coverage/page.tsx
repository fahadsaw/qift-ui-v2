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
import CoverageTree from '@/components/CoverageTree'
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
  hasAnyCoverage,
  selectionFromZones,
  zonesFromSelectionCityDistrictOnly,
  type CoverageSelection,
} from '@/lib/coverageSelection'

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
// so we have the persisted zones to seed the tree.
//
// Hydration: legacy `{ city: ... }` rows (no country / no region)
// are reverse-looked-up via lib/coverageSelection so the tree
// renders them under the right country + region. City entries the
// catalog doesn't recognise are preserved as "orphans" and shown
// as removable chips at the bottom of the editor — they survive
// a save round-trip unchanged.
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
  const [selection, setSelection] = useState<CoverageSelection>({
    countries: {},
    orphans: [],
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const o = await getOwnerStore(accessToken, store.id)
      if (cancelled) return
      setOwner(o)
      setSelection(selectionFromZones(o?.deliveryZones ?? null))
      setDirty(false)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, store.id])

  const onSave = async () => {
    if (saving) return
    if (!hasAnyCoverage(selection)) {
      setError(t('coverage.error_no_zones'))
      return
    }
    // Closed-beta stopgap (PR 2a): emit city/district rows only —
    // the backend write path drops wildcard (country/region) rows,
    // which would silently persist narrower coverage than shown.
    const zones = zonesFromSelectionCityDistrictOnly(selection)
    setError(null)
    setSaving(true)
    try {
      await patchStore(accessToken, store.id, { deliveryZones: zones })
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

          <CoverageTree
            selection={selection}
            onChange={(next) => {
              setSelection(next)
              setDirty(true)
            }}
          />

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
