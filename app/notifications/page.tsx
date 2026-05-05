'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/NotificationBell'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import {
  isPushSupported,
  readPushStatus,
  subscribePush,
  type PushState,
} from '@/lib/push'

// sessionStorage flag set when the user dismisses the push-enable
// prompt. Scoped to a session so the banner returns next time they
// open the app — but doesn't nag them on every navigation within the
// same session.
const SS_PUSH_PROMPT_DISMISSED = 'qift.push.prompt_dismissed'

type ServerNotification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  isRead: boolean
  createdAt: string
}

// Five user-facing categories (per spec). Order here = display order on
// the page. Each category renders its own SectionHeader + grouped card.
type GroupId =
  | 'attempt'
  | 'address_set'
  | 'sent'
  | 'received'
  | 'message_ready'

const GROUP_ORDER: GroupId[] = [
  'attempt',
  'address_set',
  'sent',
  'received',
  'message_ready',
]

// Type → category. Each backend type lives in exactly one bucket; types
// that fire to BOTH sender and receiver (gift.default_address_used,
// gift.delivered) are placed where the most informative grouping label
// applies — `gift.default_address_used` reads as "address resolved" and
// goes in `address_set`; `gift.delivered` reads as "the message is now
// readable" and goes in `message_ready`.
function groupForType(type: string): GroupId {
  switch (type) {
    case 'gift.attempted_no_address':
      return 'attempt'
    case 'gift.address_ready_for_retry':
    case 'gift.address_confirmed':
    case 'gift.default_address_used':
      return 'address_set'
    case 'gift.preparing':
    case 'gift.shipped':
      return 'sent'
    case 'gift.received':
    case 'gift.confirm_address':
      return 'received'
    case 'gift.delivered':
      return 'message_ready'
    default:
      // Unknown / future types fall into "received" — that's the most
      // generic gift-flow bucket. Easier to retro-fix than to spawn a
      // sixth catch-all section.
      return 'received'
  }
}

// Routing per spec. We honor the backend-provided link when it points
// at a specific resource (a route segment beyond just `/gifts`), and
// fall back to a category-based default otherwise.
//
// Spec actions:
//   attempt        → /profile
//   address_set    → /send (sender retries; we can't include `?to=`
//                          because the username isn't stored on the
//                          notification row)
//   sent           → /gifts?tab=sent
//   received       → /gifts?tab=received
//   message_ready  → /gifts/[id] when we have a specific link, else
//                     /gifts?tab=received
function routeForNotification(n: ServerNotification): string {
  // Trust same-origin specific links from the backend.
  if (
    n.link &&
    n.link.startsWith('/') &&
    !n.link.startsWith('//') &&
    n.link !== '/gifts' // /gifts is "generic" — override with our tab default
  ) {
    return n.link
  }
  switch (groupForType(n.type)) {
    case 'attempt':
      return '/profile'
    case 'address_set':
      // Sender-side retry surface. The originating username isn't on
      // the notification row, so the user lands on /send empty and
      // picks the recipient — better than a dead link.
      if (n.type === 'gift.address_ready_for_retry') return '/send'
      return '/gifts?tab=sent'
    case 'sent':
      return '/gifts?tab=sent'
    case 'received':
      return '/gifts?tab=received'
    case 'message_ready':
      return '/gifts?tab=received'
  }
}

// Notify any other component (the header bell, mainly) that the read state
// changed so it can refresh its badge without waiting for the poll.
function broadcastChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}

