'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import GradientText from '@/components/GradientText'
import PageContainer from '@/components/PageContainer'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  STORES,
  type Store as SampleStore,
  type StoreCategory,
  type StoreTag,
} from '@/lib/sampleData'
import { listStores, type ApiStore } from '@/lib/storesApi'

// Home is now the primary discovery surface (Stores tab is gone from
// bottom nav). The page renders a stack of horizontal "rails" — each
// is a category cohort of stores, scrollable on mobile, with a
// "View all" link routing to the existing /stores page filtered by
// that category. Real API stores are merged ahead of sample data so
// merchant-onboarded rows always lead.
//
// Auth gate: logged-out viewers see a compact welcome header above
// the feed but can still browse every rail (the underlying /stores
// page is also public). Logged-in viewers skip the marketing copy
// and land directly on the feed.

type DisplayStore = SampleStore & { source: 'api' | 'sample' }

function adaptApiStore(s: ApiStore): DisplayStore {
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

// Category rails surfaced on the home feed. Order = display order.
// Each rail filters the merged store list by its category. Empty
// rails are hidden so the page never shows an "empty" cohort.
const CATEGORY_RAILS: { category: StoreCategory; tKey: string }[] = [
  { category: 'flowers', tKey: 'home.section_flowers' },
  { category: 'chocolate', tKey: 'home.section_chocolate' },
  { category: 'perfume', tKey: 'home.section_perfume' },
  { category: 'cake', tKey: 'home.section_cake' },
  { category: 'gifts', tKey: 'home.section_gifts' },
]

export default function HomePage() {
  const { t } = useI18n()
  const { isAuthenticated, user } = useAuth()
  const [apiStores, setApiStores] = useState<DisplayStore[]>([])

  // Pull real stores from the API once on mount. We don't gate this
  // on auth — /stores is publicly readable. Failure is non-fatal:
  // the sample dataset still drives every rail.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await listStores()
      if (!cancelled) setApiStores(list.map(adaptApiStore))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Real API stores lead — they're created by actual merchants and
  // should win attention. Sample stores fill the rest so the demo
  // experience never looks empty.
  const allStores: DisplayStore[] = useMemo(
    () => [...apiStores, ...SAMPLE_STORES],
    [apiStores],
  )

  // Featured = the top 6 stores by rating across all categories. Real
  // featured-store curation (admin-flagged) belongs on a future
  // Featured table; this is the lightweight MVP.
  const featured = useMemo(
    () => [...allStores].sort((a, b) => b.rating - a.rating).slice(0, 6),
    [allStores],
  )

  // Nearby fast-delivery — stores with the 'nearby' AND ('fast' OR
  // 'same_day') tags. Sample stores carry these tags today; real
  // API rows don't yet, so this rail relies on the demo dataset for
  // the private-testing window.
  const nearbyFast = useMemo(
    () =>
      allStores
        .filter(
          (s) =>
            s.tags.includes('nearby') &&
            (s.tags.includes('fast') || s.tags.includes('same_day')),
        )
        .slice(0, 8),
    [allStores],
  )

  // Trending gifts — for now, the highest-rated gifts-category store
  // products. The model is a placeholder for a real trending signal
  // (recent gift volume by product) once analytics lands.
  const trending = useMemo(
    () => allStores.filter((s) => s.tags.includes('same_day')).slice(0, 8),
    [allStores],
  )

  return (
    <PageContainer>
      {/* Header. Logged-in: compact greeting. Logged-out: marketing
          headline + CTA. We keep both in the same DOM position so
          rails below render identically. */}
      {isAuthenticated ? (
        <section className="pt-5 qift-fade-in">
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('home.greeting_kicker')}
          </p>
          <h1
            className="mt-1 text-[1.6rem] font-extrabold leading-tight tracking-tight sm:text-[1.85rem]"
            style={{ color: 'var(--ink)' }}
          >
            {t('home.greeting_title')}
            {user?.fullName ? (
              <>
                {' '}
                <GradientText>{user.fullName.split(' ')[0]}</GradientText>
              </>
            ) : null}
          </h1>
          <p
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('home.greeting_sub')}
          </p>
        </section>
      ) : (
        <section className="pt-6 qift-fade-in">
          <Badge>{t('home.badge')}</Badge>
          <h1
            className="mt-3 text-[2rem] font-extrabold leading-[1.15] tracking-tight sm:text-[2.4rem]"
            style={{ color: 'var(--ink)' }}
          >
            {t('home.headline_1')}{' '}
            <GradientText>{t('home.headline_2')}</GradientText>
          </h1>
          <p
            className="mt-2.5 max-w-md text-sm leading-relaxed sm:text-base"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('home.subtitle')}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {t('home.cta_primary')}
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('home.cta_secondary')}
            </Link>
          </div>
        </section>
      )}

      {/* Featured stores — full-width cards, scroll horizontally. */}
      <Rail
        title={t('home.section_featured')}
        viewAllHref="/stores"
        items={featured}
      />

      {/* Category rails. Filtered, merged real+sample stores per
          category. Hide rails that would render zero items so the
          home doesn't show empty states. */}
      {CATEGORY_RAILS.map((rail) => {
        const items = allStores
          .filter((s) => s.category === rail.category)
          .slice(0, 8)
        if (items.length === 0) return null
        return (
          <Rail
            key={rail.category}
            title={t(rail.tKey)}
            viewAllHref={`/stores?cat=${rail.category}`}
            items={items}
          />
        )
      })}

      {/* Trending gifts placeholder. Same-day stores stand in for
          a real trending signal until analytics lands. */}
      {trending.length > 0 && (
        <Rail
          title={t('home.section_trending')}
          viewAllHref="/stores"
          items={trending}
        />
      )}

      {/* Nearby fast-delivery — the "I need a gift now" rail. */}
      {nearbyFast.length > 0 && (
        <Rail
          title={t('home.section_nearby_fast')}
          viewAllHref="/stores"
          items={nearbyFast}
        />
      )}

      {/* Bottom-of-feed gift CTA. The raised center button in the
          bottom nav is the canonical primary action; this is just an
          inline reinforcement at the end of scrolling. */}
      <div className="mt-8 mb-4">
        <Link
          href="/stores"
          className="flex items-center justify-between rounded-3xl border p-5 backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-[0.99]"
          style={{
            borderColor: 'transparent',
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--card)) 0%, var(--card) 100%)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div>
            <p
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {t('home.cta_browse_title')}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('home.cta_browse_body')}
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
      </div>
    </PageContainer>
  )
}

