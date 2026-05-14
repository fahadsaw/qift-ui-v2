'use client'

// Single occasion row on the /occasions page. Calm by design —
// a soft card with the title, a single readable date line, a
// muted visibility chip, and edit/remove actions. No counters,
// no reactions, no "X people are remembering this".
//
// The card consumes the owner-side PublicOccasion shape (full
// year, visibility shown). Relationship-side projections never
// render through this component — those live behind feed/discovery
// surfaces that ship in 6.4+.

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type {
  OccasionVisibility,
  PublicOccasion,
} from '@/lib/occasions'

// Calm pastel colour per kind-group. Picked once at render time so
// cards don't flicker between renders.
function groupColorFor(kind: string): string {
  if (
    kind === 'birthday' ||
    kind === 'anniversary_relationship' ||
    kind === 'anniversary_work' ||
    kind === 'anniversary_other'
  ) {
    return 'rgba(123, 92, 245, 0.10)' // primary-tint
  }
  if (
    kind === 'eid_al_fitr' ||
    kind === 'eid_al_adha' ||
    kind === 'ramadan' ||
    kind === 'hijri_new_year' ||
    kind === 'mawlid' ||
    kind === 'ashura' ||
    kind === 'mothers_day' ||
    kind === 'fathers_day' ||
    kind === 'saudi_national_day' ||
    kind === 'new_year'
  ) {
    return 'rgba(99, 179, 167, 0.10)' // soft teal
  }
  if (
    kind === 'graduation' ||
    kind === 'wedding' ||
    kind === 'engagement' ||
    kind === 'new_baby' ||
    kind === 'new_home' ||
    kind === 'new_job' ||
    kind === 'promotion' ||
    kind === 'retirement' ||
    kind === 'degree' ||
    kind === 'exam_success' ||
    kind === 'milestone'
  ) {
    return 'rgba(232, 156, 84, 0.10)' // warm amber
  }
  return 'rgba(150, 150, 160, 0.08)'
}

// Map daysUntil to the same coarse bucket the backend exposes for
// RelationshipOccasion. Owner-side rows don't carry `daysUntil`
// directly — we derive it from `nextOccurrenceAt`.
function bucketForDays(daysUntil: number | null): {
  bucket:
    | 'today'
    | 'tomorrow'
    | 'this_week'
    | 'this_month'
    | 'later'
    | 'past'
  daysUntil: number | null
} {
  if (daysUntil === null) return { bucket: 'past', daysUntil: null }
  if (daysUntil <= 0) return { bucket: 'today', daysUntil }
  if (daysUntil === 1) return { bucket: 'tomorrow', daysUntil }
  if (daysUntil <= 7) return { bucket: 'this_week', daysUntil }
  if (daysUntil <= 30) return { bucket: 'this_month', daysUntil }
  return { bucket: 'later', daysUntil }
}

function relativeTiming(nextIso: string | null): {
  bucket:
    | 'today'
    | 'tomorrow'
    | 'this_week'
    | 'this_month'
    | 'later'
    | 'past'
  daysUntil: number | null
} {
  if (!nextIso) return { bucket: 'past', daysUntil: null }
  const next = Date.parse(nextIso)
  if (!Number.isFinite(next)) return { bucket: 'past', daysUntil: null }
  const dayMs = 24 * 60 * 60 * 1000
  const nowUtcDay = (() => {
    const n = new Date()
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())
  })()
  const nextUtcDay = (() => {
    const d = new Date(next)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  })()
  const days = Math.round((nextUtcDay - nowUtcDay) / dayMs)
  return bucketForDays(days)
}

export default function OccasionCard({
  occasion,
  onEdit,
  onDelete,
}: {
  occasion: PublicOccasion
  onEdit: (o: PublicOccasion) => void
  onDelete: (o: PublicOccasion) => void
}) {
  const { t } = useI18n()
  const timing = useMemo(
    () => relativeTiming(occasion.nextOccurrenceAt),
    [occasion.nextOccurrenceAt],
  )

  const kindLabel = t(`occasions.kind_${occasion.kind}`)
  const monthLabel = t(
    `occasions.month_${occasion.calendar === 'hijri' ? 'h' : 'g'}_${occasion.month}`,
  )
  const title = occasion.label?.trim() || kindLabel
  const groupTint = groupColorFor(occasion.kind)

  const whenLine = (() => {
    if (timing.bucket === 'today') return t('occasions.when_today')
    if (timing.bucket === 'tomorrow') return t('occasions.when_tomorrow')
    if (timing.daysUntil !== null && timing.daysUntil <= 7) {
      return t('occasions.when_in_days').replace(
        '{n}',
        String(timing.daysUntil),
      )
    }
    if (timing.bucket === 'this_month') return t('occasions.when_this_month')
    if (timing.bucket === 'later') return t('occasions.when_later')
    return t('occasions.when_past')
  })()

  // Date display line — month + day + calendar tag (only when
  // Hijri, to avoid noisy "Gregorian" copy on the default case).
  // Year is shown ONLY for one-off rows (the year IS the occurrence).
  const dateLine = (() => {
    const dayPart = `${occasion.day}`
    const monthPart = monthLabel
    const tail =
      occasion.recurrence === 'once' && occasion.year !== null
        ? ` ${occasion.year}`
        : ''
    const calendarTag =
      occasion.calendar === 'hijri'
        ? ` · ${t('occasions.calendar_hijri')}`
        : ''
    return `${dayPart} ${monthPart}${tail}${calendarTag}`
  })()

  return (
    <article
      className="qift-fade-in rounded-3xl border p-4 transition-shadow"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Soft swatch with kind-group tint. No emoji / icon —
            the design stays calm and intentionally unbranded. */}
        <div
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-2xl"
          style={{ background: groupTint }}
        />
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[0.95rem] font-semibold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </h3>
          <p
            className="mt-0.5 truncate text-[0.78rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {dateLine}
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[0.65rem] font-medium whitespace-nowrap"
          style={{
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {whenLine}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VisibilityChip visibility={occasion.visibility} />
        {occasion.label && occasion.label.trim() !== '' && (
          // Show the underlying kind as a quieter chip when the
          // user has supplied a personal label. Keeps the warm
          // owner-chosen title primary while preserving the
          // type-of-occasion signal.
          <span
            className="rounded-full border px-2 py-0.5 text-[0.62rem]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--muted-2)',
            }}
          >
            {kindLabel}
          </span>
        )}
        <span className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(occasion)}
            className="rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors"
            style={{
              background: 'var(--card-soft)',
              color: 'var(--ink)',
            }}
          >
            {t('occasions.edit')}
          </button>
          <button
            type="button"
            onClick={() => onDelete(occasion)}
            className="rounded-full px-3 py-1 text-[0.7rem] font-medium transition-colors"
            style={{ color: 'var(--muted-2)' }}
          >
            {t('occasions.delete')}
          </button>
        </span>
      </div>
    </article>
  )
}

function VisibilityChip({ visibility }: { visibility: OccasionVisibility }) {
  const { t } = useI18n()
  const label = t(`occasions.vis_${visibility}`)
  // Single muted treatment — we don't escalate visual weight on the
  // wider tiers. Visibility is a quiet detail, not a status badge.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-medium"
      style={{
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1 w-1 rounded-full"
        style={{ background: 'var(--primary)', opacity: 0.6 }}
      />
      {label}
    </span>
  )
}
