'use client'

// Merchant metrics visibility dashboard.
//
// Per-store, per-metric opt-in toggles. Every metric defaults to
// HIDDEN — the merchant explicitly turns each one on. This is the
// SAME opt-in basis as User.preferencesVisibility (Phase 2) and the
// same architectural promise: the platform never surfaces a
// commercial-sensitivity signal the merchant hasn't approved.
//
// Privacy model recap (see project_storefront_architecture.md Section 11):
//   - The DB column `Store.metricsVisibility` stores ONLY the
//     truthy flags. Unset / missing keys = hidden.
//   - The backend's public storefront projection drops every key
//     the merchant hasn't opted into BEFORE the wire ships.
//   - The `<MetricChip>` primitive guards on undefined / null
//     values so a hidden metric NEVER reaches a theme — even if
//     the projection had a bug, themes still can't render it.
//   - Themes never write to this state. The merchant is the only
//     authority.
//
// V1 scope:
//   - 8 metric keys, boolean each, one save button.
//   - No per-product overrides (whole-store policy).
//   - No anonymized aggregation tier (V2 idea — "show ranges
//     instead of exact counts").

import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  listMyStores,
  setStoreMetricsVisibility,
  type ApiStore,
} from '@/lib/storesApi'

// MUST mirror METRICS_VISIBILITY_KEYS in
// apps/api/src/stores/storefront-themes.ts. Order here drives the
// dashboard rendering order — pick the order that makes the most
// commercial sense first (wishlist-saves first, popularity-signal
// last).
const METRICS = [
  'wishlistSaves',
  'giftedCount',
  'purchaseCount',
  'ratingsCount',
  'trendingIndicator',
  'soldCount',
  'stockCount',
  'popularityScore',
] as const
type MetricKey = (typeof METRICS)[number]

// Per-metric "what does this expose, in plain words" so the
// merchant decides with their eyes open. The translation keys
// land in lib/translations.ts.
const METRIC_HELP: Record<MetricKey, { labelKey: string; helpKey: string }> = {
  wishlistSaves: {
    labelKey: 'visibility.metric_wishlistSaves',
    helpKey: 'visibility.metric_wishlistSaves_help',
  },
  giftedCount: {
    labelKey: 'visibility.metric_giftedCount',
    helpKey: 'visibility.metric_giftedCount_help',
  },
  purchaseCount: {
    labelKey: 'visibility.metric_purchaseCount',
    helpKey: 'visibility.metric_purchaseCount_help',
  },
  ratingsCount: {
    labelKey: 'visibility.metric_ratingsCount',
    helpKey: 'visibility.metric_ratingsCount_help',
  },
  trendingIndicator: {
    labelKey: 'visibility.metric_trendingIndicator',
    helpKey: 'visibility.metric_trendingIndicator_help',
  },
  soldCount: {
    labelKey: 'visibility.metric_soldCount',
    helpKey: 'visibility.metric_soldCount_help',
  },
  stockCount: {
    labelKey: 'visibility.metric_stockCount',
    helpKey: 'visibility.metric_stockCount_help',
  },
  popularityScore: {
    labelKey: 'visibility.metric_popularityScore',
    helpKey: 'visibility.metric_popularityScore_help',
  },
}

