'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import ProductModal from '@/components/ProductModal'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  deleteProduct,
  listMyStores,
  listProducts,
  updateProduct,
  type ApiProduct,
  type ApiStore,
} from '@/lib/storesApi'

// Wraps the inner page in <Suspense> because useSearchParams() needs it
// at the App Router top-level. Same pattern used by /send and /checkout.
export default function StoreProductsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer size="md">
          <div className="pt-5" />
        </PageContainer>
      }
    >
      <StoreProductsInner />
    </Suspense>
  )
}

// Modal mode discriminator. `null` = closed; the variant carries either
// "create new" context or the row to edit. Keeps the modal state in one
// place so the page never renders two modals at once.
type ModalState =
  | { mode: 'closed' }
  | { mode: 'create'; storeId: string }
  | { mode: 'edit'; storeId: string; product: ApiProduct }

function StoreProductsInner() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const ready = useSimulatedReady(300)
  const { accessToken, isAuthenticated } = useAuth()

  const [stores, setStores] = useState<ApiStore[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [storeId, setStoreId] = useState<string | null>(
    searchParams.get('storeId'),
  )
  const [loading, setLoading] = useState(true)
  // Tracks the row currently being mutated so its action buttons can show
  // a spinner without freezing the rest of the list.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ mode: 'closed' })
  // Two-step delete confirmation — clicking "delete" once arms the
  // button; a second click within 4s actually deletes. Keeps the
  // destructive action one-tap-protected without a full modal.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)

  // Load the viewer's stores once, then resolve which store to show. If
  // ?storeId=… was supplied and matches one of the user's stores we use
  // it; otherwise we fall back to the first store they own.
  const loadStores = useCallback(async () => {
    if (!accessToken) return [] as ApiStore[]
    const list = await listMyStores(accessToken)
    setStores(list)
    return list
  }, [accessToken])

  const loadProducts = useCallback(
    async (id: string) => {
      // includeUnavailable=true so the dashboard sees out-of-stock rows too
      // — they're hidden on the public storefront but the owner needs to
      // be able to flip them back on.
      const rows = await listProducts(id, {
        includeUnavailable: true,
        token: accessToken,
      })
      setProducts(rows)
    },
    [accessToken],
  )

  useEffect(() => {
    if (ready && !isAuthenticated)
      router.replace('/login?next=/store-dashboard/products')
  }, [ready, isAuthenticated, router])

  // Initial load.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await loadStores()
        if (cancelled) return
        const requested = searchParams.get('storeId')
        const resolved =
          (requested && list.find((s) => s.id === requested)?.id) ??
          list[0]?.id ??
          null
        setStoreId(resolved)
        if (resolved) await loadProducts(resolved)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // We deliberately omit `searchParams` from deps so a stale URL doesn't
    // force a refetch when the user picks a different store via the chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, loadStores, loadProducts])

  // When the user picks a different store from the chip row, swap.
  const switchStore = async (id: string) => {
    setStoreId(id)
    setLoading(true)
    try {
      await loadProducts(id)
    } finally {
      setLoading(false)
    }
    // Mirror the pick into the URL so a refresh keeps the same store.
    const url = new URL(window.location.href)
    url.searchParams.set('storeId', id)
    window.history.replaceState({}, '', url.toString())
  }

  // Inline availability toggle. Optimistic; rolls back on failure.
  const toggleAvailability = async (product: ApiProduct) => {
    if (!accessToken || pendingId) return
    setPendingId(product.id)
    const previous = products
    const next = !product.isAvailable
    setProducts((list) =>
      list.map((p) => (p.id === product.id ? { ...p, isAvailable: next } : p)),
    )
    try {
      const updated = await updateProduct(accessToken, product.id, {
        isAvailable: next,
      })
      setProducts((list) =>
        list.map((p) => (p.id === product.id ? updated : p)),
      )
      toast.show(
        next
          ? t('store.product_available')
          : t('store.product_unavailable'),
      )
    } catch {
      setProducts(previous)
      toast.show(t('store.product_update_failed'), { tone: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  // Two-tap delete: first tap arms (visually highlights), second tap
  // confirms. Disarms after 4s so a forgotten click doesn't linger.
  useEffect(() => {
    if (!armedDeleteId) return
    const id = setTimeout(() => setArmedDeleteId(null), 4000)
    return () => clearTimeout(id)
  }, [armedDeleteId])

  const onDeleteClick = async (product: ApiProduct) => {
    if (!accessToken || pendingId) return
    if (armedDeleteId !== product.id) {
      setArmedDeleteId(product.id)
      return
    }
    setPendingId(product.id)
    setArmedDeleteId(null)
    const previous = products
    setProducts((list) => list.filter((p) => p.id !== product.id))
    try {
      await deleteProduct(accessToken, product.id)
      toast.show(t('store.product_deleted'))
    } catch {
      setProducts(previous)
      toast.show(t('store.product_delete_failed'), { tone: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  const activeStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId],
  )

  if (!ready || !isAuthenticated) return <ProductsSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <Link
          href="/store-dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--text-soft)' }}
        >
          <span aria-hidden>←</span>
          {t('store.back_to_dashboard')}
        </Link>

        <PageHeading
          badge={<Badge>{t('store.products_badge')}</Badge>}
          line1={t('store.products_title_1')}
          gradient={t('store.products_title_2')}
          subtitle={t('store.products_subtitle')}
          size="sm"
        />

        {/* Empty state when the user has no stores yet. */}
        {!loading && stores.length === 0 ? (
          <NoStoreView />
        ) : (
          <>
            {/* Store-picker chip row. Only renders when the user owns >1
                store — single-store users skip the picker entirely. */}
            {stores.length > 1 && (
              <div
                className="mt-5 -mx-1 flex gap-2 overflow-x-auto pb-1"
                role="tablist"
              >
                {stores.map((s) => {
                  const active = s.id === storeId
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => void switchStore(s.id)}
                      className="shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition-all active:scale-95"
                      style={{
                        borderColor: active ? 'transparent' : 'var(--border)',
                        background: active
                          ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                          : 'var(--card-soft)',
                        color: active ? '#fff' : 'var(--text-soft)',
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? 'var(--shadow-soft)' : undefined,
                      }}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Header row: count + add button. */}
            {storeId && (
              <div
                className="mt-5 flex items-center justify-between gap-3"
                style={{ color: 'var(--muted)' }}
              >
                <span className="text-xs">
                  {products.length}{' '}
                  {products.length === 1
                    ? t('store.product_singular')
                    : t('store.product_plural')}
                  {activeStore && (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span style={{ color: 'var(--text-soft)' }}>
                        {activeStore.name}
                      </span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setModal({ mode: 'create', storeId: storeId! })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                >
                  + {t('store.add_product')}
                </button>
              </div>
            )}

            {loading ? (
              <ul className="mt-3 flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i}>
                    <Skeleton className="h-32 w-full" rounded="3xl" />
                  </li>
                ))}
              </ul>
            ) : products.length === 0 ? (
              <EmptyProducts />
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    pending={pendingId === p.id}
                    armedDelete={armedDeleteId === p.id}
                    onEdit={() =>
                      setModal({
                        mode: 'edit',
                        storeId: p.storeId,
                        product: p,
                      })
                    }
                    onToggle={() => void toggleAvailability(p)}
                    onDelete={() => void onDeleteClick(p)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {modal.mode !== 'closed' && (
        <ProductModal
          storeId={modal.storeId}
          product={modal.mode === 'edit' ? modal.product : undefined}
          onClose={() => setModal({ mode: 'closed' })}
          onSaved={(saved) => {
            setModal({ mode: 'closed' })
            // Optimistic merge — replace if it already exists, prepend if
            // it's a brand-new row.
            setProducts((list) => {
              const existing = list.find((p) => p.id === saved.id)
              if (existing) {
                return list.map((p) => (p.id === saved.id ? saved : p))
              }
              return [saved, ...list]
            })
            toast.show(
              modal.mode === 'edit'
                ? t('store.product_updated')
                : t('store.product_created'),
            )
          }}
        />
      )}
    </PageContainer>
  )
}

// --- Card ---

function ProductCard({
  product,
  pending,
  armedDelete,
  onEdit,
  onToggle,
  onDelete,
}: {
  product: ApiProduct
  pending: boolean
  armedDelete: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  // Row is "available" only when both isAvailable AND in_stock. The toggle
  // below controls only `isAvailable`; stock_status is edited via the modal.
  const inStock = product.stockStatus === 'in_stock'

  return (
    <li
      className="overflow-hidden rounded-3xl border backdrop-blur-md transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: product.isAvailable ? 1 : 0.78,
      }}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        {/* Product image / placeholder square */}
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          }}
        >
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
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
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="truncate text-sm font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {product.name}
            </h3>
            <StockBadge inStock={inStock} />
          </div>
          <p
            className="mt-0.5 text-[0.7rem]"
            style={{ color: 'var(--muted)' }}
          >
            <span dir="ltr" className="tabular-nums">
              {product.price.toLocaleString('ar-SA')} ر.س
            </span>
            <span className="mx-1.5 opacity-50">·</span>
            {t(`store.cat_${product.category}`)}
            {product.isFastDelivery && (
              <>
                <span className="mx-1.5 opacity-50">·</span>
                <span style={{ color: 'var(--primary)' }}>
                  {t('store.product_fast_chip')}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div
        className="mt-3 flex items-center justify-between gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <AvailabilityToggle
          value={product.isAvailable}
          loading={pending}
          onChange={onToggle}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--primary)',
            }}
          >
            {t('store.product_edit')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: armedDelete
                ? '#D55B6E'
                : 'var(--border)',
              background: armedDelete
                ? 'rgba(213, 91, 110, 0.12)'
                : 'var(--card-soft)',
              color: '#D55B6E',
            }}
          >
            {armedDelete
              ? t('store.product_delete_confirm')
              : t('store.product_delete')}
          </button>
        </div>
      </div>
    </li>
  )
}

function StockBadge({ inStock }: { inStock: boolean }) {
  const { t } = useI18n()
  // in_stock → green, out_of_stock → grey (per spec).
  const color = inStock ? '#3FA46A' : 'var(--muted)'
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
      {inStock ? t('store.in_stock') : t('store.out_of_stock')}
    </span>
  )
}

function AvailabilityToggle({
  value,
  loading,
  onChange,
}: {
  value: boolean
  loading: boolean
  onChange: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={loading}
      className="flex items-center gap-2 text-[0.7rem] font-medium disabled:opacity-50"
      style={{ color: 'var(--text-soft)' }}
    >
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{
          background: value ? 'var(--primary)' : 'var(--border-strong)',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{
            left: value ? 'calc(100% - 18px)' : '2px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        />
      </span>
      {value ? t('store.available') : t('store.unavailable')}
    </button>
  )
}

// --- Empty / no-store states ---

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
      <p
        className="text-sm font-bold tracking-tight"
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
        className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
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

function EmptyProducts() {
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
        {t('store.products_empty_title')}
      </p>
      <p
        className="mt-1 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('store.products_empty_body')}
      </p>
    </div>
  )
}

function ProductsSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-7 w-24" rounded="full" />
        <Skeleton className="mt-3 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <ul className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-32 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}
