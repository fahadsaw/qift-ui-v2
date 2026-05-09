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
  listMyStores,
  syncProducts,
  type ApiStore,
  type IntegrationStatus,
  type IntegrationType,
} from '@/lib/storesApi'
import ProductModal from '@/components/ProductModal'

// --- Types & helpers ---

type DashboardStatus = Extract<
  GiftStatus,
  | 'address_confirmed'
  | 'default_address_used'
  | 'preparing'
  | 'shipped'
  | 'delivered'
>

type StoreOrder = {
  giftId: string
  productName: string
  storeName: string
  receiverName: string
  // Single-line, courier-friendly Arabic-comma string built server-side.
  address: string
  deliveryPhone: string | null
  // Raw address breakdown — used by the details modal so each field gets
  // its own labelled row. All nullable; older addresses may not have all
  // columns populated.
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
const NEXT_ACTION: Record<DashboardStatus, ActionKind | null> = {
  address_confirmed: 'prepare',
  default_address_used: 'prepare',
  preparing: 'ship',
  shipped: 'deliver',
  delivered: null,
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
        <p
          className="text-[0.7rem] font-semibold tracking-wide"
          style={{ color: 'var(--muted)' }}
        >
          {t('store.integration_section')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
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
            disabled={busy !== null || store.integrationStatus !== 'connected'}
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
}: {
  order: StoreOrder
  pendingKind: ActionKind | null
  onAction: (kind: ActionKind) => void
  onOpenDetails: () => void
}) {
  const { t } = useI18n()
  const created = new Date(order.createdAt).toLocaleString()

  const next = NEXT_ACTION[order.status]
  const canPrepare = next === 'prepare'
  const canShip = next === 'ship'
  const canDeliver = next === 'deliver'

  // Short address shown on the card. Prefer the granular city + district
  // pair so the courier sees the locality at a glance; fall back to the
  // server-formatted full string when those columns are missing.
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
        <Row
          label={t('store.row_phone')}
          value={order.deliveryPhone ?? '—'}
          ltr={!!order.deliveryPhone}
          monospace
        />
        {/* Short address row + inline "view details" link. The full
            address breakdown lives in the OrderDetailsModal so the card
            stays scannable. */}
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
        {order.trackingNumber && (
          <Row
            label={t('store.row_tracking')}
            value={order.trackingNumber}
            ltr
            monospace
          />
        )}
      </dl>

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
      </div>
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
  const labelKey =
    status === 'delivered'
      ? 'store.badge_delivered'
      : status === 'shipped'
        ? 'store.badge_shipped'
        : status === 'preparing'
          ? 'store.badge_preparing'
          : 'store.badge_ready'
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
  let queued = 0
  let preparing = 0
  let shipped = 0
  let delivered = 0
  for (const o of orders) {
    if (o.status === 'address_confirmed' || o.status === 'default_address_used') {
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
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