export default function StoreVisibilityPage() {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const [stores, setStores] = useState<ApiStore[] | null>(null)
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const list = await listMyStores(accessToken)
        if (cancelled) return
        setStores(list)
        if (list.length > 0 && activeStoreId === null) {
          setActiveStoreId(list[0].id)
        }
      } catch {
        if (!cancelled) setStores([])
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const activeStore = useMemo(
    () => stores?.find((s) => s.id === activeStoreId) ?? null,
    [stores, activeStoreId],
  )

  // Sync draft when the active store changes. Reads the live
  // `metricsVisibility` dict; unset keys read as false (hidden).
  // Wrapped in Promise.resolve().then() so the set-state doesn't
  // run synchronously inside the effect (mirrors the GiftPostViewer
  // wishlist-hydration pattern — same react-hooks lint rule).
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (!activeStore) {
        setDraft({})
        return
      }
      const live = (activeStore.metricsVisibility ?? {}) as Record<
        string,
        boolean
      >
      const next: Record<string, boolean> = {}
      for (const k of METRICS) next[k] = live[k] === true
      setDraft(next)
    })
    return () => {
      cancelled = true
    }
  }, [activeStore])

  const liveDict: Record<string, boolean> = useMemo(() => {
    const live = (activeStore?.metricsVisibility ?? {}) as Record<
      string,
      boolean
    >
    const out: Record<string, boolean> = {}
    for (const k of METRICS) out[k] = live[k] === true
    return out
  }, [activeStore])

  const isDirty = useMemo(() => {
    for (const k of METRICS) {
      if ((draft[k] ?? false) !== (liveDict[k] ?? false)) return true
    }
    return false
  }, [draft, liveDict])

  const enabledCount = useMemo(
    () => METRICS.filter((k) => draft[k]).length,
    [draft],
  )

  const onToggle = (k: MetricKey) => {
    setDraft((d) => ({ ...d, [k]: !d[k] }))
  }

  const onSave = async () => {
    if (!accessToken || !activeStore || !isDirty || saving) return
    setSaving(true)
    // Build the payload. We send only the truthy keys so the
    // backend's sanitizer ends up writing the minimal dict; when
    // nothing is on, we send `null` so the column resets to NULL
    // (the projection treats NULL as all-private).
    const payload: Record<string, boolean> = {}
    for (const k of METRICS) {
      if (draft[k]) payload[k] = true
    }
    const body = Object.keys(payload).length === 0 ? null : payload
    const previous = activeStore.metricsVisibility
    // Optimistic: splice the new dict into local state.
    setStores((prev) =>
      prev
        ? prev.map((s) =>
            s.id === activeStore.id ? { ...s, metricsVisibility: body } : s,
          )
        : prev,
    )
    try {
      await setStoreMetricsVisibility(accessToken, activeStore.id, body)
      toast.show(t('visibility.saved_toast'))
    } catch (err) {
      // Roll back.
      setStores((prev) =>
        prev
          ? prev.map((s) =>
              s.id === activeStore.id
                ? { ...s, metricsVisibility: previous }
                : s,
            )
          : prev,
      )
      const msg =
        err instanceof Error ? err.message : t('visibility.save_failed')
      toast.show(msg, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <PageContainer size="md">
        <section className="pt-6 qift-fade-in">
          <PageHeading
            badge={<Badge>{t('visibility.badge')}</Badge>}
            line1={t('visibility.title_1')}
            gradient={t('visibility.title_2')}
            subtitle={t('visibility.subtitle')}
            size="sm"
          />
          <p className="mt-4 text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('social.login_required')}
          </p>
        </section>
      </PageContainer>
    )
  }

  if (stores === null) {
    return (
      <PageContainer size="md">
        <section className="pt-6 qift-fade-in">
          <Skeleton className="h-9 w-2/5" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-16 w-full" rounded="2xl" />
            <Skeleton className="h-16 w-full" rounded="2xl" />
            <Skeleton className="h-16 w-full" rounded="2xl" />
            <Skeleton className="h-16 w-full" rounded="2xl" />
          </div>
        </section>
      </PageContainer>
    )
  }

  if (stores.length === 0) {
    return (
      <PageContainer size="md">
        <section className="pt-6 qift-fade-in">
          <PageHeading
            badge={<Badge>{t('visibility.badge')}</Badge>}
            line1={t('visibility.title_1')}
            gradient={t('visibility.title_2')}
            subtitle={t('visibility.subtitle')}
            size="sm"
          />
          <p className="mt-4 text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('visibility.no_stores')}
          </p>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="md">
      <section className="pt-6 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('visibility.badge')}</Badge>}
          line1={t('visibility.title_1')}
          gradient={t('visibility.title_2')}
          subtitle={t('visibility.subtitle')}
          size="sm"
        />

        {/* Privacy stance card. Sets the tone: "you're in control"
            without a wall of legalese. */}
        <div
          className="mt-5 rounded-2xl border p-4"
          style={{
            borderColor: 'var(--border)',
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--card)) 0%, var(--card) 100%)',
          }}
        >
          <h3
            className="text-sm font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {t('visibility.privacy_title')}
          </h3>
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('visibility.privacy_body')}
          </p>
        </div>

        {stores.length > 1 && (
          <div
            role="tablist"
            className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto pb-1"
          >
            {stores.map((s) => {
              const active = s.id === activeStoreId
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveStoreId(s.id)}
                  className="shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all duration-300 active:scale-95"
                  style={{
                    borderColor: active ? 'transparent' : 'var(--border)',
                    background: active
                      ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                      : 'var(--card-soft)',
                    color: active ? '#fff' : 'var(--text-soft)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Summary row — "X of 8 enabled". Calm signal, no
            judgment ("hidden by default" vs "exposing N metrics"). */}
        <div className="mt-5 flex items-center justify-between">
          <span
            className="text-[0.78rem] font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {t('visibility.count_label')}
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold tabular-nums"
            style={{
              background: 'var(--ring)',
              color: 'var(--primary)',
            }}
          >
            {enabledCount}/{METRICS.length}
          </span>
        </div>

        <ul className="mt-3 space-y-2.5">
          {METRICS.map((k) => {
            const value = draft[k] === true
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onToggle(k)}
                  aria-pressed={value}
                  className="flex w-full items-start gap-3 rounded-2xl border p-3.5 text-start transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: value ? 'transparent' : 'var(--border)',
                    background: value
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, var(--card)) 0%, var(--card) 100%)'
                      : 'var(--card)',
                    boxShadow: value ? 'var(--shadow-soft)' : 'var(--shadow-card)',
                    outline: value ? '2px solid color-mix(in srgb, var(--primary) 60%, transparent)' : 'none',
                    outlineOffset: '-2px',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-bold tracking-tight"
                      style={{ color: 'var(--ink)' }}
                    >
                      {t(METRIC_HELP[k].labelKey)}
                    </p>
                    <p
                      className="mt-0.5 text-[0.7rem] leading-relaxed"
                      style={{ color: 'var(--text-soft)' }}
                    >
                      {t(METRIC_HELP[k].helpKey)}
                    </p>
                  </div>
                  {/* Toggle. Pure CSS — no third-party component */}
                  <span
                    aria-hidden
                    className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors"
                    style={{
                      background: value
                        ? 'var(--primary)'
                        : 'var(--card-soft)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span
                      className="absolute h-4 w-4 rounded-full transition-transform"
                      style={{
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                        insetInlineStart: value
                          ? 'calc(100% - 1.25rem)'
                          : '0.125rem',
                      }}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || saving}
            className="qift-press inline-flex items-center gap-1 rounded-full px-5 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-cta)',
            }}
          >
            {saving ? t('visibility.saving') : t('visibility.save')}
          </button>
        </div>

        <p
          className="mt-4 text-[0.68rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {t('visibility.safety_note')}
        </p>
      </section>
    </PageContainer>
  )
}
