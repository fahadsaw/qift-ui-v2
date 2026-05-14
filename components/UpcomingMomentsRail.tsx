'use client'

// Phase 6.5 — calm "Upcoming moments" rail.
//
// A quiet horizontal-scrollable surface that shows the soonest
// visible occasions belonging to people the viewer follows. Renders
// only when there's signal — empty / errored / unauthenticated
// states collapse the entire rail (no empty placeholder, no
// "follow more people" prompt, no engagement bait).
//
// Privacy: every row comes from /occasions/upcoming, which routes
// through canSeeOccasion server-side (Phase 6.2). Block-list /
// private / unmet-visibility rows never reach this client. Year is
// stripped on yearly rows. The rail just renders what arrives.
//
// UX guardrails per the Phase 6.5 brief:
//   - No CTAs ("send a gift now") — the only tap goes to the
//     person's public profile, NOT into the gifting funnel
//   - Cap 5 cards by default — never becomes an infinite feed
//   - Soft cards: no engagement counters, no popularity mechanics
//   - Section silently disappears when there's nothing imminent
//   - Window: 14 days, soonest first

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  fetchUpcomingForFollowed,
  type RelationshipOccasion,
} from '@/lib/occasions'

// Default window. Wider than the brief's "today / tomorrow / this
// week" so the rail still has content on a quiet week, but the
// server-supplied `bucket` carries the visual emphasis. Cap of 5
// keeps the rail one-screen on mobile.
const DEFAULT_WINDOW_DAYS = 14
const DEFAULT_LIMIT = 5

// Buckets we surface in the rail. `later` rows are filtered out —
// the rail is for what's imminent, not a 30-day forecast.
const VISIBLE_BUCKETS = new Set<RelationshipOccasion['bucket']>([
  'today',
  'tomorrow',
  'this_week',
  'this_month',
])

export default function UpcomingMomentsRail({
  windowDays = DEFAULT_WINDOW_DAYS,
  limit = DEFAULT_LIMIT,
}: {
  windowDays?: number
  limit?: number
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<RelationshipOccasion[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchUpcomingForFollowed({ windowDays, limit })
        if (cancelled) return
        // Filter client-side to the visible buckets. Server already
        // sorts by daysUntil ascending and caps at `limit`; this
        // just drops `later` rows that snuck in at the long tail of
        // the window.
        setItems(data.filter((o) => VISIBLE_BUCKETS.has(o.bucket)))
      } catch {
        if (cancelled) return
        // Failure is non-fatal — the rail just doesn't render. The
        // rest of the page is unaffected.
        setFailed(true)
        setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [windowDays, limit])

  // Calm-absence rule: nothing renders when there's no signal. No
  // skeleton, no "you have no upcoming moments" empty state.
  if (failed || items === null || items.length === 0) return null

  return (
    <section className="mt-6 qift-fade-in">
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <h2
          className="text-[0.95rem] font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('upcoming.title')}
        </h2>
        <span
          className="text-[0.65rem] font-medium tracking-[0.16em] uppercase"
          style={{ color: 'var(--muted-2)' }}
        >
          {t('upcoming.kicker')}
        </span>
      </div>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
        // Hide the scrollbar visually on the rail — same chrome
        // approach the store rails use elsewhere on home.
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((o) => (
          <UpcomingCard key={o.id} occasion={o} t={t} />
        ))}
      </div>
    </section>
  )
}

// Single card. Layout intentionally narrow (one-screen rail
// shouldn't feel like a wall of avatars). The whole card is a Link
// to /u/<username> — NOT to /send. The brief is anti-pressure: a
// visit to the profile is a deliberate, calm motion the viewer
// chooses; gifting is the next step they take from there, not a
// one-tap conversion path.
function UpcomingCard({
  occasion,
  t,
}: {
  occasion: RelationshipOccasion
  t: (key: string) => string
}) {
  // The /occasions/upcoming endpoint attaches `owner` to every row.
  // The cultural-row case (userId=null, owner=null) is V1-dormant
  // but we defend against it so a future seed doesn't crash the
  // rail.
  if (!occasion.owner) return null

  const kindLabel = t(`occasions.kind_${occasion.kind}`)
  const occasionTitle = occasion.label?.trim() || kindLabel

  const initials = (() => {
    const src = occasion.owner.fullName ?? occasion.owner.qiftUsername
    const parts = src
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase())
      .filter(Boolean)
    return (parts[0] ?? '') + (parts[1] ?? '')
  })()

  // Timing chip text. Mirrors PublicOccasionsPanel's mapping — the
  // server bucket drives the label, the daysUntil drives the
  // "in N days" specifics when bucket === 'this_week'.
  const timingText = (() => {
    if (occasion.bucket === 'today') return t('occasions.when_today')
    if (occasion.bucket === 'tomorrow') return t('occasions.when_tomorrow')
    if (
      occasion.bucket === 'this_week' &&
      occasion.daysUntil !== null &&
      occasion.daysUntil > 1
    ) {
      return t('occasions.when_in_days').replace(
        '{n}',
        String(occasion.daysUntil),
      )
    }
    if (occasion.bucket === 'this_month') return t('occasions.when_this_month')
    return t('occasions.when_later')
  })()

  // Today/tomorrow get the slightly stronger primary tint; further
  // out reads quieter. Calm gradation — not a "URGENT" badge.
  const imminent =
    occasion.bucket === 'today' || occasion.bucket === 'tomorrow'

  return (
    <Link
      href={`/u/${encodeURIComponent(occasion.owner.qiftUsername)}`}
      className="qift-press flex w-[170px] shrink-0 flex-col rounded-3xl border p-3 transition-all"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Avatar + handle row. The avatar uses initials when no
          image is on the user — the qiftUsername stays the
          authoritative recognition cue. */}
      <div className="flex items-center gap-2">
        {occasion.owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- intentionally <img>: avatars are remote, small, and not on the LCP path; <Image> would force per-card optimisation calls that don't fit a horizontal rail
          <img
            src={occasion.owner.avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            }}
          >
            {initials || '·'}
          </span>
        )}
        <span
          className="min-w-0 truncate text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {occasion.owner.fullName ?? `@${occasion.owner.qiftUsername}`}
        </span>
      </div>

      {/* Occasion title. Custom label preferred; falls back to the
          translated kind. No date detail here — the rail is about
          "what's coming up", not the full schema. */}
      <p
        className="mt-2.5 line-clamp-2 text-[0.78rem] leading-snug font-medium"
        style={{ color: 'var(--text)' }}
      >
        {occasionTitle}
      </p>

      {/* Timing chip. Imminent rows get a stronger tint; further-out
          rows read like a quiet note. */}
      <span
        className="mt-2.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[0.62rem] font-medium"
        style={{
          background: imminent
            ? 'rgba(123, 92, 245, 0.10)'
            : 'var(--card-soft)',
          color: imminent ? 'var(--ink)' : 'var(--text-soft)',
        }}
      >
        {timingText}
      </span>
    </Link>
  )
}
