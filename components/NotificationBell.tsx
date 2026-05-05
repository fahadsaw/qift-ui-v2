'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

// Custom event other components fire when notifications change so the bell
// updates immediately (instead of waiting for the next poll). Same pattern
// as the auth `qift:auth-changed` channel.
export const NOTIFICATIONS_CHANGED_EVENT = 'qift:notifications-changed'

const POLL_MS = 30_000

// Header bell. Only mounts when the viewer is authenticated; polls
// /notifications/unread-count on a 30s tick and listens for the in-app
// `notifications-changed` event so /notifications can refresh the badge
// the moment it marks something read.
export default function NotificationBell() {
  const { accessToken, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      // Reset the badge when the user logs out / token is cleared. Setting
      // state in an effect is the correct sync point for an external store
      // (auth lives in localStorage), even though the lint rule warns.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnread(0)
      return
    }

    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/notifications/unread-count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { unread?: number }
        if (typeof data.unread === 'number') setUnread(data.unread)
      } catch {
        // Silent — we'll try again next tick.
      }
    }

    void tick()
    const id = setInterval(() => {
      void tick()
    }, POLL_MS)

    const onChanged = () => {
      void tick()
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    // Pull a fresh count whenever the tab becomes visible again — the user
    // is most likely to open it after they noticed something happened.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Service worker → page bridge: when the SW receives a push it
    // posts `qift:push-received` to every controlled client. We use it
    // to refresh the badge instantly instead of waiting for the next
    // 30s poll.
    const onSwMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string } | undefined
      if (data?.type === 'qift:push-received') void tick()
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage)
    }

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
      document.removeEventListener('visibilitychange', onVisibility)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage)
      }
    }
  }, [isAuthenticated, accessToken])

  if (!isAuthenticated) return null

  // Display 99+ instead of letting the badge swell past two digits.
  const label = unread > 99 ? '99+' : String(unread)
  const showBadge = unread > 0

  return (
    <Link
      href="/notifications"
      aria-label={t('notifications.bell_label')}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 active:scale-95"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
        <path d="M10 21h4" />
      </svg>
      {showBadge && (
        <span
          aria-hidden
          className="absolute -top-1 -end-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[0.55rem] font-bold text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            height: '1.1rem',
            boxShadow: '0 0 0 2px var(--bg-base)',
          }}
        >
          {label}
        </span>
      )}
    </Link>
  )
}
