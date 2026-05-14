'use client'

// Notification preferences API client — Phase 7.1B.
//
// Consumes the orchestrator-aware backend (Phase 7.1):
//   GET    /notifications/categories
//     → catalogue of categories with priority + mandatory flag +
//       budget caps. Drives the per-category toggle list.
//
//   GET    /users/me/notification-preferences
//     → the viewer's preferences row (or all-defaults shape when
//       no row exists yet). Lazy-create on the backend.
//
//   PATCH  /users/me/notification-preferences
//     → partial update. Validates quiet-hours pair, HH:MM shape,
//       IANA timezone, digestFrequency. Mandatory categories are
//       silently stripped from any opt-out dict (the backend
//       refuses to silence them).
//
// The wire shapes mirror the backend exactly. Anything the
// frontend needs to render (priority / mandatory / caps for the
// per-category UI) arrives on the categories endpoint so the UI
// never duplicates the backend's truth.

import { getAuth } from './auth'
import { API_BASE } from './apiBase'

// ── Types (mirror backend NotificationCategory + descriptors) ──

export type NotificationCategoryId =
  | 'security'
  | 'otp'
  | 'legal'
  | 'gift_update'
  | 'address_confirm'
  | 'merchant_order'
  | 'occasion_reminder'
  | 'social'
  | 'system'

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low'

export type NotificationCategoryView = {
  id: NotificationCategoryId
  priority: NotificationPriority
  mandatory: boolean
  // null = no cap (mandatory categories always have null caps).
  dailyCap: number | null
  weeklyCap: number | null
}

export type NotificationPreferences = {
  // "HH:MM" 24-hour. null on both ends = no quiet hours.
  quietHoursStart: string | null
  quietHoursEnd: string | null
  // IANA timezone (default "Asia/Riyadh").
  quietHoursTimezone: string
  // Sparse dict: { [categoryId]: true } means opted OUT. Missing
  // key = opted in. Mandatory categories never appear here (the
  // backend strips them on write).
  categoryOptOuts: Record<string, boolean>
  // Master switch. false = real-time delivery regardless of
  // digest cadence. Quiet hours still apply.
  digestEnabled: boolean
  digestFrequency: 'daily' | 'weekly'
}

export type UpdateNotificationPreferencesInput = Partial<{
  quietHoursStart: string | null
  quietHoursEnd: string | null
  quietHoursTimezone: string
  categoryOptOuts: Record<string, boolean>
  digestEnabled: boolean
  digestFrequency: 'daily' | 'weekly'
}>

// ── Internal: authed fetch ──────────────────────────────────────

export class NotificationsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'NotificationsApiError'
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken } = getAuth()
  if (!accessToken) {
    throw new NotificationsApiError('not_authenticated', 401)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    throw new NotificationsApiError(`request_failed_${res.status}`, res.status)
  }
  return res
}

// ── Public API ──────────────────────────────────────────────────

export async function fetchNotificationCategories(): Promise<
  NotificationCategoryView[]
> {
  const res = await authedFetch('/notifications/categories')
  return (await res.json()) as NotificationCategoryView[]
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await authedFetch('/users/me/notification-preferences')
  return (await res.json()) as NotificationPreferences
}

export async function updateNotificationPreferences(
  patch: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const res = await authedFetch('/users/me/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return (await res.json()) as NotificationPreferences
}

// ── Derived helpers ────────────────────────────────────────────

// The three-way digest mode the UI exposes. Maps onto the two
// backend booleans cleanly:
//   real_time → digestEnabled: false (frequency irrelevant)
//   daily     → digestEnabled: true,  digestFrequency: 'daily'
//   weekly    → digestEnabled: true,  digestFrequency: 'weekly'
export type DigestMode = 'real_time' | 'daily' | 'weekly'

export function deriveDigestMode(prefs: NotificationPreferences): DigestMode {
  if (!prefs.digestEnabled) return 'real_time'
  return prefs.digestFrequency === 'weekly' ? 'weekly' : 'daily'
}

export function patchForDigestMode(
  mode: DigestMode,
): UpdateNotificationPreferencesInput {
  if (mode === 'real_time') return { digestEnabled: false }
  return { digestEnabled: true, digestFrequency: mode }
}
