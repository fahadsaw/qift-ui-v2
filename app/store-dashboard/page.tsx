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
import type { GiftStatus } from '@/lib/sampleData'
import { colorForStatus } from '@/lib/giftStatus'
import {
  connectIntegration,
  getStoreAnalytics,
  listMyStores,
  listShippingProviders,
  syncProducts,
  type ApiStore,
  type IntegrationStatus,
  type IntegrationType,
  type ShippingProvider,
  type StoreAnalytics,
} from '@/lib/storesApi'
import ProductModal from '@/components/ProductModal'
import OrderShipmentModal from '@/components/OrderShipmentModal'
import { planHas } from '@/lib/merchantPlans'

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
type DashboardStatus = Extract<
  GiftStatus,
  | 'pending_address'
  | 'address_confirmed'
  | 'default_address_used'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
>

type StoreOrder = {
  giftId: string
  productName: string
  storeName: string
  receiverName: string
  // Single-line, courier-friendly Arabic-comma string built server-side.
  // Empty string for `pending_address` rows (the recipient hasn't picked
  // an address yet); the rendering path falls back to a "awaiting
  // address" hint in that case.
  address: string
  deliveryPhone: string | null
  // Raw address breakdown — used by the details modal so each field gets
  // its own labelled row. All nullable; older addresses may not have all
  // columns populated AND `pending_address` rows have them all null.
  region: string | null
  city: string | null
  district: string | null
  street: string | null
  buildingNumber: string | null
  status: DashboardStatus
  trackingNumber: string | null
  carrier: string | null
  createdAt: string
  confirmedAt?: string | null
  shippedAt?: string | null
  // Note: messageText / mediaUrl / mediaType are intentionally absent.
  // The backend doesn't ship them to the store; reading them client-side
  // would just be undefined.
}

