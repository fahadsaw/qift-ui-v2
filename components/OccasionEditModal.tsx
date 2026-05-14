'use client'

// Create + edit modal for occasions. One scroll-able form (no
// wizard / multi-step) so the action stays calm and short. Six
// sections, in order:
//
//   1. Kind            (chip picker, grouped)
//   2. Recurrence       (yearly | once)
//   3. Calendar + date  (Gregorian | Hijri toggle → month/day/year)
//   4. Optional label   (single line, max 80)
//   5. Visibility       (4 tiers with human-language labels)
//   6. Reminders        (toggle a couple of timings; channel hint)
//
// The submit handler accepts both create + update — the parent
// passes either undefined (create flow) or an existing occasion
// (edit flow). Submitted payloads route through the centralised
// API client in lib/occasions.ts; visibility enforcement lives
// entirely server-side.

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  KIND_GROUPS,
  OCCASION_KINDS,
  REMINDER_TIMING_OPTIONS,
  VISIBILITY_ORDER,
  createOccasion,
  defaultRemindersFor,
  deleteReminder,
  fetchReminders,
  maxPickerDay,
  updateOccasion,
  upsertReminder,
  type OccasionCalendar,
  type OccasionKind,
  type OccasionRecurrence,
  type OccasionReminder,
  type OccasionVisibility,
  type PublicOccasion,
  type ReminderChannel,
} from '@/lib/occasions'

type DraftReminder = {
  // Existing rows carry the server id; new toggles only carry
  // daysBefore until we POST.
  id?: string
  daysBefore: number
  enabled: boolean
}

const DEFAULT_KIND: OccasionKind = 'birthday'
const DEFAULT_CALENDAR: OccasionCalendar = 'gregorian'
const DEFAULT_RECURRENCE: OccasionRecurrence = 'yearly'
const DEFAULT_VISIBILITY: OccasionVisibility = 'private'

function clampDay(
  day: number,
  calendar: OccasionCalendar,
  year: number | null,
  month: number,
): number {
  const max = maxPickerDay(calendar, year, month)
  if (day < 1) return 1
  if (day > max) return max
  return day
}

// Convert a fetched reminder list into the modal's draft array.
// Folds the server rows into the timing-options set so disabled
// options still render (the user can re-enable them in place).
function buildDraftReminders(
  server: OccasionReminder[],
  defaults: number[],
  options: readonly number[],
): DraftReminder[] {
  const byDays = new Map<number, OccasionReminder>()
  for (const r of server) byDays.set(r.daysBefore, r)
  return options
    .map<DraftReminder>((daysBefore) => {
      const existing = byDays.get(daysBefore)
      if (existing) {
        return {
          id: existing.id,
          daysBefore,
          enabled: existing.enabled,
        }
      }
      return {
        id: undefined,
        daysBefore,
        // Pre-check the timings that match this kind's default
        // cadence — so a brand-new birthday already has its 7d/1d
        // suggestions visible.
        enabled: defaults.includes(daysBefore),
      }
    })
    .sort((a, b) => b.daysBefore - a.daysBefore)
}

