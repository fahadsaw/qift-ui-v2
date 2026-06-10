'use client'

import Link from 'next/link'
import { Suspense, use, useEffect, useState } from 'react'
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import GradientText from '@/components/GradientText'
import PageContainer from '@/components/PageContainer'
import Skeleton from '@/components/Skeleton'
import { gradientFor } from '@/components/StoreCard'
import StorefrontPage from '@/components/storefront/StorefrontPage'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  createWish,
  type OwnerWishItem,
} from '@/lib/social'
import { STORES, isSampleStoreId, type StoreTag } from '@/lib/sampleData'
import {
  getStore,
  listProducts,
  type ApiProduct,
  type ApiStore,
} from '@/lib/storesApi'
import { clearStoresLastDetailHref } from '@/lib/storesNav'

// sessionStorage keys — must match /stores page so the breadcrumb (last
// store id) and the funnel-restore breadcrumb (last detail href) survive
// a profile detour. Defined twice (once here, once on /stores) instead
// of in a shared module because keeping the literals colocated with
// their consumers makes refactors safer than importing constants.
const SS_KEY_LAST_STORE = 'qift.stores.lastStoreId'
const SS_KEY_LAST_DETAIL_HREF = 'qift.stores.lastDetailHref'

// Build a stable lookup key for sample-product wish dedup. Mirrors the
// backend's idempotency rule on POST /wishes: same trimmed title +
// same store (NULL/empty treated as one bucket). Only used on the
// sample-data render path — real merchant products are productId-keyed
// and live entirely inside the StorefrontPage wrapper.
function buildSampleWishKey(
  title: string,
  store: string | null | undefined,
): string {
  return `${title.trim()}|${(store ?? '').trim()}`
}

// Display row for the sample-store legacy renderer. Real merchant
// stores no longer hit this path — they flow through StorefrontPage
// (which builds StorefrontProduct from ApiProduct internally).
type SampleStore = {
  id: string
  name: string
  city: string
  district: string
  rating: number
  tags: StoreTag[]
  blurb: string
}

type SampleProduct = {
  id: string
  name: string
  price: string
}

export default function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // useSearchParams must be inside Suspense in Next.js 16. The wrapper
  // also lets us pass the unwrapped `id` down without leaking the params
  // promise into the inner component.
  const { id } = use(params)
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <StoreDetailInner id={id} />
    </Suspense>
  )
}

