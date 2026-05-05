'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { isPushSupported } from '@/lib/push'

// Silently registers the web-push service worker on every page load for
// authenticated viewers. Does NOT request notification permission — that
// stays an explicit opt-in via /settings or the in-app prompt banner.
//
// Why register at boot instead of only at subscribe time:
//   1. If the user previously subscribed (granted permission, has a row
//      in PushSubscription), push events will fire as long as a service
//      worker is alive. Without an early registration the SW only
//      activates after they re-visit /settings — fragile when the SW
//      file gets updated between releases.
//   2. SW registration is idempotent — repeat calls return the same
//      registration. Browsers also persist the SW across tab restarts,
//      so this is mostly a "make sure the latest sw.js is the active
//      version" guarantee rather than a per-load setup cost.
//   3. The component renders nothing — it's a pure side-effect carrier
//      so it can sit at the bottom of the layout tree without affecting
//      the visual hierarchy.
export default function PushBootstrap() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    // Skip on the server render (no `navigator`) and on the rare browser
    // that lacks Push/Notification entirely. We deliberately don't gate
    // on the user's permission state here — the SW can be registered
    // even when the user hasn't granted notifications, so any future
    // subscribePush() call doesn't need to first wait for SW boot.
    if (!isAuthenticated) return
    if (!isPushSupported()) return
    if (typeof navigator === 'undefined') return

    // Fire-and-forget. `register()` is idempotent; failures are silent
    // because the user-visible push flow falls back to polling
    // (NotificationBell polls /notifications/unread-count every 30s).
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // Silent — registration failure just means the in-app polling
        // path keeps working. Logging would only spam the console for
        // browsers in private mode etc.
      })
  }, [isAuthenticated])

  return null
}
