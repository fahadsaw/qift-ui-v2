'use client'

// Admin Workers Operations API client — Phase 7 canary console.
//
// Wires the four real /admin/workers/* endpoints into a typed,
// reusable surface for the System tab's Workers section.
//
// CRITICAL DISCIPLINE
//
// This client wires ONLY endpoints that exist in production
// today. Each function below maps 1:1 to a backend route
// verified in apps/api/src/admin/admin-workers.controller.ts:
//
//   GET  /admin/workers/status                        → fetchWorkersStatus
//   POST /admin/workers/run-reminders                 → runReminders
//   POST /admin/workers/run-digest                    → runDigest
//   POST /admin/workers/cleanup-stale-reminder-claims → cleanupStaleClaims
//
// If a future button needs a backend route that doesn't exist
// yet, do NOT add a stub here. Either the route lands first or
// the UI labels it as "Not implemented".
//
// All routes require admin auth — the AdminGuard server-side is
// authoritative. The 401/403 path is surfaced via the
// AdminWorkersApiError so the UI can show a calm "your session
// expired" message instead of a generic failure.
//
// Wire-shape note: the response types mirror the backend
// verbatim. ReminderRunResult / DigestRunResult /
// StaleClaimCleanupResult / WorkerStatusSnapshot all live as
// pure type aliases here — when the backend adds a field, add
// it here (and to the UI's stat-block renderer).

import { API_BASE } from './apiBase'

// ── Error shape ─────────────────────────────────────────────────

export class AdminWorkersApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AdminWorkersApiError'
  }
}

async function authedFetch(
  accessToken: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!accessToken) {
    throw new AdminWorkersApiError('not_authenticated', 401)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    // 401/403 are the two we expect operationally (session expired
    // OR the admin role was revoked mid-session). 4xx/5xx beyond
    // those are surfaced verbatim so the UI can show a structured
    // failure card.
    throw new AdminWorkersApiError(`request_failed_${res.status}`, res.status)
  }
  return res
}

// ── Status snapshot ─────────────────────────────────────────────

// Mirrors WorkerStatusSnapshot from
// apps/api/src/notifications/occasion-reminder-worker.service.ts
//
// Read-only. Safe to poll. Aggregate counts only — no user ids,
// no notification bodies, no occasion content.
export type WorkerStatusSnapshot = {
  asOf: string
  flags: {
    occasionReminderFiringEnabled: boolean
    digestWorkerEnabled: boolean
    pushDeliveryEnabled: boolean
    emailDeliveryEnabled: boolean
    smsDeliveryEnabled: boolean
    reminderDryRun: boolean
    reminderAllowlist: readonly string[]
    reminderUserSamplePercent: number
  }
  queue: {
    staleClaims: number
    pendingDigest: number
  }
  last24h: {
    firingsByStatus: Record<string, number>
  }
  mostRecentFiring: {
    firedAt: string
    status: string
  } | null
}

export async function fetchWorkersStatus(
  accessToken: string | null,
): Promise<WorkerStatusSnapshot> {
  const res = await authedFetch(accessToken, '/admin/workers/status')
  return (await res.json()) as WorkerStatusSnapshot
}

// ── Reminder worker run ─────────────────────────────────────────

// Mirrors ReminderRunResult from
// apps/api/src/notifications/occasion-reminder-worker.service.ts
export type ReminderRunResult = {
  ran: boolean
  skippedReason?: 'feature_flag_off' | 'manual_skip'
  considered: number
  inWindow: number
  fired: number
  digested: number
  suppressed: number
  errors: number
  filteredAllowlist: number
  filteredSamplePercent: number
  filteredDryRun: number
  staleClaims: number
}

export async function runReminders(
  accessToken: string | null,
  opts: { dryRun: boolean },
): Promise<ReminderRunResult> {
  // The backend treats the query value as a literal string —
  // 'true' opts into dry-run; anything else (including unset) is
  // real-run. Mirror that exactly so a typo here can't accidentally
  // flip a dry-run intent into a real fire.
  const qs = opts.dryRun ? '?dryRun=true' : ''
  const res = await authedFetch(
    accessToken,
    `/admin/workers/run-reminders${qs}`,
    { method: 'POST' },
  )
  return (await res.json()) as ReminderRunResult
}

// ── Digest worker run ───────────────────────────────────────────

// Mirrors DigestRunResult from
// apps/api/src/notifications/digest-worker.service.ts
export type DigestRunResult = {
  ran: boolean
  skippedReason?: 'feature_flag_off'
  usersConsidered: number
  usersDigested: number
  rowsConsumed: number
  errors: number
  filteredCadence: number
  filteredDryRun: number
}

export type DigestCadenceOverride = 'force_daily' | 'force_weekly' | null

export async function runDigest(
  accessToken: string | null,
  opts: { dryRun: boolean; cadenceOverride: DigestCadenceOverride },
): Promise<DigestRunResult> {
  const params = new URLSearchParams()
  if (opts.dryRun) params.set('dryRun', 'true')
  if (opts.cadenceOverride) params.set('cadence', opts.cadenceOverride)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await authedFetch(accessToken, `/admin/workers/run-digest${qs}`, {
    method: 'POST',
  })
  return (await res.json()) as DigestRunResult
}

// ── Stale-claim cleanup ─────────────────────────────────────────

// Mirrors StaleClaimCleanupResult from
// apps/api/src/notifications/occasion-reminder-worker.service.ts
export type StaleClaimCleanupResult = {
  dryRun: boolean
  forceClear: boolean
  staleHoursOld: number
  considered: number
  recovered: number
  cleared: number
  errors: number
  sampleIds: string[]
}

// Backend defaults: dryRun=true (safe), forceClear=false (safe).
// The client mirrors that posture — both opt-ins must be passed
// explicitly. A caller that forgets `dryRun: false` gets a
// preview, not a write.
export async function cleanupStaleClaims(
  accessToken: string | null,
  opts: {
    dryRun: boolean
    forceClear: boolean
    staleHoursOld?: number
  },
): Promise<StaleClaimCleanupResult> {
  const params = new URLSearchParams()
  // Only set dryRun on the URL when we want to opt OUT. Default
  // is true server-side; we don't want a stray dryRun=true on the
  // URL to look like a stronger statement than it is.
  if (!opts.dryRun) params.set('dryRun', 'false')
  if (opts.forceClear) params.set('forceClear', 'true')
  if (opts.staleHoursOld !== undefined) {
    params.set('staleHoursOld', String(opts.staleHoursOld))
  }
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await authedFetch(
    accessToken,
    `/admin/workers/cleanup-stale-reminder-claims${qs}`,
    { method: 'POST' },
  )
  return (await res.json()) as StaleClaimCleanupResult
}

// ── Discriminated last-action result ────────────────────────────

// The Workers section keeps a single "most recent action result"
// in state so the operator can see what the last button did
// without scrolling. The discriminator lets the renderer pick
// the right field set per action without losing type safety.
export type LastActionResult =
  | { kind: 'reminders'; dryRun: boolean; result: ReminderRunResult }
  | {
      kind: 'digest'
      dryRun: boolean
      cadenceOverride: DigestCadenceOverride
      result: DigestRunResult
    }
  | {
      kind: 'cleanup'
      result: StaleClaimCleanupResult
    }
