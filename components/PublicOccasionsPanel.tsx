'use client'

// Visitor-side occasion list. Renders the RelationshipOccasion[]
// returned by /users/:userId/occasions (Phase 6.2 — privacy-
// filtered server-side; year stripped on yearly rows; daysUntil +
// bucket pre-computed).
//
// Two uses:
//   1. /u/[username] — "Upcoming moments" tab, read-only browsing
//   2. /send — gifting-context picker (`selectable` mode adds a
//      tap-to-attach affordance with a per-row aria-pressed state)
//
// Calm by design — no counters, no reactions, no "send now"
// pressure. The card reads like a quiet reminder, not a CTA.

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  fetchUserOccasions,
  type RelationshipOccasion,
} from '@/lib/occasions'

type Props = {
  userId: string
  // Selectable mode adds tap-to-attach with aria-pressed feedback.
  // The selected id is owned by the parent — null means "none".
  selectable?: boolean
  selectedId?: string | null
  onSelect?: (occasionId: string | null) => void
  // Bound on the number of rows shown. Defaults to 6 — enough to
  // surface the 1-2 most-imminent occasions without becoming a
  // wall of dates on busy profiles.
  limit?: number
  // Translation key for the empty-state body. Lets callers reuse
  // the same panel on /u/[username] ("hasn't shared occasions") vs
  // /send ("recipient has no upcoming occasions to attach").
  emptyKey?: string
}

// Month label key suffix. Two calendars; the picker pulls the
// matching localised name from `occasions.month_{g|h}_{1..12}`.
function monthLabelKey(calendar: 'gregorian' | 'hijri', month: number): string {
  return `occasions.month_${calendar === 'hijri' ? 'h' : 'g'}_${month}`
}

// Map the server's bucket (or a missing one) to a human-readable
// chip label key. The actual day count drives "in N days" for the
// 2-7 day window — readable when the server's bucket is
// 'this_week' and the row is genuinely days away.
function timingKey(o: RelationshipOccasion): string {
  if (o.bucket === 'today') return 'occasions.when_today'
  if (o.bucket === 'tomorrow') return 'occasions.when_tomorrow'
  if (o.bucket === 'this_week') return 'occasions.when_in_days'
  if (o.bucket === 'this_month') return 'occasions.when_this_month'
  if (o.bucket === 'later') return 'occasions.when_later'
  return 'occasions.when_past'
}

export default function PublicOccasionsPanel({
  userId,
  selectable = false,
  selectedId = null,
  onSelect,
  limit = 6,
  emptyKey = 'occasions.public_empty',
}: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<RelationshipOccasion[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchUserOccasions(userId)
        if (cancelled) return
        setItems(data)
      } catch {
        if (cancelled) return
        setError(true)
        setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (items === null) {
    return (
      <div className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded-2xl"
            style={{ background: 'var(--card-soft)' }}
          />
        ))}
      </div>
    )
  }

  if (error || items.length === 0) {
    return (
      <div
        className="mt-3 rounded-2xl border p-5 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
        }}
      >
        <p className="text-[0.78rem]" style={{ color: 'var(--text-soft)' }}>
          {t(emptyKey)}
        </p>
      </div>
    )
  }

  const shown = items.slice(0, limit)

  return (
    <div className="mt-3 space-y-2">
      {/* When selectable: include the "no attach" choice as a
          dismiss option at the top. The parent controls whether
          the visual chip reads "skip" or "no occasion attached". */}
      {selectable && (
        <button
          type="button"
          onClick={() => onSelect?.(null)}
          aria-pressed={selectedId === null}
          className="flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-start text-[0.78rem] transition-colors"
          style={{
            borderColor:
              selectedId === null ? 'var(--primary)' : 'var(--border)',
            background:
              selectedId === null
                ? 'rgba(123, 92, 245, 0.06)'
                : 'var(--card)',
            color: 'var(--text-soft)',
          }}
        >
          <span>{t('occasions.attach_none')}</span>
          {selectedId === null && (
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: 'var(--primary)' }}
            />
          )}
        </button>
      )}

      {shown.map((o) => (
        <PublicOccasionRow
          key={o.id}
          occasion={o}
          monthKey={monthLabelKey(o.calendar, o.month)}
          timingKeyId={timingKey(o)}
          selectable={selectable}
          selected={selectedId === o.id}
          onSelect={selectable ? () => onSelect?.(o.id) : undefined}
          t={t}
        />
      ))}
    </div>
  )
}

// Single occasion row. Layout matches the calm card style of
// OccasionCard from Phase 6.3 but lighter — no edit/remove
// actions, no kind chip, no visibility chip.
function PublicOccasionRow({
  occasion,
  monthKey,
  timingKeyId,
  selectable,
  selected,
  onSelect,
  t,
}: {
  occasion: RelationshipOccasion
  monthKey: string
  timingKeyId: string
  selectable: boolean
  selected: boolean
  onSelect?: () => void
  t: (key: string) => string
}) {
  const kindLabel = t(`occasions.kind_${occasion.kind}`)
  const monthLabel = t(monthKey)
  const title = occasion.label?.trim() || kindLabel
  const calendarTag =
    occasion.calendar === 'hijri' ? ` · ${t('occasions.calendar_hijri')}` : ''

  // Year shown ONLY when the row is a one-off (the year IS the
  // occurrence). Yearly rows arrive with year=null from the
  // server — defence-in-depth: even if a malformed payload sent a
  // year, this UI never renders it on a `yearly` row.
  const yearSuffix =
    occasion.recurrence === 'once' && occasion.year !== null
      ? ` ${occasion.year}`
      : ''
  const dateLine = `${occasion.day} ${monthLabel}${yearSuffix}${calendarTag}`

  const timingText =
    timingKeyId === 'occasions.when_in_days' && occasion.daysUntil !== null
      ? t(timingKeyId).replace('{n}', String(occasion.daysUntil))
      : t(timingKeyId)

  const inner = (
    <div className="flex w-full items-center gap-3">
      <div
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-2xl"
        style={{ background: 'rgba(123, 92, 245, 0.10)' }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[0.85rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 truncate text-[0.7rem]"
          style={{ color: 'var(--text-soft)' }}
        >
          {dateLine}
        </p>
      </div>
      <span
        className="rounded-full px-2.5 py-1 text-[0.62rem] font-medium whitespace-nowrap"
        style={{
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        {timingText}
      </span>
      {selectable && (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full border"
          style={{
            borderColor: selected ? 'var(--primary)' : 'var(--border-strong)',
            background: selected ? 'var(--primary)' : 'transparent',
          }}
        />
      )}
    </div>
  )

  if (!selectable) {
    return (
      <div
        className="rounded-2xl border p-3"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="block w-full rounded-2xl border p-3 text-start transition-colors"
      style={{
        borderColor: selected ? 'var(--primary)' : 'var(--border)',
        background: selected
          ? 'rgba(123, 92, 245, 0.06)'
          : 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {inner}
    </button>
  )
}