type ActionKind = 'prepare' | 'ship' | 'deliver'
type ActionInFlight = { id: string; kind: ActionKind }

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
  const { accessToken, isAuthenticated } = useAuth()
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

  if (!ready || !isAuthenticated) return <DashboardSkeleton />

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
            {/* Operational KPI strip. Counts derived from the live
                orders array — `address_confirmed` + `default_address_used`
                share the "queued" bucket because both mean "waiting on
                the merchant to start preparing". The strip is the
                first thing the merchant sees on landing so the page
                reads as an operations dashboard, not a profile. */}
            <OpsSummary orders={orders} />

            {/* Fast actions row — direct paths into the most-common
                merchant operations. Keeps the heavy lifting (add a
                product, jump to integrations, open the storefront
                preview) one tap away from the dashboard root. */}
            <FastActions
              hasStores={myStores.length > 0}
              firstStoreId={myStores[0]?.id ?? null}
              onAddProduct={() => {
                if (myStores[0]) setProductModalStoreId(myStores[0].id)
              }}
            />

            {/* Pending-approval / changes-requested banner. Renders
                when at least one of the merchant's stores hasn't
                been approved yet. Tapping the resume CTA goes to
                the multi-step onboarding form (re-uses the same
                state via the v2 backend) so the merchant can fill
                whatever the admin asked for and resubmit. Approved
                stores skip the banner entirely. */}
            {myStores.some(
              (s) =>
                s.status &&
                s.status !== 'approved' &&
                s.status !== 'suspended',
            ) && (
              <PendingApprovalBanner
                stores={myStores}
              />
            )}

            {/* My stores summary — integration status + add-product button. */}
            {myStores.length > 0 && (
              <ul className="mt-5 flex flex-col gap-3">
                {myStores.map((s) => (
                  <StoreCard
                    key={s.id}
                    store={s}
                    onAddProduct={() => setProductModalStoreId(s.id)}
                    onChanged={() => void refresh()}
                  />
                ))}
              </ul>
            )}

            {/* Operations summary: revenue, status counts, top
                products, delivery success rate. Surfaces the
                merchant's business at a glance above the order
                list. Lazy-loaded — fast-fail when /store/analytics
                returns nothing so the dashboard stays usable. */}
            {myStores.length > 0 && (
              <AnalyticsSection accessToken={accessToken} />
            )}

            {/* Delivery-coverage card. Now functional — links to the
                live editor at /store-dashboard/coverage. Fast-delivery
                addresses outside the configured zones are rejected at
                receiver confirm-address time. */}
            {myStores.length > 0 && <CoverageCard />}

            {/* Payouts entry. Mock breakdown today; real settlement
                wiring is future work. */}
            {myStores.length > 0 && <PayoutsCardLink />}

            {/* Plan entry. Informational only — admins assign
                tiers via /admin. Surfaces the merchant's current
                tier + what each unlocks. */}
            {myStores.length > 0 && <PlanCardLink stores={myStores} />}

            {/* Orders list — same as before but now scoped to viewer's stores. */}
            <div
              id="orders"
              className="mt-6 flex items-center justify-between text-xs scroll-mt-24"
              style={{ color: 'var(--muted)' }}
            >
              <span>
                {orders.length}{' '}
                {orders.length === 1
                  ? t('store.order_singular')
                  : t('store.order_plural')}
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
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
            {loading && orders.length === 0 ? (
              <ul className="mt-3 flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i}>
                    <Skeleton className="h-44 w-full" rounded="3xl" />
                  </li>
                ))}
              </ul>
            ) : orders.length === 0 ? (
              <EmptyOrders hasStores={myStores.length > 0} />
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {orders.map((o) => (
                  <OrderCard
                    key={o.giftId}
                    order={o}
                    pendingKind={
                      pending?.id === o.giftId ? pending.kind : null
                    }
                    onAction={(kind) => void callAction(o, kind)}
                    onOpenDetails={() => setDetailsOrder(o)}
                    onManageShipping={() => setShipmentOrderId(o.giftId)}
                  />
                ))}
              </ul>
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
        <div className="flex items-center gap-3 text-[0.7rem]">
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
function PendingApprovalBanner({ stores }: { stores: ApiStore[] }) {
  const { t } = useI18n()
  const pending = stores.find(
    (s) =>
      s.status === 'submitted' ||
      s.status === 'pending' ||
      s.status === 'pending_review',
  )
  const changes = stores.find((s) => s.status === 'changes_requested')
  const rejected = stores.find((s) => s.status === 'rejected')
  const worst = changes ?? rejected ?? pending
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
function OpsSummary({ orders }: { orders: StoreOrder[] }) {
  // We deliberately don't read `Date.now()` during render directly —
  // react-hooks/purity flags non-idempotent reads even for read-only
  // arithmetic. A useState lazy initializer fires exactly once on
  // mount, gives us a stable cutoff for the 7-day delivered window,
  // and re-renders don't re-evaluate it. The window is "last 7 days
  // starting from when the dashboard mounted" — small drift over a
  // long-lived session is fine.
  const [sevenDaysAgo] = useState(
    () => Date.now() - 7 * 24 * 60 * 60 * 1000,
  )
  // `pendingRecipient` covers the merchant-visible-but-not-actionable
  // bucket: paid orders whose recipient hasn't confirmed an address
  // yet. We surface a tile so the merchant can SEE incoming volume
  // even before the address is resolved, even though the buttons
  // stay disabled until the recipient acts.
  let pendingRecipient = 0
  let queued = 0
  let preparing = 0
  let shipped = 0
  let delivered = 0
  for (const o of orders) {
    if (o.status === 'pending_address') {
      pendingRecipient += 1
    } else if (
      o.status === 'address_confirmed' ||
      o.status === 'default_address_used'
    ) {
      queued += 1
    } else if (o.status === 'preparing') {
      preparing += 1
    } else if (o.status === 'shipped') {
      shipped += 1
    } else if (o.status === 'delivered') {
      const d = o.shippedAt ? new Date(o.shippedAt).getTime() : 0
      if (d >= sevenDaysAgo) delivered += 1
    }
  }
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <KpiTile
        labelKey="store.kpi_pending_recipient"
        value={pendingRecipient}
        accent="info"
        emphasised={pendingRecipient > 0}
      />
      <KpiTile
        labelKey="store.kpi_queued"
        value={queued}
        accent="warn"
        emphasised={queued > 0}
      />
      <KpiTile labelKey="store.kpi_preparing" value={preparing} accent="info" />
      <KpiTile labelKey="store.kpi_shipped" value={shipped} accent="info" />
      <KpiTile
        labelKey="store.kpi_delivered_7d"
        value={delivered}
        accent="ok"
      />
    </div>
  )
}

function KpiTile({
  labelKey,
  value,
  accent,
  emphasised,
}: {
  labelKey: string
  value: number
  accent: 'warn' | 'info' | 'ok'
  emphasised?: boolean
}) {
  const { t } = useI18n()
  const tone = {
    warn: { dot: '#E89B3A', glow: 'rgba(232, 155, 58, 0.18)' },
    info: { dot: 'var(--primary)', glow: 'color-mix(in srgb, var(--primary) 18%, transparent)' },
    ok: { dot: '#3FA46A', glow: 'rgba(63, 164, 106, 0.16)' },
  }[accent]
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: emphasised
          ? `color-mix(in srgb, ${tone.dot} 50%, var(--border))`
          : 'var(--border)',
        background: emphasised
          ? `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 65%)`
          : 'var(--card)',
        boxShadow: emphasised
          ? `0 12px 28px -16px ${tone.glow}`
          : 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone.dot }}
        />
        <span
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--muted)' }}
        >
          {t(labelKey)}
        </span>
      </div>
      <p
        className="mt-2 text-[1.65rem] font-extrabold leading-none tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  )
}

