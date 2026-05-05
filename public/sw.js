// Qift web-push service worker.
//
// Handles three things:
//   1. Receive a push event from the server, render an OS notification.
//   2. On click, focus an existing Qift tab if one exists; otherwise open
//      a new one routed to `notification.url` (validated against an
//      allow-list — never an external URL).
//   3. Broadcast "qift:push-received" to any open clients so the in-app
//      bell can refresh its unread count immediately, without waiting
//      for the next 30s poll.
//
// Hand-written, no Workbox / build step. Lives at /sw.js so it's served
// from the origin root and can intercept the entire app scope.

self.addEventListener('install', (event) => {
  // skipWaiting → take control on first install instead of waiting for
  // the user to close every Qift tab.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Same allow-list as the backend's PushService.sanitisePayload. Defence
// in depth — if a payload somehow slips through with a sketchy URL we
// still refuse to route the click off-origin.
const SAFE_URL_PREFIXES = ['/notifications', '/gifts', '/store-dashboard']

function safePath(rawUrl) {
  if (typeof rawUrl !== 'string') return '/notifications'
  if (!SAFE_URL_PREFIXES.some((p) => rawUrl.startsWith(p))) {
    return '/notifications'
  }
  return rawUrl
}

self.addEventListener('push', (event) => {
  // Server payload shape: { title, body, url, type }. We try to parse
  // JSON first; if the server ever sends raw text we fall back to a
  // generic title so the user still sees something.
  let payload = { title: 'Qift', body: '', url: '/notifications', type: '' }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      payload.body = event.data.text()
    }
  }

  const title = String(payload.title || 'Qift').slice(0, 120)
  const body = payload.body ? String(payload.body).slice(0, 280) : ''
  const url = safePath(payload.url)
  const type = typeof payload.type === 'string' ? payload.type : ''

  // `tag` collapses repeat notifications of the same kind so the OS
  // tray doesn't pile up identical pings (e.g. a noisy "shipped" event
  // firing twice). renotify=true still vibrates / sounds on repeat.
  const tag = type ? `qift:${type}` : 'qift'

  const showPromise = self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    data: { url, type },
    badge: '/icon.png',
    icon: '/icon.png',
    dir: 'rtl',
    lang: 'ar',
  })

  // Tell every open tab a push just landed so the bell can refresh.
  // Wrapped in a separate promise so a slow tab can't delay the toast.
  const broadcastPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      for (const c of clients) {
        c.postMessage({ type: 'qift:push-received', url, payloadType: type })
      }
    })
    .catch(() => undefined)

  event.waitUntil(Promise.all([showPromise, broadcastPromise]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = safePath(event.notification.data && event.notification.data.url)

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Prefer focusing an existing Qift tab and routing it to the
      // target — much less jarring than spawning a new one. We pick any
      // same-origin client; the navigate() handles deep linking.
      for (const c of all) {
        try {
          if (new URL(c.url).origin === self.location.origin) {
            await c.focus()
            // Some browsers (Safari) don't expose `navigate()` on
            // WindowClient; fall back to postMessage so the SPA can
            // route via the auth-aware router.
            if (typeof c.navigate === 'function') {
              await c.navigate(url)
            } else {
              c.postMessage({ type: 'qift:navigate', url })
            }
            return
          }
        } catch {
          // ignore — try the next client
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
