'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { type GiftHubItem, type GiftStatus } from '@/lib/sampleData'
import { colorForStatus, statusCopyKey } from '@/lib/giftStatus'

// Two-tab UI: receiver-side and sender-side. The previous "pending" tab
// was removed — `pending_address` gifts already surface their confirm-
// address CTA inline on the receiver-side card, so a separate filter was
// adding a click without adding signal.
type Tab = 'received' | 'sent'

type ServerParty = {
  id: string
  qiftUsername?: string
  fullName?: string | null
}

type ServerGift = {
  id: string
  senderId: string
  receiverId: string
  productName: string
  storeName: string
  // Renamed from `message` in Gift v3. Both names are accepted on read
  // so cached responses from older API builds still parse cleanly.
  messageText?: string | null
  message?: string | null
  status: GiftStatus
  isAnonymous?: boolean
  // Sender's surprise flag + the backend's positive reveal flag. When
  // `productVisible === false`, productName / storeName are blanked
  // server-side and the card renders the mystery state. `productVisible`
  // is missing on responses from older API builds — treat that as
  // "show normally" via the `!== false` check at consumption sites.
  isSurprise?: boolean
  productVisible?: boolean
  // Positive message-reveal flag. `false` ⇒ render the locked
  // placeholder ("سيتم عرض الرسالة بعد استلام الهدية") instead of the
  // real message text. `true` / absent ⇒ render the message inline.
  messageVisible?: boolean
  addressId?: string | null
  createdAt: string
  sender?: ServerParty
  receiver?: ServerParty
}

const PALETTE = [
  '#F472B6,#7B5CF5',
  '#FFD6B5,#7B5CF5',
  '#7B5CF5,#C084FC',
  '#A78BFA,#F472B6',
  '#9AE6B4,#7B5CF5',
  '#C084FC,#F472B6',
]

