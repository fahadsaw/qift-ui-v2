'use client'

// Phase 7.1B — calm notification preferences UI.
//
// Renders inside /settings. Consumes the Phase 7.1 backend
// directly — no local mirroring of the category registry, no
// duplication of the orchestrator's truth. The backend is the
// source of truth for:
//   - which categories exist
//   - which are mandatory (cannot be opted out)
//   - per-category daily / weekly caps
//
// UX philosophy (matches the brief):
//   - Calm, human language. No "rate limit", "fanout", "channel
//     eligibility", "budget exceeded" jargon anywhere visible.
//   - Mandatory categories shown as locked with a soft explanation,
//     not a scary warning.
//   - Quiet hours read as a sleep-friendly choice, not a scheduler.
//   - Digest mode is a 3-way radio; the underlying boolean +
//     enum on the backend is invisible to the user.
//   - Trust copy at the top reinforces what we DON'T put in
//     notifications.
//
// Privacy reinforcement: every notification body the orchestrator
// dispatches is caller-supplied (gift / order / payment service).
// The architectural rule "no PII in bodies" is enforced by the
// caller-side contract (Phase 7.1 commit message). This UI just
// communicates the rule to the user — it doesn't enforce it.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  type DigestMode,
  type NotificationCategoryId,
  type NotificationCategoryView,
  type NotificationPreferences,
  deriveDigestMode,
  fetchNotificationCategories,
  fetchNotificationPreferences,
  patchForDigestMode,
  updateNotificationPreferences,
} from '@/lib/notifications'

// ── Visual constants ────────────────────────────────────────────

// Default quiet-hours pre-fill when the user first toggles the
// feature on. Matches the most common "sleep window" — explicit
// + adjustable.
const DEFAULT_QUIET_START = '22:00'
const DEFAULT_QUIET_END = '08:00'

// Curated IANA timezone list for the picker. Saudi-first, then
// the wider GCC, then a small global fallback. Keeps the dropdown
// short + relevant. Picker stays a free-text input fallback for
// users whose TZ isn't on the list (rare).
const TIMEZONE_CHOICES: ReadonlyArray<{ id: string; labelKey: string }> = [
  { id: 'Asia/Riyadh', labelKey: 'notif_prefs.tz_riyadh' },
  { id: 'Asia/Kuwait', labelKey: 'notif_prefs.tz_kuwait' },
  { id: 'Asia/Dubai', labelKey: 'notif_prefs.tz_dubai' },
  { id: 'Asia/Qatar', labelKey: 'notif_prefs.tz_doha' },
  { id: 'Asia/Bahrain', labelKey: 'notif_prefs.tz_bahrain' },
  { id: 'Asia/Muscat', labelKey: 'notif_prefs.tz_muscat' },
  { id: 'Africa/Cairo', labelKey: 'notif_prefs.tz_cairo' },
  { id: 'Europe/Istanbul', labelKey: 'notif_prefs.tz_istanbul' },
  { id: 'Europe/London', labelKey: 'notif_prefs.tz_london' },
  { id: 'America/New_York', labelKey: 'notif_prefs.tz_new_york' },
]

// Display order for the category list. Mandatory first (so the
// user sees what's PROTECTED before the togglable rows), then
// operational, then social, then system. Order is stable across
// renders even though the backend returns them in registry order.
const CATEGORY_DISPLAY_ORDER: ReadonlyArray<NotificationCategoryId> = [
  'security',
  'otp',
  'legal',
  'gift_update',
  'address_confirm',
  'merchant_order',
  'occasion_reminder',
  'social',
  'system',
]

// ── The component ───────────────────────────────────────────────