// Fast-actions row — three primary merchant operations one tap
// away from the dashboard root. Tiles are intentionally compact
// (single-line label) so the row stays under one screen height
// next to the KPI strip on a 375px iPhone.
function FastActions({
  hasStores,
  firstStoreId,
  onAddProduct,
}: {
  hasStores: boolean
  firstStoreId: string | null
  onAddProduct: () => void
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <FastActionTile
        labelKey="store.fast_action_add_product"
        href={hasStores ? null : '/store-dashboard/new'}
        onClick={hasStores ? onAddProduct : undefined}
        glyph={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        }
      />
      <FastActionTile
        labelKey="store.fast_action_products"
        href={
          firstStoreId
            ? `/store-dashboard/products?storeId=${firstStoreId}`
            : '/store-dashboard/products'
        }
        glyph={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21 16V8a2 2 0 00-1-1.7L13 2.5a2 2 0 00-2 0L4 6.3A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <path d="M3.3 7l8.7 5 8.7-5" />
          </svg>
        }
      />
      <FastActionTile
        labelKey="store.fast_action_storefront"
        href="/stores"
        glyph={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M3 9l1.5-4.5a1 1 0 011-.7h13a1 1 0 011 .7L21 9" />
            <path d="M3 9h18" />
            <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
          </svg>
        }
      />
    </div>
  )
}

function FastActionTile({
  labelKey,
  href,
  onClick,
  glyph,
}: {
  labelKey: string
  href: string | null
  onClick?: () => void
  glyph: React.ReactNode
}) {
  const { t } = useI18n()
  const inner = (
    <>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
        }}
      >
        {glyph}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        {t(labelKey)}
      </span>
    </>
  )
  const baseClass =
    'flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-start transition-colors active:scale-[0.98]'
  const baseStyle: React.CSSProperties = {
    borderColor: 'var(--border)',
    background: 'var(--card-soft)',
  }
  if (href && !onClick) {
    return (
      <Link href={href} className={baseClass} style={baseStyle}>
        {inner}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={baseClass}
      style={baseStyle}
    >
      {inner}
    </button>
  )
}

