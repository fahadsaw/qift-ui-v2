'use client'

// Occasions API client — Phase 6 (data layer + projection).
// Mirrors apps/api/src/occasions/* — wraps the JWT-protected
// REST surface so /occasions UI code never touches `fetch`
// directly.
//
// Wire shapes match the backend exactly:
//   - PublicOccasion       — owner-side full view
//   - RelationshipOccasion — visitor-side, year stripped on
//                            yearly rows, daysUntil + bucket
//                            pre-computed
//   - OccasionReminder     — reminder row (Phase 7 fires; this
//                            phase only configures)
//
// Phase 6.3 is the management UI. It consumes the owner-side
// endpoints (PublicOccasion shape); the relationship-side surfaces
// are reserved for the discovery/feed work in 6.4+.

import { getAuth } from './auth'
import { API_BASE } from './apiBase'

// ── Types (mirror apps/api/src/occasions/occasion-projection.ts)

export type OccasionCalendar = 'gregorian' | 'hijri'
export type OccasionRecurrence = 'once' | 'yearly'
export type OccasionVisibility = 'private' | 'followers' | 'mutual' | 'public'
export type ReminderChannel = 'digest' | 'real_time'

// Owner-side projection. Includes visibility (the owner needs to
// see + edit it) and the original year (their own data).
export type PublicOccasion = {
  id: string
  kind: string
  label: string | null
  calendar: OccasionCalendar
  year: number | null
  month: number
  day: number
  recurrence: OccasionRecurrence
  visibility: OccasionVisibility
  regionCode: string | null
  relatedUserId: string | null
  nextOccurrenceAt: string | null
}

// Visitor-side projection. Year stripped on yearly rows;
// visibility omitted. Used by the discovery feed work in 6.4+.
export type RelationshipOccasion = {
  id: string
  kind: string
  label: string | null
  calendar: OccasionCalendar
  year: number | null
  month: number
  day: number
  recurrence: OccasionRecurrence
  regionCode: string | null
  nextOccurrenceAt: string | null
  daysUntil: number | null
  bucket: 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'later' | null
  owner: {
    id: string
    qiftUsername: string
    fullName: string | null
    avatarUrl: string | null
  } | null
}

export type OccasionReminder = {
  id: string
  userId: string
  occasionId: string
  daysBefore: number
  channel: ReminderChannel
  enabled: boolean
}

// ── Input shapes for create / update / upsert-reminder

export type OccasionInput = {
  kind: string
  label?: string | null
  calendar: OccasionCalendar
  year?: number | null
  month: number
  day: number
  recurrence: OccasionRecurrence
  visibility?: OccasionVisibility
  regionCode?: string | null
  relatedUserId?: string | null
}

export type OccasionPatch = Partial<OccasionInput>

export type ReminderInput = {
  daysBefore: number
  channel?: ReminderChannel
  enabled?: boolean
}

// ── Internal: authed fetch with explicit error class

export class OccasionsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'OccasionsApiError'
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken } = getAuth()
  if (!accessToken) {
    throw new OccasionsApiError('not_authenticated', 401)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    throw new OccasionsApiError(`request_failed_${res.status}`, res.status)
  }
  return res
}

// ── Owner CRUD ──────────────────────────────────────────────────

// GET /occasions/me — owner's full list, newest-first.
export async function fetchMyOccasions(): Promise<PublicOccasion[]> {
  const res = await authedFetch('/occasions/me')
  return (await res.json()) as PublicOccasion[]
}

// GET /occasions/:id — single owned occasion (edit-modal hydrate).
export async function fetchOccasion(id: string): Promise<PublicOccasion> {
  const res = await authedFetch(`/occasions/${encodeURIComponent(id)}`)
  return (await res.json()) as PublicOccasion
}