// Single horizontal rail. Header (title + "View all" link) above a
// `overflow-x-auto` row of cards. Card count auto-fits visually:
// each card is a fixed 64% width on mobile (so two cards peek
// at the edge — the universal "this is scrollable" signal) and a
// fixed 18rem on desktop.
function Rail({
  title,
  viewAllHref,
  items,
}: {
  title: string
  viewAllHref: string
  items: DisplayStore[]
}) {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h2>
        <Link
          href={viewAllHref}
          className="text-xs font-semibold transition-colors"
          style={{ color: 'var(--primary)' }}
        >
          {t('home.view_all')}
        </Link>
      </div>
      <ul
        className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items.map((s) => (
          <li
            key={s.source + s.id}
            className="shrink-0"
            style={{
              width: 'min(64vw, 18rem)',
              scrollSnapAlign: 'start',
            }}
          >
            <RailCard store={s} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// Compact store card optimised for horizontal rails: gradient
// poster on top, title + city + rating chip below. Sized to feel
// premium at 64vw on mobile.
function RailCard({ store }: { store: DisplayStore }) {
  const { t } = useI18n()
  const tagText: Record<StoreTag, string> = {
    fast: t('stores.tag_fast'),
    same_day: t('stores.tag_same_day'),
    nearby: t('stores.tag_nearby'),
  }
  // Two-stop gradient seeded by the store id so the "poster" looks
  // intentional, not random — same store always gets the same color.
  const PALETTE = [
    '#F472B6,#7B5CF5',
    '#FFD6B5,#7B5CF5',
    '#7B5CF5,#C084FC',
    '#A78BFA,#F472B6',
    '#9AE6B4,#7B5CF5',
    '#C084FC,#F472B6',
  ]
  const gradient =
    PALETTE[
      (store.id.charCodeAt(0) +
        store.id.charCodeAt(store.id.length - 1)) %
        PALETTE.length
    ]
  const [a, b] = gradient.split(',')

  return (
    <Link
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-3xl border backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-[0.99]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        aria-hidden
        className="relative aspect-[16/10] w-full"
        style={{
          background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        }}
      >
        {/* Subtle inner sheen for depth. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 60%)',
          }}
        />
        {store.tags.length > 0 && (
          <div className="absolute bottom-2 start-2 flex flex-wrap gap-1">
            {store.tags.slice(0, 1).map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold backdrop-blur"
                style={{
                  background: 'rgba(15,11,24,0.5)',
                  color: '#fff',
                }}
              >
                {tagText[tag]}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="truncate text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {store.name}
          </h3>
          <span
            className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
            style={{
              background: 'var(--ring)',
              color: 'var(--primary)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-2.5 w-2.5"
            >
              <path d="M12 2l2.6 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.4-.5z" />
            </svg>
            {store.rating}
          </span>
        </div>
        <p
          className="mt-0.5 truncate text-xs"
          style={{ color: 'var(--muted)' }}
        >
          {store.city}
          {store.district ? ` · ${store.district}` : ''}
        </p>
      </div>
    </Link>
  )
}
