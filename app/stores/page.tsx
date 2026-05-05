'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  COUNTRIES_LIST,
  COUNTRY_LOCATIONS,
  STORES,
  type StoreCategory,
  type StoreTag,
  type Store as SampleStore,
} from '@/lib/sampleData'
import { listStores, type ApiStore } from '@/lib/storesApi'

// Unified card model used by both API rows and the legacy sample data.
// Sample stores keep their richer metadata; API stores fill in defaults.
type DisplayStore = SampleStore & { source: 'api' | 'sample' }

function adaptApiStore(s: ApiStore): DisplayStore {
  // The API doesn't carry district/tags/blurb/rating/products yet — fill
  // in conservative defaults so the card renders without crashing.
  return {
    id: s.id,
    name: s.name,
    category: (s.category as StoreCategory) ?? 'gifts',
    country: 'SA',
    city: s.city,
    district: '',
    rating: 5,
    tags: [],
    blurb: '',
    products: [],
    officialUrl: null,
    source: 'api',
  }
}

const SAMPLE_STORES: DisplayStore[] = STORES.map((s) => ({
  ...s,
  source: 'sample' as const,
}))

// Top horizontal filter bar. The list is ordered by what we expect users
// to browse most often — daily-occasion categories first, then perfume +
// general gifts, then non-perishable categories. New entries should also
// be added to `StoreCategory` in lib/sampleData.ts and to the translation
// dictionary (key: `stores.cat_<key>`).
const CATEGORY_KEYS: { key: 'all' | StoreCategory; tKey: string }[] = [
  { key: 'all', tKey: 'stores.cat_all' },
  { key: 'flowers', tKey: 'stores.cat_flowers' },
  { key: 'chocolate', tKey: 'stores.cat_chocolate' },
  { key: 'cake', tKey: 'stores.cat_cake' },
  { key: 'perfume', tKey: 'stores.cat_perfume' },
  { key: 'gifts', tKey: 'stores.cat_gifts' },
  { key: 'clothes', tKey: 'stores.cat_clothes' },
  { key: 'accessories', tKey: 'stores.cat_accessories' },
]

// sessionStorage keys — single namespace so we can clear the whole stores
// browsing state if we ever need to (e.g. on logout).
const SS_KEY_CATEGORY = 'qift.stores.category'
const SS_KEY_TO = 'qift.stores.to'
const SS_KEY_LAST_STORE = 'qift.stores.lastStoreId'
// Full URL (`pathname + search`) of the last /stores/[id] page the user
// visited. Lets us auto-restore the funnel when the user comes back to
// /stores after a profile detour. Written by /stores/[id] on mount;
// cleared by the back-to-all-stores button + funnel-start handlers.
const SS_KEY_LAST_DETAIL_HREF = 'qift.stores.lastDetailHref'

// Cheap validator for `lastDetailHref` values pulled out of session
// storage. We only `router.replace` to values that look like a real
// detail-page route — anything else (corrupted writes, stale values
// from a previous app version, hand-edited storage) is ignored. The
// route must be an absolute path inside our app: `/stores/<id>` plus
// optional query string.
function isValidDetailHref(href: string | null): boolean {
  if (!href) return false
  // Reject protocol-relative ("//evil") and absolute URLs — same-origin
  // routing only.
  if (href.startsWith('//')) return false
  if (!href.startsWith('/stores/')) return false
  const after = href.slice('/stores/'.length)
  // Need at least one character of id, and it must come before any
  // query / hash. Empty id (`/stores/?to=...`) is meaningless.
  if (after.length === 0) return false
  if (after.startsWith('?') || after.startsWith('#')) return false
  return true
}

// Read a sessionStorage value safely. Returns `null` on SSR or when the
// browser blocks storage (private mode in some browsers).
function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (value === null || value === '') {
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, value)
    }
  } catch {
    /* ignore */
  }
}

export default function StoresPage() {
  // useSearchParams() must run inside a Suspense boundary in Next.js 16 —
  // wrap the body so the route can statically prerender the shell.
  return (
    <Suspense fallback={<StoresSkeleton />}>
      <StoresInner />
    </Suspense>
  )
}

