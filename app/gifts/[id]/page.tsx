'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import GiftPostPublishCard from '@/components/GiftPostPublishCard'
import GiftRevealOverlay from '@/components/GiftRevealOverlay'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import RevealedMessageCard from '@/components/RevealedMessageCard'
import Skeleton from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import type { GiftStatus } from '@/lib/sampleData'
import {
  TIMELINE_STEPS,
  colorForStatus,
  statusCopyKey,
  timelineStateFor,
  type TimelineKey,
  type TimelineState,
} from '@/lib/giftStatus'
import {
  canDeliverTo,
  type DeliveryZone,
  type Eligibility,
} from '@/lib/giftDelivery'
import { formatCoverageList } from '@/lib/deliveryZones'

type ServerParty = {
  id: string
  qiftUsername?: string
  fullName?: string | null
}

// The address blob the backend returns inline with the gift (when one is
// already linked). Shape mirrors the ADDRESS_SELECT in gifts.service.ts.
type ServerAddress = {
  id: string
  label?: string | null
  country: string
  region?: string | null
  city: string
  governorate?: string | null
  district: string
  street?: string | null
  buildingNumber?: string | null
  unitNumber?: string | null
  postalCode?: string | null
  additionalNumber?: string | null
  shortAddress?: string | null
  deliveryPhone?: string | null
  details?: string | null
  isDefault?: boolean
}

type ServerGift = {
  id: string
  senderId: string
  receiverId: string
  productName: string
  storeName: string
  // Renamed from `message` in Gift v3. The backend always emits the new
  // name; we keep the optional `message` alias on the type so older
  // cached responses don't break the page on first load.
  messageText?: string | null
  message?: string | null
  // Optional media attachment, populated only when the buyer added one.
  // URL, type, and message text are all stripped by the backend's reveal
  // gate when the viewer is the receiver and the gift hasn't been
  // delivered yet — the API never leaks even a hint about whether media
  // was attached.
  mediaUrl?: string | null
  mediaType?: 'image' | 'video' | null
  // Positive flag from the backend. `true` → render the actual message +
  // media. `false` → backend has stripped the content because the viewer
  // is the receiver and the gift hasn't been delivered yet, so we render
  // the locked placeholder instead.
  messageVisible?: boolean
  // Sender flagged the gift as a surprise. `productVisible` is the
  // positive reveal flag — `false` ⇒ productName/storeName were blanked
  // server-side (receiver pre-delivery view) and the page should render
  // the mystery state instead. Mirrors `messageVisible`.
  isSurprise?: boolean
  productVisible?: boolean
  status: GiftStatus
  isAnonymous: boolean
  // Sender views always get null here — applyAddressPrivacy on the
  // backend strips the address row before the response leaves the
  // server. The frontend gates rendering by `direction === 'received'`
  // as a second safety layer.
  addressId?: string | null
  address?: ServerAddress | null
  // Positive flag from applyAddressPrivacy: true once the gift has
  // moved past `pending_address` (either via confirm-address or the
  // 24h auto-default sweep). The sender UI uses this to flip from
  // "Waiting for recipient" to "Recipient confirmed — preparing soon"
  // without ever needing the address itself.
  addressConfirmed?: boolean
  // Tracking timestamps from Gift v3.
  confirmedAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  // Read-only structured shipment timeline. Populated when the
  // merchant has created a Shipment row (via the new shipment
  // manager). When absent, the legacy single-line tracking card
  // still renders from trackingNumber + carrier. Both surfaces
  // can co-exist on the same gift while older orders catch up.
  shipment?: {
    provider: string
    trackingNumber: string | null
    trackingUrl: string | null
    status: string
    events: { status: string; note: string | null; occurredAt: string }[]
  } | null
  createdAt: string
  sender?: ServerParty
  receiver?: ServerParty
  // Store-coverage fields used by the delivery-eligibility check
  // on the address picker. Forwarded from Order at gift-create
  // time and snapshotted onto Gift so a mid-flight merchant zone
  // change doesn't invalidate this gift.
  //
  // The preferred shape is `deliveryZones` — explicit coverage
  // tuples. `storeCity` is the legacy fallback for stores that
  // haven't opted into zones yet; the matcher promotes it to a
  // single-element zone internally. All optional so older gifts
  // gracefully fall through to "unknown coverage" mode (picker
  // stays open with a hint we can't verify city eligibility).
  // See lib/giftDelivery.ts and lib/deliveryZones.ts BACKEND
  // CONTRACT for the full required-fields list.
  deliveryZones?: DeliveryZone[] | null
  storeCity?: string | null
  storeCountry?: string | null
  isFastDelivery?: boolean | null
  category?: string | null
}

// localStorage key tracking which delivered gifts the receiver has
// already opened. Used to fire the GiftRevealOverlay only on the
// first visit. Comma-separated set of cuid ids; small enough to
// stay well under the localStorage budget for the lifetime of an
// account. Stable namespace (`qift.*`) shared with the rest of the
// app's client-side persistence.
const GIFT_OPENED_KEY = 'qift.giftOpenedIds'

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
  return PALETTE[(id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % PALETTE.length]
}

// Sender-side fulfilment narration. Maps the underlying gift status
// to a human sentence the sender reads on the gift detail page —
// "Recipient confirmed", "Being prepared", "Handed to shipping",
// "Delivered". The address itself is never on the wire for senders
// (see applyAddressPrivacy on the backend), so this row is the
// sender's only fulfilment signal. Defaults to the confirmed copy
// for the two pre-merchant statuses; falls back to the generic
// "in progress" for anything we don't recognise.
function senderFulfilmentCopyKey(status: GiftStatus): string {
  switch (status) {
    case 'address_confirmed':
      return 'gifts.fulfilment_sender_address_confirmed'
    case 'default_address_used':
      return 'gifts.fulfilment_sender_default_used'
    case 'preparing':
      return 'gifts.fulfilment_sender_preparing'
    case 'shipped':
      return 'gifts.fulfilment_sender_shipped'
    case 'delivered':
      return 'gifts.fulfilment_sender_delivered'
    default:
      return 'gifts.fulfilment_confirmed_for_sender'
  }
}