// POST /occasions — create. Server seeds default reminder cadence
// for the kind; the UI can edit/disable per-row reminders after.
export async function createOccasion(
  input: OccasionInput,
): Promise<PublicOccasion> {
  const res = await authedFetch('/occasions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await res.json()) as PublicOccasion
}

// PATCH /occasions/:id — partial update.
export async function updateOccasion(
  id: string,
  patch: OccasionPatch,
): Promise<PublicOccasion> {
  const res = await authedFetch(`/occasions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return (await res.json()) as PublicOccasion
}

// DELETE /occasions/:id — soft-delete (sets deactivatedAt). The
// row stays in the DB so historic Gift.occasionId tags keep
// resolving; the /occasions list filters it out via the backend's
// `deactivatedAt is null` clause.
export async function deleteOccasion(id: string): Promise<{ ok: true }> {
  const res = await authedFetch(`/occasions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return (await res.json()) as { ok: true }
}

// ── Public / discovery surfaces (Phase 6.4) ─────────────────────

// GET /users/:userId/occasions — visitor-side view of another
// user's occasions. The backend's RelationshipOccasion projection
// strips year on yearly rows + omits the visibility tier + adds
// daysUntil + bucket. Block / private / unmet-visibility rows are
// filtered out server-side; this client just renders what arrives.
export async function fetchUserOccasions(
  userId: string,
): Promise<RelationshipOccasion[]> {
  const res = await authedFetch(
    `/users/${encodeURIComponent(userId)}/occasions`,
  )
  return (await res.json()) as RelationshipOccasion[]
}

// GET /occasions/upcoming?windowDays=&limit= — followed-user
// upcoming feed. Returns occasions belonging to users the viewer
// follows (status='accepted'), within the window, soonest-first.
// Same RelationshipOccasion projection — every row carries an
// `owner` summary so a feed card can render "name + handle".
export async function fetchUpcomingForFollowed(
  opts: { windowDays?: number; limit?: number } = {},
): Promise<RelationshipOccasion[]> {
  const qs = new URLSearchParams()
  if (typeof opts.windowDays === 'number')
    qs.set('windowDays', String(opts.windowDays))
  if (typeof opts.limit === 'number') qs.set('limit', String(opts.limit))
  const tail = qs.toString() ? `?${qs.toString()}` : ''
  const res = await authedFetch(`/occasions/upcoming${tail}`)
  return (await res.json()) as RelationshipOccasion[]
}

// ── Reminders ───────────────────────────────────────────────────

// GET /occasions/:id/reminders — list reminders for an occasion
// the viewer owns. Sorted daysBefore-desc by the backend (the
// farthest-out reminder first).
export async function fetchReminders(
  occasionId: string,
): Promise<OccasionReminder[]> {
  const res = await authedFetch(
    `/occasions/${encodeURIComponent(occasionId)}/reminders`,
  )
  return (await res.json()) as OccasionReminder[]
}

// POST /occasions/:id/reminders — upsert by (userId, occasionId,
// daysBefore). The frontend can call repeatedly without first
// checking existence; the backend collapses duplicates.
export async function upsertReminder(
  occasionId: string,
  input: ReminderInput,
): Promise<OccasionReminder> {
  const res = await authedFetch(
    `/occasions/${encodeURIComponent(occasionId)}/reminders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return (await res.json()) as OccasionReminder
}

// DELETE /occasions/:id/reminders/:reminderId — remove a single
// reminder row.
export async function deleteReminder(
  occasionId: string,
  reminderId: string,
): Promise<{ ok: true }> {
  const res = await authedFetch(
    `/occasions/${encodeURIComponent(occasionId)}/reminders/${encodeURIComponent(reminderId)}`,
    { method: 'DELETE' },
  )
  return (await res.json()) as { ok: true }
}

// ── Allow-listed kinds (mirrors apps/api/src/occasions/occasion-kinds.ts)

// Keeping the list duplicated client-side avoids an extra round-
// trip to seed the picker. The backend is authoritative on
// validation — a stale client list can only fail closed (the
// API will reject an unknown kind with 400).
export const OCCASION_KINDS = [
  // Personal recurring
  'birthday',
  'anniversary_relationship',
  'anniversary_work',
  'anniversary_other',
  // Religious / cultural
  'eid_al_fitr',
  'eid_al_adha',
  'ramadan',
  'hijri_new_year',
  'mawlid',
  'ashura',
  'mothers_day',
  'fathers_day',
  'saudi_national_day',
  'new_year',
  // Life milestones
  'graduation',
  'engagement',
  'wedding',
  'new_baby',
  'new_home',
  'new_job',
  'promotion',
  'retirement',
  // Achievement
  'degree',
  'exam_success',
  'milestone',
  // Acknowledgement
  'thank_you',
  'congratulations',
  'sympathy',
  'get_well',
  'just_because',
  // User-defined
  'custom',
] as const

export type OccasionKind = (typeof OCCASION_KINDS)[number]

// Grouped kinds for the picker UI. Order matters — most-common
// first. Acknowledgement kinds are intentionally NOT in the
// picker; they're attached retroactively to gifts via
// gift.occasionId (Phase 6.4 stitches that path).
export const KIND_GROUPS: ReadonlyArray<{
  id: string
  kinds: ReadonlyArray<OccasionKind>
}> = [
  {
    id: 'personal',
    kinds: [
      'birthday',
      'anniversary_relationship',
      'anniversary_work',
      'anniversary_other',
    ],
  },
  {
    id: 'milestone',
    kinds: [
      'graduation',
      'engagement',
      'wedding',
      'new_baby',
      'new_home',
      'new_job',
      'promotion',
      'retirement',
      'degree',
      'exam_success',
      'milestone',
    ],
  },
  {
    id: 'cultural',
    kinds: [
      'eid_al_fitr',
      'eid_al_adha',
      'ramadan',
      'hijri_new_year',
      'mawlid',
      'ashura',
      'mothers_day',
      'fathers_day',
      'saudi_national_day',
      'new_year',
    ],
  },
  {
    id: 'custom',
    kinds: ['custom'],
  },
] as const

// Default reminder cadence (cents-on-the-dollar of the backend's
// `defaultCadenceFor` — duplicated so the edit modal can show the
// suggested toggles pre-checked on a brand-new occasion).
export function defaultRemindersFor(kind: OccasionKind): number[] {
  if (
    kind === 'engagement' ||
    kind === 'wedding' ||
    kind === 'new_baby' ||
    kind === 'new_home' ||
    kind === 'new_job' ||
    kind === 'promotion' ||
    kind === 'graduation' ||
    kind === 'retirement'
  ) {
    return [14, 3, 0]
  }
  if (kind === 'degree' || kind === 'exam_success' || kind === 'milestone') {
    return [0]
  }
  if (
    kind === 'thank_you' ||
    kind === 'congratulations' ||
    kind === 'sympathy' ||
    kind === 'get_well' ||
    kind === 'just_because'
  ) {
    return []
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
    return [7]
  }
  return [7, 1]
}

// User-presented reminder-timing options. Wider than the default
// cadence so the user can tighten or relax per row. Architecturally
// the backend accepts any integer 0..60.
export const REMINDER_TIMING_OPTIONS = [0, 1, 3, 7, 14, 30] as const

// Visibility tier order, narrowest first. Used by the picker so
// "Just for me" reads as the default-deny anchor.
export const VISIBILITY_ORDER: ReadonlyArray<OccasionVisibility> = [
  'private',
  'mutual',
  'followers',
  'public',
]

// ── Calendar helpers ───────────────────────────────────────────

// Days in a Gregorian month for the picker's day dropdown. The
// Hijri calendar uses a fixed-29-day fallback in the picker — the
// backend's @umalqura/core knows the real month length per year
// and accepts day 30 → 29 silently via the day-overflow clamp.
// Mirroring the full Umm al-Qura table client-side would balloon
// the bundle for marginal benefit; we cap the picker at 30 for
// Hijri instead and let the server normalise.
export function daysInGregorianMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Max day count for the day-picker. For Gregorian we use the
// current year's length (leap-year aware). For Hijri we use 30 —
// the backend clamps day 30 → 29 in 29-day Hijri months silently.
export function maxPickerDay(
  calendar: OccasionCalendar,
  year: number | null,
  month: number,
): number {
  if (calendar === 'hijri') return 30
  return daysInGregorianMonth(year ?? new Date().getUTCFullYear(), month)
}