function gradientFor(id: string) {
  if (!id) return PALETTE[0]
  const idx = (id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % PALETTE.length
  return PALETTE[idx]
}

function toItem(
  gift: ServerGift,
  direction: 'received' | 'sent',
): GiftHubItem {
  const isAnonymous = !!gift.isAnonymous
  const other = direction === 'received' ? gift.sender : gift.receiver
  // For anonymous received gifts the backend already strips the sender —
  // surface a placeholder name and empty handle so the card masks cleanly.
  const masked = isAnonymous && direction === 'received'
  return {
    id: gift.id,
    direction,
    status: gift.status,
    product: {
      name: gift.productName,
      price: '',
      gradient: gradientFor(gift.id),
    },
    store: gift.storeName,
    other: masked
      ? { name: '', username: '' }
      : {
          name: other?.fullName?.trim() || other?.qiftUsername || '—',
          username: other?.qiftUsername || '',
        },
    // Prefer the new `messageText` field; fall back to the legacy
    // `message` alias if the API hasn't been redeployed yet. The
    // backend's reveal gate has already nulled this for receivers
    // pre-delivery, so the preview "just works" without extra logic.
    message: gift.messageText ?? gift.message ?? undefined,
    date: new Date(gift.createdAt).toLocaleDateString('ar-SA'),
    isAnonymous,
    isSurprise: !!gift.isSurprise,
    // Default to true when the backend didn't include the flag (older
    // API builds): both fields are positive, so absence ⇒ show normally.
    productVisible: gift.productVisible !== false,
    messageVisible: gift.messageVisible !== false,
    hasAddress: !!gift.addressId,
  }
}

export default function GiftsHubPage() {
  // useSearchParams must run inside a Suspense boundary in Next.js 16.
  // The wrapper also lets the route prerender the shell while the
  // client hydrates `?tab=` from the URL.
  return (
    <Suspense fallback={<GiftsSkeleton />}>
      <GiftsHubInner />
    </Suspense>
  )
}

function GiftsHubInner() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const params = useSearchParams()
  const ready = useSimulatedReady(400)
  const { accessToken, userId, isAuthenticated } = useAuth()
  // `?tab=` is the canonical tab driver so notifications can deep-link
  // (`/gifts?tab=sent` from a sender-side notification, `?tab=received`
  // from a receiver-side one). Falls back to `received` for any other
  // value so a malformed param doesn't blank the page.
  const urlTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(
    urlTab === 'sent' || urlTab === 'received' ? urlTab : 'received',
  )
  const [items, setItems] = useState<GiftHubItem[]>([])
  const [loading, setLoading] = useState(true)

  // Track explicit fetch errors so the empty-state UI can switch to a
  // "couldn't load — retry" card instead of silently rendering "no
  // gifts yet" (which is the wrong message when the network failed).
  const [loadError, setLoadError] = useState<'network' | 'server' | null>(
    null,
  )

  const refresh = useCallback(async () => {
    if (!accessToken || !userId) return
    setLoading(true)
    setLoadError(null)
    try {
      const headers = { Authorization: `Bearer ${accessToken}` }
      const [recRes, sentRes] = await Promise.all([
        fetch(`${API_BASE}/gifts/received/${userId}`, { headers }),
        fetch(`${API_BASE}/gifts/sent/${userId}`, { headers }),
      ])
      // If both sides 4xx/5xx we can't tell if the user has zero gifts
      // or if the API is down. Surface a load error rather than the
      // empty-state copy. (Either side succeeding is enough — the
      // other rail simply renders empty.)
      if (!recRes.ok && !sentRes.ok) {
        setLoadError('server')
        return
      }
      const received: ServerGift[] = recRes.ok ? await recRes.json() : []
      const sent: ServerGift[] = sentRes.ok ? await sentRes.json() : []
      setItems([
        ...received.map((g) => toItem(g, 'received')),
        ...sent.map((g) => toItem(g, 'sent')),
      ])
    } catch {
      // Network-level failure — distinct from a 5xx so the retry copy
      // can hint at "check your connection" instead of "try again".
      setLoadError('network')
    } finally {
      setLoading(false)
    }
  }, [accessToken, userId])

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login')
    }
  }, [ready, isAuthenticated, router])

  // Keep state in sync when the URL changes from outside the tab buttons
  // (notification click while already on the page, browser back/forward).
  useEffect(() => {
    if (urlTab === 'sent' || urlTab === 'received') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(urlTab)
    }
  }, [urlTab])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (accessToken && userId) void refresh()
  }, [accessToken, userId, refresh])

  const filtered = useMemo(() => {
    return items.filter((g) => g.direction === tab)
  }, [items, tab])

  // Receiver confirms the delivery address for a gift. Without an explicit
  // addressId the backend falls back to the receiver's default address,
  // which matches the 24-hour auto-use behavior.
  //
  // Error mapping: the backend exposes specific 4xx messages we surface
  // verbatim through localized strings, instead of the old catch-all
  // "register.error_toast". Hitting "no default address" should walk the
  // user to /settings, not show a generic failure.
  const confirmAddress = async (id: string) => {
    // Optimistic update so the card flips to address_confirmed instantly;
    // we revert on failure by re-fetching from the source of truth.
    setItems((list) =>
      list.map((g) =>
        g.id === id ? { ...g, status: 'address_confirmed', hasAddress: true } : g,
      ),
    )
    try {
      const res = await fetch(`${API_BASE}/gifts/${id}/confirm-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string | string[]
        } | null
        const raw = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message ?? ''
        const message = typeof raw === 'string' ? raw : ''
        // Ordered specificity: address-not-found before no-default-address
        // because the latter substring also occurs inside other generic
        // error copies.
        if (message.includes('العنوان غير موجود') || message.includes('لا يخصك')) {
          toast.show(t('gifts.confirm_address_not_yours'), { tone: 'error' })
        } else if (message.includes('عنوان افتراضي')) {
          toast.show(t('gifts.confirm_no_default_address'), { tone: 'error' })
        } else if (res.status >= 500) {
          toast.show(t('gifts.confirm_server_error'), { tone: 'error' })
        } else {
          toast.show(t('gifts.confirm_failed'), { tone: 'error' })
        }
        // Re-pull the source of truth so the optimistic flip rolls back
        // to whatever the server actually has.
        void refresh()
        return
      }
      toast.show(t('toast.gift_address_confirmed'))
    } catch {
      // Network error: re-fetch and tell the user the connection failed.
      toast.show(t('gifts.confirm_network_error'), { tone: 'error' })
      void refresh()
    }
  }

  // Sender cancels their own gift (only allowed by the backend before
  // status === 'preparing'). Optimistic flip to 'cancelled' for instant
  // feedback; full re-fetch on failure so the row rolls back to
  // whatever the server actually has.
  const cancelGift = async (id: string) => {
    if (!accessToken) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(t('gifts.cancel_confirm'))
    ) {
      return
    }
    setItems((list) =>
      list.map((g) => (g.id === id ? { ...g, status: 'cancelled' } : g)),
    )
    try {
      const res = await fetch(`${API_BASE}/gifts/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        toast.show(t('gifts.cancel_failed'), { tone: 'error' })
        void refresh()
        return
      }
      toast.show(t('gifts.cancel_done'))
    } catch {
      toast.show(t('gifts.confirm_network_error'), { tone: 'error' })
      void refresh()
    }
  }

  if (!ready || !isAuthenticated) return <GiftsSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('gifts.badge')}</Badge>}
          line1={t('gifts.title_1')}
          gradient={t('gifts.title_2')}
          subtitle={t('gifts.subtitle')}
          size="sm"
        />

        <div
          className="mt-5 inline-flex w-full items-center rounded-2xl border p-1 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          {(['received', 'sent'] as Tab[]).map((id) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id)
                  // Keep the URL in sync so deep-linking + share +
                  // browser-back work. `replace` so back doesn't add a
                  // history entry per tab click.
                  const next = new URLSearchParams(params.toString())
                  next.set('tab', id)
                  router.replace(`/gifts?${next.toString()}`, {
                    scroll: false,
                  })
                }}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:text-sm"
                style={{
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--text-soft)',
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? 'var(--shadow-soft)' : 'none',
                }}
              >
                {t(`gifts.tab_${id}`)}
              </button>
            )
          })}
        </div>

        {loading && items.length === 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-28 w-full" rounded="3xl" />
              </li>
            ))}
          </ul>
        ) : loadError && items.length === 0 ? (
          // Distinct from Empty: the user MIGHT actually have gifts —
          // we couldn't reach the API to find out. The retry button
          // re-runs the same fetch with a fresh attempt.
          <LoadFailed kind={loadError} onRetry={() => void refresh()} />
        ) : filtered.length === 0 ? (
          <Empty tab={tab} />
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {filtered.map((g) => (
              <GiftCard
                key={g.direction + g.id}
                gift={g}
                onConfirmAddress={() => confirmAddress(g.id)}
                onCancel={() => cancelGift(g.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

function GiftsSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-24" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        {/* Tab strip */}
        <Skeleton className="mt-5 h-12 w-full" rounded="2xl" />
        {/* Cards mirror the real GiftCard layout: avatar tile + title +
            status pill, store/date line, sender row, progress bar.
            Same vertical cadence so the swap to live data has no
            visible reflow. */}
        <ul className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-3xl border p-4 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-14 w-14" rounded="2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-5 w-20" rounded="full" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-3/5" />
                  <div className="mt-3 flex items-center gap-2">
                    <Skeleton className="h-6 w-6" rounded="full" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                  {/* 5-segment progress mirror */}
                  <div className="mt-3 flex items-center gap-1">
                    {[0, 1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-1 flex-1" rounded="full" />
                    ))}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// Hard-fail card. Only rendered when both /gifts/sent AND /gifts/received
// failed to return data — partial failures fall through to the regular
// list because at least one side is real. Retry hits the same callback
// the page used on mount.
function LoadFailed({
  kind,
  onRetry,
}: {
  kind: 'network' | 'server'
  onRetry: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      className="mt-6 flex flex-col items-center rounded-3xl border p-8 text-center backdrop-blur-md qift-fade-in"
      style={{
        borderColor: 'color-mix(in srgb, #D55B6E 35%, var(--border))',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: 'color-mix(in srgb, #D55B6E 14%, var(--surface-2))',
          color: '#D55B6E',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <h3
        className="mt-3 text-base font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('gifts.load_failed_title')}
      </h3>
      <p
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {kind === 'network'
          ? t('gifts.load_failed_network')
          : t('gifts.load_failed_server')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M21 12a9 9 0 11-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        {t('gifts.load_failed_retry')}
      </button>
    </div>
  )
}

function Empty({ tab }: { tab: Tab }) {
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
        className="qift-bob flex h-16 w-16 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
        </svg>
      </span>
      <p
        className="mt-4 text-base font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t(`gifts.empty_${tab}`)}
      </p>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t(`gifts.empty_${tab}_body`)}
      </p>
      <Link
        href="/stores"
        className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {t('gifts.empty_cta')}
      </Link>
    </div>
  )
}

function GiftCard({
  gift,
  onConfirmAddress,
  onCancel,
}: {
  gift: GiftHubItem
  onConfirmAddress: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [a, b] = gift.product.gradient.split(',')
  // Single source of truth for status colors lives in lib/giftStatus —
  // both the list cards and the detail badge consume it so any palette
  // change ripples without a sync hunt.
  const statusColor = colorForStatus(gift.status)

  const isAnonReceived = gift.isAnonymous && gift.direction === 'received'
  const partyLabel =
    gift.direction === 'received' ? t('gifts.from') : t('gifts.to')
  const partyName = isAnonReceived
    ? t('gifts.anonymous_sender')
    : gift.other.name || '—'
  const initials = isAnonReceived
    ? '?'
    : gift.other.name
      ? gift.other.name
          .split(' ')
          .filter(Boolean)
          .map((p) => p[0])
          .slice(0, 2)
          .join('') || '?'
      : '?'

  return (
    <li
      className="rounded-3xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <Link
        href={`/gifts/${gift.id}`}
        className="block"
        aria-label={t('gifts.view_details')}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M20 12v9H4v-9" />
              <path d="M2 7h20v5H2z" />
              <path d="M12 22V7" />
              <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
              <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                className="truncate text-[0.95rem] font-bold tracking-tight"
                style={{
                  color: 'var(--ink)',
                  // Italic + softer weight on the mystery placeholder so
                  // it reads as "intentional secret" rather than "missing
                  // value".
                  fontStyle:
                    gift.productVisible === false ? 'italic' : undefined,
                }}
              >
                {gift.productVisible === false
                  ? t('gifts.mystery_title')
                  : gift.product.name}
              </h3>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold tracking-wider"
                style={{
                  borderColor: 'var(--border)',
                  color: statusColor,
                  background: 'var(--card-soft)',
                }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: statusColor }}
                />
                {/* Audience-aware copy. The same status reads
                    differently to sender ("Waiting for recipient")
                    vs receiver ("Action needed") — see
                    statusCopyKey for the full mapping. */}
                {t(statusCopyKey(gift.status, gift.direction))}
              </span>
            </div>
            <p
              className="mt-0.5 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {/* Hide the store name in surprise mode — the body line
                  becomes "Surprise gift · <date>" so we don't even hint
                  at the merchant. */}
              {gift.productVisible === false
                ? t('gifts.mystery_subtitle')
                : gift.store}
              {gift.productVisible !== false && gift.product.price && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span style={{ color: 'var(--primary)' }}>
                    {gift.product.price}
                  </span>
                </>
              )}
              <span className="mx-1.5 opacity-50">·</span>
              {gift.date}
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                style={{
                  background: isAnonReceived
                    ? 'var(--muted-2)'
                    : 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                }}
              >
                {initials}
              </span>
              <span
                className="truncate text-xs"
                style={{ color: 'var(--text-soft)' }}
              >
                <span style={{ color: 'var(--muted)' }}>{partyLabel}</span>{' '}
                <span
                  className="font-semibold"
                  style={{
                    color: isAnonReceived ? 'var(--muted)' : 'var(--ink)',
                    fontStyle: isAnonReceived ? 'italic' : undefined,
                  }}
                >
                  {partyName}
                </span>
                {!isAnonReceived && gift.other.username && (
                  <>
                    {' '}
                    <span dir="ltr" className="opacity-70">
                      @{gift.other.username}
                    </span>
                  </>
                )}
              </span>
              {gift.isAnonymous && (
                <span
                  className="ms-auto shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--muted)',
                  }}
                >
                  {t('gifts.anonymous_chip')}
                </span>
              )}
              {/* Surprise chip — identical for every surprise gift, so it
                  reveals "this is a surprise" but nothing else. Only
                  rendered while the surprise is still active (productVisible
                  is false); after delivery the chip would be redundant. */}
              {gift.isSurprise && gift.productVisible === false && (
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${gift.isAnonymous ? '' : 'ms-auto'}`}
                  style={{
                    borderColor: 'transparent',
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                    color: '#fff',
                  }}
                >
                  {t('gifts.surprise_chip')}
                </span>
              )}
            </div>

            {/* Message slot.
                  - messageVisible === false  → locked placeholder. We
                    deliberately render this on EVERY pre-delivery
                    receiver card (regardless of whether a message was
                    actually attached) — telling the receiver "no
                    message exists" before delivery would itself leak
                    information about the gift.
                  - messageVisible === true && a message exists → quote
                    it inline.
                  - messageVisible === true && no message → render
                    nothing (no row at all). */}
            {gift.messageVisible === false ? (
              <p
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, var(--card-soft) 100%)',
                  color: 'var(--text-soft)',
                  border: '1px solid var(--border)',
                }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--primary)' }}
                >
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                {t('gifts.message_locked_until_delivery')}
              </p>
            ) : (
              gift.message && (
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  “{gift.message}”
                </p>
              )
            )}

            {/* 5-step progress indicator. Each segment is a thin pill
                that fills with the primary gradient as the gift
                advances through pending → confirmed → preparing →
                shipped → delivered. address_confirmed and
                default_address_used both count as step 2 (the address
                milestone — same node in TIMELINE_ORDER). */}
            <ProgressIndicator status={gift.status} />
          </div>
        </div>
      </Link>

      {gift.direction === 'received' && gift.status === 'pending_address' && (
        // Receiver path: confirm the default address (or open the detail
        // page to pick a non-default one).
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onConfirmAddress()
            }}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('gifts.confirm_address')}
          </button>
          <Link
            href={`/gifts/${gift.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition-colors active:scale-[0.98]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-soft)',
              background: 'var(--card)',
            }}
          >
            {t('gifts.choose_address')}
          </Link>
        </div>
      )}

      {/* Sender path: cancel button. Only rendered while the backend
          will still accept the cancel transition (pending_address /
          address_confirmed / default_address_used) — once the gift is
          `preparing` or beyond, the store has the order and refund
          flow takes over. We keep this OUT of the wrapping <Link> so
          a click on the button doesn't also navigate to the detail
          page; the e.stopPropagation guard inside cancelGift's
          confirm prompt is the safety net. */}
      {gift.direction === 'sent' &&
        (gift.status === 'pending_address' ||
          gift.status === 'address_confirmed' ||
          gift.status === 'default_address_used') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onCancel()
            }}
            className="mt-3 w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: '#D55B6E',
            }}
          >
            {t('gifts.cancel_button')}
          </button>
        )}

      {/* Note: the "mark delivered" button used to live here for either
          party. v3 makes delivery store-driven (the store dashboard
          handles it) so the user-facing button was removed to keep
          transitions strict — delivery only ever flows shipped → delivered. */}
    </li>
  )
}

