'use client'

// Merchant storefront theme + branding surface.
//
// Two stacked sections, kept on one page so a merchant feels
// "this is where my storefront identity lives":
//   1. Theme picker — choose Classic / Gallery / Editorial.
//   2. Branding — accent color, banner image, hero headline +
//      subhead. The bounded universal overrides that EVERY theme
//      consumes through ResolvedThemeConfig.
//
// Plan gating is displayed visually (greyed-out previews with an
// "upgrade to unlock" hint) — the AUTHORITATIVE gate is server-side:
// PATCH /stores/:id/theme rejects an ineligible slug or a config
// that doesn't pass `sanitizeThemeConfig`. The dispatcher falls
// back to Classic at render time regardless.
//
// V1 scope (do not extend without a design pass):
//   - Bounded branding only — no free-form CSS, no custom HTML,
//     no script injection, no per-theme-specific knobs in the UI
//     (themeConfig.themeSpecific exists in the schema but the V1
//     picker doesn't expose it; that's intentional restraint).
//   - Static SVG preview thumbnails — no live previews. The
//     architecture memory + Section 9 of the storefront doc.
//   - No A/B testing, no per-product theme overrides, no custom
//     image uploads (URL field only — merchants paste from their
//     existing CDN / R2 / shopify-cdn etc.).
//
// Privacy: nothing leaks here. Plan + theme + branding are
// owner-private; the page checks ownership via listMyStores()
// (server filters on the JWT viewer).

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