function StoreDetailInner({ id }: { id: string }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // `to` threads from /stores → /stores/[id] → /send so the recipient
  // stays prefilled all the way through the gift funnel.
  const recipient = (searchParams.get('to') ?? '').trim().toLowerCase()

  // Two source-of-truth modes:
  //   - sample: data comes from sampleData.STORES, never the API.
  //   - api: data comes from /stores/:id + /products?storeId=:id.
  // Real merchant stores flow through the storefront theme system
  // (StorefrontPage → StorefrontDispatcher); sample stores keep the
  // legacy demo renderer because they have no Product rows on the
  // backend and `Send as gift` must stay inert (DemoProductNotice).
  const [sampleStore, setSampleStore] = useState<SampleStore | null>(null)
  const [sampleProducts, setSampleProducts] = useState<SampleProduct[]>([])
  const [apiStore, setApiStore] = useState<ApiStore | null>(null)
  const [apiProducts, setApiProducts] = useState<ApiProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  // Leave a breadcrumb so /stores can highlight + scroll-into-view this
  // store next time the user comes back. Cleared by /stores when the
  // user clears the funnel via the "x" on the recipient banner — but we
  // do NOT clear it here: navigating back to the list is the common case
  // and we want the highlight every time.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(SS_KEY_LAST_STORE, id)
    } catch {
      /* ignore */
    }
  }, [id])

  // Funnel-restore breadcrumb: save the full canonical URL of THIS
  // detail page so /stores can `router.replace` back to it next time.
  // We rebuild from `pathname + search` rather than `window.location`
  // so the value reflects the route at this render (avoiding stale
  // popstate edge cases). Re-runs on any search-param change so the
  // breadcrumb stays current as `?to=` is added/removed.
  //
  // Intentionally NOT cleared on unmount — the whole point is that the
  // breadcrumb survives leaving the route. Cleared explicitly by the
  // back-to-all-stores button below and by funnel-start handlers in
  // the SocialListModal / public profile.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = searchParams.toString()
    const href = search ? `${pathname}?${search}` : pathname
    try {
      window.sessionStorage.setItem(SS_KEY_LAST_DETAIL_HREF, href)
    } catch {
      /* ignore */
    }
  }, [pathname, searchParams])

  // Compute the canonical "back to /stores" href once. Preserves the
  // recipient context and any other query params the user came in with
  // (e.g. ?cat=flowers if we ever start writing that to the URL).
  const backHref = recipient
    ? `/stores?to=${encodeURIComponent(recipient)}`
    : '/stores'

  // Click handler for the "all stores" link. Clears `lastDetailHref` so
  // that landing on /stores doesn't immediately bounce the user back
  // here — this is the explicit "exit the funnel into the list" affordance.
  // We DON'T preventDefault: the Link navigates as usual; we just
  // synchronously clear the breadcrumb first.
  const onBackToAllStores = () => {
    clearStoresLastDetailHref()
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Sample slugs render from the in-memory dataset; anything else
      // (cuid OR stable seed-time id like `store-riyadh-flowers`) is
      // assumed to be a real merchant store and fetched from the API.
      // We can't gate on cuid shape any more — the seeded onboarding-v2
      // merchants use stable string ids that aren't cuids but ARE real
      // backend rows.
      if (isSampleStoreId(id)) {
        const sample = STORES.find((s) => s.id === id)!
        setSampleStore({
          id: sample.id,
          name: sample.name,
          city: sample.city,
          district: sample.district,
          rating: sample.rating,
          tags: sample.tags,
          blurb: sample.blurb,
        })
        setSampleProducts(
          sample.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
          })),
        )
        setLoading(false)
        return
      }

      const [s, p] = await Promise.all([getStore(id), listProducts(id)])
      if (cancelled) return
      if (!s) {
        setMissing(true)
        setLoading(false)
        return
      }
      setApiStore(s)
      setApiProducts(p)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (missing) notFound()
  if (loading) return <DetailSkeleton />

  // Real merchant store — render through the storefront theme system.
  // The wrapper owns wishlist hydration; the dispatcher picks the
  // theme; primitives own the heart + buy-as-gift + metric behavior.
  //
  // Route-level chrome stays here (back link, recipient banner) so
  // every theme renders the same funnel context above its own body.
  if (apiStore) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <BackLink
            href={backHref}
            onClick={onBackToAllStores}
            label={t('stores.back_to_all')}
          />
          {recipient && <RecipientBanner recipient={recipient} />}
          <div className="mt-4">
            <StorefrontPage
              store={apiStore}
              products={apiProducts}
              recipientUsername={recipient || null}
            />
          </div>
        </section>
      </PageContainer>
    )
  }

  // Sample store path. Keeps the legacy demo renderer because:
  //   - Sample products have no real backend Product row, so the
  //     buy-as-gift primitive would route into /send against a null
  //     productId and the order would be unlinked.
  //   - The demo banners (DemoStoreBanner / DemoProductNotice) frame
  //     the page as "example data only" — that's specific to the
  //     sample path; we don't want themes to render demo chrome.
  // When the sample dataset is retired this whole branch goes away
  // and the dispatcher becomes the single render path.
  if (sampleStore) {
    return (
      <SampleStoreRenderer
        store={sampleStore}
        products={sampleProducts}
        recipient={recipient}
        backHref={backHref}
        onBackToAllStores={onBackToAllStores}
      />
    )
  }

  return <DetailSkeleton />
}

// ---------- Sample-store renderer ----------
//
// The legacy inline renderer for sample/demo storefronts. Real
// merchant stores never hit this code path. Kept as a separate
// component so the main route stays readable and so retiring the
// sample dataset is a single-file deletion.