// Compute the linear progress index (0..4) for a given gift status.
// Both `address_confirmed` and `default_address_used` are alternate
// paths through the same address milestone (step 1) — see TIMELINE_ORDER
// in apps/api/src/gifts/gift-status.ts. The discriminator stays in the
// row's status; the indicator collapses them.
function progressIndexFor(status: GiftStatus): number {
  switch (status) {
    case 'pending_address':
      return 0
    case 'address_confirmed':
    case 'default_address_used':
      return 1
    case 'preparing':
      return 2
    case 'shipped':
      return 3
    case 'delivered':
      return 4
    default:
      return 0
  }
}

// Five thin segments under the card body. Each one fills with a primary
// gradient as the gift advances. We render an aria-hidden visual + a
// visually-hidden text label so screen readers still get the status
// (the badge above the title carries the localized name).
function ProgressIndicator({ status }: { status: GiftStatus }) {
  const idx = progressIndexFor(status)
  const isDelivered = status === 'delivered'
  return (
    <div
      aria-hidden
      className="mt-3 flex items-center gap-1"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const reached = i <= idx
        return (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-all"
            style={{
              background: reached
                ? isDelivered
                  ? // Delivered → solid celebratory primary→accent.
                    'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)'
                  : // In-flight → primary→primary-dark for active progress.
                    'linear-gradient(90deg, var(--primary) 0%, var(--primary-dark) 100%)'
                : 'var(--border-strong)',
              opacity: reached ? 1 : 0.45,
            }}
          />
        )
      })}
    </div>
  )
}