// ─── Branding allow-list (MUST mirror the backend) ───────────────
// See apps/api/src/stores/storefront-themes.ts → ACCENT_PALETTE,
// HEADLINE_MAX, SUBHEAD_MAX, HTTPS_URL. The form pre-validates so
// the merchant gets instant feedback; the server still re-runs
// `sanitizeThemeConfig` and is the authoritative gate.
const ACCENT_PALETTE: { value: string; nameKey: string }[] = [
  { value: '#7B5CF5', nameKey: 'themes.accent_violet' },
  { value: '#5A8AC8', nameKey: 'themes.accent_blue' },
  { value: '#6FA882', nameKey: 'themes.accent_green' },
  { value: '#D64A55', nameKey: 'themes.accent_red' },
  { value: '#E89AAE', nameKey: 'themes.accent_pink' },
  { value: '#D4A85A', nameKey: 'themes.accent_gold' },
  { value: '#C5C5CC', nameKey: 'themes.accent_silver' },
  { value: '#1A1A1F', nameKey: 'themes.accent_ink' },
]
const HEADLINE_MAX = 80
const SUBHEAD_MAX = 160
const HTTPS_URL = /^https?:\/\/[^\s<>"']{1,512}$/

type BrandingDraft = {
  accentColor: string | null
  bannerImageUrl: string
  heroHeadline: string
  heroSubhead: string
}

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

  // Branding save. Patches the FOUR universal keys via the same
  // PATCH /stores/:id/theme endpoint. The server sanitizes through
  // the same `sanitizeThemeConfig` helper — anything that doesn't
  // pass the allow-list is silently dropped server-side, and we
  // toast on outright rejection.
  //
  // Optimistic: we splice the new themeConfig into local state so
  // the form continues showing the saved values; on rejection we
  // re-fetch via listMyStores to resync.
  const onSaveBranding = async (draft: BrandingDraft) => {
    if (!accessToken || !activeStore) return
    // Empty strings become "clear this field" (the backend's
    // sanitization drops zero-length strings). Convert to null so
    // the payload is unambiguous.
    const themeConfig = {
      accentColor: draft.accentColor || null,
      bannerImageUrl: draft.bannerImageUrl.trim() || null,
      heroHeadline: draft.heroHeadline.trim() || null,
      heroSubhead: draft.heroSubhead.trim() || null,
    }
    const previous = activeStore.themeConfig
    setStores((prev) =>
      prev
        ? prev.map((s) =>
            s.id === activeStore.id
              ? {
                  ...s,
                  themeConfig: {
                    accentColor: themeConfig.accentColor ?? undefined,
                    bannerImageUrl: themeConfig.bannerImageUrl ?? undefined,
                    heroHeadline: themeConfig.heroHeadline ?? undefined,
                    heroSubhead: themeConfig.heroSubhead ?? undefined,
                  },
                }
              : s,
          )
        : prev,
    )
    try {
      await setStoreTheme(accessToken, activeStore.id, {
        themeConfig,
      })
      toast.show(t('themes.branding_saved_toast'))
    } catch (err) {
      // Roll back the optimistic write.
      setStores((prev) =>
        prev
          ? prev.map((s) =>
              s.id === activeStore.id ? { ...s, themeConfig: previous } : s,
            )
          : prev,
      )
      const msg =
        err instanceof Error ? err.message : t('themes.branding_save_failed')
      toast.show(msg, { tone: 'error' })
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
          <>
            <ThemePicker
              plan={normalisePlan(activeStore.plan)}
              currentSlug={
                (activeStore.themeSlug as ThemeSlug | undefined) ?? 'classic'
              }
              pendingSlug={pendingSlug}
              onPick={onPick}
            />
            <BrandingSection
              key={activeStore.id /* reset draft on store switch */}
              store={activeStore}
              onSave={onSaveBranding}
            />
          </>
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

// ─── Branding section ─────────────────────────────────────────────
//
// Bounded form. Four universal keys; nothing else. The form
// pre-validates so the merchant sees errors at the field — the
// server's `sanitizeThemeConfig` is still the authoritative gate
// (it silently drops bad input rather than rejecting, so even an
// adversarial client can't corrupt the payload).
function BrandingSection({
  store,
  onSave,
}: {
  store: ApiStore
  onSave: (draft: BrandingDraft) => Promise<void>
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<BrandingDraft>(() => ({
    accentColor: store.themeConfig?.accentColor ?? null,
    bannerImageUrl: store.themeConfig?.bannerImageUrl ?? '',
    heroHeadline: store.themeConfig?.heroHeadline ?? '',
    heroSubhead: store.themeConfig?.heroSubhead ?? '',
  }))
  const [saving, setSaving] = useState(false)

  // Field-level validation. The form keeps the merchant from
  // submitting obviously-wrong values; the server has the final
  // say. URL is the strictest check because it's the field most
  // likely to get pasted in malformed (missing protocol, copied
  // from a "share" sheet with whitespace, etc.).
  const urlValid =
    draft.bannerImageUrl.trim() === '' ||
    HTTPS_URL.test(draft.bannerImageUrl.trim())
  const headlineValid = draft.heroHeadline.length <= HEADLINE_MAX
  const subheadValid = draft.heroSubhead.length <= SUBHEAD_MAX
  const canSave = urlValid && headlineValid && subheadValid && !saving

  // Has-changes guard so the Save button stays inert when the
  // form matches what's on disk. Stops accidental no-op PATCH
  // round-trips (which would still succeed, but a calm UI is the
  // direction here).
  const isDirty =
    draft.accentColor !== (store.themeConfig?.accentColor ?? null) ||
    draft.bannerImageUrl !== (store.themeConfig?.bannerImageUrl ?? '') ||
    draft.heroHeadline !== (store.themeConfig?.heroHeadline ?? '') ||
    draft.heroSubhead !== (store.themeConfig?.heroSubhead ?? '')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave || !isDirty) return
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-3xl border p-5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <header className="mb-4">
        <h2
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('themes.branding_title')}
        </h2>
        <p
          className="mt-1 text-xs leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('themes.branding_subtitle')}
        </p>
      </header>

      {/* Accent palette */}
      <fieldset className="mt-5">
        <legend
          className="mb-2 text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {t('themes.accent_label')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PALETTE.map((swatch) => {
            const isSelected = draft.accentColor === swatch.value
            return (
              <button
                key={swatch.value}
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    accentColor: isSelected ? null : swatch.value,
                  }))
                }
                aria-pressed={isSelected}
                aria-label={t(swatch.nameKey)}
                title={t(swatch.nameKey)}
                className="qift-press relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-all hover:-translate-y-0.5"
                style={{
                  background: swatch.value,
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--card), 0 0 0 4px var(--primary)'
                    : '0 0 0 1px var(--border)',
                }}
              >
                {isSelected && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
        <p
          className="mt-2 text-[0.68rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('themes.accent_help')}
        </p>
      </fieldset>

      {/* Banner image URL */}
      <div className="mt-5">
        <label
          className="block text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
          htmlFor="banner-url"
        >
          {t('themes.banner_label')}
        </label>
        <input
          id="banner-url"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          value={draft.bannerImageUrl}
          onChange={(e) =>
            setDraft((d) => ({ ...d, bannerImageUrl: e.target.value }))
          }
          className="mt-1.5 w-full rounded-xl border bg-transparent px-3 py-2 text-sm transition-colors focus:outline-none"
          style={{
            borderColor: urlValid ? 'var(--border)' : '#D64A55',
            color: 'var(--ink)',
          }}
        />
        <p
          className="mt-1.5 text-[0.68rem]"
          style={{ color: urlValid ? 'var(--muted)' : '#D64A55' }}
        >
          {urlValid ? t('themes.banner_help') : t('themes.banner_invalid')}
        </p>
      </div>

      {/* Hero headline */}
      <div className="mt-5">
        <label
          className="flex items-baseline justify-between text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
          htmlFor="hero-headline"
        >
          <span>{t('themes.headline_label')}</span>
          <span
            className="text-[0.65rem] tabular-nums"
            style={{
              color:
                draft.heroHeadline.length > HEADLINE_MAX
                  ? '#D64A55'
                  : 'var(--muted)',
            }}
          >
            {draft.heroHeadline.length}/{HEADLINE_MAX}
          </span>
        </label>
        <input
          id="hero-headline"
          type="text"
          maxLength={HEADLINE_MAX + 20 /* let typing past, validate at submit */}
          placeholder={t('themes.headline_placeholder')}
          value={draft.heroHeadline}
          onChange={(e) =>
            setDraft((d) => ({ ...d, heroHeadline: e.target.value }))
          }
          className="mt-1.5 w-full rounded-xl border bg-transparent px-3 py-2 text-sm transition-colors focus:outline-none"
          style={{
            borderColor: headlineValid ? 'var(--border)' : '#D64A55',
            color: 'var(--ink)',
          }}
        />
        <p
          className="mt-1.5 text-[0.68rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('themes.headline_help')}
        </p>
      </div>

      {/* Hero subhead */}
      <div className="mt-5">
        <label
          className="flex items-baseline justify-between text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
          htmlFor="hero-subhead"
        >
          <span>{t('themes.subhead_label')}</span>
          <span
            className="text-[0.65rem] tabular-nums"
            style={{
              color:
                draft.heroSubhead.length > SUBHEAD_MAX
                  ? '#D64A55'
                  : 'var(--muted)',
            }}
          >
            {draft.heroSubhead.length}/{SUBHEAD_MAX}
          </span>
        </label>
        <textarea
          id="hero-subhead"
          rows={3}
          maxLength={SUBHEAD_MAX + 40}
          placeholder={t('themes.subhead_placeholder')}
          value={draft.heroSubhead}
          onChange={(e) =>
            setDraft((d) => ({ ...d, heroSubhead: e.target.value }))
          }
          className="mt-1.5 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm transition-colors focus:outline-none"
          style={{
            borderColor: subheadValid ? 'var(--border)' : '#D64A55',
            color: 'var(--ink)',
          }}
        />
        <p
          className="mt-1.5 text-[0.68rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('themes.subhead_help')}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={!canSave || !isDirty}
          className="qift-press inline-flex items-center gap-1 rounded-full px-5 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-cta)',
          }}
        >
          {saving ? t('themes.saving') : t('themes.save_branding')}
        </button>
      </div>

      <p
        className="mt-3 text-[0.65rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('themes.branding_safety_note')}
      </p>
    </form>
  )
}

function normalisePlan(plan: string | undefined): MerchantPlan {
  if (plan === 'pro') return 'pro'
  if (plan === 'enterprise') return 'enterprise'
  return 'starter'
}