// Color per fulfilment phase. Uses the shared status palette so the
// row visually agrees with the badge + timeline elsewhere on the
// page. Default green is a safe choice for the address-confirmed
// states (we WANT the sender to feel "this is moving").
function fulfilmentColorFor(status: GiftStatus): string {
  switch (status) {
    case 'preparing':
      return '#E89B3A'
    case 'shipped':
      return '#6366F1'
    case 'delivered':
      return '#3FA46A'
    default:
      return '#3FA46A'
  }
}

// Stitches the granular columns into a single human-readable line. Falls
// back to the legacy `details` blob when the granular fields are empty
// (older addresses created before the v2 schema).
function formatAddress(addr: ServerAddress): string {
  const parts = [
    addr.region,
    addr.governorate,
    addr.city,
    addr.district,
    addr.street,
    addr.buildingNumber && `#${addr.buildingNumber}`,
    addr.unitNumber && `(${addr.unitNumber})`,
    addr.postalCode,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return addr.details?.trim() || '—'
}

export default function GiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accessToken, userId, isAuthenticated } = useAuth()
  const [gift, setGift] = useState<ServerGift | null>(null)
  const [loading, setLoading] = useState(true)
  // Only the receiver-side confirm-address action sets this. Sender
  // self-cancel is no longer exposed (admin/support only — see
  // GiftsController), so 'cancel' is no longer a valid value.
  const [actionPending, setActionPending] = useState<'confirm' | null>(null)
  // One-shot acceptance flash. Set true the moment the receiver
  // confirms the address; cleared when the user dismisses the banner
  // or after a 4s timeout. Adds a brief celebratory beat that the
  // toast alone wasn't carrying.
  const [acceptanceFlash, setAcceptanceFlash] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [addresses, setAddresses] = useState<ServerAddress[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [chosenAddressId, setChosenAddressId] = useState<string | null>(null)
  // Premium reveal overlay flag. Set true when the receiver lands on
  // a delivered gift they haven't acknowledged yet; cleared when the
  // overlay's `onClose` fires. We persist the acknowledgement to
  // localStorage so a refresh / second visit doesn't replay the
  // moment — opening a gift twice should feel like opening a
  // remembered card, not the first reveal again.
  //
  // The detection effect runs once we have a gift in state. We
  // intentionally drive it off React state (not directly off
  // localStorage in the render path) so the overlay mounts inside
  // the React tree and benefits from suspense / portals.
  const [revealOpen, setRevealOpen] = useState(false)
  // First-render emphasis flag for the message card. Set true the
  // moment the user taps "open" so the card animates in with the
  // bigger qift-reveal-pop entrance. Subsequent visits get the
  // calm qift-fade-in.
  const [messageEmphasised, setMessageEmphasised] = useState(false)

  useEffect(() => {
    if (isAuthenticated === false) router.replace('/login')
  }, [isAuthenticated, router])

  // Pull the gift detail every time the id or the access token changes.
  useEffect(() => {
    if (!accessToken || !id) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/gifts/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const data = (await res.json()) as ServerGift
        if (cancelled) return
        setGift(data)
        setLoading(false)
      } catch {
        if (cancelled) return
        setNotFound(true)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, id])

  // Pull the receiver's own address book once we know they're the receiver.
  // We only need this for the confirm-address picker — sender view never
  // sees the receiver's other addresses.
  useEffect(() => {
    if (!accessToken || !gift) return
    if (gift.receiverId !== userId) return
    if (gift.status !== 'pending_address') return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/addresses/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const list = (await res.json()) as ServerAddress[]
        if (cancelled) return
        setAddresses(list)
        const def = list.find((a) => a.isDefault) ?? list[0]
        if (def) setChosenAddressId(def.id)
      } catch {
        // Non-fatal — confirm with the default still works server-side.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, gift, userId])

  // First-open reveal detection. Mounts the overlay only when:
  //   - the gift is loaded
  //   - the viewer IS the receiver (senders never get the reveal)
  //   - status === 'delivered' (reveal moment is the delivery)
  //   - the receiver hasn't already acknowledged this gift id
  //   - messageVisible !== false (defense in depth: a stale response
  //     where the backend's reveal gate hasn't lifted shouldn't
  //     trigger the moment)
  // localStorage stores a comma-separated set under
  // `qift.giftOpenedIds`. Set is small (a power user might have
  // hundreds, but each id is ~25 chars so 500 ids is ~12KB —
  // comfortably under the 5MB localStorage budget).
  //
  // We schedule the setState through an async IIFE so the lint rule
  // ("setState synchronously in effect") is happy and we don't fire
  // a render cascade — same pattern used by lastStoreId hydration on
  // the stores page.
  useEffect(() => {
    if (!gift) return
    if (gift.receiverId !== userId) return
    if (gift.status !== 'delivered') return
    if (gift.messageVisible === false) return
    let cancelled = false
    void (async () => {
      try {
        const raw = window.localStorage.getItem(GIFT_OPENED_KEY) ?? ''
        const opened = new Set(raw.split(',').filter(Boolean))
        if (cancelled) return
        if (opened.has(gift.id)) return
        setRevealOpen(true)
      } catch {
        // localStorage blocked (private mode in some browsers) —
        // fall through and let the user see the regular layout.
        // Replaying the reveal on every visit would be more
        // annoying than missing it once.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gift, userId])

  const ackReveal = () => {
    setRevealOpen(false)
    setMessageEmphasised(true)
    if (!gift) return
    try {
      const raw = window.localStorage.getItem(GIFT_OPENED_KEY) ?? ''
      const opened = new Set(raw.split(',').filter(Boolean))
      opened.add(gift.id)
      window.localStorage.setItem(
        GIFT_OPENED_KEY,
        Array.from(opened).join(','),
      )
    } catch {
      // Same fallback as above — non-fatal.
    }
  }

  const onConfirmAddress = async () => {
    if (!gift || actionPending) return
    // Frontend pre-flight: when we know the store's coverage, never
    // submit an unsupported address. The picker UI also disables
    // the confirm button in this case, but the guard here is a
    // second layer for any path that bypasses it (e.g. keyboard
    // submit, programmatic). Backend MUST mirror this — see
    // lib/giftDelivery.ts BACKEND CONTRACT.
    const chosen = addresses.find((a) => a.id === chosenAddressId)
    if (chosen) {
      const elig = canDeliverTo(chosen, {
        deliveryZones: Array.isArray(gift.deliveryZones)
          ? gift.deliveryZones
          : null,
        storeCity: gift.storeCity ?? null,
        storeCountry: gift.storeCountry ?? null,
        isFastDelivery: gift.isFastDelivery ?? null,
        category: gift.category ?? null,
      })
      if (!elig.ok) {
        // Compose the coverage hint from the zone list when we
        // have one; fall back to the legacy single-city message
        // when only storeCity is known.
        const coverageHint =
          elig.reason === 'unsupported_city'
            ? formatCoverageList(
                elig.coveredCities.map((c) => ({
                  city: c,
                  districts: elig.coverageByCity[c] ?? [],
                })),
              ) || elig.storeCity
            : ''
        toast.show(
          coverageHint
            ? t('gifts.coverage_blocked_toast').replace('{city}', coverageHint)
            : t('gifts.coverage_blocked_generic'),
          { tone: 'error' },
        )
        return
      }
    }
    setActionPending('confirm')
    try {
      const res = await fetch(`${API_BASE}/gifts/${gift.id}/confirm-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        // If the receiver picked a non-default in the picker we send it;
        // otherwise the backend falls back to their default address.
        body: JSON.stringify(chosenAddressId ? { addressId: chosenAddressId } : {}),
      })
      if (!res.ok) {
        // Mirror the /gifts list error map so both surfaces speak the
        // same language when the same backend rule trips.
        const data = (await res.json().catch(() => null)) as {
          code?: string
          message?: string | string[]
        } | null
        const code = typeof data?.code === 'string' ? data.code : null
        const raw = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message ?? ''
        const message = typeof raw === 'string' ? raw : ''
        // Stable code first (the backend should grow these for
        // every guard); legacy substring matches stay as a
        // fallback for older API versions.
        if (code === 'address_unsupported_for_store') {
          // Surface the same coverage message the picker shows.
          // The backend can also include `storeCity` in the body;
          // when it doesn't we fall back to whatever the gift
          // response had (or a generic line).
          const cityHint =
            (data as { storeCity?: string } | null)?.storeCity ??
            gift.storeCity ??
            ''
          toast.show(
            cityHint
              ? t('gifts.coverage_blocked_toast').replace('{city}', cityHint)
              : t('gifts.coverage_blocked_generic'),
            { tone: 'error' },
          )
          return
        }
        if (
          message.includes('العنوان غير موجود') ||
          message.includes('لا يخصك')
        ) {
          toast.show(t('gifts.confirm_address_not_yours'), { tone: 'error' })
        } else if (message.includes('عنوان افتراضي')) {
          toast.show(t('gifts.confirm_no_default_address'), { tone: 'error' })
        } else if (res.status >= 500) {
          toast.show(t('gifts.confirm_server_error'), { tone: 'error' })
        } else {
          toast.show(t('gifts.confirm_failed'), { tone: 'error' })
        }
        return
      }
      const updated = (await res.json()) as ServerGift
      setGift(updated)
      setPickerOpen(false)
      toast.show(t('toast.gift_address_confirmed'))
      // Brief celebratory banner under the timeline. Auto-dismisses
      // after 4s so it doesn't linger; the toast handles the
      // immediate acknowledgement.
      setAcceptanceFlash(true)
      setTimeout(() => setAcceptanceFlash(false), 4000)
    } catch {
      // Network-level: distinct copy ("connection failed") so the user
      // doesn't try to re-confirm assuming the gift state is the issue.
      toast.show(t('gifts.confirm_network_error'), { tone: 'error' })
    } finally {
      setActionPending(null)
    }
  }

  // Sender-facing cancel was deliberately removed.
  //
  // Once the gift is paid the sender cannot cancel it through the
  // app. Cancellation is admin / support only — see the matching
  // comment on the backend GiftsController where the route is
  // disabled. The `cancelled` status itself stays in the state
  // machine so an admin path can reach it later.

  if (loading) return <DetailSkeleton />
  if (notFound || !gift) return <NotFoundView />

  const direction: 'received' | 'sent' =
    gift.receiverId === userId ? 'received' : 'sent'
  const [a, b] = gradientFor(gift.id).split(',')
  const senderHidden = gift.isAnonymous && direction === 'received'
  const senderName = senderHidden
    ? t('gifts.anonymous_sender')
    : gift.sender?.fullName?.trim() || gift.sender?.qiftUsername || '—'
  const senderHandle = senderHidden ? '' : gift.sender?.qiftUsername || ''
  const receiverName =
    gift.receiver?.fullName?.trim() || gift.receiver?.qiftUsername || '—'
  const receiverHandle = gift.receiver?.qiftUsername || ''
  const statusColor = colorForStatus(gift.status)
  const formattedDate = new Date(gift.createdAt).toLocaleString('ar-SA')

  // Per-address delivery eligibility map for the receiver-side
  // address picker. Memoised against the addresses array + the
  // gift's coverage fields so the eligibility chips don't recompute
  // on every render. The map is keyed by address.id; an address
  // present in `addresses` but absent from the map means we skipped
  // the check (no granular store coverage) — the picker treats
  // those as ok-with-unknown-coverage.
  const explicitZones = Array.isArray(gift.deliveryZones)
    ? gift.deliveryZones
    : null
  const storeContext = {
    deliveryZones: explicitZones,
    storeCity: gift.storeCity ?? null,
    storeCountry: gift.storeCountry ?? null,
    isFastDelivery: gift.isFastDelivery ?? null,
    category: gift.category ?? null,
  }
  const eligibilityByAddress: Record<string, Eligibility> = {}
  for (const addr of addresses) {
    eligibilityByAddress[addr.id] = canDeliverTo(addr, storeContext)
  }
  const chosenEligibility: Eligibility | null = chosenAddressId
    ? eligibilityByAddress[chosenAddressId] ?? null
    : null
  // True when the gift's product is time-sensitive AND we have
  // some coverage data (explicit zones or legacy storeCity). This
  // is the ONLY case where the picker enforces coverage —
  // otherwise the original "let any address through" behaviour
  // stands and legacy gifts continue to work.
  const hasCoverageData =
    (explicitZones && explicitZones.length > 0) || !!gift.storeCity
  const coverageEnforced =
    direction === 'received' &&
    gift.status === 'pending_address' &&
    hasCoverageData &&
    (storeContext.isFastDelivery === true ||
      (typeof storeContext.category === 'string' &&
        storeContext.category.length > 0))
  // Pretty-printed coverage line for the banner above the picker.
  // Reads "الرياض (العليا، الملقا)، جدة" when zones are explicit,
  // or just "الرياض" when only the legacy single city is known.
  // Empty when no coverage data is available.
  const coverageDisplay =
    explicitZones && explicitZones.length > 0
      ? formatCoverageList(explicitZones)
      : (gift.storeCity ?? '').trim()
  // Confirm button is disabled when either no address is chosen
  // (legacy: handled by the existing flow), the action is in-flight,
  // or the chosen address is ineligible. We surface a per-row chip
  // for the third case so the user understands why.
  const confirmBlocked =
    coverageEnforced && !!chosenEligibility && !chosenEligibility.ok

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <Link
          href="/gifts"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--text-soft)' }}
        >
          <span aria-hidden>←</span>
          {t('gifts.detail_back')}
        </Link>

        <div className="mt-4 flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M20 12v9H4v-9" />
              <path d="M2 7h20v5H2z" />
              <path d="M12 22V7" />
              <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
              <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <Badge>
              <span className="flex items-center gap-1.5">
                <StatusDot color={statusColor} />
                {/* Audience-aware copy. Sender sees "Waiting for
                    recipient" while receiver sees "Action needed". */}
                {t(statusCopyKey(gift.status, direction))}
              </span>
            </Badge>
            <PageHeading
              line1={t('gifts.detail_title_1')}
              gradient={t('gifts.detail_title_2')}
              size="sm"
            />
          </div>
        </div>

        {/* Vertical tracking timeline. Five steps; "address" collapses both
            address_confirmed and default_address_used into one node. */}
        <SectionHeader>{t('gifts.tracking_title')}</SectionHeader>
        <Card className="mt-2">
          <ol className="flex flex-col">
            {TIMELINE_STEPS.map((step, i) => (
              <TimelineStep
                key={step}
                step={step}
                isLast={i === TIMELINE_STEPS.length - 1}
                state={timelineStateFor(step, gift.status)}
                gift={gift}
              />
            ))}
          </ol>
          {/* Structured shipment timeline. Renders only when the
              merchant created a Shipment via /store/orders/:id/
              shipment*; falls back below to the legacy
              tracking# card when absent. */}
          {gift.shipment && (
            <ShipmentTimelineCard shipment={gift.shipment} />
          )}
          {!gift.shipment && (gift.trackingNumber || gift.carrier) && (
            <div
              className="mt-4 rounded-2xl border p-3 text-[0.78rem]"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
              }}
            >
              {gift.carrier && (
                <p className="font-medium" style={{ color: 'var(--text)' }}>
                  {t('gifts.tracking_carrier')}: {gift.carrier}
                </p>
              )}
              {gift.trackingNumber && (
                <p
                  dir="ltr"
                  className="mt-1 font-mono text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('gifts.tracking_number')}: {gift.trackingNumber}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Cancellation banner — replaces the receiver action card and
            the sender cancel button when the gift is terminal. Reads
            differently for sender (you cancelled this) vs receiver
            (the sender cancelled this). */}
        {gift.status === 'cancelled' && (
          <div
            role="status"
            className="qift-fade-in mt-4 rounded-3xl border p-5 backdrop-blur-md"
            style={{
              borderColor: 'color-mix(in srgb, #D55B6E 40%, var(--border))',
              background:
                'linear-gradient(135deg, color-mix(in srgb, #D55B6E 12%, var(--card)) 0%, var(--card) 100%)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: '#D55B6E' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  className="text-[0.95rem] font-bold tracking-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {t(
                    direction === 'sent'
                      ? 'gifts.cancelled_sender_title'
                      : 'gifts.cancelled_receiver_title',
                  )}
                </h2>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {t(
                    direction === 'sent'
                      ? 'gifts.cancelled_sender_body'
                      : 'gifts.cancelled_receiver_body',
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Acceptance flash — receiver-side celebratory beat right
            after they confirm the address. Auto-dismisses; pairs with
            the toast so the moment lands emotionally. Only renders
            briefly, never on the sender side. */}
        {acceptanceFlash && direction === 'received' && (
          <div
            role="status"
            className="qift-fade-in mt-4 rounded-3xl border p-4 backdrop-blur-md"
            style={{
              borderColor:
                'color-mix(in srgb, #3FA46A 45%, var(--border))',
              background:
                'linear-gradient(135deg, color-mix(in srgb, #3FA46A 14%, var(--card)) 0%, var(--card) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: '#3FA46A' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-bold tracking-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {t('gifts.accepted_flash_title')}
                </p>
                <p
                  className="mt-0.5 text-[0.7rem]"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {t('gifts.accepted_flash_body')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Receiver action card — placed immediately under the timeline
            so it's the first thing the receiver sees when they land on
            the page during the pending_address phase. The previous
            placement (after the message card, near the page bottom)
            buried the most important call-to-action behind every other
            section. The picker + confirm button are inside this card so
            the user never has to scroll to act. */}
        {direction === 'received' && gift.status === 'pending_address' && (
          <div
            role="region"
            aria-labelledby="gift-action-required-title"
            className="qift-fade-in mt-4 rounded-3xl border p-5 backdrop-blur-md"
            style={{
              borderColor: 'color-mix(in srgb, var(--primary) 40%, var(--border))',
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
                  <path d="M12 21s-7-7-7-12a7 7 0 1114 0c0 5-7 12-7 12z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="gift-action-required-title"
                  className="text-[0.95rem] font-bold tracking-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {t('gifts.action_required_title')}
                </h2>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {t('gifts.action_required_body')}
                </p>
              </div>
            </div>

            {/* Coverage banner. Shows the store's full delivery
                coverage so the recipient knows BEFORE picking what
                this merchant can fulfil. When the store has
                explicit zones we render the pretty zone list
                ("الرياض (العليا، الملقا)، جدة"); otherwise we show
                the legacy single-city ("الرياض"). The store's
                coverage is public information — surfacing it here
                leaks nothing. */}
            {coverageEnforced && coverageDisplay && (
              <div
                role="note"
                className="mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--primary) 30%, var(--border))',
                  background: 'var(--card-soft)',
                }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      'color-mix(in srgb, var(--primary) 20%, transparent)',
                    color: 'var(--primary)',
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
                    <path d="M12 21s-7-7-7-12a7 7 0 1114 0c0 5-7 12-7 12z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </span>
                <p
                  className="min-w-0 flex-1 text-[0.72rem] leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    {t('gifts.coverage_label')}
                  </span>{' '}
                  <span style={{ color: 'var(--ink)' }}>
                    {coverageDisplay}
                  </span>
                </p>
              </div>
            )}

            {/* Address picker. Only renders when the receiver has more
                than one address — otherwise the only option IS the
                default and we skip straight to the button. */}
            {addresses.length > 1 && (
              <div
                className="mt-4 rounded-2xl border p-3"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card-soft)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold tracking-wide"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('gifts.delivery_address_label')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--primary)' }}
                  >
                    {pickerOpen
                      ? t('gifts.address_picker_close')
                      : t('gifts.address_picker_change')}
                  </button>
                </div>
                {pickerOpen ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {addresses.map((addr) => {
                      const active = addr.id === chosenAddressId
                      // Eligibility for this row. When coverage is
                      // not enforced (non-fast or unknown coverage)
                      // every address reads as "ok" and the chip
                      // doesn't render. Otherwise we surface a per-
                      // row reason chip and visually mute disabled
                      // rows so the user can't accidentally pick
                      // an undeliverable address.
                      const elig = eligibilityByAddress[addr.id]
                      const ineligible =
                        coverageEnforced && !!elig && !elig.ok
                      return (
                        <li key={addr.id}>
                          <button
                            type="button"
                            onClick={() => setChosenAddressId(addr.id)}
                            // Ineligible rows are still tappable so
                            // the user can read the row's full
                            // detail (label + address line). The
                            // confirm button below blocks the
                            // submit when an ineligible row is
                            // selected; the per-row chip explains
                            // why the address won't work.
                            aria-disabled={ineligible || undefined}
                            className="flex w-full items-start gap-3 rounded-xl border p-3 text-start transition-colors"
                            style={{
                              borderColor: active
                                ? ineligible
                                  ? '#D55B6E'
                                  : 'var(--primary)'
                                : 'var(--border)',
                              background: active
                                ? ineligible
                                  ? 'rgba(220, 90, 110, 0.10)'
                                  : 'var(--ring)'
                                : 'var(--card)',
                              opacity: ineligible ? 0.78 : 1,
                            }}
                          >
                            <span
                              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                              style={{
                                borderColor: active
                                  ? ineligible
                                    ? '#D55B6E'
                                    : 'var(--primary)'
                                  : 'var(--border-strong)',
                                background: active
                                  ? ineligible
                                    ? '#D55B6E'
                                    : 'var(--primary)'
                                  : 'transparent',
                              }}
                            >
                              {active && (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className="flex items-center gap-2 text-xs font-semibold"
                                style={{ color: 'var(--ink)' }}
                              >
                                <span className="truncate">
                                  {addr.label || t('gifts.address_unlabeled')}
                                </span>
                                {addr.isDefault && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[0.55rem] tracking-wider"
                                    style={{
                                      background: 'var(--ring)',
                                      color: 'var(--primary)',
                                    }}
                                  >
                                    {t('settings.address_default')}
                                  </span>
                                )}
                                {ineligible && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider"
                                    style={{
                                      background:
                                        'rgba(220, 90, 110, 0.12)',
                                      color: '#D55B6E',
                                    }}
                                  >
                                    {t('gifts.coverage_chip_unavailable')}
                                  </span>
                                )}
                              </span>
                              <span
                                className="mt-1 block text-[0.7rem] leading-relaxed"
                                style={{ color: 'var(--muted)' }}
                              >
                                {formatAddress(addr)}
                              </span>
                              {ineligible && elig && !elig.ok && (
                                <span
                                  className="mt-1.5 block text-[0.7rem] leading-relaxed"
                                  style={{ color: '#D55B6E' }}
                                >
                                  {elig.reason === 'missing_city'
                                    ? t('gifts.coverage_address_missing_city')
                                    : t(
                                        'gifts.coverage_blocked_inline',
                                      ).replace(
                                        '{city}',
                                        formatCoverageList(
                                          elig.coveredCities.map((c) => ({
                                            city: c,
                                            districts:
                                              elig.coverageByCity[c] ?? [],
                                          })),
                                        ) || elig.storeCity,
                                      )}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {addresses.find((addr) => addr.id === chosenAddressId)
                      ? formatAddress(
                          addresses.find((addr) => addr.id === chosenAddressId)!,
                        )
                      : t('gifts.address_using_default')}
                  </p>
                )}
              </div>
            )}

            {/* Coverage block banner — only renders when the chosen
                address fails the eligibility check. Carries the
                same message as the per-row chip so the user reads
                it both inline (on the row) and as a primary
                explanation here. The CTA copy switches to "Add a
                supported address" so users know how to recover. */}
            {confirmBlocked && chosenEligibility && !chosenEligibility.ok && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor:
                    'color-mix(in srgb, #D55B6E 35%, var(--border))',
                  background:
                    'linear-gradient(135deg, rgba(220, 90, 110, 0.08) 0%, var(--card) 100%)',
                }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: '#D55B6E' }}
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
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                  </svg>
                </span>
                <p
                  className="min-w-0 flex-1 text-[0.72rem] leading-relaxed"
                  style={{ color: 'var(--text)' }}
                >
                  {chosenEligibility.reason === 'missing_city'
                    ? t('gifts.coverage_address_missing_city')
                    : t('gifts.coverage_blocked_full').replace(
                        '{city}',
                        formatCoverageList(
                          chosenEligibility.coveredCities.map((c) => ({
                            city: c,
                            districts:
                              chosenEligibility.coverageByCity[c] ?? [],
                          })),
                        ) || chosenEligibility.storeCity,
                      )}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => void onConfirmAddress()}
              disabled={actionPending !== null || confirmBlocked}
              className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow:
                  '0 10px 24px -10px color-mix(in srgb, var(--primary) 70%, transparent)',
              }}
            >
              {actionPending === 'confirm' ? (
                <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                t('gifts.confirm_address')
              )}
            </button>
            <p
              className="mt-2 text-center text-[0.7rem]"
              style={{ color: 'var(--muted)' }}
            >
              {t('gifts.confirm_address_hint')}
            </p>
            {/* When coverage is enforced, surface a one-line link to
                the address book so users with no supported address
                have an obvious recovery path (open Settings, add a
                Riyadh address, come back). The link goes through a
                router push so back-button returns to the gift. */}
            {confirmBlocked && (
              <Link
                href="/settings"
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors"
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--primary) 35%, var(--border))',
                  background: 'var(--card-soft)',
                  color: 'var(--primary)',
                }}
              >
                + {t('gifts.coverage_add_address_cta')}
              </Link>
            )}
          </div>
        )}

        {/* Sender cancel button intentionally absent. Once the gift is
            paid the buyer cannot cancel through the app — it's an
            admin / support operation. See the matching note in the
            backend GiftsController. */}

        {/* Surprise mystery banner — replaces the product/store rows
            when the receiver isn't allowed to see them yet. The card
            keeps the same visual frame so the page rhythm doesn't
            change between surprise and normal gifts. */}
        {gift.productVisible === false && (
          <Card className="mt-4">
            <SurpriseMysteryBlock />
          </Card>
        )}

        <SectionHeader>{t('gifts.detail_section_title')}</SectionHeader>
        <Card className="mt-2">
          {gift.productVisible === false ? (
            // Surprise placeholder rows. We intentionally render the
            // same row scaffolding (label + value) as the revealed
            // version so the card height doesn't jump on delivery —
            // just with masked values. Italic + softer color so the
            // placeholder reads as "intentional secret".
            <>
              <DetailRow
                label={t('gifts.detail_product')}
                value={t('gifts.mystery_title')}
                bold
                italic
              />
              <Divider />
              <DetailRow
                label={t('gifts.detail_store')}
                value={t('gifts.mystery_store')}
                italic
              />
              <Divider />
            </>
          ) : (
            <>
              <DetailRow label={t('gifts.detail_product')} value={gift.productName} bold />
              <Divider />
              <DetailRow label={t('gifts.detail_store')} value={gift.storeName} />
              <Divider />
            </>
          )}
          <DetailRow
            label={t('gifts.detail_sender')}
            value={senderName}
            hint={
              senderHidden
                ? t('gifts.anonymous_chip')
                : senderHandle
                ? `@${senderHandle}`
                : undefined
            }
            hintLtr
            anonymous={senderHidden}
          />
          <Divider />
          <DetailRow
            label={t('gifts.detail_receiver')}
            value={receiverName}
            hint={receiverHandle ? `@${receiverHandle}` : undefined}
            hintLtr
          />
          <Divider />
          <DetailRow
            label={t('gifts.detail_status')}
            value={t(statusCopyKey(gift.status, direction))}
            valueColor={statusColor}
          />
          <Divider />
          <DetailRow
            label={t('gifts.detail_date')}
            value={formattedDate}
          />
          {/* Delivery address is visible only to the recipient. The
              backend's applyAddressPrivacy mask strips both `address`
              and `addressId` from the sender's response, so by the
              time we get here the field is null on the sender side.
              The defensive `direction === 'received'` gate is a
              second layer in case a future API change leaks the
              field — better to render nothing than to surface street/
              building/phone to the sender by accident. */}
          {direction === 'received' && gift.address && (
            <>
              <Divider />
              <DetailRow
                label={t('gifts.detail_address')}
                value={formatAddress(gift.address)}
                hint={
                  gift.address.deliveryPhone
                    ? `📞 ${gift.address.deliveryPhone}`
                    : undefined
                }
                hintLtr
              />
            </>
          )}
          {/* Sender-side fulfilment status. Replaces the hidden address
              row with safe, address-free copy that walks the sender
              through the merchant handoff: recipient confirmed →
              preparing → shipped → delivered. The address itself is
              never on the wire (applyAddressPrivacy strips it on the
              backend). */}
          {direction === 'sent' && gift.addressConfirmed && (
            <>
              <Divider />
              <DetailRow
                label={t('gifts.detail_fulfilment')}
                value={t(senderFulfilmentCopyKey(gift.status))}
                valueColor={fulfilmentColorFor(gift.status)}
              />
            </>
          )}
        </Card>

        {/* Message reveal card.
            Sender always sees what they wrote. Receiver sees:
              - the locked placeholder before delivery
              - the premium RevealedMessageCard once the backend's
                reveal gate lifts (messageVisible === true)
            The locked state stays inline (LockedMessageCard below)
            because it doesn't need media or the lightbox; the
            revealed state delegates to RevealedMessageCard which
            handles fullscreen media + signature typography. */}
        <SectionHeader>{t('gifts.detail_message')}</SectionHeader>
        {gift.messageVisible === false ? (
          <LockedMessageCard />
        ) : (
          <RevealedMessageCard
            message={gift.messageText ?? gift.message ?? ''}
            mediaUrl={gift.mediaUrl ?? null}
            mediaType={gift.mediaType ?? null}
            senderName={senderName}
            senderHandle={senderHandle}
            anonymous={senderHidden}
            // Bump up the entry animation only on the first
            // post-reveal render (right after the overlay
            // dismisses). Subsequent visits land calm.
            emphasised={messageEmphasised}
          />
        )}

        {/* Note: the receiver address-confirm block used to live here.
            It was promoted to immediately under the timeline (see above)
            so the receiver lands on the page and sees the call-to-action
            without scrolling past the message + details. */}

        {/* V1 gift-post publish CTA — sender-side only. The receiver-side
            entry point is a future surface (the component accepts
            `direction` but the parent gates the render today). The card
            is self-contained: it queries the GiftPost row, renders
            "Share" vs "Copy link" + "Unpublish", and is a no-op until
            the gift reaches `address_confirmed` (the surprise reveal
            shouldn't be spoiled by a pre-delivery share). */}
        {direction === 'sent' && gift.status !== 'cancelled' && (
          <GiftPostPublishCard
            giftId={gift.id}
            direction="sent"
            giftStatus={gift.status}
          />
        )}
      </section>

      {/* Premium first-open reveal. Mounts only on first visit to a
          delivered gift the receiver hasn't acknowledged yet (see
          GIFT_OPENED_KEY effect above). The overlay stops body scroll
          and traps focus while open; ackReveal persists the
          acknowledgement so refreshes don't replay the moment. */}
      {revealOpen && <GiftRevealOverlay onClose={ackReveal} />}
    </PageContainer>
  )
}

// --- Tracking timeline ---

function TimelineStep({
  step,
  isLast,
  state,
  gift,
}: {
  step: TimelineKey
  isLast: boolean
  state: TimelineState
  gift: ServerGift
}) {
  const { t } = useI18n()
  const { titleKey, timestamp } = stepLabel(step, gift)
  // Color palette:
  //   completed → green dot, full connector
  //   current   → primary (highlighted) with a pulsing ring, dashed connector
  //   upcoming  → grey
  const baseColor =
    state === 'completed'
      ? '#3FA46A'
      : state === 'current'
        ? 'var(--primary)'
        : 'var(--border-strong)'
  const labelColor =
    state === 'upcoming' ? 'var(--muted)' : 'var(--ink)'

  return (
    <li className="relative flex gap-3 ps-1">
      {/* Vertical connector line drawn behind the dot. We hide it on the
          last step so the timeline ends cleanly. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-6 bottom-0 w-px"
          style={{
            insetInlineStart: '0.69rem',
            background:
              state === 'completed'
                ? '#3FA46A'
                : state === 'current'
                  ? 'linear-gradient(180deg, var(--primary), var(--border))'
                  : 'var(--hairline)',
          }}
        />
      )}
      <span
        aria-hidden
        // `qift-pulse-ring` adds a soft, infinite primary halo around the
        // current step so the user's eye lands on it instantly. Only
        // applied to the "current" state so completed/upcoming dots stay
        // calm.
        className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state === 'current' ? 'qift-pulse-ring' : ''}`}
        style={{
          background:
            state === 'completed'
              ? '#3FA46A'
              : state === 'current'
                ? 'var(--primary)'
                : 'var(--card-soft)',
          color: state === 'upcoming' ? 'var(--muted)' : '#fff',
          border:
            state === 'upcoming'
              ? '1.5px dashed var(--border-strong)'
              : 'none',
          boxShadow:
            state === 'current'
              ? '0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)'
              : undefined,
        }}
      >
        {state === 'completed' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: baseColor }}
          />
        )}
      </span>
      <div className="min-w-0 flex-1 pb-5">
        <p
          className="text-[0.82rem] font-semibold tracking-tight"
          style={{ color: labelColor }}
        >
          {t(titleKey)}
        </p>
        <p
          className="mt-0.5 text-[0.7rem]"
          style={{ color: 'var(--muted)' }}
        >
          {timestamp ? new Date(timestamp).toLocaleString('ar-SA') : '—'}
        </p>
      </div>
    </li>
  )
}

// Pick the right label + timestamp for each timeline node based on the
// gift's actual status. The "address" step has two possible labels.
function stepLabel(
  step: TimelineKey,
  gift: ServerGift,
): { titleKey: string; timestamp: string | null | undefined } {
  switch (step) {
    case 'created':
      return { titleKey: 'gifts.timeline_created', timestamp: gift.createdAt }
    case 'address':
      return {
        titleKey:
          gift.status === 'default_address_used'
            ? 'gifts.timeline_address_default'
            : 'gifts.timeline_address_confirmed',
        timestamp: gift.confirmedAt,
      }
    case 'preparing':
      return {
        titleKey: 'gifts.timeline_preparing',
        // No dedicated `preparingAt` column; show the confirmation
        // timestamp as a soft "started after" hint when we're past it.
        timestamp: null,
      }
    case 'shipped':
      return { titleKey: 'gifts.timeline_shipped', timestamp: gift.shippedAt }
    case 'delivered':
      return {
        titleKey: 'gifts.timeline_delivered',
        timestamp: gift.deliveredAt,
      }
  }
}

// --- Locked-message card ---
//
// Pre-delivery placeholder shown to the receiver. Stays
// intentionally generic — never hints at whether the gift carries
// media, never leaks the caption length. The same icon and copy
// renders for every locked gift so the surprise lives entirely in
// the post-delivery reveal (handled by RevealedMessageCard +
// GiftRevealOverlay).
function LockedMessageCard() {
  const { t } = useI18n()
  return (
    <div
      className="qift-fade-in mt-4 overflow-hidden rounded-3xl border text-center"
      style={{
        borderColor: 'var(--border)',
        background:
          'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 18%, transparent) 0%, transparent 60%), var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="px-6 pt-7 pb-6">
        <span
          aria-hidden
          className="qift-bob mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow:
              '0 12px 28px -10px color-mix(in srgb, var(--primary) 60%, transparent)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M20 12v9H4v-9" />
            <path d="M2 7h20v5H2z" />
            <path d="M12 22V7" />
            <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
          </svg>
        </span>
        <p
          className="mt-4 text-base font-extrabold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('gifts.message_locked_until_delivery')}
        </p>
        <p
          className="mt-1.5 text-xs leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('gifts.message_locked_body')}
        </p>
      </div>
      {/* Subtle hairline ribbon footer — visual flourish that reads as
          "wrapped gift" without hinting at the contents. */}
      <div
        aria-hidden
        className="h-1 w-full"
        style={{
          background:
            'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)',
          opacity: 0.6,
        }}
      />
    </div>
  )
}

// Page-level section heading. Renders ABOVE a Card (not inside) so the
// page reads as a sequence of named sections (تتبّع الهدية → تفاصيل
// الهدية → الرسالة) instead of a stack of unlabeled cards. Slightly
// larger + warmer than the in-card SectionTitle so the hierarchy is
// unambiguous: page heading → section header → in-card title.
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-6 px-1 text-[0.78rem] font-bold uppercase tracking-[0.18em]"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </h2>
  )
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
    />
  )
}

function DetailRow({
  label,
  value,
  hint,
  hintLtr,
  bold,
  muted,
  valueColor,
  anonymous,
  italic,
}: {
  label: string
  value: string
  hint?: string
  hintLtr?: boolean
  bold?: boolean
  muted?: boolean
  valueColor?: string
  anonymous?: boolean
  // Generic italic toggle. `anonymous` already implies italic for the
  // anonymous-sender row; this prop is the same visual treatment for
  // any other "intentionally placeholder" value (e.g. surprise mystery
  // rows) without overloading the `anonymous` flag's semantics.
  italic?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span
        className="text-xs font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </span>
      <div className="flex flex-col items-end text-end">
        <span
          className={bold ? 'text-sm font-bold' : 'text-sm font-medium'}
          style={{
            color: valueColor ?? (muted ? 'var(--muted-2)' : 'var(--ink)'),
            fontStyle: anonymous || italic ? 'italic' : undefined,
          }}
        >
          {value}
        </span>
        {hint && (
          <span
            dir={hintLtr ? 'ltr' : undefined}
            className="mt-0.5 text-[0.65rem]"
            style={{ color: 'var(--muted)' }}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div
      className="h-px w-full"
      style={{ background: 'var(--hairline)' }}
    />
  )
}

// Banner shown above the (masked) detail rows when the gift is a
// surprise. Visually distinct from the locked-message card — uses the
// gift icon + a "wrapped" gradient bar so the receiver reads it as
// "your sender intentionally hid this" rather than "data is missing".
//
// We render this as a sibling of the detail-rows Card (rather than
// inside it) so the page layout stays consistent across the
// surprise/normal split — same Card spacing, same divider rhythm.
function SurpriseMysteryBlock() {
  const { t } = useI18n()
  return (
    <div className="qift-fade-in -mx-4 -my-2 flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--card)) 0%, var(--card) 100%)',
      }}
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow:
            '0 8px 22px -8px color-mix(in srgb, var(--primary) 60%, transparent)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('gifts.surprise_banner_title')}
        </p>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('gifts.surprise_banner_body')}
        </p>
      </div>
    </div>
  )
}

// Read-only shipment timeline rendered on the gift detail page
// for both sender + receiver. Replaces the older 2-line
// trackingNumber + carrier card with a structured timeline so
// the buyer/receiver can see where the package actually is.
// Provider + tracking deep-link to the courier's public
// tracking page (template lives on the backend's provider
// catalog; null when no public page exists for that provider).
//
// PRIVACY: identical projection to what the merchant sees on
// their own shipment manager. No recipient address detail; the
// merchant's free-text event note is operational, not buyer-
// to-receiver content.
function ShipmentTimelineCard({
  shipment,
}: {
  shipment: NonNullable<ServerGift['shipment']>
}) {
  const { t } = useI18n()
  return (
    <section
      className="mt-4 rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="text-[0.85rem] font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('gifts.shipment_section_title')}
          </h3>
          <p
            className="mt-0.5 text-[0.7rem]"
            style={{ color: 'var(--muted)' }}
          >
            {t(`gifts.shipment_provider_${shipment.provider}`) ||
              shipment.provider}
            {' · '}
            {t(`gifts.shipment_status_${shipment.status}`)}
          </p>
        </div>
        {shipment.trackingNumber && (
          <span
            dir="ltr"
            className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.65rem]"
            style={{
              borderColor: 'var(--hairline)',
              background: 'var(--card)',
              color: 'var(--text-soft)',
            }}
          >
            {shipment.trackingNumber}
          </span>
        )}
      </header>

      {shipment.trackingUrl && (
        <a
          href={shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[0.72rem] font-semibold underline-offset-4 hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          {t('gifts.shipment_open_tracking')}
          <span aria-hidden>↗</span>
        </a>
      )}

      {shipment.events.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5">
          {shipment.events.map((ev, i) => (
            <li
              key={`${ev.occurredAt}-${i}`}
              className="rounded-xl border px-3 py-1.5 text-[0.72rem]"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card)',
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <strong
                  className="font-bold"
                  style={{ color: 'var(--ink)' }}
                >
                  {t(`gifts.shipment_status_${ev.status}`)}
                </strong>
                <span
                  className="text-[0.65rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {new Date(ev.occurredAt).toLocaleString()}
                </span>
              </div>
              {ev.note && (
                <p
                  className="mt-0.5 leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {ev.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function DetailSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 flex items-start gap-4">
          <Skeleton className="h-16 w-16" rounded="2xl" />
          <div className="flex-1">
            <Skeleton className="h-6 w-20" rounded="full" />
            <Skeleton className="mt-3 h-7 w-2/3" />
            <Skeleton className="mt-2 h-7 w-1/2" />
          </div>
        </div>
        <Skeleton className="mt-5 h-72 w-full" rounded="3xl" />
      </section>
    </PageContainer>
  )
}

function NotFoundView() {
  const { t } = useI18n()
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Card>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('gifts.detail_not_found')}
          </p>
          <Link
            href="/gifts"
            className="mt-4 inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-medium"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            {t('gifts.detail_back')}
          </Link>
        </Card>
      </section>
    </PageContainer>
  )
}
