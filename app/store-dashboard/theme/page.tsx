'use client'

// Merchant storefront theme picker.
//
// Lets the merchant choose among the available themes for each of
// their stores. Plan gating is displayed visually (greyed-out
// previews with an "upgrade to unlock" hint) — the AUTHORITATIVE
// gate is server-side: PATCH /stores/:id/theme rejects an
// ineligible slug, and the storefront dispatcher falls back to
// Classic at render time regardless.
//
// V1 scope (do not extend without a design pass):
//   - Theme selection only. Per-store branding overrides
//     (accentColor / bannerImageUrl / heroHeadline / heroSubhead)
//     come in a follow-up commit alongside the visibility
//     dashboard.
//   - No live previews — static R2-hosted PNG/WebP thumbnails
//     per the architecture decision (`project_storefront_architecture.md`
//     Section 9 / 14).
//   - No A/B testing, no per-product theme overrides, no custom
//     uploads.
//
// Privacy: nothing leaks here. Plan + theme are owner-private;
// the page checks ownership via listMyStores() (server filters
// on the JWT viewer).

import Link from 'next/link'
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
  setStoreTheme,
  type ApiStore,
} from '@/lib/storesApi'
import { STOREFRONT_THEMES, isThemeAvailable, type ThemeSlug } from '@/components/storefront/themes'
import type { MerchantPlan } from '@/lib/merchantPlans'

export default function StoreThemePage() {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const [stores, setStores] = useState<ApiStore[] | null>(null)
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [pendingSlug, setPendingSlug] = useState<ThemeSlug | null>(null)

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
    // activeStoreId intentionally omitted — we only set it once
    // on first load, never re-pick on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const activeStore = useMemo(
    () => stores?.find((s) => s.id === activeStoreId) ?? null,
    [stores, activeStoreId],
  )

  const onPick = async (slug: ThemeSlug) => {
    if (!accessToken || !activeStore) return
    if (pendingSlug !== null) return
    const plan = normalisePlan(activeStore.plan)
    if (!isThemeAvailable(plan, STOREFRONT_THEMES[slug])) {
      toast.show(t('themes.locked_hint'), { tone: 'error' })
      return
    }
    if (activeStore.themeSlug === slug) return // no-op
    setPendingSlug(slug)
    // Optimistic flip.
    setStores((prev) =>
      prev
        ? prev.map((s) =>
            s.id === activeStore.id ? { ...s, themeSlug: slug } : s,
          )
        : prev,
    )
    try {
      await setStoreTheme(accessToken, activeStore.id, { themeSlug: slug })
      toast.show(t('themes.applied_toast'))
    } catch (err) {
      // Roll back.
      setStores((prev) =>
        prev
          ? prev.map((s) =>
              s.id === activeStore.id
                ? { ...s, themeSlug: activeStore.themeSlug }
                : s,
            )
          : prev,
      )
      const msg = err instanceof Error ? err.message : t('themes.apply_failed')
      toast.show(msg, { tone: 'error' })
    } finally {
      setPendingSlug(null)
    }
  }

  if (!isAuthenticated) {
    return (
      <PageContainer size="md">
        <section className="pt-6 qift-fade-in">
          <PageHeading
            badge={<Badge>{t('themes.badge')}</Badge>}
            line1={t('themes.title_1')}
            gradient={t('themes.title_2')}
            subtitle={t('themes.subtitle')}
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
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="aspect-[4/3] w-full" rounded="2xl" />
            <Skeleton className="aspect-[4/3] w-full" rounded="2xl" />
            <Skeleton className="aspect-[4/3] w-full" rounded="2xl" />
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
            badge={<Badge>{t('themes.badge')}</Badge>}
            line1={t('themes.title_1')}
            gradient={t('themes.title_2')}
            subtitle={t('themes.subtitle')}
            size="sm"
          />
          <p className="mt-4 text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('themes.no_stores')}
          </p>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="md">
      <section className="pt-6 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('themes.badge')}</Badge>}
          line1={t('themes.title_1')}
          gradient={t('themes.title_2')}
          subtitle={t('themes.subtitle')}
          size="sm"
        />

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

        {activeStore && (
          <ThemePicker
            plan={normalisePlan(activeStore.plan)}
            currentSlug={
              (activeStore.themeSlug as ThemeSlug | undefined) ?? 'classic'
            }
            pendingSlug={pendingSlug}
            onPick={onPick}
          />
        )}
      </section>
    </PageContainer>
  )
}

function ThemePicker({
  plan,
  currentSlug,
  pendingSlug,
  onPick,
}: {
  plan: MerchantPlan
  currentSlug: ThemeSlug
  pendingSlug: ThemeSlug | null
  onPick: (slug: ThemeSlug) => void
}) {
  const { t } = useI18n()
  const slugs = Object.keys(STOREFRONT_THEMES) as ThemeSlug[]
  return (
    <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {slugs.map((slug) => {
        const entry = STOREFRONT_THEMES[slug]
        const available = isThemeAvailable(plan, entry)
        const isCurrent = currentSlug === slug
        const isPending = pendingSlug === slug
        return (
          <li key={slug}>
            <button
              type="button"
              onClick={() => onPick(slug)}
              disabled={!available || isPending}
              aria-pressed={isCurrent}
              className="qift-press group block w-full overflow-hidden rounded-3xl border text-start transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed"
              style={{
                borderColor: isCurrent ? 'transparent' : 'var(--border)',
                background: 'var(--card)',
                boxShadow: isCurrent ? 'var(--shadow-cta)' : 'var(--shadow-card)',
                opacity: available ? 1 : 0.6,
                outline: isCurrent ? '2px solid var(--primary)' : 'none',
                outlineOffset: '-2px',
              }}
            >
              <div
                className="relative w-full overflow-hidden"
                style={{
                  aspectRatio: '4 / 3',
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.previewUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {isCurrent && (
                  <span
                    className="absolute end-2 top-2 inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold backdrop-blur"
                    style={{
                      background:
                        'color-mix(in srgb, var(--card) 88%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {t('themes.active_badge')}
                  </span>
                )}
                {!available && (
                  <span
                    className="absolute start-2 top-2 inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold backdrop-blur"
                    style={{
                      background:
                        'color-mix(in srgb, var(--card) 88%, transparent)',
                      color: 'var(--text-soft)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {t(`themes.requires_${entry.minPlan}`)}
                  </span>
                )}
              </div>
              <div className="px-4 pb-4 pt-3">
                <h3
                  className="text-base font-bold leading-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {t(`themes.${slug}.name`)}
                </h3>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {t(entry.descriptionKey)}
                </p>
                {!available && (
                  <Link
                    href="/store-dashboard/plan"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"
                    style={{ color: 'var(--primary)' }}
                  >
                    {t('themes.upgrade_cta')}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function normalisePlan(plan: string | undefined): MerchantPlan {
  if (plan === 'pro') return 'pro'
  if (plan === 'enterprise') return 'enterprise'
  return 'starter'
}
