'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import GradientText from '@/components/GradientText'
import PageContainer from '@/components/PageContainer'
import StoreCard from '@/components/StoreCard'
import UpcomingMomentsRail from '@/components/UpcomingMomentsRail'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { homeForRole, roleOf } from '@/lib/roleHome'
import {
  STORES,
  type Store as SampleStore,
  type StoreCategory,
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
    featured: s.featured === true,
    verified: s.status === 'approved',
  }
}

// When NEXT_PUBLIC_HIDE_SAMPLE_STORES=1 at build time, demo stores
// are stripped from the home rails. Production should set this so
// buyers only see real merchant stores. Mirrors the same flag in
// app/stores/page.tsx — the two surfaces stay consistent.
const HIDE_SAMPLE_STORES =
  process.env.NEXT_PUBLIC_HIDE_SAMPLE_STORES === '1'

const SAMPLE_STORES: DisplayStore[] = HIDE_SAMPLE_STORES
  ? []
  : STORES.map((s) => ({
      ...s,
      source: 'sample' as const,
      featured: false,
      verified: false,
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
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const [apiStores, setApiStores] = useState<DisplayStore[]>([])

  // Role-aware home redirect. Merchants and admins live in their
  // own operational hubs — the social discovery feed below isn't
  // their landing surface. Logged-out viewers and regular users
  // continue to render this page as before.
  //
  // We replace (not push) so the back button doesn't bounce them
  // into the social home from their dashboard. The redirect runs
  // exactly once per role transition (the user's role typically
  // doesn't change mid-session) so the dependency on `user` is
  // safe.
  useEffect(() => {
    if (!isAuthenticated) return
    const role = roleOf(user)
    if (role === 'user') return
    router.replace(homeForRole(role))
  }, [isAuthenticated, user, router])

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

  // Featured rail. Two-stage curation:
  //   1. Admin-toggled `featured` stores always lead — these are
  //      editorial placements via PATCH /admin/stores/:id/featured.
  //   2. Remaining slots fill from the top-rated stores so the rail
  //      never looks empty when no admin curation has happened.
  // Cap at 6 so the rail stays one-screen on mobile.
  const featured = useMemo(() => {
    const adminFeatured = allStores.filter((s) => s.featured === true)
    const byRating = [...allStores]
      .filter((s) => !s.featured)
      .sort((a, b) => b.rating - a.rating)
    return [...adminFeatured, ...byRating].slice(0, 6)
  }, [allStores])

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

          {/* Phase 6.5 — calm "Upcoming moments" rail. Renders only
              when the viewer follows at least one person with a
              visible imminent occasion; otherwise the section
              silently disappears so the home page falls back to
              its commerce-first layout. No CTAs, no engagement
              counters — tapping a card routes to /u/<username>,
              never directly into /send. */}
          <UpcomingMomentsRail />
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
            <StoreCard store={s} variant="rail" />
          </li>
        ))}
      </ul>
    </section>
  )
}