export default function NotificationPreferencesSection() {
  const { t } = useI18n()
  const toast = useToast()
  const [categories, setCategories] = useState<NotificationCategoryView[]>([])
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Initial hydration. Both calls are JWT-protected; the auth
  // helper handles unauthenticated callers via a thrown
  // NotificationsApiError that we catch as a silent failure
  // (the rest of /settings keeps rendering).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [cats, p] = await Promise.all([
          fetchNotificationCategories(),
          fetchNotificationPreferences(),
        ])
        if (cancelled) return
        setCategories(cats)
        setPrefs(p)
      } catch {
        // Silent — user is unauthenticated OR the API is briefly
        // unreachable. /settings continues to render the rest of
        // its surfaces; this card simply doesn't appear.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Optimistic patch helper. Local state flips first; rollback
  // toast on backend rejection. Matches the pattern the rest of
  // /settings uses for privacy toggles.
  const patchPrefs = useCallback(
    async (
      patch: Parameters<typeof updateNotificationPreferences>[0],
      optimistic: (current: NotificationPreferences) => NotificationPreferences,
    ) => {
      if (!prefs || saving) return
      const before = prefs
      setPrefs(optimistic(prefs))
      setSaving(true)
      try {
        const next = await updateNotificationPreferences(patch)
        setPrefs(next)
      } catch {
        setPrefs(before)
        toast.show(t('notif_prefs.save_failed'), { tone: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [prefs, saving, t, toast],
  )

  if (loading) return <Skeleton />
  if (!prefs) return null

  // Mandatory categories render as a "protected" list; optional
  // as togglable rows. Sort to the display order so the layout
  // doesn't depend on the backend's registry iteration.
  const ordered = [...categories].sort(
    (a, b) =>
      CATEGORY_DISPLAY_ORDER.indexOf(a.id) -
      CATEGORY_DISPLAY_ORDER.indexOf(b.id),
  )
  const mandatory = ordered.filter((c) => c.mandatory)
  const optional = ordered.filter((c) => !c.mandatory)

  const quietHoursEnabled =
    prefs.quietHoursStart !== null && prefs.quietHoursEnd !== null
  const digestMode = deriveDigestMode(prefs)

  // ── Handlers ──────────────────────────────────────────────────

  const onToggleCategory = (id: NotificationCategoryId) => {
    const current = prefs.categoryOptOuts[id] === true
    const next = !current
    const nextOptOuts = { ...prefs.categoryOptOuts }
    if (next) nextOptOuts[id] = true
    else delete nextOptOuts[id]
    void patchPrefs(
      { categoryOptOuts: nextOptOuts },
      (p) => ({ ...p, categoryOptOuts: nextOptOuts }),
    )
  }

  const onToggleQuietHours = (enabled: boolean) => {
    if (enabled) {
      void patchPrefs(
        {
          quietHoursStart: DEFAULT_QUIET_START,
          quietHoursEnd: DEFAULT_QUIET_END,
        },
        (p) => ({
          ...p,
          quietHoursStart: DEFAULT_QUIET_START,
          quietHoursEnd: DEFAULT_QUIET_END,
        }),
      )
    } else {
      void patchPrefs(
        { quietHoursStart: null, quietHoursEnd: null },
        (p) => ({ ...p, quietHoursStart: null, quietHoursEnd: null }),
      )
    }
  }

  const onChangeQuietHour = (which: 'start' | 'end', value: string) => {
    // Only patch when both ends remain non-null — the backend
    // rejects half-configured pairs. Since `quietHoursEnabled` is
    // true here, both ends already exist; we update the touched
    // one and resend the pair.
    const patch =
      which === 'start'
        ? { quietHoursStart: value, quietHoursEnd: prefs.quietHoursEnd }
        : { quietHoursStart: prefs.quietHoursStart, quietHoursEnd: value }
    void patchPrefs(patch, (p) => ({
      ...p,
      ...(which === 'start' ? { quietHoursStart: value } : { quietHoursEnd: value }),
    }))
  }

  const onChangeTimezone = (tz: string) => {
    void patchPrefs(
      { quietHoursTimezone: tz },
      (p) => ({ ...p, quietHoursTimezone: tz }),
    )
  }

  const onChangeDigestMode = (mode: DigestMode) => {
    const patch = patchForDigestMode(mode)
    void patchPrefs(patch, (p) => ({
      ...p,
      digestEnabled: patch.digestEnabled ?? p.digestEnabled,
      digestFrequency: patch.digestFrequency ?? p.digestFrequency,
    }))
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <section className="space-y-6">
      <header>
        <h3
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('notif_prefs.title')}
        </h3>
        <p
          className="mt-1 text-[0.8rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('notif_prefs.subtitle')}
        </p>
      </header>

      <TrustNote />

      {/* WHAT TO RECEIVE — categories list */}
      <div>
        <Label>{t('notif_prefs.what_heading')}</Label>

        {/* Mandatory categories — locked, with calm explanation */}
        <ul className="mt-2 flex flex-col gap-2">
          {mandatory.map((cat) => (
            <li key={cat.id}>
              <MandatoryRow
                title={t(`notif_prefs.cat_${cat.id}_title`)}
                hint={t(`notif_prefs.cat_${cat.id}_hint`)}
              />
            </li>
          ))}
        </ul>

        {/* Optional categories — toggles */}
        <ul className="mt-2 flex flex-col gap-2">
          {optional.map((cat) => {
            // categoryOptOuts is sparse — missing key = opted in.
            const optedIn = prefs.categoryOptOuts[cat.id] !== true
            return (
              <li key={cat.id}>
                <OptionalRow
                  title={t(`notif_prefs.cat_${cat.id}_title`)}
                  hint={t(`notif_prefs.cat_${cat.id}_hint`)}
                  on={optedIn}
                  onChange={() => onToggleCategory(cat.id)}
                />
              </li>
            )
          })}
        </ul>
      </div>

      {/* QUIET HOURS */}
      <div>
        <Label>{t('notif_prefs.quiet_heading')}</Label>
        <OptionalRow
          title={t('notif_prefs.quiet_toggle_title')}
          hint={t('notif_prefs.quiet_toggle_hint')}
          on={quietHoursEnabled}
          onChange={() => onToggleQuietHours(!quietHoursEnabled)}
        />
        {quietHoursEnabled && (
          <div
            className="qift-fade-in mt-2 rounded-2xl border p-3.5"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                label={t('notif_prefs.quiet_from')}
                value={prefs.quietHoursStart ?? DEFAULT_QUIET_START}
                onChange={(v) => onChangeQuietHour('start', v)}
              />
              <TimeField
                label={t('notif_prefs.quiet_to')}
                value={prefs.quietHoursEnd ?? DEFAULT_QUIET_END}
                onChange={(v) => onChangeQuietHour('end', v)}
              />
            </div>
            <div className="mt-3">
              <span
                className="block text-[0.65rem] font-semibold tracking-[0.16em] uppercase"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('notif_prefs.quiet_tz_label')}
              </span>
              <select
                value={prefs.quietHoursTimezone}
                onChange={(e) => onChangeTimezone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                }}
              >
                {TIMEZONE_CHOICES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {t(tz.labelKey)}
                  </option>
                ))}
                {/* Render the user's own TZ if it isn't on the
                    curated list — preserves any free-text value
                    set via direct API call. */}
                {!TIMEZONE_CHOICES.some((tz) => tz.id === prefs.quietHoursTimezone) && (
                  <option value={prefs.quietHoursTimezone}>
                    {prefs.quietHoursTimezone}
                  </option>
                )}
              </select>
            </div>
            <p
              className="mt-3 text-[0.7rem] leading-relaxed"
              style={{ color: 'var(--muted)' }}
            >
              {t('notif_prefs.quiet_critical_note')}
            </p>
          </div>
        )}
      </div>

      {/* DIGEST CADENCE */}
      <div>
        <Label>{t('notif_prefs.cadence_heading')}</Label>
        <ul className="mt-2 flex flex-col gap-2">
          {(['real_time', 'daily', 'weekly'] as DigestMode[]).map((mode) => {
            const active = digestMode === mode
            return (
              <li key={mode}>
                <RadioRow
                  title={t(`notif_prefs.cadence_${mode}_title`)}
                  hint={t(`notif_prefs.cadence_${mode}_hint`)}
                  selected={active}
                  onSelect={() => onChangeDigestMode(mode)}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[0.65rem] font-semibold tracking-[0.18em] uppercase"
      style={{ color: 'var(--muted)' }}
    >
      {children}
    </p>
  )
}

// Calm "we don't include sensitive data in notifications" note.
// Reinforces trust before the user starts toggling categories.
function TrustNote() {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border p-3.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: 'rgba(123, 92, 245, 0.10)',
            color: 'var(--primary)',
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
            <path d="M12 2L4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <p
          className="text-[0.78rem] leading-relaxed"
          style={{ color: 'var(--text)' }}
        >
          {t('notif_prefs.trust_body')}
        </p>
      </div>
    </div>
  )
}

// Row for mandatory categories. NO toggle — shown with a soft
// "always on" indicator and the rationale. Calm, not scary.
function MandatoryRow({ title, hint }: { title: string; hint: string }) {
  const { t } = useI18n()
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border px-4 py-3"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: 'rgba(123, 92, 245, 0.10)',
          color: 'var(--primary)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {hint}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.62rem] font-medium"
        style={{
          background: 'rgba(123, 92, 245, 0.10)',
          color: 'var(--primary)',
        }}
      >
        {t('notif_prefs.always_on')}
      </span>
    </div>
  )
}

// Row for opt-outable categories AND the quiet-hours master
// toggle. Label + hint + an iOS-style switch.
function OptionalRow({
  title,
  hint,
  on,
  onChange,
}: {
  title: string
  hint: string
  on: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={on}
      className="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-start transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {hint}
        </p>
      </div>
      <span
        aria-hidden
        className="relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{
          background: on ? 'var(--primary)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{
            left: on ? 'calc(100% - 22px)' : '2px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        />
      </span>
    </button>
  )
}

// Radio row for the 3-way digest selector.
function RadioRow({
  title,
  hint,
  selected,
  onSelect,
}: {
  title: string
  hint: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-start transition-colors"
      style={{
        borderColor: selected ? 'var(--primary)' : 'var(--border)',
        background: selected ? 'rgba(123, 92, 245, 0.06)' : 'var(--surface-2)',
      }}
    >
      <span
        aria-hidden
        className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border"
        style={{
          borderColor: selected ? 'var(--primary)' : 'var(--border-strong)',
          background: selected ? 'var(--primary)' : 'transparent',
        }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {hint}
        </p>
      </div>
    </button>
  )
}

// HH:MM time picker. Uses <input type="time"> for the native OS
// picker on mobile; falls back to a usable text-ish input on
// older browsers.
function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[0.65rem] font-semibold tracking-[0.16em] uppercase"
        style={{ color: 'var(--text-soft)' }}
      >
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'var(--card)',
          color: 'var(--text)',
        }}
      />
    </label>
  )
}

// Loading shell — same visual rhythm as the rest of /settings.
function Skeleton() {
  return (
    <div className="space-y-4">
      <div
        className="h-5 w-40 rounded-md animate-pulse"
        style={{ background: 'var(--card-soft)' }}
      />
      <div
        className="h-3 w-3/4 rounded-md animate-pulse"
        style={{ background: 'var(--card-soft)' }}
      />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-14 rounded-2xl animate-pulse"
            style={{ background: 'var(--card-soft)' }}
          />
        ))}
      </div>
    </div>
  )
}
