// Authed fetch wrapper for admin (and future merchant) surfaces.
//
// PROBLEM
// -------
// Admin sections previously used raw `fetch` with a bearer token and
// resolved a 401 by setting state to `[]`. The page then rendered an
// empty-data UI that is visually indistinguishable from "the database
// genuinely has no rows" — see FUTURE_UX_HARDENING.md § 1 in the
// platform repo for the full incident write-up. An operator who hits
// an expired admin JWT can spend significant time confirming "did I
// lose real data?" before realising the only issue is auth.
//
// THIS WRAPPER
// ------------
// `adminFetch()` returns a discriminated union instead of a thrown
// error. Call sites switch on the `kind` field and render the
// appropriate UI — a distinct "session expired" state for `expired`,
// vs the existing empty state for actual empty data. The wrapper
// also injects the `Authorization` header so call sites stop having
// to remember it.
//
// SCOPE
// -----
// Read-only for v1.0. The wrapper supports GET semantics + arbitrary
// body for write methods, but the 401-handling pattern is the
// load-bearing piece. Per the operator's "UI/mock only" constraint
// for this session, no new financial side effects flow through here.

import { API_BASE } from './apiBase'

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'expired' } // 401 — token rejected
  | { kind: 'forbidden' } // 403 — token valid but role/permission missing
  | { kind: 'network' } // fetch threw (offline, CORS, etc.)
  | { kind: 'server'; status: number } // 4xx other than 401/403, or 5xx

export type AdminFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  // Override the default JSON content-type if the body is something
  // else (FormData, etc.). Most admin call sites won't touch this.
  headers?: Record<string, string>
  // Abort signal for callers that want cancellation. The wrapper
  // does not introduce its own AbortController — the caller owns
  // cancellation lifecycle.
  signal?: AbortSignal
}

// Path can be either a full URL (rare — pass-through to fetch) or a
// path relative to API_BASE (the common case for admin endpoints).
function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Authed fetch for admin endpoints. Returns a discriminated union so
 * call sites can distinguish "session expired" from "no data" from
 * "server error" without inspecting raw status codes.
 *
 * Usage:
 *   const result = await adminFetch<AdminUser[]>('/admin/users', token)
 *   if (result.kind === 'expired') {
 *     // surface SessionExpiredBanner — do NOT setState([])
 *     onSessionExpired()
 *     return
 *   }
 *   if (result.kind === 'ok') {
 *     setUsers(result.data)
 *   }
 *
 * The wrapper never throws on auth/server errors; only network
 * failures (fetch itself rejecting) produce `kind: 'network'`. Call
 * sites can switch exhaustively without try/catch.
 */
export async function adminFetch<T>(
  path: string,
  accessToken: string | null,
  options: AdminFetchOptions = {},
): Promise<ApiResult<T>> {
  // No token = treat as expired up front. Saves a guaranteed-401
  // round-trip and keeps the call-site shape identical (no extra
  // "token missing" branch).
  if (!accessToken) {
    return { kind: 'expired' }
  }

  const { method = 'GET', body, headers = {}, signal } = options

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...headers,
  }

  let requestBody: BodyInit | undefined
  if (body !== undefined && body !== null) {
    // If the caller already supplied a Content-Type header (e.g.
    // FormData uploads), assume they know what they're doing and
    // pass the body through untouched. Otherwise default to JSON.
    if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
      requestHeaders['Content-Type'] = 'application/json'
      requestBody = JSON.stringify(body)
    } else {
      requestBody = body as BodyInit
    }
  }

  let res: Response
  try {
    res = await fetch(resolveUrl(path), {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    })
  } catch {
    // fetch rejects on real network failures (offline, DNS, CORS
    // preflight failure). Abort errors also land here; callers
    // that pass a signal should check signal.aborted themselves.
    return { kind: 'network' }
  }

  // 401 is the load-bearing case: the bearer token was rejected
  // (expired, revoked, or invalid). Caller surfaces re-login UI.
  if (res.status === 401) {
    return { kind: 'expired' }
  }

  // 403 means the token is valid but the role/permission is wrong.
  // Distinct UX from 401 — re-login won't help; the operator needs
  // a role grant. Call sites can render this differently or share
  // the SessionExpiredBanner with a 'forbidden' variant.
  if (res.status === 403) {
    return { kind: 'forbidden' }
  }

  if (!res.ok) {
    return { kind: 'server', status: res.status }
  }

  // 204 No Content is a valid OK response with no body — return
  // a typed `undefined` cast to T rather than calling .json() on
  // an empty body (which would throw).
  if (res.status === 204) {
    return { kind: 'ok', data: undefined as T }
  }

  let data: T
  try {
    data = (await res.json()) as T
  } catch {
    // Server returned 200 with malformed JSON — treat as server
    // error so the UI doesn't render undefined as if it were
    // legitimate empty data.
    return { kind: 'server', status: res.status }
  }

  return { kind: 'ok', data }
}