function SampleStoreRenderer({
  store,
  products,
  recipient,
  backHref,
  onBackToAllStores,
}: {
  store: SampleStore
  products: SampleProduct[]
  recipient: string
  backHref: string
  onBackToAllStores: () => void
}) {
  const { t } = useI18n()
  const { accessToken } = useAuth()

  // Legacy free-text wishlist set — keyed by `${title}|${store}`
  // because sample products carry no productId.
  const [wishedLegacyKeys, setWishedLegacyKeys] = useState<Set<string>>(
    new Set(),
  )

  // We don't pre-hydrate from /wishes/me here — sample products
  // are demo-only and the legacy free-text wishlist surface lives
  // entirely on /wishlist. Mid-session writes still update the
  // local set so the heart fills immediately.
  void accessToken

  const handleSampleWishAdded = (wish: OwnerWishItem) => {
    if (!wish.productId) {
      setWishedLegacyKeys((prev) => {
        const next = new Set(prev)
        next.add(buildSampleWishKey(wish.title, wish.store))
        return next
      })
    }
  }

  const tagText: Record<StoreTag, string> = {
    fast: t('stores.tag_fast'),
    same_day: t('stores.tag_same_day'),
    nearby: t('stores.tag_nearby'),
  }

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <BackLink
          href={backHref}
          onClick={onBackToAllStores}
          label={t('stores.back_to_all')}
        />
        {recipient && <RecipientBanner recipient={recipient} />}

        {(() => {
          const [a, b] = gradientFor(store.id)
          return (
            <div
              aria-hidden
              className="qift-fade-in relative mt-4 aspect-[21/9] w-full overflow-hidden rounded-3xl"
              style={{
                background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 60%)',
                }}
              />
            </div>
          )
        })()}

        <div className="-mt-7 flex items-end gap-4 px-1">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              boxShadow:
                '0 14px 30px -8px rgba(58,30,80,0.35), 0 0 0 4px var(--bg-base)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
            >
              <path d="M3 9l1.5-4.5a1 1 0 011-.7h13a1 1 0 011 .7L21 9" />
              <path d="M3 9h18" />
              <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <Badge>{t('stores.badge')}</Badge>
          </div>
        </div>

        <div className="mt-3">
          <h1
            className="text-[1.7rem] font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            <GradientText>{store.name}</GradientText>
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {store.city}
            {store.district && (
              <>
                {' · '}
                {store.district}
              </>
            )}
            <span className="mx-1.5 opacity-50">·</span>★ {store.rating}
          </p>
          {/* Verified Phase 1 — every publicly listed store passed
              Qift's business review (CR/VAT/bank); say so where the
              shopper decides. The badge is platform-generated truth,
              not merchant-editable decoration. */}
          <span
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.68rem] font-bold"
            style={{
              background:
                'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            ✓ {t('stores.verified_merchant')}
          </span>
        </div>

        {store.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {store.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-soft)',
                }}
              >
                {tagText[tag]}
              </span>
            ))}
          </div>
        )}

        {store.blurb && (
          <Card className="mt-5">
            <h2
              className="text-sm font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {t('stores.about')}
            </h2>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {store.blurb}
            </p>
          </Card>
        )}

        <DemoStoreBanner />

        <h2
          className="mt-7 text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('stores.products')}
        </h2>

        {products.length === 0 ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {t('stores.products_empty')}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {products.map((p) => (
              <SampleProductRow
                key={p.id}
                product={p}
                storeName={store.name}
                isWished={wishedLegacyKeys.has(
                  buildSampleWishKey(p.name, store.name),
                )}
                onWishAdded={handleSampleWishAdded}
              />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

// Sample-data row. Heart still works via the legacy free-text
// wishlist path; the buy-as-gift CTA is inert (DemoProductNotice).
function SampleProductRow({
  product,
  storeName,
  isWished,
  onWishAdded,
}: {
  product: SampleProduct
  storeName: string
  isWished: boolean
  onWishAdded: (wish: OwnerWishItem) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accessToken } = useAuth()
  const [wishBusy, setWishBusy] = useState(false)

  const onToggleWishlist = async () => {
    if (wishBusy) return
    if (!accessToken) {
      router.push('/login')
      return
    }
    if (isWished) {
      // Legacy free-text wishes don't support unheart from the
      // storefront — see /wishlist to remove.
      toast.show(t('wishlist.demo_unheart_hint'), { tone: 'error' })
      return
    }
    setWishBusy(true)
    try {
      const wish = await createWish({
        title: product.name,
        store: storeName,
        visibility: 'public',
      })
      onWishAdded(wish)
      toast.show(t('wishlist.added_product_toast'))
    } catch (err) {
      console.error('[stores/[id]/sample] wishlist add failed', err)
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
    } finally {
      setWishBusy(false)
    }
  }

  return (
    <li
      className="rounded-3xl border p-4 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {product.name}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {t('store.from')} {storeName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void onToggleWishlist()}
            disabled={wishBusy}
            aria-label={isWished ? t('wishlist.remove') : t('wishlist.add')}
            aria-pressed={isWished}
            aria-busy={wishBusy || undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-default"
            style={{
              borderColor: isWished ? 'transparent' : 'var(--border)',
              background: isWished
                ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                : 'var(--card-soft)',
              color: 'var(--primary)',
              opacity: wishBusy ? 0.6 : 1,
              boxShadow: isWished
                ? '0 4px 14px -6px color-mix(in srgb, var(--primary) 50%, transparent)'
                : undefined,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isWished ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              style={{ transform: isWished ? 'scale(1.06)' : 'scale(1)' }}
            >
              <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
            </svg>
          </button>
          <span
            className="rounded-full px-3 py-1 text-sm font-bold"
            style={{ background: 'var(--ring)', color: 'var(--primary)' }}
          >
            {product.price}
          </span>
        </div>
      </div>
      <DemoProductNotice />
    </li>
  )
}

// ---------- Shared chrome ----------

function BackLink({
  href,
  onClick,
  label,
}: {
  href: string
  onClick: () => void
  label: string
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      style={{ color: 'var(--text-soft)' }}
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  )
}

// Send-gift funnel banner — same UI rule as /stores. Confirms the
// recipient context above the product grid so the user never
// wonders who their gift will go to.
function RecipientBanner({ recipient }: { recipient: string }) {
  const { t } = useI18n()
  return (
    <div
      role="status"
      className="mt-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--card)) 0%, var(--card) 100%)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
        style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
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
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
        </svg>
      </span>
      <p
        className="min-w-0 truncate text-xs leading-snug"
        style={{ color: 'var(--text-soft)' }}
      >
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {t('stores.gifting_to_label')}
        </span>{' '}
        <span dir="ltr" style={{ color: 'var(--primary)', fontWeight: 700 }}>
          @{recipient}
        </span>
      </p>
    </div>
  )
}

// Inert "demo product" CTA shown beneath every sample product. The
// real-store theme path renders an active BuyAsGiftButton primitive
// instead.
function DemoProductNotice() {
  const { t } = useI18n()
  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-xl border px-4 py-2.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold"
        style={{ background: 'rgba(232, 155, 58, 0.18)', color: '#E89B3A' }}
      >
        i
      </span>
      <p
        className="min-w-0 flex-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('stores.demo_product_notice')}
      </p>
    </div>
  )
}

// Page-level banner shown above the products grid when the store
// is a sample/demo row.
function DemoStoreBanner() {
  const { t } = useI18n()
  return (
    <div
      role="note"
      className="mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3"
      style={{
        borderColor: 'color-mix(in srgb, #E89B3A 35%, var(--border))',
        background:
          'linear-gradient(135deg, rgba(232, 155, 58, 0.10) 0%, var(--card) 100%)',
      }}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ background: '#E89B3A' }}
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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {t('stores.demo_store_title')}
        </p>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('stores.demo_store_body')}
        </p>
      </div>
    </div>
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
            <Skeleton className="h-5 w-20" rounded="full" />
            <Skeleton className="mt-3 h-7 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="mt-5 h-32 w-full" rounded="3xl" />
        <Skeleton className="mt-4 h-44 w-full" rounded="3xl" />
      </section>
    </PageContainer>
  )
}
