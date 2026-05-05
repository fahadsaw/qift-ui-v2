// Web Push client helpers. Wraps the browser's Notification + Push APIs
// behind one async surface that the settings UI can call without
// learning the spec.

import { API_BASE } from './apiBase'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

// What the settings UI shows: each state maps to a clear translated
// label + a single CTA button.
export type PushState =
  | 'unsupported' // no Notification/PushManager API in this browser
  | 'no-vapid' // server hasn't published a public key yet
  | 'denied' // user clicked Block
  | 'enabled' // we've got a valid PushSubscription registered
  | 'disabled' // browser supports it but we haven't asked yet

export type PushStatus = {
  state: PushState
  endpoint: string | null
}

// Browser-feature detection. Three things have to be true:
//   1. Service workers are available (every modern browser since ~2018,
//      but iOS WKWebView still misses it in some embeds).
//   2. PushManager exists.
//   3. Notification API exists.
// We never assume the user's permission grant — that's a separate check.
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Resolves the current state without asking for permission. Used to
// render the settings card on first paint.
export async function readPushStatus(token: string | null): Promise<PushStatus> {
  if (!isPushSupported()) return { state: 'unsupported', endpoint: null }
  if (!VAPID_PUBLIC) return { state: 'no-vapid', endpoint: null }
  if (Notification.permission === 'denied') {
    return { state: 'denied', endpoint: null }
  }
  // Look for an existing subscription on this browser. We only consider
  // the local one — the server may still have stale rows from another
  // device, but those don't affect *this* browser's UI.
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub && token) {
      return { state: 'enabled', endpoint: sub.endpoint }
    }
  } catch {
    // ignore — fall through to disabled
  }
  return { state: 'disabled', endpoint: null }
}

// Subscribe + register on the backend. Returns the new endpoint on
// success. Handles the full sequence:
//   1. Ensure SW is registered.
//   2. Ask for notification permission (browser prompt).
//   3. Subscribe via PushManager with the VAPID public key.
//   4. POST the subscription to /push/subscribe.
//
// Any step throwing rejects with a tagged Error so the UI can render a
// friendly message per failure mode.
export async function subscribePush(token: string): Promise<string> {
  if (!isPushSupported()) throw tagged('unsupported', 'Push not supported')
  if (!VAPID_PUBLIC) throw tagged('no-vapid', 'Server key missing')

  // Permission first — if the user blocks here, no point registering.
  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw tagged('denied', 'Permission denied')
  if (permission !== 'granted') throw tagged('denied', 'Permission not granted')

  // Register the service worker (idempotent — repeat calls return the
  // same registration).
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  // `getSubscription` returns the existing one if the user previously
  // subscribed and we didn't unsubscribe; we reuse it instead of
  // forcing a fresh credential exchange with the push service.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }

  // Persist on the backend. If this fails we roll back the local
  // subscription so the user isn't stuck with a half-registered state.
  const json = sub.toJSON()
  try {
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    })
    if (!res.ok) throw new Error('subscribe_post_failed')
  } catch (err) {
    await sub.unsubscribe().catch(() => undefined)
    throw tagged('server', (err as Error).message)
  }
  return sub.endpoint
}

// Unsubscribe from both browser + backend. Best-effort: failure on
// either side doesn't block the other. Returns true if the local
// browser subscription is gone afterwards.
export async function unsubscribePush(
  token: string,
  endpoint: string | null,
): Promise<boolean> {
  if (!isPushSupported()) return true
  let removed = true
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      removed = await sub.unsubscribe()
    }
  } catch {
    removed = false
  }
  if (endpoint) {
    try {
      await fetch(`${API_BASE}/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      })
    } catch {
      // backend cleanup is best-effort; the row will also get pruned
      // by the auto-cleanup on the next push attempt.
    }
  }
  return removed
}

// Decode the base64 VAPID public key into the byte array PushManager.
// subscribe expects. Standard helper from the Web Push spec.
//
// Backed by an explicit ArrayBuffer (not the default ArrayBufferLike)
// because PushSubscriptionOptionsInit.applicationServerKey is typed as
// `BufferSource & ArrayBufferView<ArrayBuffer>` in newer DOM lib defs.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function tagged(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}
