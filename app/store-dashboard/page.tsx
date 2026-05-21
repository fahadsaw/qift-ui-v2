'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { homeForRole, roleOf } from '@/lib/roleHome'
import { colorForStatus } from '@/lib/giftStatus'
import {
  connectIntegration,
  getOwnerStore,
  listMyStores,
  listShippingProviders,
  submitStoreForReview,
  syncProducts,
  type ApiStore,
  type IntegrationStatus,
  type IntegrationType,
  type OwnerStore,
  type ShippingProvider,
} from '@/lib/storesApi'
import ProductModal from '@/components/ProductModal'
import OrderShipmentModal from '@/components/OrderShipmentModal'
import { planHas } from '@/lib/merchantPlans'
import type {
  ActionInFlight,
  ActionKind,
  DashboardStatus,
  StoreOrder,
} from './_types'
import { OpsSummary } from './_sections/OpsSummary'
import { QuickLinksGrid } from './_sections/QuickLinksGrid'

// BACKEND CONTRACT (merchant order pipeline — read this first when
// debugging "merchant doesn't see an order they should see").
//
// 1. /checkout posts `storeId` to POST /orders ONLY when the
//    buyer came from a real /stores/[id] (cuid). Sample-store
//    flows leave storeId off — that's intentional, those gifts
//    aren't owned by any merchant.
//    See app/checkout/page.tsx body assembly + the [storeIdRef
//    missing] console warning below.
//
// 2. The backend MUST persist Order.storeId AND propagate it to
//    Gift.storeId at payment-confirm time. /store/orders queries
//    by `Gift.storeId IN (mystoreids)` — without that linkage
//    the order is invisible to the merchant who fulfilled it.
//
// 3. /store/orders MUST return rows in `pending_address` status.
//    Operationally the merchant needs to see incoming orders
//    immediately — even before the recipient picks an address —
//    so they can plan capacity. The address columns can be null
//    for these rows; the dashboard renders an "awaiting
//    recipient" hint instead of an address. The merchant can't
//    advance these to `preparing` until the recipient confirms;
//    that's enforced by the existing transition graph.
//
// 4. /store/orders SHOULD include the lifecycle terminal state
//    `cancelled` for a short window so the merchant sees the
//    cancelled row before it drops off the list. Today the
//    backend silently filters terminal rows; surfacing them with
//    a red badge is a small UX win.
//
// Until the backend ships (3) and (4) the dashboard's
// type narrowing is a no-op (the array is just empty for those
// statuses) — no rendering breaks, no runtime errors.

// --- Types & helpers ---

// What the merchant dashboard renders.
//
// Operationally there are two phases for a paid gift:
//   1. PRE-CONFIRMATION
//      `pending_address` — the gift exists, payment cleared, and
//      the merchant is owed the order. The recipient hasn't picked
//      a delivery address yet. The merchant can SEE the row but
//      can't act on it (no address means no shipment) — surfacing
//      it gives the merchant visibility into incoming volume
//      without letting them act prematurely.
//   2. ACTIONABLE
//      `address_confirmed` / `default_address_used` / `preparing`
//      / `shipped` / `delivered` — the recipient has resolved the
//      address (either explicitly or via the 24h auto-default)
//      and the merchant can move the order through the
//      preparation → shipping → delivery pipeline.
//
// Plus `cancelled` as a terminal red badge so the merchant sees a
// short-lived "this was cancelled" row before /store/orders drops
// it on the next refresh.
//
// BACKEND CONTRACT
// /store/orders MUST return rows in `pending_address` status too
// (with their address fields nulled out — the recipient hasn't
// chosen yet). Until the backend ships that, this type narrowing
// is a no-op (the array is just empty for that status) but the
// rendering path is ready.
// Types (DashboardStatus, StoreOrder, ActionKind, ActionInFlight)
// moved to ./_types.ts. OpsSummary + QuickLinksGrid sections moved
// to ./_sections/*.

// What's the next valid step for a given status. Mirrors the backend
// transition graph one-for-one — never let the UI offer something the
// server would reject.
//
// `pending_address` and `cancelled` are visible-only — no action
// available. The merchant can SEE these rows but can't move them
// through the pipeline. For `pending_address` we render an
// "awaiting recipient" hint instead of action buttons; for
// `cancelled` we render a red terminal badge.
const NEXT_ACTION: Record<DashboardStatus, ActionKind | null> = {
  pending_address: null,
  address_confirmed: 'prepare',
  default_address_used: 'prepare',
  preparing: 'ship',
  shipped: 'deliver',
  delivered: null,
  cancelled: null,
}

// --- Page ---