export default function OccasionEditModal({
  occasion,
  onClose,
  onSaved,
}: {
  occasion: PublicOccasion | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const isEdit = !!occasion

  // Initial form state. For edit flow, hydrate from the row;
  // otherwise fall back to a calm birthday default.
  const seed = useMemo(() => {
    if (occasion) return occasion
    return {
      kind: DEFAULT_KIND,
      label: '',
      calendar: DEFAULT_CALENDAR,
      year: null as number | null,
      month: 1,
      day: 1,
      recurrence: DEFAULT_RECURRENCE,
      visibility: DEFAULT_VISIBILITY,
    }
  }, [occasion])

  const [kind, setKind] = useState<OccasionKind>(seed.kind as OccasionKind)
  const [label, setLabel] = useState(seed.label ?? '')
  const [calendar, setCalendar] = useState<OccasionCalendar>(seed.calendar)
  const [recurrence, setRecurrence] = useState<OccasionRecurrence>(
    seed.recurrence,
  )
  const [year, setYear] = useState<number | null>(seed.year ?? null)
  const [month, setMonth] = useState<number>(seed.month)
  const [day, setDay] = useState<number>(seed.day)
  const [visibility, setVisibility] = useState<OccasionVisibility>(
    seed.visibility,
  )

  const [reminders, setReminders] = useState<DraftReminder[]>(() => {
    const defaults = defaultRemindersFor(seed.kind as OccasionKind)
    return buildDraftReminders([], defaults, REMINDER_TIMING_OPTIONS)
  })
  const [channel, setChannel] = useState<ReminderChannel>('digest')

  const [saving, setSaving] = useState(false)

  // On edit-open, fetch the live reminder rows so the modal shows
  // the user's real choices (not just the kind defaults).
  useEffect(() => {
    if (!occasion) return
    let cancelled = false
    void (async () => {
      try {
        const server = await fetchReminders(occasion.id)
        if (cancelled) return
        // Channel: take the most-common server channel; default
        // to 'digest' otherwise. V1 doesn't surface per-row
        // channels (matches the calm-UX guardrail).
        const realTimeCount = server.filter(
          (r) => r.channel === 'real_time',
        ).length
        setChannel(
          realTimeCount > server.length / 2 ? 'real_time' : 'digest',
        )
        const defaults = defaultRemindersFor(
          occasion.kind as OccasionKind,
        )
        setReminders(
          buildDraftReminders(server, defaults, REMINDER_TIMING_OPTIONS),
        )
      } catch {
        // Failure to load reminders shouldn't block editing the
        // occasion itself; we just show the kind defaults.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [occasion])

  // Day-clamp helpers. When the user toggles calendar / month /
  // year, an existing day value may exceed the new month's length
  // (Feb 30 in Gregorian, day 30 in a 29-day Hijri month). We clamp
  // here in the change handlers — NOT in an effect — to avoid a
  // cascading re-render and the corresponding lint rule.
  const setCalendarSafe = (next: OccasionCalendar) => {
    setCalendar(next)
    setDay((d) => clampDay(d, next, year, month))
  }
  const setMonthSafe = (next: number) => {
    setMonth(next)
    setDay((d) => clampDay(d, calendar, year, next))
  }
  const setYearSafe = (next: number | null) => {
    setYear(next)
    setDay((d) => clampDay(d, calendar, next, month))
  }

  // ── Validation: surface only at submit time. Inline form
  // pressure (red borders mid-typing) feels harsher than the
  // calm voice this surface wants.
  const validation = useMemo(() => {
    if (!OCCASION_KINDS.includes(kind)) return 'kind'
    if (!Number.isInteger(month) || month < 1 || month > 12) return 'month'
    if (!Number.isInteger(day) || day < 1 || day > 31) return 'day'
    if (recurrence === 'once') {
      if (
        year === null ||
        !Number.isInteger(year) ||
        year < 1900 ||
        year > 3000
      )
        return 'year'
    }
    return null
  }, [kind, month, day, recurrence, year])

  const onSubmit = async () => {
    if (saving || validation) return
    setSaving(true)
    try {
      const payload = {
        kind,
        label: label.trim() ? label.trim() : null,
        calendar,
        recurrence,
        year:
          recurrence === 'once'
            ? year
            : year === null || year === 0
              ? null
              : year,
        month,
        day,
        visibility,
      }

      let saved: PublicOccasion
      if (occasion) {
        saved = await updateOccasion(occasion.id, payload)
      } else {
        saved = await createOccasion(payload)
      }

      // Reminder sync. We diff the draft against the server in
      // two passes:
      //   - rows toggled OFF that have an existing id → DELETE
      //   - rows toggled ON → POST (upsert by (userId, occasionId,
      //     daysBefore) so a repeated toggle is a no-op)
      // Best-effort: a failed reminder doesn't roll back the saved
      // occasion (the occasion is the load-bearing artifact).
      for (const r of reminders) {
        try {
          if (r.enabled) {
            await upsertReminder(saved.id, {
              daysBefore: r.daysBefore,
              channel,
              enabled: true,
            })
          } else if (r.id) {
            await deleteReminder(saved.id, r.id)
          }
        } catch {
          /* tolerated; user can adjust again */
        }
      }

      toast.show(
        isEdit ? t('occasions.saved_toast') : t('occasions.created_toast'),
      )
      onSaved()
      onClose()
    } catch {
      toast.show(t('occasions.save_failed'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ── Render

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-6 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border p-5 backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit
              ? t('occasions.modal_edit_title')
              : t('occasions.modal_new_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[0.7rem] font-medium"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('occasions.cancel')}
          </button>
        </div>

        {/* 1. Kind */}
        <SectionLabel text={t('occasions.section_kind')} />
        <KindPicker value={kind} onChange={setKind} />

        {/* 2. Optional label */}
        <SectionLabel text={t('occasions.section_label')} optional />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 80))}
          placeholder={t('occasions.section_label_placeholder')}
          className="w-full rounded-2xl border px-4 py-3 text-sm transition-colors focus:outline-none"
          style={{
            borderColor: 'var(--border-strong)',
            background: 'var(--card)',
            color: 'var(--text)',
          }}
        />

        {/* 3. Recurrence */}
        <SectionLabel text={t('occasions.section_recurrence')} />
        <SegmentedTwo
          value={recurrence}
          a={{
            id: 'yearly' as const,
            label: t('occasions.recurrence_yearly'),
          }}
          b={{ id: 'once' as const, label: t('occasions.recurrence_once') }}
          onChange={setRecurrence}
        />

        {/* 4. Calendar */}
        <SectionLabel text={t('occasions.section_calendar')} />
        <SegmentedTwo
          value={calendar}
          a={{
            id: 'gregorian' as const,
            label: t('occasions.calendar_gregorian'),
          }}
          b={{
            id: 'hijri' as const,
            label: t('occasions.calendar_hijri'),
          }}
          onChange={setCalendarSafe}
        />

        {/* 5. Month + Day + Year */}
        <SectionLabel text={t('occasions.section_when')} />
        <div className="grid grid-cols-3 gap-2">
          <SelectField
            label={t('occasions.section_month')}
            value={month}
            onChange={(v) => setMonthSafe(Number.parseInt(v, 10))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {t(
                  `occasions.month_${calendar === 'hijri' ? 'h' : 'g'}_${m}`,
                )}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('occasions.section_day')}
            value={day}
            onChange={(v) => setDay(Number.parseInt(v, 10))}
          >
            {Array.from(
              { length: maxPickerDay(calendar, year, month) },
              (_, i) => i + 1,
            ).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={
              recurrence === 'once'
                ? t('occasions.section_year')
                : `${t('occasions.section_year')} (${t('occasions.year_optional')})`
            }
            value={year ?? ''}
            onChange={(v) =>
              setYearSafe(v === '' ? null : Number.parseInt(v, 10))
            }
          >
            <option value="">—</option>
            {yearRangeFor(recurrence).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectField>
        </div>

        {/* 6. Visibility */}
        <SectionLabel text={t('occasions.section_visibility')} />
        <VisibilityPicker value={visibility} onChange={setVisibility} />

        {/* 7. Reminders */}
        <SectionLabel text={t('occasions.section_reminders')} />
        <p
          className="-mt-2 mb-2 text-[0.7rem]"
          style={{ color: 'var(--muted-2)' }}
        >
          {t('occasions.reminders_help')}
        </p>
        <div className="flex flex-wrap gap-2">
          {reminders.map((r) => (
            <button
              type="button"
              key={r.daysBefore}
              onClick={() =>
                setReminders((rs) =>
                  rs.map((x) =>
                    x.daysBefore === r.daysBefore
                      ? { ...x, enabled: !x.enabled }
                      : x,
                  ),
                )
              }
              className="rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-colors"
              style={{
                borderColor: r.enabled
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
                background: r.enabled
                  ? 'rgba(123, 92, 245, 0.10)'
                  : 'transparent',
                color: r.enabled ? 'var(--ink)' : 'var(--text-soft)',
              }}
              aria-pressed={r.enabled}
            >
              {t(`occasions.remind_${r.daysBefore}`)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <SegmentedTwo
            value={channel}
            a={{
              id: 'digest' as const,
              label: t('occasions.reminder_channel_digest'),
            }}
            b={{
              id: 'real_time' as const,
              label: t('occasions.reminder_channel_real_time'),
            }}
            onChange={setChannel}
          />
          <p
            className="mt-2 text-[0.65rem]"
            style={{ color: 'var(--muted-2)' }}
          >
            {t('occasions.reminder_channel_hint')}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[0.78rem] font-medium"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('occasions.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving || !!validation}
            className="rounded-full px-5 py-2 text-[0.82rem] font-semibold text-white transition-opacity disabled:opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            }}
          >
            {t('occasions.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function SectionLabel({
  text,
  optional,
}: {
  text: string
  optional?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="mt-4 mb-2 flex items-center gap-1">
      <span
        className="text-[0.65rem] font-semibold tracking-[0.18em] uppercase"
        style={{ color: 'var(--text-soft)' }}
      >
        {text}
      </span>
      {optional && (
        <span
          className="text-[0.6rem] font-normal"
          style={{ color: 'var(--muted-2)' }}
        >
          ({t('occasions.year_optional')})
        </span>
      )}
    </div>
  )
}

function SegmentedTwo<T extends string>({
  value,
  a,
  b,
  onChange,
}: {
  value: T
  a: { id: T; label: string }
  b: { id: T; label: string }
  onChange: (next: T) => void
}) {
  return (
    <div
      className="inline-flex w-full rounded-2xl border p-1"
      style={{
        borderColor: 'var(--border-strong)',
        background: 'var(--card-soft)',
      }}
    >
      {[a, b].map((opt) => {
        const active = value === opt.id
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="flex-1 rounded-xl px-3 py-2 text-[0.78rem] font-medium transition-colors"
            style={{
              background: active ? 'var(--card)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--text-soft)',
              boxShadow: active ? 'var(--shadow-card)' : 'none',
            }}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[0.6rem] font-semibold tracking-[0.18em] uppercase"
        style={{ color: 'var(--text-soft)' }}
      >
        {label}
      </span>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border px-3 py-2.5 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'var(--card)',
          color: 'var(--text)',
        }}
      >
        {children}
      </select>
    </label>
  )
}

function KindPicker({
  value,
  onChange,
}: {
  value: OccasionKind
  onChange: (next: OccasionKind) => void
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      {KIND_GROUPS.map((group) => (
        <div key={group.id}>
          <p
            className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.18em] uppercase"
            style={{ color: 'var(--muted-2)' }}
          >
            {t(`occasions.kind_group_${group.id}`)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.kinds.map((k) => {
              const active = value === k
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => onChange(k)}
                  className="rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-colors"
                  style={{
                    borderColor: active
                      ? 'var(--primary)'
                      : 'var(--border-strong)',
                    background: active
                      ? 'rgba(123, 92, 245, 0.10)'
                      : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--text-soft)',
                  }}
                  aria-pressed={active}
                >
                  {t(`occasions.kind_${k}`)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function VisibilityPicker({
  value,
  onChange,
}: {
  value: OccasionVisibility
  onChange: (next: OccasionVisibility) => void
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      {VISIBILITY_ORDER.map((tier) => {
        const active = value === tier
        return (
          <button
            type="button"
            key={tier}
            onClick={() => onChange(tier)}
            className="flex w-full items-start gap-3 rounded-2xl border p-3 text-start transition-colors"
            style={{
              borderColor: active
                ? 'var(--primary)'
                : 'var(--border-strong)',
              background: active
                ? 'rgba(123, 92, 245, 0.06)'
                : 'transparent',
            }}
            aria-pressed={active}
          >
            <span
              aria-hidden
              className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full border"
              style={{
                borderColor: active
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
                background: active ? 'var(--primary)' : 'transparent',
              }}
            />
            <span className="flex-1">
              <span
                className="block text-[0.85rem] font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {t(`occasions.vis_${tier}`)}
              </span>
              <span
                className="mt-0.5 block text-[0.7rem]"
                style={{ color: 'var(--muted-2)' }}
              >
                {t(`occasions.vis_${tier}_hint`)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Year range for the picker. For 'once' we show this year + the
// next 5 (future events) AND the previous 5 (retroactively logging
// a wedding from last summer). For 'yearly' we show a window
// centred on the current year so the user can pick a birth year.
function yearRangeFor(recurrence: OccasionRecurrence): number[] {
  const now = new Date().getUTCFullYear()
  if (recurrence === 'once') {
    const out: number[] = []
    for (let y = now - 5; y <= now + 10; y += 1) out.push(y)
    return out
  }
  // Yearly: birth-year picker. Range 100 years back to 5 forward.
  const out: number[] = []
  for (let y = now - 100; y <= now + 5; y += 1) out.push(y)
  return out.reverse()
}