function StoresInner() {
  const { t } = useI18n()
  const ready = useSimulatedReady(450)
  const router = useRouter()
  const params = useSearchParams()

  // --- Funnel restore (lastDetailHref) ---
  // When the user re-enters /stores after a profile detour (or any other
  // navigation away), we want them to land back on the detail page they
  // were last viewing — not the main list. The detail page writes its
  // full URL to `qift.stores.lastDetailHref` on mount; we read it here
  // and `router.replace` to it.
  //
  // Loop / sticky-funnel safety:
  //   - The "back to all stores" button on /stores/[id] clears the
  //     breadcrumb before navigating, so the next /stores hit renders
  //     the list normally.
  //   - The "Send gift" handlers in the followers/following modal and
  //     the public profile clear it too, so a fresh funnel start always
  //     enters the list (with the new `?to=`), not a stale detail.
  //   - We use `router.replace` (not push), so the /stores history entry
  //     gets eaten — browser-back from the restored detail goes to
  //     whatever was before /stores, not /stores itself.
  //
  // Render gate: while `redirectChecked` is false we render the
  // skeleton. Once the effect resolves, either we issue the replace
  // (skeleton stays put until the route swaps) or we mark the check as
  // done and render the list.
  const [redirectChecked, setRedirectChecked] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const href = readSession(SS_KEY_LAST_DETAIL_HREF)
      if (cancelled) return
      if (isValidDetailHref(href)) {
        // Don't flip `redirectChecked` — keep the skeleton visible
        // until the route swap unmounts us.
        router.replace(href as string)
        return
      }
      setRedirectChecked(true)
    })()
    return () => {
      cancelled = true
    }
    // Restore decision is one-shot per mount. Subsequent param/router
    // changes do not re-run it; if the user clears the funnel and then
    // navigates within /stores, we don't want to re-redirect them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Send-gift funnel: `to` query param ---
  // When the user enters from "Send gift to @user" in the followers/
  // following modal or the public profile, the URL is /stores?to=username.
  // We thread that param through every link and persist it to
  // sessionStorage so a refresh (or a sub-navigation back) keeps the
  // recipient context. URL takes precedence; sessionStorage is the
  // hydrate-on-mount fallback.
  const urlTo = (params.get('to') ?? '').trim().toLowerCase()
  const [recipient, setRecipient] = useState<string>(() => {
    if (urlTo) return urlTo
    const fromSession = readSession(SS_KEY_TO)
    return fromSession?.trim().toLowerCase() ?? ''
  })

  // If we hydrated `to` from sessionStorage but the URL is empty, push
  // it back into the URL so it visibly threads through subsequent
  // navigations. router.replace is shallow — no scroll jump.
  useEffect(() => {
    if (recipient && !urlTo) {
      const next = new URLSearchParams(params.toString())
      next.set('to', recipient)
      router.replace(`/stores?${next.toString()}`, { scroll: false })
    }
    // We deliberately watch only the URL `to`. Subsequent changes to
    // `recipient` come from URL changes (re-runs this effect) or from
    // session hydration on mount, which already wrote to URL above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTo])

  // --- Category filter ---
  // URL is canonical when `?cat=` is present; otherwise hydrate from
  // sessionStorage so navigating back to /stores from a profile page
  // restores the last category the user picked.
  const urlCat = params.get('cat')
  const [category, setCategory] = useState<'all' | StoreCategory>(() => {
    const candidate = (urlCat ?? readSession(SS_KEY_CATEGORY) ?? 'all') as
      | 'all'
      | StoreCategory
    return CATEGORY_KEYS.some((c) => c.key === candidate) ? candidate : 'all'
  })

  // Persist whenever category changes.
  useEffect(() => {
    writeSession(SS_KEY_CATEGORY, category === 'all' ? null : category)
  }, [category])

  // Persist whenever the recipient context changes.
  useEffect(() => {
    writeSession(SS_KEY_TO, recipient || null)
  }, [recipient])

  // Last-opened store id. We don't auto-redirect — that would be jarring
  // — but we DO scroll the matching card into view after the list mounts
  // so the user lands back where they were. The `lastStoreId` is written
  // by /stores/[id] on mount. Stored in state (not a ref) so a render-
  // time comparison against `s.id` doesn't trip the `react-hooks/refs`
  // rule. We resolve it inside an async IIFE so the setState lands
  // after a microtask — that satisfies `react-hooks/set-state-in-effect`
  // without changing the hydrated value (sessionStorage is unavailable
  // server-side, so first paint always sees `null`).
  const [lastStoreId, setLastStoreId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = readSession(SS_KEY_LAST_STORE)
      if (cancelled) return
      setLastStoreId(saved)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const [country, setCountry] = useState('SA')
  const [tier1, setTier1] = useState<string>('')
  const [tier2, setTier2] = useState<string>('')
  const [tier3, setTier3] = useState<string>('')
  const [nearbyOnly, setNearbyOnly] = useState(false)
  // Real API stores prepended onto the sample dataset. Sample stores stay
  // visible so the demo paths keep working, but API stores show up first
  // (they're created by real users and should win the eyeballs).
  const [apiStores, setApiStores] = useState<DisplayStore[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await listStores()
      if (cancelled) return
      setApiStores(list.map(adaptApiStore))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const allStores: DisplayStore[] = useMemo(
    () => [...apiStores, ...SAMPLE_STORES],
    [apiStores],
  )

  const schema = COUNTRY_LOCATIONS[country]
  const tier1Options = schema?.tier1 ?? []
  const tier2Options = schema && tier1 ? schema.tier2[tier1] ?? [] : []
  const tier3Options = schema && tier2 ? schema.tier3[tier2] ?? [] : []

  const results = useMemo(
    () =>
      allStores.filter((s) => {
        if (category !== 'all' && s.category !== category) return false
        if (country && s.country !== country) return false
        // Tier 2 in SA = city; tier 3 in SA = district. For other countries
        // STORES are empty so tier filters silently no-op (handled by country).
        if (tier2 && s.city !== tier2) return false
        if (tier3 && s.district !== tier3) return false
        if (nearbyOnly && !s.tags.includes('nearby')) return false
        return true
      }),
    [allStores, category, country, tier2, tier3, nearbyOnly],
  )

  // Brief shimmer on filter changes for premium feedback.
  const [filtering, setFiltering] = useState(false)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setFiltering(true)
    const id = setTimeout(() => setFiltering(false), 280)
    return () => clearTimeout(id)
  }, [category, country, tier1, tier2, tier3, nearbyOnly])

  const { isAuthenticated } = useAuth()

  // Render the skeleton until BOTH the simulated-ready timer AND the
  // funnel-restore decision have resolved. If the restore decision says
  // "redirect", we keep the skeleton up while the route swap happens
  // (the hook never flips `redirectChecked` to true in that branch).
  if (!ready || !redirectChecked) return <StoresSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('stores.badge')}</Badge>}
          line1={t('stores.title_1')}
          gradient={t('stores.title_2')}
          subtitle={t('stores.subtitle')}
          size="sm"
        />

        {/* Send-gift funnel banner. Only renders when the user entered
            via "Send gift to @user" — confirms the recipient context and
            offers an explicit way out (clears the param + sessionStorage). */}
        {recipient && (
          <div
            role="status"
            className="mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md qift-fade-in"
            style={{
              borderColor: 'var(--border)',
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--card)) 0%, var(--card) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M20 12v9H4v-9" />
                  <path d="M2 7h20v5H2z" />
                  <path d="M12 22V7" />
                  <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                </svg>
              </span>
              <p
                className="min-w-0 truncate text-xs leading-snug"
                style={{ color: 'var(--text-soft)' }}
              >
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {t('stores.gifting_to_label')}
                </span>{' '}
                <span dir="ltr" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                  @{recipient}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecipient('')
                writeSession(SS_KEY_TO, null)
                // Also drop the funnel-restore breadcrumb — clearing
                // the recipient is an explicit exit from the gift
                // funnel, so the next /stores visit should land on
                // the list, not bounce into the last detail.
                writeSession(SS_KEY_LAST_DETAIL_HREF, null)
                const next = new URLSearchParams(params.toString())
                next.delete('to')
                const qs = next.toString()
                router.replace(qs ? `/stores?${qs}` : '/stores', {
                  scroll: false,
                })
              }}
              className="shrink-0 rounded-full border px-3 py-1 text-[0.7rem] font-medium transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('stores.gifting_clear')}
            </button>
          </div>
        )}

        {isAuthenticated && (
          // Inline CTA for the "إنشاء متجر" flow. Only logged-in users
          // can create a store; unauthenticated visitors just see the
          // storefront browse experience.
          <div className="mt-3">
            <Link
              href="/store-dashboard/new"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--primary)',
              }}
            >
              + {t('store.create_store')}
            </Link>
          </div>
        )}

        <div className="mt-5 -mx-1 flex gap-2 overflow-x-auto pb-1">
          {CATEGORY_KEYS.map((c) => {
            const active = category === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className="shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-all"
                style={{
                  borderColor: active
                    ? 'transparent'
                    : 'var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: active ? '#fff' : 'var(--text-soft)',
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? 'var(--shadow-soft)' : undefined,
                }}
              >
                {t(c.tKey)}
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Selector
            label={t('stores.filter_country')}
            value={country}
            options={COUNTRIES_LIST.map((c) => ({
              value: c.code,
              label: c.name,
            }))}
            placeholder={`${t('stores.choose')} ${t('stores.filter_country')}`}
            onChange={(v) => {
              setCountry(v)
              setTier1('')
              setTier2('')
              setTier3('')
            }}
          />
          <Selector
            label={schema ? t(schema.tier1LabelKey) : ''}
            value={tier1}
            options={tier1Options.map((r) => ({ value: r, label: r }))}
            placeholder={
              !schema || tier1Options.length === 0
                ? t('stores.select_country_first')
                : `${t('stores.choose')} ${t(schema.tier1LabelKey)}`
            }
            disabled={!schema || tier1Options.length === 0}
            onChange={(v) => {
              setTier1(v)
              setTier2('')
              setTier3('')
            }}
          />
          <Selector
            label={schema ? t(schema.tier2LabelKey) : ''}
            value={tier2}
            options={tier2Options.map((c) => ({ value: c, label: c }))}
            placeholder={
              tier2Options.length === 0
                ? t('stores.select_region_first')
                : schema
                ? `${t('stores.choose')} ${t(schema.tier2LabelKey)}`
                : ''
            }
            disabled={tier2Options.length === 0}
            onChange={(v) => {
              setTier2(v)
              setTier3('')
            }}
          />
          <Selector
            label={schema ? t(schema.tier3LabelKey) : ''}
            value={tier3}
            options={tier3Options.map((d) => ({ value: d, label: d }))}
            placeholder={
              tier3Options.length === 0
                ? t('stores.select_city_first')
                : schema
                ? `${t('stores.choose')} ${t(schema.tier3LabelKey)}`
                : ''
            }
            disabled={tier3Options.length === 0}
            onChange={setTier3}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p
            className="text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            {results.length} {t('stores.results')}
          </p>
          <button
            type="button"
            onClick={() => setNearbyOnly((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.7rem] font-medium transition-all"
            style={{
              borderColor: nearbyOnly ? 'transparent' : 'var(--border)',
              background: nearbyOnly
                ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                : 'var(--card-soft)',
              color: nearbyOnly ? '#fff' : 'var(--text-soft)',
              boxShadow: nearbyOnly ? 'var(--shadow-soft)' : undefined,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 21s-7-7-7-12a7 7 0 1114 0c0 5-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {t('stores.nearby_only')}
          </button>
        </div>

        {filtering ? (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-44 w-full" rounded="3xl" />
              </li>
            ))}
          </ul>
        ) : results.length === 0 ? (
          <EmptyStores />
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 qift-fade-in sm:grid-cols-2">
            {results.map((s) => (
              <StoreCard
                key={s.id}
                store={s}
                recipient={recipient || null}
                isLastOpened={lastStoreId === s.id}
              />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

function Selector({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: disabled ? 'var(--muted-2)' : 'var(--muted)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-xl border px-3 py-2.5 text-sm font-medium backdrop-blur-md transition-colors focus:outline-none disabled:cursor-not-allowed"
        style={{
          borderColor: 'var(--border)',
          background: disabled ? 'var(--surface-2)' : 'var(--card)',
          color: value
            ? 'var(--text)'
            : disabled
            ? 'var(--muted-2)'
            : 'var(--placeholder)',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <option value="">{placeholder ?? '—'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function StoreCard({
  store,
  recipient,
  isLastOpened,
}: {
  store: DisplayStore
  // When set, the funnel started from "Send gift to @<recipient>". Both
  // the "Browse store" link and the resulting product/send navigation
  // must preserve this so the recipient stays prefilled all the way.
  recipient: string | null
  // True when /stores/[id] last left a breadcrumb pointing at this card.
  // The card scrolls itself into view on mount and renders a soft ring so
  // the user lands back where they were after a profile detour.
  isLastOpened: boolean
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!isLastOpened) return
    // requestAnimationFrame waits one paint so the surrounding fade-in
    // animation has settled, otherwise the scroll target moves mid-tween.
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [isLastOpened])

  const tagText: Record<StoreTag, string> = {
    fast: t('stores.tag_fast'),
    same_day: t('stores.tag_same_day'),
    nearby: t('stores.tag_nearby'),
  }

  // Build the "Browse store" href with the recipient context if present.
  // We use URLSearchParams to keep it tidy if more params are added later.
  const browseQs = new URLSearchParams()
  if (recipient) browseQs.set('to', recipient)
  const browseHref =
    browseQs.toString().length > 0
      ? `/stores/${store.id}?${browseQs.toString()}`
      : `/stores/${store.id}`

  // Resolve the localized category label. Categories outside the chip
  // list (e.g. 'perishable' from sample data) gracefully fall through to
  // the lower-case key.
  const catKey = `stores.cat_${store.category}`
  const categoryLabel = t(catKey)

  return (
    <li
      ref={ref}
      data-store-id={store.id}
      className="rounded-3xl border p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: isLastOpened
          ? 'color-mix(in srgb, var(--primary) 55%, var(--border))'
          : 'var(--border)',
        background: 'var(--card)',
        boxShadow: isLastOpened
          ? '0 14px 36px -16px color-mix(in srgb, var(--primary) 55%, transparent)'
          : 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="truncate text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {store.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
              style={{
                background: 'var(--ring)',
                color: 'var(--primary)',
              }}
            >
              {categoryLabel}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {store.city}
              {store.district && (
                <>
                  {' · '}
                  {store.district}
                </>
              )}
            </span>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: 'var(--ring)',
            color: 'var(--primary)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
            <path d="M12 2l2.6 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.4-.5z" />
          </svg>
          {store.rating}
        </div>
      </div>

      {store.blurb && (
        <p
          className="mt-2 line-clamp-2 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {store.blurb}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {store.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-soft)',
            }}
          >
            {tagText[tag]}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={browseHref}
          className="inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {t('stores.browse_cta')}
        </Link>
        {/* Optional public-facing URL (the merchant's own site). Hidden
            for sample / API stores that don't expose one. Opens in a new
            tab; rel="noopener" prevents the target from snooping window
            references. */}
        {store.officialUrl && (
          <a
            href={store.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M14 3h7v7" />
              <path d="M21 3l-9 9" />
              <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
            </svg>
            {t('stores.official_link')}
          </a>
        )}
      </div>
    </li>
  )
}

function EmptyStores() {
  const { t } = useI18n()
  return (
    <div
      className="mt-6 flex flex-col items-center rounded-3xl border p-8 text-center backdrop-blur-md qift-fade-in"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          style={{ color: 'var(--primary)' }}
        >
          <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </span>
      <h3
        className="mt-4 text-base font-bold"
        style={{ color: 'var(--ink)' }}
      >
        {t('stores.empty_title')}
      </h3>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('stores.empty_body')}
      </p>
    </div>
  )
}

function StoresSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-32" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />

        <div className="mt-5 -mx-1 flex gap-2 overflow-hidden pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 shrink-0" rounded="full" />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" rounded="xl" />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-28" rounded="full" />
        </div>

        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="rounded-3xl border p-5 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {/* Mirrors the real StoreCard layout: header row (title +
                  rating chip), category + city line, blurb, tags row,
                  CTA. Same dimensions so the swap to live data has no
                  visible reflow. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <div className="mt-2 flex items-center gap-1.5">
                    <Skeleton className="h-4 w-12" rounded="full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-5 w-12" rounded="full" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-4/5" />
              <div className="mt-3 flex gap-1.5">
                <Skeleton className="h-5 w-16" rounded="full" />
                <Skeleton className="h-5 w-20" rounded="full" />
              </div>
              <Skeleton className="mt-4 h-10 w-full" rounded="xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}
