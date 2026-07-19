// Corporate claim-flow API client (/claim/* on the backend).
//
// BACKEND CONTRACT (apps/api src/corporate/claim.* — CF PR 5):
//   GET  /claim/:token            → { ok, channel, channelHint }
//     The GENERIC teaser. By design (F1 rule) it carries NO
//     recipient name, NO company, NO gift — render nothing
//     identifying before OTP.
//   POST /claim/:token/send-otp   → { ok, channelHint }
//     OTP goes to the channel BOUND server-side; we never send a
//     target from the client.
//   POST /claim/:token/verify-otp { code }
//     → { ok, sessionToken, claim } — the FIRST identifying payload.
//   POST /claim/:token/reveal     { sessionToken } → { ok, claim }
//   POST /claim/:token/not-me     { sessionToken } → { ok }
//   POST /claim/:token/decline    { sessionToken } → { ok }
//   POST /claim/:token/address    { sessionToken, ...address }
//     → { ok, status: 'claimed' } — IRREVOCABLE once it succeeds.
//
// Error contract: every dead token (missing / expired / revoked /
// already finalized) is the IDENTICAL 404 claim_not_found —
// anti-enumeration; the UI must not pretend to know which case it
// hit. Stable 400/401 codes: invalid_code, expired_code, otp_locked,
// otp_rate_limited, sms_unavailable, email_unavailable,
// claim_session_invalid, address_phone_invalid,
// address_fields_required, address_out_of_coverage,
// claim_already_finalized.

import { API_BASE } from './apiBase'

export type ClaimChannel = 'phone' | 'email'

export type ClaimTeaser = {
  ok: boolean
  channel: ClaimChannel
  channelHint: string
}

export type ClaimGiftSnapshot = {
  productId?: string
  productName?: string
  price?: number
  imageUrl?: string | null
  category?: string
  storeId?: string
  storeName?: string
}

export type ClaimReveal = {
  recipientName: string
  orgDisplayName: string
  message: string | null
  gift: ClaimGiftSnapshot
  expiresAt: string
  // Canonical recipient-gift reference (QG-XXXX-XXXX) — the handle the
  // recipient quotes to support. Not a secret; the token is.
  giftReference: string
}

export type ClaimAddressInput = {
  fullName?: string
  phone: string
  country: string
  region?: string
  city: string
  district?: string
  line1: string
  notes?: string
}

export class ClaimApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function claimFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/claim/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    })
  } catch {
    throw new ClaimApiError(0, 'network_error')
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON body (proxy error page) — fall through to status code.
  }
  if (!res.ok) {
    const b = (body ?? {}) as { code?: string; message?: string }
    // Nest string-exceptions arrive as { message: '<code>' }; object
    // exceptions as { code: '<code>' }.
    throw new ClaimApiError(res.status, b.code || b.message || 'unknown_error')
  }
  return body as T
}

export function fetchClaimTeaser(token: string): Promise<ClaimTeaser> {
  return claimFetch<ClaimTeaser>(encodeURIComponent(token))
}

export function sendClaimOtp(
  token: string,
): Promise<{ ok: boolean; channelHint: string }> {
  return claimFetch(`${encodeURIComponent(token)}/send-otp`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function verifyClaimOtp(
  token: string,
  code: string,
): Promise<{ ok: boolean; sessionToken: string; claim: ClaimReveal }> {
  return claimFetch(`${encodeURIComponent(token)}/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function revealClaim(
  token: string,
  sessionToken: string,
): Promise<{ ok: boolean; claim: ClaimReveal }> {
  return claimFetch(`${encodeURIComponent(token)}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  })
}

export function notMeClaim(
  token: string,
  sessionToken: string,
): Promise<{ ok: boolean }> {
  return claimFetch(`${encodeURIComponent(token)}/not-me`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  })
}

export function declineClaim(
  token: string,
  sessionToken: string,
): Promise<{ ok: boolean }> {
  return claimFetch(`${encodeURIComponent(token)}/decline`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  })
}

export function submitClaimAddress(
  token: string,
  sessionToken: string,
  address: ClaimAddressInput,
): Promise<{ ok: boolean; status: string }> {
  return claimFetch(`${encodeURIComponent(token)}/address`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken, ...address }),
  })
}

// The post-OTP session survives a page refresh via sessionStorage
// (tab-scoped, 30-minute server TTL anyway). Keyed by a token
// prefix so two claim links in two tabs don't clobber each other.
const SESSION_PREFIX = 'qift.claim.session.'

function sessionKey(token: string): string {
  return `${SESSION_PREFIX}${token.slice(0, 12)}`
}

export function storeClaimSession(token: string, sessionToken: string): void {
  try {
    sessionStorage.setItem(sessionKey(token), sessionToken)
  } catch {}
}

export function readClaimSession(token: string): string | null {
  try {
    return sessionStorage.getItem(sessionKey(token))
  } catch {
    return null
  }
}

export function clearClaimSession(token: string): void {
  try {
    sessionStorage.removeItem(sessionKey(token))
  } catch {}
}