export default function StoreDashboardPage() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const ready = useSimulatedReady(300)
  const { accessToken, isAuthenticated, user } = useAuth()
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [myStores, setMyStores] = useState<ApiStore[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<ActionInFlight | null>(null)
  const [forbidden, setForbidden] = useState(false)
  // Modal state for "+ إضافة منتج"
  const [productModalStoreId, setProductModalStoreId] = useState<string | null>(
    null,
  )
  // Currently-open order details modal. Stores the full row so the modal
  // can render even after `orders` is mutated underneath it (e.g. a
  // status change that happens while the modal is open).
  const [detailsOrder, setDetailsOrder] = useState<StoreOrder | null>(null)
  const [shipmentOrderId, setShipmentOrderId] = useState<string | null>(null)
  const [shippingProviders, setShippingProviders] = useState<
    ShippingProvider[]
  >([])

  // Lazy-load the shipping provider catalog the first time the
  // merchant opens the shipment manager. Cached for the rest of
  // the session — providers don't change between page views.
  useEffect(() => {
    if (!accessToken || shippingProviders.length > 0) return
    let cancelled = false
    void (async () => {
      const list = await listShippingProviders(accessToken)
      if (!cancelled) setShippingProviders(list)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, shippingProviders.length])

  const refresh = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const stores = await listMyStores(accessToken)
      setMyStores(stores)
      const res = await fetch(`${API_BASE}/store/orders`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.status === 403) {
        setForbidden(true)
        setOrders([])
        return
      }
      if (!res.ok) throw new Error('list_failed')
      const list = (await res.json()) as StoreOrder[]
      setOrders(Array.isArray(list) ? list : [])
      setForbidden(false)
    } catch {
      // leave existing list intact on transient failure
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login')
  }, [ready, isAuthenticated, router])

  // Role gate. /store-dashboard is the merchant operational hub.
  // A regular-role user who URL-hops in would otherwise see the
  // "Create your store" empty-state CTA — exactly the role-mixing
  // regression the QA audit flagged. Admins are allowed through
  // (legitimate QA / oversight use). Non-merchants get bounced to
  // their canonical home — same pattern /admin uses for non-admins.
  useEffect(() => {
    if (!ready || !isAuthenticated || !user) return
    const role = roleOf(user)
    if (role !== 'store' && role !== 'admin') {
      router.replace(homeForRole(role))
    }
  }, [ready, isAuthenticated, user, router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (accessToken) void refresh()
  }, [accessToken, refresh])

  // Live-feed feel: refresh whenever the merchant returns to the
  // tab (visibilitychange) and on a 30s background poll while the
  // page is active. This is a frontend-only "near-realtime" until
  // the backend ships SSE / websockets — orders that arrive
  // mid-session show up without a manual refresh, and a merchant
  // who tabs back from another app immediately sees the latest
  // state instead of a stale list.
  //
  // We skip the poll when the tab is hidden (browsers throttle
  // setInterval to ~1/min anyway) so we don't waste battery on a
  // backgrounded merchant browser. The visibility listener picks
  // them up the moment they come back.
  useEffect(() => {
    if (!accessToken) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(intervalId)
    }
  }, [accessToken, refresh])

  const callAction = async (order: StoreOrder, kind: ActionKind) => {
    if (pending) return
    if (NEXT_ACTION[order.status] !== kind) {
      toast.show(t('store.toast_invalid_state'), { tone: 'error' })
      return
    }
    setPending({ id: order.giftId, kind })

    const previous = orders
    if (kind === 'prepare') {
      setOrders((list) =>
        list.map((o) =>
          o.giftId === order.giftId
            ? { ...o, status: 'preparing' as const }
            : o,
        ),
      )
    } else if (kind === 'ship') {
      setOrders((list) =>
        list.map((o) =>
          o.giftId === order.giftId
            ? {
                ...o,
                status: 'shipped' as const,
                shippedAt: new Date().toISOString(),
              }
            : o,
        ),
      )
    } else {
      setOrders((list) => list.filter((o) => o.giftId !== order.giftId))
    }

    try {
      const path =
        kind === 'prepare'
          ? 'prepare'
          : kind === 'ship'
            ? 'ship'
            : 'delivered'
      const res = await fetch(`${API_BASE}/store/orders/${order.giftId}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error('action_failed')
      toast.show(
        kind === 'prepare'
          ? t('store.toast_preparing')
          : kind === 'ship'
            ? t('store.toast_shipped')
            : t('store.toast_delivered'),
      )
    } catch {
      setOrders(previous)
      toast.show(t('store.toast_action_failed'), { tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  // Skeleton covers: pre-ready, anonymous (will redirect to /login),
  // and non-merchant authenticated users (will redirect to their
  // role home). Without the role-aware case here, a regular user
  // could see the "Create your store" CTA flash during the redirect
  // — exactly the role-mixing regression the QA audit flagged.
  if (!ready || !isAuthenticated) return <DashboardSkeleton />
  const role = user ? roleOf(user) : 'user'
  if (role !== 'store' && role !== 'admin') return <DashboardSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('store.badge')}</Badge>}
          line1={t('store.title_1')}
          gradient={t('store.title_2')}
          subtitle={t('store.subtitle')}
          size="sm"
        />

        {/* Empty-store hint: no /stores/me rows AND backend is forbidden
            ⇒ user has never registered a store. Surface the create CTA. */}
        {forbidden && myStores.length === 0 ? (
          <NoStoreView />
        ) : (
          <>
            {/* Alerts first. Pending-approval / changes-requested
                banner takes priority over everything below — the
                merchant can't fulfill orders until they're
                approved, so the call-to-action is the first
                surface they see. Approved stores skip this. */}
            {myStores.some(
              (s) =>
                s.status &&
                s.status !== 'approved' &&
                s.status !== 'suspended',
            ) && <PendingApprovalBanner stores={myStores} />}

            {/* Operational KPI strip. Counts derived from the live
                orders array — `address_confirmed` + `default_address_used`
                share the "queued" bucket because both mean "waiting on
                the merchant to start preparing". This is the
                operations heartbeat — every other section reads off
                these counts. */}
            <OpsSummary orders={orders} />

            {/* Orders queue. Promoted to the top of the dashboard:
                a merchant opens this page to act on incoming work,
                not to browse. Quick links + secondary surfaces sit
                below the queue so they're never in the way of
                taking action. */}
            <OrdersSection
              orders={orders}
              myStores={myStores}
              loading={loading}
              pending={pending}
              onAction={callAction}
              onOpenDetails={setDetailsOrder}
              onManageShipping={setShipmentOrderId}
              onRefresh={refresh}
            />

            {/* Quick links — Merchant OS hub. One row, four tiles:
                Coverage · Payouts · Plan · Add product. Replaces
                the old FastActions row + the three stacked cards
                (Coverage / Payouts / Plan). Tighter, scannable in
                one glance, all the merchant's secondary surfaces
                in a single block. */}
            {myStores.length > 0 && (
              <QuickLinksGrid
                firstStoreId={myStores[0]?.id ?? null}
                onAddProduct={() => {
                  if (myStores[0]) setProductModalStoreId(myStores[0].id)
                }}
                stores={myStores}
              />
            )}

            {/* My stores. Demoted to the bottom — once the merchant
                has approved stores, this becomes a config surface
                they only visit for integrations / disconnects, not
                their daily landing. */}
            {myStores.length > 0 && (
              <section className="mt-7">
                <h2
                  className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('store.my_stores_section')}
                </h2>
                <ul className="flex flex-col gap-3">
                  {myStores.map((s) => (
                    <StoreCard
                      key={s.id}
                      store={s}
                      onAddProduct={() => setProductModalStoreId(s.id)}
                      onChanged={() => void refresh()}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>

      {productModalStoreId && (
        <ProductModal
          storeId={productModalStoreId}
          onClose={() => setProductModalStoreId(null)}
          onSaved={() => {
            setProductModalStoreId(null)
            toast.show(t('store.product_created'))
            void refresh()
          }}
        />
      )}

      {detailsOrder && (
        <OrderDetailsModal
          order={detailsOrder}
          onClose={() => setDetailsOrder(null)}
        />
      )}

      {shipmentOrderId && accessToken && (
        <OrderShipmentModal
          giftId={shipmentOrderId}
          accessToken={accessToken}
          providers={shippingProviders}
          onClose={() => setShipmentOrderId(null)}
          onSaved={() => void refresh()}
        />
      )}
    </PageContainer>
  )
}

// --- Store summary card with integration controls ---

function StoreCard({
  store,
  onAddProduct,
  onChanged,
}: {
  store: ApiStore
  onAddProduct: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null)

  const onConnect = async (type: IntegrationType) => {
    if (!accessToken || busy) return
    setBusy('connect')
    try {
      await connectIntegration(accessToken, {
        storeId: store.id,
        integrationType: type,
      })
      toast.show(
        type === 'none'
          ? t('store.integration_disconnected')
          : t('store.integration_connected'),
      )
      onChanged()
    } catch {
      toast.show(t('store.integration_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const onSync = async () => {
    if (!accessToken || busy) return
    setBusy('sync')
    try {
      const res = await syncProducts(accessToken, store.id)
      toast.show(
        `${t('store.sync_done')} (${res.syncedCount})`,
      )
      onChanged()
    } catch {
      toast.show(t('store.sync_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <li
      className="overflow-hidden rounded-3xl border backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {store.name}
          </h3>
          <p
            className="mt-0.5 text-[0.7rem]"
            style={{ color: 'var(--muted)' }}
          >
            {store.city}
            <span className="mx-1.5 opacity-50">·</span>
            {store.category}
          </p>
        </div>
        <IntegrationBadge status={store.integrationStatus} />
      </div>

      <div
        className="mt-3 border-t px-4 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="flex items-center gap-2">
          <p
            className="text-[0.7rem] font-semibold tracking-wide"
            style={{ color: 'var(--muted)' }}
          >
            {t('store.integration_section')}
          </p>
          {/* Plan-gate hint: api_integrations is a Pro+ capability.
              Buttons stay visible so merchants can see what the
              tier unlocks; clicks 403 server-side and surface the
              "needs Pro" toast. */}
          {!planHas(store.plan, 'api_integrations') && (
            <Link
              href="/store-dashboard/plan"
              className="rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] underline-offset-2 hover:underline"
              style={{
                borderColor:
                  'color-mix(in srgb, var(--primary) 30%, var(--border))',
                background:
                  'color-mix(in srgb, var(--primary) 12%, transparent)',
                color: 'var(--primary)',
              }}
            >
              {t('plan.available_on_pro')}
            </Link>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              busy !== null || !planHas(store.plan, 'api_integrations')
            }
            onClick={() => void onConnect('shopify')}
            className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--primary)',
            }}
          >
            {busy === 'connect'
              ? t('store.integration_connecting')
              : t('store.connect_official')}
          </button>
          <button
            type="button"
            disabled={
              busy !== null ||
              store.integrationStatus !== 'connected' ||
              !planHas(store.plan, 'api_integrations')
            }
            onClick={() => void onSync()}
            className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--primary)',
            }}
          >
            {busy === 'sync' ? t('store.syncing') : t('store.sync_products')}
          </button>
          {store.integrationStatus !== 'disconnected' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onConnect('none')}
              className="rounded-full border px-3 py-1.5 text-[0.7rem] font-medium transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('store.disconnect')}
            </button>
          )}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]">
          <Link
            href={`/stores/${store.id}`}
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.view_storefront')}
          </Link>
          <Link
            href={`/store-dashboard/products?storeId=${store.id}`}
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            {t('store.manage_products')}
          </Link>
          {/* Storefront theme + branding entry. Merchant identity
              surface — landed in Phase 5. Routes to /theme; the
              page itself handles multi-store selection via tabs. */}
          <Link
            href="/store-dashboard/theme"
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.manage_theme')}
          </Link>
          {/* Per-metric publicity opt-ins. Owner-private control
              over what the storefront exposes. */}
          <Link
            href="/store-dashboard/visibility"
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.manage_visibility')}
          </Link>
        </div>
        <button
          type="button"
          onClick={onAddProduct}
          className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          + {t('store.add_product')}
        </button>
      </div>
    </li>
  )
}

function IntegrationBadge({ status }: { status: IntegrationStatus }) {
  const { t } = useI18n()
  const palette =
    status === 'connected'
      ? { color: '#3FA46A', labelKey: 'store.integration_connected' }
      : status === 'error'
        ? { color: '#D55B6E', labelKey: 'store.integration_error' }
        : { color: 'var(--muted)', labelKey: 'store.integration_disconnected' }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color: palette.color,
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: palette.color }}
      />
      {t(palette.labelKey)}
    </span>
  )
}

// --- Order card (unchanged behaviour) ---

function OrderCard({
  order,
  pendingKind,
  onAction,
  onOpenDetails,
  onManageShipping,
}: {
  order: StoreOrder
  pendingKind: ActionKind | null
  onAction: (kind: ActionKind) => void
  onOpenDetails: () => void
  onManageShipping: () => void
}) {
  const { t } = useI18n()
  const created = new Date(order.createdAt).toLocaleString()

  const next = NEXT_ACTION[order.status]
  const canPrepare = next === 'prepare'
  const canShip = next === 'ship'
  const canDeliver = next === 'deliver'
  // Two visible-but-inert states. `awaiting_recipient` is the
  // merchant's "we got the order, the customer is choosing where
  // to send it" view — buttons disabled, address row replaced by
  // a hint. `terminal_cancelled` is the same idea on the other
  // end of the pipeline. Both render with no action footer.
  const awaitingRecipient = order.status === 'pending_address'
  const isCancelled = order.status === 'cancelled'
  const isInert = awaitingRecipient || isCancelled

  // Short address shown on the card. Prefer the granular city + district
  // pair so the courier sees the locality at a glance; fall back to the
  // server-formatted full string when those columns are missing.
  // Empty for `pending_address` rows — replaced by an inline hint
  // below.
  const shortAddress =
    [order.city, order.district].filter((v) => v && v.trim()).join('، ') ||
    order.address

  return (
    <li
      className="overflow-hidden rounded-3xl border backdrop-blur-md transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-sm font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {order.productName}
            </h3>
            <p
              className="mt-0.5 text-[0.7rem]"
              style={{ color: 'var(--muted)' }}
            >
              {order.storeName}
              <span className="mx-1.5 opacity-50">·</span>
              {created}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      <dl className="mt-3 flex flex-col gap-2 px-4 text-[0.78rem]">
        <Row label={t('store.row_receiver')} value={order.receiverName} />
        {!awaitingRecipient && (
          <Row
            label={t('store.row_phone')}
            value={order.deliveryPhone ?? '—'}
            ltr={!!order.deliveryPhone}
            monospace
          />
        )}
        {awaitingRecipient ? (
          // Inert "awaiting recipient" hint replaces the address row.
          // The merchant CAN see the order and the recipient name —
          // they just can't see / ship to an address until the
          // recipient confirms one. We surface why in plain copy so
          // the merchant doesn't think the row is broken.
          <div
            role="note"
            className="flex items-start gap-2 rounded-xl border px-3 py-2"
            style={{
              borderColor:
                'color-mix(in srgb, var(--primary) 30%, var(--border))',
              background: 'var(--card-soft)',
            }}
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-2.5 w-2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <p
              className="min-w-0 flex-1 text-[0.7rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('store.awaiting_recipient_body')}
            </p>
          </div>
        ) : (
          // Short address row + inline "view details" link. The full
          // address breakdown lives in the OrderDetailsModal so the
          // card stays scannable.
          <div className="flex items-start justify-between gap-3">
            <dt
              className="shrink-0 text-[0.65rem] font-medium tracking-wide"
              style={{ color: 'var(--muted)' }}
            >
              {t('store.row_address')}
            </dt>
            <dd className="min-w-0 flex-1 text-end">
              <span
                className="block truncate font-medium"
                style={{ color: 'var(--text)' }}
              >
                {shortAddress}
              </span>
              <button
                type="button"
                onClick={onOpenDetails}
                className="mt-1 text-[0.65rem] font-semibold underline-offset-4 hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                {t('store.view_details')}
              </button>
            </dd>
          </div>
        )}
        {order.trackingNumber && (
          <Row
            label={t('store.row_tracking')}
            value={order.trackingNumber}
            ltr
            monospace
          />
        )}
      </dl>

      {/* Action footer: hidden for inert rows (awaiting recipient or
          cancelled). The disabled buttons would just clutter the card
          with greyed-out actions the merchant can never invoke. */}
      {!isInert && (
        <div
          className="mt-3 flex flex-wrap gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <ActionButton
            tone="warn"
            disabled={!canPrepare || pendingKind !== null}
            loading={pendingKind === 'prepare'}
            onClick={() => onAction('prepare')}
            label={t('store.action_preparing')}
          />
          <ActionButton
            tone="info"
            disabled={!canShip || pendingKind !== null}
            loading={pendingKind === 'ship'}
            onClick={() => onAction('ship')}
            label={t('store.action_shipped')}
          />
          <ActionButton
            tone="success"
            disabled={!canDeliver || pendingKind !== null}
            loading={pendingKind === 'deliver'}
            onClick={() => onAction('deliver')}
            label={t('store.action_delivered')}
          />
          {/* Shipment manager — visible once the order is ready
              to ship (or already shipped). Lets the merchant pick
              a provider, attach a tracking number, and post
              timeline events. Receiver/sender see the timeline
              read-only on /gifts/:id. */}
          {(canShip || order.status === 'shipped') && (
            <button
              type="button"
              onClick={onManageShipping}
              className="rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--primary)',
              }}
            >
              {t('store.action_manage_shipping')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Row({
  label,
  value,
  ltr,
  monospace,
}: {
  label: string
  value: string
  ltr?: boolean
  monospace?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt
        className="shrink-0 text-[0.65rem] font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </dt>
      <dd
        dir={ltr ? 'ltr' : undefined}
        className={`min-w-0 flex-1 text-end font-medium${
          monospace ? ' tabular-nums' : ''
        }`}
        style={{ color: 'var(--text)' }}
      >
        {value}
      </dd>
    </div>
  )
}

function StatusBadge({ status }: { status: DashboardStatus }) {
  const { t } = useI18n()
  const color = colorForStatus(status)
  // Each status maps to its own copy. The "ready" key handles
  // address_confirmed / default_address_used (the merchant's
  // actionable bucket); pending_address and cancelled get
  // dedicated copy so the merchant can read the row's state at a
  // glance.
  let labelKey: string
  if (status === 'pending_address') labelKey = 'store.badge_pending_recipient'
  else if (status === 'cancelled') labelKey = 'store.badge_cancelled'
  else if (status === 'delivered') labelKey = 'store.badge_delivered'
  else if (status === 'shipped') labelKey = 'store.badge_shipped'
  else if (status === 'preparing') labelKey = 'store.badge_preparing'
  else labelKey = 'store.badge_ready'
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color,
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {t(labelKey)}
    </span>
  )
}

function ActionButton({
  tone,
  disabled,
  loading,
  onClick,
  label,
}: {
  tone: 'warn' | 'info' | 'success'
  disabled: boolean
  loading: boolean
  onClick: () => void
  label: string
}) {
  const palette =
    tone === 'warn'
      ? {
          fg: '#B47F2A',
          bg: 'rgba(232, 155, 58, 0.12)',
          border: 'rgba(232, 155, 58, 0.4)',
        }
      : tone === 'info'
        ? {
            fg: '#4338CA',
            bg: 'rgba(99, 102, 241, 0.12)',
            border: 'rgba(99, 102, 241, 0.4)',
          }
        : {
            fg: '#2F7F50',
            bg: 'rgba(63, 164, 106, 0.12)',
            border: 'rgba(63, 164, 106, 0.4)',
          }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: palette.border,
        background: palette.bg,
        color: palette.fg,
      }}
    >
      {loading ? (
        <span
          className="qift-spin inline-block h-3.5 w-3.5 rounded-full border-2"
          style={{
            borderColor: `${palette.fg}40`,
            borderTopColor: palette.fg,
          }}
        />
      ) : (
        label
      )}
    </button>
  )
}

// --- Order details modal ---

// Surfaces every field the courier might need: full address breakdown,
// delivery phone (with a tel: shortcut), status, and timestamps. The
// buyer's gift message + media URL are deliberately NOT shown — those
// belong to the sender↔receiver channel and the backend strips them
// from the store payload anyway. Two delivery-UX shortcuts:
//   - Copy address  → puts the formatted address on the clipboard
//   - Call          → tel: link to the delivery phone (when present)
function OrderDetailsModal({
  order,
  onClose,
}: {
  order: StoreOrder
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()

  // ESC + scroll lock — same affordance as every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const onCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(order.address)
      toast.show(t('store.address_copied'))
    } catch {
      toast.show(t('store.copy_failed'), { tone: 'error' })
    }
  }

  // Each detail row uses the granular column when present; otherwise we
  // suppress the row so the modal stays clean for partial addresses.
  const addressRows: Array<{ label: string; value: string }> = []
  if (order.region) addressRows.push({ label: t('addr.region'), value: order.region })
  if (order.city) addressRows.push({ label: t('addr.city'), value: order.city })
  if (order.district) addressRows.push({ label: t('addr.district'), value: order.district })
  if (order.street) addressRows.push({ label: t('addr.street'), value: order.street })
  if (order.buildingNumber)
    addressRows.push({ label: t('addr.building'), value: order.buildingNumber })

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md qift-fade-in"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-modal-in w-full max-w-md overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <div className="min-w-0">
            <h3
              className="truncate text-base font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {t('store.details_title')}
            </h3>
            <p
              className="mt-0.5 text-[0.7rem]"
              style={{ color: 'var(--muted)' }}
            >
              {order.productName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profile.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
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
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {/* Status — top of the modal so the courier sees it first */}
          <Section title={t('store.row_status')}>
            <StatusBadge status={order.status} />
          </Section>

          <Section title={t('store.row_receiver')}>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
              {order.receiverName}
            </p>
          </Section>

          {/* Phone with click-to-call. Disabled state when null. */}
          <Section title={t('store.row_phone')}>
            {order.deliveryPhone ? (
              <div className="flex items-center justify-between gap-3">
                <span
                  dir="ltr"
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: 'var(--ink)' }}
                >
                  {order.deliveryPhone}
                </span>
                <a
                  href={`tel:${order.deliveryPhone}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
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
                    className="h-3.5 w-3.5"
                  >
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L8 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  {t('store.call_button')}
                </a>
              </div>
            ) : (
              <p
                className="text-sm"
                style={{ color: 'var(--muted-2)' }}
              >
                —
              </p>
            )}
          </Section>

          {/* Address breakdown + copy button. Always shows the formatted
              one-line string at the top so the user can copy it without
              hunting for the right rows. */}
          <Section title={t('store.row_address')}>
            <div
              className="rounded-2xl border p-3"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
              }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text)' }}
              >
                {order.address}
              </p>
              <button
                type="button"
                onClick={() => void onCopyAddress()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--primary)',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                {t('store.copy_address')}
              </button>
            </div>
            {addressRows.length > 0 && (
              <dl className="mt-3 flex flex-col gap-2">
                {addressRows.map((row) => (
                  <Row key={row.label} label={row.label} value={row.value} />
                ))}
              </dl>
            )}
          </Section>

          {/* Privacy: the buyer's gift message + media are NEVER shown
              to the store. The receiver-side gift detail is the only
              place those render, and only after delivery. */}

          {/* Tracking info, when the store has already shipped. */}
          {(order.trackingNumber || order.carrier) && (
            <Section title={t('store.row_tracking')}>
              {order.carrier && (
                <p className="text-sm" style={{ color: 'var(--ink)' }}>
                  {order.carrier}
                </p>
              )}
              {order.trackingNumber && (
                <p
                  dir="ltr"
                  className="mt-0.5 font-mono text-xs tabular-nums"
                  style={{ color: 'var(--muted)' }}
                >
                  {order.trackingNumber}
                </p>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <p
        className="text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

// --- Pending-approval banner ---
//
// Renders above the merchant's store list when at least one store
// hasn't been approved. Tones the surface based on the worst
// status across the list:
//   submitted / pending / pending_review → primary (waiting)
//   changes_requested                    → warm/orange (action needed)
//   rejected                             → rose/red (rejected)
// We don't render a banner for `suspended` stores — the suspended
// state is rare + admin-driven, and the existing per-row
// integration / status indicators already cover it.
//
// Before slice-1: the banner rendered a generic translated note
// ("Your application is being reviewed.") and had NO call to action
// — merchants couldn't see the rejection reason, couldn't upload
// missing documents, couldn't resubmit. This pulls the rich
// `OwnerStore` projection (via getOwnerStore) so the actual
// rejectionReason text from the admin's review note can be rendered
// inline. Two CTAs land here: "Upload documents" (always — primary
// gap during closed beta) and "Resubmit application" (only when the
// admin requested changes; backend's submit endpoint will 422 from
// any other state).
function PendingApprovalBanner({ stores }: { stores: ApiStore[] }) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const pending = stores.find(
    (s) =>
      s.status === 'submitted' ||
      s.status === 'pending' ||
      s.status === 'pending_review',
  )
  const changes = stores.find((s) => s.status === 'changes_requested')
  const rejected = stores.find((s) => s.status === 'rejected')
  const worst = changes ?? rejected ?? pending
  // Owner-side rich detail for the worst store. Only fetched when
  // a banner is going to render at all (the early-return below
  // would otherwise short-circuit the fetch), so approved-only
  // dashboards pay zero cost for this.
  const [detail, setDetail] = useState<OwnerStore | null>(null)
  const [resubmitting, setResubmitting] = useState(false)
  const worstId = worst?.id ?? null
  useEffect(() => {
    // Same async-wrapper pattern used elsewhere in this file to
    // satisfy react-hooks/set-state-in-effect.
    let cancelled = false
    void (async () => {
      if (!accessToken || !worstId) {
        if (!cancelled) setDetail(null)
        return
      }
      const d = await getOwnerStore(accessToken, worstId)
      if (!cancelled) setDetail(d)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, worstId])
  if (!worst) return null
  const tone = changes
    ? { color: '#E89B3A', glow: 'rgba(232, 155, 58, 0.14)' }
    : rejected
      ? { color: '#D55B6E', glow: 'rgba(220, 90, 110, 0.10)' }
      : { color: 'var(--primary)', glow: 'color-mix(in srgb, var(--primary) 14%, transparent)' }
  const titleKey = changes
    ? 'merchant.banner_changes_title'
    : rejected
      ? 'merchant.banner_rejected_title'
      : 'merchant.banner_pending_title'
  const bodyKey = changes
    ? 'merchant.banner_changes_body'
    : rejected
      ? 'merchant.banner_rejected_body'
      : 'merchant.banner_pending_body'

  const reason = detail?.rejectionReason?.trim() || null
  const canResubmit = changes !== undefined && !resubmitting

  const onResubmit = async () => {
    if (!accessToken || !canResubmit) return
    setResubmitting(true)
    try {
      await submitStoreForReview(accessToken, worst.id)
      toast.show(t('merchant.banner_resubmit_success'))
      // No client-side refetch — the parent dashboard polls every
      // 30s and the banner derives its state from the polled list.
    } catch {
      toast.show(t('merchant.banner_resubmit_failed'), { tone: 'error' })
    } finally {
      setResubmitting(false)
    }
  }

  return (
    <div
      role="status"
      className="qift-fade-in mt-4 rounded-3xl border p-4 backdrop-blur-md"
      style={{
        borderColor: `color-mix(in srgb, ${tone.color} 35%, var(--border))`,
        background: `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 100%)`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: tone.color }}
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
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t(titleKey)}
          </h3>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(bodyKey)}
          </p>
          {/* The operator's actual rejection / change-request note.
              Rendered inline so the merchant doesn't have to email
              support to find out why their application is stuck. */}
          {reason && (
            <p
              className="mt-2 rounded-xl border px-3 py-2 text-[0.72rem] leading-relaxed"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            >
              <span
                className="me-1 text-[0.6rem] font-semibold tracking-[0.18em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('merchant.banner_reason_label')}
              </span>
              {reason}
            </p>
          )}
          {/* CTAs. "Upload documents" is always shown when the store
              is in a pre-approved state — the primary closed-beta
              gap was that merchants had no way to attach their CR /
              VAT / license docs. "Resubmit" is only meaningful when
              the admin requested changes; the backend's submit
              endpoint will 422 if invoked from any other status. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/store-dashboard/documents"
              className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold"
              style={{
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                background: 'var(--card-soft)',
              }}
            >
              {t('merchant.banner_upload_docs_cta')}
            </Link>
            {changes && (
              <button
                type="button"
                onClick={() => void onResubmit()}
                disabled={!canResubmit}
                className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: tone.color,
                  color: tone.color,
                  background: 'var(--card-soft)',
                }}
              >
                {resubmitting
                  ? t('merchant.banner_resubmit_loading')
                  : t('merchant.banner_resubmit_cta')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Empty / forbidden states ---

function NoStoreView() {
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
          <path d="M3 7h18l-2 13H5L3 7z" />
          <path d="M8 7V5a4 4 0 018 0v2" />
        </svg>
      </span>
      <p
        className="mt-3 text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('store.no_store_title')}
      </p>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('store.no_store_body')}
      </p>
      <Link
        href="/store-dashboard/new"
        className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        + {t('store.create_store')}
      </Link>
    </div>
  )
}

function EmptyOrders({ hasStores }: { hasStores: boolean }) {
  const { t } = useI18n()
  return (
    <div
      className="mt-3 flex flex-col items-center rounded-3xl border p-7 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <p
        className="text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('store.empty')}
      </p>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {hasStores ? t('store.empty_body') : t('store.no_store_body')}
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-24" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <ul className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-44 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// Operational KPI strip rendered above the merchant's stores +
// orders sections. Four counters derived from the live orders
// array; counts re-compute on every render (the array is small —
// at most a few dozen rows — so memoisation is overkill here).
//
// Buckets:
//   queued     — address_confirmed + default_address_used. The
//                "you owe the customer a 'preparing' click" pile.
//   preparing  — actively being prepared at the store.
//   shipped    — courier holds it.
//   delivered  — last 7 days only, so the counter feels current
//                instead of a lifetime tally.
//
// The "queued" tile gets the warm/orange treatment because it's
// the actionable bucket — the merchant should drain this pile
// first. Other tiles are calmer so the eye lands on the work
// that needs doing.



// Orders queue section. The merchant OS's primary workspace —
// promoted to the top of the dashboard (right after the KPI
// strip). Receives the state + handlers from the page-level
// component so it stays a thin presentational layer.
function OrdersSection({
  orders,
  myStores,
  loading,
  pending,
  onAction,
  onOpenDetails,
  onManageShipping,
  onRefresh,
}: {
  orders: StoreOrder[]
  myStores: ApiStore[]
  loading: boolean
  pending: ActionInFlight | null
  onAction: (order: StoreOrder, kind: ActionKind) => void
  onOpenDetails: (order: StoreOrder) => void
  onManageShipping: (giftId: string) => void
  onRefresh: () => void
}) {
  const { t } = useI18n()
  return (
    <section id="orders" className="mt-6 scroll-mt-24">
      <div className="flex items-center justify-between">
        <h2
          className="text-[0.7rem] font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('store.orders_queue_section')}
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors active:scale-95"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--primary)',
          }}
        >
          {t('store.refresh')}
        </button>
      </div>
      <p
        className="mt-1 text-[0.7rem]"
        style={{ color: 'var(--muted)' }}
      >
        {orders.length}{' '}
        {orders.length === 1
          ? t('store.order_singular')
          : t('store.order_plural')}
      </p>
      {loading && orders.length === 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-44 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      ) : orders.length === 0 ? (
        <div className="mt-3">
          <EmptyOrders hasStores={myStores.length > 0} />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard
              key={o.giftId}
              order={o}
              pendingKind={pending?.id === o.giftId ? pending.kind : null}
              onAction={(kind) => onAction(o, kind)}
              onOpenDetails={() => onOpenDetails(o)}
              onManageShipping={() => onManageShipping(o.giftId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// Quick links grid — Merchant OS hub. 2×2 tile layout
// (Coverage · Payouts · Plan · Add product). Replaces the old
// FastActions row + the three stacked entry cards that ate a lot
// of vertical real estate on the dashboard. Each tile is a
// click target — single line label + glyph — so the whole grid
// reads as one scannable block.