export default function NotificationsPage() {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const ready = useSimulatedReady(300)
  const { accessToken, isAuthenticated } = useAuth()
  const [items, setItems] = useState<ServerNotification[]>([])
  const [loading, setLoading] = useState(true)
  // Push subscription state for the discoverable prompt banner. We
  // surface the CTA only when the browser supports push, the server
  // has VAPID configured, the user hasn't denied permission, and they
  // haven't already subscribed in this browser. The full /settings
  // push card stays canonical — this is just a convenience entry point
  // close to where push value is highest.
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [promptDismissed, setPromptDismissed] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error('list_failed')
      const list = (await res.json()) as ServerNotification[]
      setItems(Array.isArray(list) ? list : [])
    } catch {
      // leave existing list intact
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login')
  }, [ready, isAuthenticated, router])

  useEffect(() => {
    // refresh() flips `loading` synchronously before awaiting fetch, so
    // the lint rule sees a setState directly in the effect's call graph.
    // The flow is correct (loading state is sync'd to a network call) so
    // we silence it here rather than defer to a microtask.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (accessToken) void refresh()
  }, [accessToken, refresh])

  // Resolve push state on mount + re-resolve when auth changes. Async
  // IIFE pattern keeps the setState off the synchronous effect path so
  // `react-hooks/set-state-in-effect` stays quiet.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const dismissed =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(SS_PUSH_PROMPT_DISMISSED) === '1'
      const status = await readPushStatus(accessToken)
      if (cancelled) return
      setPushState(status.state)
      setPromptDismissed(dismissed)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const onEnablePush = async () => {
    if (!accessToken || pushBusy) return
    setPushBusy(true)
    try {
      await subscribePush(accessToken)
      setPushState('enabled')
      toast.show(t('push.subscribed_toast'))
    } catch (err) {
      const code = (err as { code?: string }).code
      // Map error codes to the same toasts the /settings page uses so
      // copy stays consistent. Unknown errors fall to the generic
      // failure toast.
      const key =
        code === 'denied'
          ? 'push.denied_toast'
          : code === 'unsupported'
            ? 'push.unsupported_toast'
            : code === 'no-vapid'
              ? 'push.no_vapid_toast'
              : 'push.subscribe_failed_toast'
      toast.show(t(key), { tone: 'error' })
      // Refresh state so a denied permission flips the state to
      // 'denied' and the banner hides.
      const status = await readPushStatus(accessToken)
      setPushState(status.state)
    } finally {
      setPushBusy(false)
    }
  }

  const onDismissPushPrompt = () => {
    setPromptDismissed(true)
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(SS_PUSH_PROMPT_DISMISSED, '1')
      } catch {
        /* private mode — banner just won't stay dismissed */
      }
    }
  }

  // Show the prompt only when the browser supports push, VAPID is
  // configured server-side, the user hasn't denied permission, hasn't
  // already subscribed, and hasn't dismissed the prompt this session.
  const showPushPrompt =
    isAuthenticated &&
    !promptDismissed &&
    pushState === 'disabled' &&
    isPushSupported()

  const onNotificationClick = async (n: ServerNotification) => {
    // Optimistically mark read so the UI doesn't lag behind the click.
    if (!n.isRead) {
      setItems((list) =>
        list.map((it) => (it.id === n.id ? { ...it, isRead: true } : it)),
      )
      try {
        await fetch(`${API_BASE}/notifications/${n.id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        broadcastChanged()
      } catch {
        // Roll back on failure.
        setItems((list) =>
          list.map((it) => (it.id === n.id ? { ...it, isRead: false } : it)),
        )
      }
    }
    // Type-aware routing — see routeForNotification(). Always returns a
    // safe same-origin path; never trusts an absolute URL from a
    // notification payload.
    router.push(routeForNotification(n))
  }

  const onReadAll = async () => {
    const previous = items
    setItems((list) => list.map((it) => ({ ...it, isRead: true })))
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      broadcastChanged()
    } catch {
      setItems(previous)
    }
  }

  const unreadCount = items.filter((n) => !n.isRead).length

  // Group items by category. Within each group items keep the API's
  // newest-first order (the backend already sorts by createdAt desc).
  const grouped = useMemo(() => {
    const buckets: Record<GroupId, ServerNotification[]> = {
      attempt: [],
      address_set: [],
      sent: [],
      received: [],
      message_ready: [],
    }
    for (const n of items) buckets[groupForType(n.type)].push(n)
    return buckets
  }, [items])

  if (!ready || !isAuthenticated) return <NotificationsSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('notifications.badge')}</Badge>}
          line1={t('notifications.title_1')}
          gradient={t('notifications.title_2')}
          subtitle={t('notifications.subtitle')}
          size="sm"
        />

        {/* Discoverable push prompt — only renders when push is
            available + the user isn't subscribed + they haven't
            dismissed it this session. /settings stays the canonical
            push management surface; this is a contextual entry point
            on the page where push value is highest. */}
        {showPushPrompt && (
          <PushPromptBanner
            busy={pushBusy}
            onEnable={() => void onEnablePush()}
            onDismiss={onDismissPushPrompt}
          />
        )}

        {/* Header row: read-all is hidden when there's nothing to read. */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span
            className="text-xs font-medium tracking-wide"
            style={{ color: 'var(--muted)' }}
          >
            {unreadCount > 0
              ? `${unreadCount} ${t('notifications.unread_label')}`
              : t('notifications.all_caught_up')}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void onReadAll()}
              className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors active:scale-95"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--primary)',
              }}
            >
              {t('notifications.read_all')}
            </button>
          )}
        </div>

        {loading && items.length === 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-16 w-full" rounded="2xl" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <Empty />
        ) : (
          <div className="mt-2 flex flex-col">
            {GROUP_ORDER.map((groupId) => {
              const rows = grouped[groupId]
              if (rows.length === 0) return null
              const groupUnread = rows.filter((n) => !n.isRead).length
              return (
                <section key={groupId} className="qift-fade-in">
                  <h2
                    className="mt-5 flex items-center gap-2 px-1 text-[0.78rem] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {t(`notifications.group_${groupId}`)}
                    {/* Per-group unread count chip — gives the user a
                        glance at which group has new activity without
                        scanning every row. Hidden when zero. */}
                    {groupUnread > 0 && (
                      <span
                        aria-label={t('notifications.unread_dot_label')}
                        className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[0.6rem] font-bold text-white"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                        }}
                      >
                        {groupUnread}
                      </span>
                    )}
                  </h2>
                  <ul
                    className="mt-2 overflow-hidden rounded-3xl border backdrop-blur-md"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--card)',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    {rows.map((n, i) => (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        isLast={i === rows.length - 1}
                        lang={lang}
                        onClick={() => void onNotificationClick(n)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </PageContainer>
  )
}

function NotificationRow({
  n,
  isLast,
  lang,
  onClick,
}: {
  n: ServerNotification
  isLast: boolean
  lang: string
  onClick: () => void
}) {
  const { t } = useI18n()
  return (
    <li
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-[var(--card-soft)]"
        style={{
          background: n.isRead ? 'transparent' : 'var(--ring)',
        }}
      >
        <span aria-hidden className="mt-1 shrink-0">
          <TypeIcon type={n.type} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-sm tracking-tight"
              style={{
                color: 'var(--ink)',
                fontWeight: n.isRead ? 500 : 700,
              }}
            >
              {n.title}
            </h3>
            <span
              className="shrink-0 text-[0.65rem] tabular-nums"
              style={{ color: 'var(--muted)' }}
            >
              {formatRelative(n.createdAt, lang, t)}
            </span>
          </div>
          {n.body && (
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: 'var(--text-soft)' }}
            >
              {n.body}
            </p>
          )}
        </div>

        {/* Unread dot. Stays in the inline-end gutter so it lines up across
            rows regardless of body length. */}
        {!n.isRead && (
          <span
            aria-label={t('notifications.unread_dot_label')}
            className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            }}
          />
        )}
      </button>
    </li>
  )
}

// Visual treatment per category. Each row's icon picks colour + glyph
// from the group derived via `groupForType()` — keeps the row visually
// consistent with the section header above it. Unknown types fall back
// to the generic gift icon.
function TypeIcon({ type }: { type: string }) {
  const group = groupForType(type)
  const { color, path } = ICON_BY_GROUP[group]
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-2xl"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, ' +
          color +
          ' 28%, transparent), color-mix(in srgb, ' +
          color +
          ' 6%, transparent))',
        color,
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
        {path}
      </svg>
    </span>
  )
}

// Per-group icon palette. Colors aren't theme tokens so we can pick
// distinctive hues that read against the dark surface — one warm warning
// for "attempt" (someone tried), neutral primary for address-related
// movement, transit blue for "sent", celebratory primary→accent for
// "received", and green for "message ready" (= delivered, the happy
// terminal state).
const ICON_BY_GROUP: Record<
  GroupId,
  { color: string; path: React.ReactNode }
> = {
  attempt: {
    color: '#E89B3A',
    path: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z" />
      </>
    ),
  },
  address_set: {
    color: 'var(--primary)',
    path: (
      <>
        <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
  sent: {
    color: '#5BA0FF',
    path: (
      <>
        <path d="M3 11l18-7-7 18-2-8-9-3z" />
      </>
    ),
  },
  received: {
    color: 'var(--primary)',
    path: (
      <>
        <path d="M20 12v9H4v-9" />
        <path d="M2 7h20v5H2z" />
        <path d="M12 22V7" />
        <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
      </>
    ),
  },
  message_ready: {
    color: '#3FA46A',
    path: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M4 4l8 8 8-8" />
      </>
    ),
  },
}

// Discoverable push-enable banner. Premium primary-tinted card with a
// bell glyph, a one-line value prop, the enable button (primary
// gradient), and a dismiss "x". Same visual contract as the gift-detail
// "action required" card so both attention surfaces feel like one
// design language.
function PushPromptBanner({
  busy,
  onEnable,
  onDismiss,
}: {
  busy: boolean
  onEnable: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      role="region"
      aria-label={t('notifications.push_prompt_title')}
      className="qift-fade-in mt-5 rounded-3xl border p-4 backdrop-blur-md"
      style={{
        borderColor:
          'color-mix(in srgb, var(--primary) 40%, var(--border))',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--card)) 0%, var(--card) 100%)',
        boxShadow:
          '0 14px 36px -16px color-mix(in srgb, var(--primary) 55%, transparent)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
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
          >
            <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
            <path d="M10 21h4" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('notifications.push_prompt_title')}
          </h3>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('notifications.push_prompt_body')}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('notifications.push_prompt_dismiss')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors active:scale-95"
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
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        onClick={onEnable}
        disabled={busy}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow:
            '0 10px 24px -10px color-mix(in srgb, var(--primary) 70%, transparent)',
        }}
      >
        {busy ? (
          <span
            aria-hidden
            className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          />
        ) : (
          t('notifications.push_prompt_cta')
        )}
      </button>
    </div>
  )
}

function Empty() {
  const { t } = useI18n()
  return (
    <div
      className="mt-6 flex flex-col items-center rounded-3xl border p-8 text-center backdrop-blur-md qift-fade-in"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
          <path d="M10 21h4" />
        </svg>
      </span>
      <p
        className="mt-3 text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('notifications.empty')}
      </p>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('notifications.empty_body')}
      </p>
    </div>
  )
}

function NotificationsSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-24" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <ul className="mt-5 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full" rounded="2xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// Plain "Nm / Nh / Nd" relative timestamp. We keep it dependency-free so
// we don't pull in dayjs/intl-relative just for this one place.
function formatRelative(
  iso: string,
  _lang: string,
  t: (key: string) => string,
): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  if (ms < 60_000) return t('notifications.now')
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}${t('notifications.unit_minute')}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}${t('notifications.unit_hour')}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}${t('notifications.unit_day')}`
  return new Date(iso).toLocaleDateString()
}