// Operations summary cards. Pulls from /store/analytics and
// renders a compact metrics grid above the order list. Quietly
// fails-soft when the endpoint is unavailable — better to show
// the order list without analytics than to block the dashboard.
function AnalyticsSection({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const [data, setData] = useState<StoreAnalytics | null>(null)
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      const a = await getStoreAnalytics(accessToken)
      if (!cancelled) setData(a)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])
  if (!data) return null
  const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('ar-SA')} ر.س`
  return (
    <section className="mt-5">
      <h2
        className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('store.analytics_title')}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label={t('store.analytics_revenue_today')}
          value={fmtMoney(data.revenue.today)}
        />
        <Metric
          label={t('store.analytics_revenue_week')}
          value={fmtMoney(data.revenue.week)}
        />
        <Metric
          label={t('store.analytics_revenue_month')}
          value={fmtMoney(data.revenue.month)}
        />
        <Metric
          label={t('store.analytics_revenue_total')}
          value={fmtMoney(data.revenue.allTime)}
        />
        <Metric
          label={t('store.analytics_total_orders')}
          value={data.totalOrders.toLocaleString('ar-SA')}
        />
        <Metric
          label={t('store.analytics_avg_order')}
          value={fmtMoney(data.avgOrderValue)}
        />
        <Metric
          label={t('store.analytics_success_rate')}
          value={
            data.deliverySuccessRate === null
              ? '—'
              : `${data.deliverySuccessRate}%`
          }
        />
        <Metric
          label={t('store.analytics_pending')}
          value={(
            (data.statusCounts.pending_address ?? 0) +
            (data.statusCounts.address_confirmed ?? 0) +
            (data.statusCounts.default_address_used ?? 0)
          ).toLocaleString('ar-SA')}
        />
      </div>
      {data.topProducts.length > 0 && (
        <div className="mt-3">
          <h3
            className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('store.analytics_top_products')}
          </h3>
          <ul className="flex flex-col gap-1">
            {data.topProducts.map((p) => (
              <li
                key={p.productName}
                className="flex items-center justify-between rounded-xl border px-3 py-1.5 text-[0.72rem]"
                style={{
                  borderColor: 'var(--hairline)',
                  background: 'var(--card-soft)',
                }}
              >
                <span
                  className="min-w-0 truncate font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {p.productName}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  ×{p.count.toLocaleString('ar-SA')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border px-3 py-2.5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div
        className="text-[0.6rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-base font-extrabold tabular-nums tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </div>
    </div>
  )
}

// Entry to the merchant payouts page. The page itself runs the
// real numbers; this is just the navigation card.
function PayoutsCardLink() {
  const { t } = useI18n()
  return (
    <Link
      href="/store-dashboard/payouts"
      className="qift-press mt-3 flex items-center justify-between gap-3 rounded-3xl border px-4 py-3 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
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
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18" />
            <path d="M7 14h6" />
          </svg>
        </span>
        <div>
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('store.payouts_card_title')}
          </h3>
          <p
            className="text-[0.7rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.payouts_card_body')}
          </p>
        </div>
      </div>
      <span aria-hidden style={{ color: 'var(--text-soft)' }}>
        ›
      </span>
    </Link>
  )
}

// Plan entry card. Shows the worst (lowest) tier across the
// merchant's stores so they see at-a-glance whether anything is
// gated, then routes to the full /store-dashboard/plan comparison.
// Informational — admins assign upgrades manually.
function PlanCardLink({ stores }: { stores: ApiStore[] }) {
  const { t } = useI18n()
  // Lowest tier wins for the headline badge — if even one store
  // is on starter, the merchant should see the starter badge
  // here. Order: starter < pro < enterprise.
  const order = ['starter', 'pro', 'enterprise'] as const
  const lowest = stores.reduce<typeof order[number]>((acc, s) => {
    const plan = (s.plan ?? 'starter') as (typeof order)[number]
    return order.indexOf(plan) < order.indexOf(acc) ? plan : acc
  }, 'enterprise')
  const palette =
    lowest === 'enterprise'
      ? {
          bg: 'color-mix(in srgb, var(--accent) 18%, transparent)',
          fg: 'var(--accent)',
        }
      : lowest === 'pro'
        ? {
            bg: 'color-mix(in srgb, var(--primary) 14%, transparent)',
            fg: 'var(--primary)',
          }
        : { bg: 'var(--ring)', fg: 'var(--text-soft)' }
  return (
    <Link
      href="/store-dashboard/plan"
      className="qift-press mt-3 flex items-center justify-between gap-3 rounded-3xl border px-4 py-3 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
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
            <path d="M12 2l2.4 5.4 5.6.6-4.2 4 1.2 5.8L12 14.9 6.9 17.8 8.1 12 4 8l5.6-.6L12 2z" />
          </svg>
        </span>
        <div>
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('store.plan_card_title')}
          </h3>
          <p
            className="text-[0.7rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.plan_card_body')}
          </p>
        </div>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em]"
        style={{ background: palette.bg, color: palette.fg }}
      >
        {t(`plan.tier_${lowest}`)}
      </span>
    </Link>
  )
}

// Delivery-coverage card. Now functional: links to the live
// editor at /store-dashboard/coverage. The matcher in
// apps/api/src/stores/delivery-zones.ts enforces zones on
// receiver address confirmation for fast-delivery products
// (flowers, chocolate, cake, perishables) — addresses outside
// the configured zones are rejected with a localized error.
function CoverageCard() {
  const { t } = useI18n()
  return (
    <Link
      href="/store-dashboard/coverage"
      className="qift-press mt-5 block rounded-3xl border p-5 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor:
          'color-mix(in srgb, var(--primary) 30%, var(--border))',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, var(--card)) 0%, var(--card) 100%)',
        boxShadow: 'var(--shadow-soft)',
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
            <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('store.coverage_card_title')}
          </h3>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('store.coverage_card_body')}
          </p>
          <span
            className="mt-2 inline-flex items-center gap-1 text-[0.7rem] font-bold"
            style={{ color: 'var(--primary)' }}
          >
            {t('store.coverage_manage_cta')}
            <span aria-hidden>›</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
