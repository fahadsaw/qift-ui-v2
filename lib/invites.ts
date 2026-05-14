'use client'

// Invitation API client — manual-share MVP.
//
// Maps 1:1 to the backend at apps/api/src/invites/invites.controller.ts:
//
//   POST  /invites                — createInvite (auth required)
//   GET   /invites/me             — listMyInvites (auth required)
//   POST  /invites/:id/revoke     — revokeInvite (auth required)
//   GET   /invites/by-token/:token — fetchInviteByToken (PUBLIC)
//
// The public-resolve endpoint is the only one without auth — used
// by the /i/<token> landing page when a recipient lands on it
// unauthenticated. The endpoint returns the MINIMUM payload
// (isValid + expiresAt only); no sender info, no channel hint, no
// platform.
//
// PRIVACY (load-bearing):
//   - The client NEVER sends the raw channel value (phone /
//     email / social handle) in the create body. The backend
//     enforces this too — the Invite row doesn't even have a
//     column for it. The sender will fill the recipient in
//     manually when they share the link.
//   - The list/revoke surfaces are scoped to the authed viewer.
//   - The public resolver returns no PII.

import { API_BASE } from './apiBase'

// ── Types (mirror backend) ─────────────────────────────────────

export type InviteChannel = 'phone' | 'email' | 'social' | 'unknown'
export type InviteSocialPlatform =
  | 'snapchat'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'telegram'

export type CreateInviteResult = {
  id: string
  token: string
  inviteUrl: string
  channel: InviteChannel
  platform: InviteSocialPlatform | null
  expiresAt: string
  suggestedMessage: { ar: string; en: string }
  // Safe URL to open the relevant social platform's app/home
  // when channel='social'. Null otherwise. The URL never
  // includes a per-recipient handle — Qift never knows it.
  platformOpenUrl: string | null
}

export type MyInviteView = {
  id: string
  token: string
  channel: InviteChannel
  platform: InviteSocialPlatform | null
  status: 'active' | 'expired' | 'revoked' | 'consumed'
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  inviteUrl: string
}

export type PublicInviteView = {
  isValid: boolean
  expiresAt: string | null
}

// ── Errors ─────────────────────────────────────────────────────

export class InvitesApiError extends Error {
  // Stable machine-readable code from the server, when present.
  // Today's known codes:
  //   - invite_daily_cap_reached (429)
  // Status is always set; code is set when the server returns a
  // structured payload.
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'InvitesApiError'
  }
}

async function authedFetch(
  accessToken: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!accessToken) throw new InvitesApiError('not_authenticated', 401)
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    let code: string | undefined
    try {
      const data = (await res.json()) as { code?: string; message?: string }
      code = data?.code
    } catch {
      /* opaque error body */
    }
    throw new InvitesApiError(`request_failed_${res.status}`, res.status, code)
  }
  return res
}

// ── Public API ─────────────────────────────────────────────────

// Mint a new invite. The MVP only persists the coarse channel +
// optional platform. The recipient's actual contact info (phone /
// email / handle) is NEVER sent over the wire and never stored.
export async function createInvite(
  accessToken: string | null,
  input: { channel: InviteChannel; platform?: InviteSocialPlatform | null },
): Promise<CreateInviteResult> {
  const res = await authedFetch(accessToken, '/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: input.channel,
      platform: input.platform ?? null,
    }),
  })
  return (await res.json()) as CreateInviteResult
}

export async function listMyInvites(
  accessToken: string | null,
): Promise<MyInviteView[]> {
  const res = await authedFetch(accessToken, '/invites/me')
  return (await res.json()) as MyInviteView[]
}

export async function revokeInvite(
  accessToken: string | null,
  id: string,
): Promise<{ id: string; status: string }> {
  const res = await authedFetch(accessToken, `/invites/${id}/revoke`, {
    method: 'POST',
  })
  return (await res.json()) as { id: string; status: string }
}

// PUBLIC — no auth. Used by the /i/[token] landing page.
// Returns the minimum payload — never reveals sender/channel/
// platform/consumer.
export async function fetchInviteByToken(
  token: string,
): Promise<PublicInviteView> {
  const res = await fetch(
    `${API_BASE}/invites/by-token/${encodeURIComponent(token)}`,
  )
  if (!res.ok) {
    // 4xx/5xx on the public route — treat as invalid invite.
    return { isValid: false, expiresAt: null }
  }
  return (await res.json()) as PublicInviteView
}
