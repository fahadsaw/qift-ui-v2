'use client'

// Closed Beta Gate admin API client.
//
// Wires the /admin/beta/* endpoints (BetaAccessController) into a
// typed surface for the admin Beta section. Authorisation is
// enforced server-side: every route is gated by
// JwtAuthGuard + AdminGuard + OpsRoleGuard(@RequireOpsPermission
// ('beta.manage')). This client is a convenience layer, NOT the
// authorisation boundary — a 403 here means the operator's ops
// role doesn't grant beta.manage.
//
// Route map (1:1 with apps/api/src/beta-access/beta-access.controller.ts):
//   GET    /admin/beta/status              → fetchBetaStatus
//   GET    /admin/beta/codes               → listBetaCodes
//   POST   /admin/beta/codes               → createBetaCode
//   PATCH  /admin/beta/codes/:id/disable   → setBetaCodeDisabled(id,true)
//   PATCH  /admin/beta/codes/:id/enable    → setBetaCodeDisabled(id,false)
//   GET    /admin/beta/allowlist           → listBetaAllowlist
//   POST   /admin/beta/allowlist           → addBetaAllowlistEntry
//   DELETE /admin/beta/allowlist/:id       → removeBetaAllowlistEntry
//
// Wire shapes mirror the Prisma rows the backend returns verbatim
// (Date columns arrive as ISO strings over JSON).

import { API_BASE } from './apiBase'

// ── Error shape ─────────────────────────────────────────────────

// Carries both the HTTP status and the backend's typed `code`
// (e.g. 'beta_code_taken', 'beta_allowlist_duplicate') so the UI
// can map failures to specific, translated messages instead of a
// generic toast.
export class BetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'BetaApiError'
  }
}

async function authedFetch(
  accessToken: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!accessToken) {
    throw new BetaApiError('not_authenticated', 401)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    // Backend errors carry a structured { statusCode, code, message }
    // envelope on 4xx (BadRequest / Conflict / NotFound). Parse it so
    // the UI can branch on `code`. A non-JSON body (e.g. a proxy 502)
    // falls through to a status-only error.
    const body = (await res.json().catch(() => null)) as {
      code?: string
      message?: string
    } | null
    throw new BetaApiError(
      body?.message ?? `request_failed_${res.status}`,
      res.status,
      body?.code ?? null,
    )
  }
  return res
}

// ── Wire types ──────────────────────────────────────────────────

// The three allowlist kinds the backend accepts. Mirrors
// BETA_ALLOWLIST_KINDS in apps/api/src/beta-access/beta-code.ts.
export const BETA_ALLOWLIST_KINDS = ['email', 'email_domain', 'phone'] as const
export type BetaAllowlistKind = (typeof BETA_ALLOWLIST_KINDS)[number]

export type BetaStatus = {
  // Whether BETA_GATE_ENABLED is currently truthy server-side. When
  // false, registration is fully open and codes/allowlist are inert
  // (curated for when the gate flips on).
  gateEnabled: boolean
}

export type BetaInviteCode = {
  id: string
  code: string
  label: string | null
  // null = unlimited uses.
  maxUses: number | null
  usedCount: number
  // ISO strings or null (never expires / not disabled).
  expiresAt: string | null
  disabledAt: string | null
  createdBy: string
  createdAt: string
}

export type BetaAllowlistEntry = {
  id: string
  kind: string
  value: string
  label: string | null
  createdBy: string
  createdAt: string
}

// ── Status ──────────────────────────────────────────────────────

export async function fetchBetaStatus(
  accessToken: string | null,
): Promise<BetaStatus> {
  const res = await authedFetch(accessToken, '/admin/beta/status')
  return (await res.json()) as BetaStatus
}

// ── Invite codes ────────────────────────────────────────────────

export async function listBetaCodes(
  accessToken: string | null,
): Promise<BetaInviteCode[]> {
  const res = await authedFetch(accessToken, '/admin/beta/codes')
  return (await res.json()) as BetaInviteCode[]
}

// Omit `code` to let the backend auto-generate (QIFT-XXXX-XXXX).
// maxUses null/undefined = unlimited; expiresAt null/undefined =
// never expires.
export async function createBetaCode(
  accessToken: string | null,
  input: {
    code?: string
    label?: string
    maxUses?: number | null
    expiresAt?: string | null
  },
): Promise<BetaInviteCode> {
  const res = await authedFetch(accessToken, '/admin/beta/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await res.json()) as BetaInviteCode
}

export async function setBetaCodeDisabled(
  accessToken: string | null,
  id: string,
  disabled: boolean,
): Promise<BetaInviteCode> {
  const action = disabled ? 'disable' : 'enable'
  const res = await authedFetch(
    accessToken,
    `/admin/beta/codes/${encodeURIComponent(id)}/${action}`,
    { method: 'PATCH' },
  )
  return (await res.json()) as BetaInviteCode
}

// ── Allowlist ───────────────────────────────────────────────────

export async function listBetaAllowlist(
  accessToken: string | null,
): Promise<BetaAllowlistEntry[]> {
  const res = await authedFetch(accessToken, '/admin/beta/allowlist')
  return (await res.json()) as BetaAllowlistEntry[]
}

// `value` is normalised server-side (lowercased email/domain,
// E.164 phone) before insert — send it raw.
export async function addBetaAllowlistEntry(
  accessToken: string | null,
  input: { kind: BetaAllowlistKind; value: string; label?: string },
): Promise<BetaAllowlistEntry> {
  const res = await authedFetch(accessToken, '/admin/beta/allowlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await res.json()) as BetaAllowlistEntry
}

export async function removeBetaAllowlistEntry(
  accessToken: string | null,
  id: string,
): Promise<void> {
  await authedFetch(
    accessToken,
    `/admin/beta/allowlist/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}
