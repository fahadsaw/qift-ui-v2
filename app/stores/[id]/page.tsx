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
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  createWish,
  fetchMyWishes,
  type OwnerWishItem,
} from '@/lib/social'
import { STORES, type StoreTag } from '@/lib/sampleData'
import {
  getStore,
  listProducts,
  looksLikeCuid,
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

// Build a stable lookup key for wish dedup. Mirrors the backend's
// idempotency rule on POST /wishes: same trimmed title + same store
// (NULL/empty treated as one bucket). Used both when seeding the
// `wishedKeys` set from /wishes/me and when computing whether a given
// product is already on the wishlist.
function buildWishKey(title: string, store: string | null | undefined): string {
  return `${title.trim()}|${(store ?? '').trim()}`
}

// Normalised "store" record consumed by the page. Source-of-truth differs
// per route id (sample vs real API) but the rendered card looks identical.
type DisplayStore = {
  id: string
  name: string
  city: string
  district: string
  rating: number
  tags: StoreTag[]
  blurb: string
  source: 'sample' | 'api'
}

type DisplayProduct = {
  id: string
  name: string
  // Pre-formatted price string for sample data, or `${price} ر.س` for API.
  price: string
  isAvailable: boolean
  // True when the product came from the catalog API (and therefore has
  // a real id we can pass through to /send → /checkout for stock checks).
  isReal: boolean
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
  const { accessToken } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // `to` threads from /stores → /stores/[id] → /send so the recipient
  // stays prefilled all the way through the gift funnel.
  const recipient = (searchParams.get('to') ?? '').trim().toLowerCase()
  const [store, setStore] = useState<DisplayStore | null>(null)
  const [products, setProducts] = useState<DisplayProduct[]>([])
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

  // Wished-product lookup. Each entry is `${title}|${store}`. Built from
  // GET /wishes/me on mount and updated locally after every successful
  // wishlist add so the UI flips to "filled heart" without a re-fetch.
  // Anonymous visitors never populate this — `accessToken` is the gate.
  const [wishedKeys, setWishedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Cuid-shaped ids hit the API; everything else falls back to the
      // sample dataset. This keeps the demo `/stores/rosary` URLs working
      // while letting real catalog IDs use the same route.
      if (looksLikeCuid(id)) {
        const [s, p] = await Promise.all([
          getStore(id),
          listProducts(id),
        ])
        if (cancelled) return
        if (!s) {
          setMissing(true)
          setLoading(false)
          return
        }
        setStore(adaptApiStore(s))
        setProducts(p.map(adaptApiProduct))
        setLoading(false)
      } else {
        const sample = STORES.find((s) => s.id === id)
        if (!sample) {
          setMissing(true)
          setLoading(false)
          return
        }
        setStore({
          id: sample.id,
          name: sample.name,
          city: sample.city,
          district: sample.district,
          rating: sample.rating,
          tags: sample.tags,
          blurb: sample.blurb,
          source: 'sample',
        })
        setProducts(
          sample.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            isAvailable: true,
            isReal: false,
          })),
        )
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Seed wishedKeys from /wishes/me. Runs whenever auth state changes so
  // logging in mid-session repopulates the set, and logout empties it.
  // All state mutations live inside the async IIFE so we don't trip the
  // react-hooks/set-state-in-effect rule on the synchronous bail.
  // Failures are non-fatal — wishedKeys just stays empty (every heart
  // renders as outline).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) {
        if (!cancelled) setWishedKeys(new Set())
        return
      }
      try {
        const list = await fetchMyWishes()
        if (cancelled) return
        setWishedKeys(
          new Set(list.items.map((w) => buildWishKey(w.title, w.store))),
        )
      } catch (err) {
        console.error('[stores/[id]] fetchMyWishes failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Called by ProductRow after a successful createWish. Adding the new
  // wish's key flips that row's heart to filled and disables the button
  // — also handles the idempotent-create case, where the backend
  // returned an existing row whose key was already in the set (no-op).
  const handleWishAdded = (wish: OwnerWishItem) => {
    setWishedKeys((prev) => {
      const next = new Set(prev)
      next.add(buildWishKey(wish.title, wish.store))
      return next
    })
  }

  if (missing) notFound()
  if (loading || !store) return <DetailSkeleton />

  const tagText: Record<StoreTag, string> = {
    fast: t('stores.tag_fast'),
    same_day: t('stores.tag_same_day'),
    nearby: t('stores.tag_nearby'),
  }

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Link
          href={backHref}
          onClick={onBackToAllStores}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--text-soft)' }}
        >
          <span aria-hidden>←</span>
          {t('stores.back_to_all')}
        </Link>

        {/* Send-gift funnel banner — same UI rule as /stores. Confirms
            the recipient context above the product grid so the user
            never wonders who their gift will go to. */}
        {recipient && (
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
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
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
        )}

        {/* Storefront banner. Same deterministic two-stop gradient
            the StoreCard's Poster uses, seeded by store.id — so a
            user who tapped a card in /stores or in a home rail
            arrives here and sees the SAME color block expand into
            the page header. Visual continuity = "this is the same
            store I tapped". The 64px logo disc sits half-overlapping
            the banner's bottom edge, anchoring the title block
            below without a hard divider. */}
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
              boxShadow: '0 14px 30px -8px rgba(58,30,80,0.35), 0 0 0 4px var(--bg-base)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
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
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--muted)' }}
          >
            {store.city}
            {store.district && (
              <>
                {' · '}
                {store.district}
              </>
            )}
            <span className="mx-1.5 opacity-50">·</span>
            ★ {store.rating}
          </p>
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

        <h2
          className="mt-7 text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('stores.products')}
        </h2>

        {products.length === 0 ? (
          <p
            className="mt-2 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {t('stores.products_empty')}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                storeId={store.id}
                storeName={store.name}
                recipient={recipient || null}
                isWished={wishedKeys.has(buildWishKey(p.name, store.name))}
                onWishAdded={handleWishAdded}
              />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

function ProductRow({
  product,
  storeId,
  storeName,
  recipient,
  isWished,
  onWishAdded,
}: {
  product: DisplayProduct
  storeId: string
  storeName: string
  // Recipient username from the funnel. When set, "Send as gift" carries
  // it through to /send so the username is prefilled on arrival.
  recipient: string | null
  isWished: boolean
  onWishAdded: (wish: OwnerWishItem) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accessToken } = useAuth()
  // Per-row loading state for the wishlist add — the page renders many
  // ProductRows so this can't be lifted to the page without complicating
  // the model.
  const [wishBusy, setWishBusy] = useState(false)

  // Out-of-stock products get an inert disabled state — clicking through
  // would just hit the backend's stock guard and bounce back.
  const qs = new URLSearchParams()
  qs.set('store', storeId)
  qs.set('product', product.id)
  if (product.isReal) {
    qs.set('productId', product.id)
    qs.set('storeIdRef', storeId)
  }
  if (recipient) qs.set('to', recipient)
  const sendHref = `/send?${qs.toString()}`

  // Add-to-wishlist click. Calls POST /wishes via the shared createWish
  // helper. Login-required path redirects to /login (the page is publicly
  // browsable so unauthenticated visitors are common). Duplicate-click
  // protection lives in `wishBusy`; `isWished` keeps the button inert
  // once the row is already on the wishlist (the parent flips it via
  // onWishAdded).
  const onAddToWishlist = async () => {
    if (wishBusy || isWished) return
    if (!accessToken) {
      router.push('/login')
      return
    }
    setWishBusy(true)
    try {
      const wish = await createWish({
        title: product.name,
        store: storeName,
        visibility: 'public',
      })
      // Notify the parent so wishedKeys updates and this row's heart
      // flips to filled (also covers the idempotent-create case where
      // the backend returned an existing row).
      onWishAdded(wish)
      toast.show(t('wishlist.added_product_toast'))
    } catch (err) {
      console.error('[stores/[id]] createWish failed', err)
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
    } finally {
      setWishBusy(false)
    }
  }

  // Visual state of the heart button: outline → filled, with a slight
  // scale-pop on transition. The button's `disabled` attribute keeps the
  // wished state inert (no hover lift, no click), and disabled:opacity
  // is overridden by inline styles when wished so the filled heart stays
  // at full vibrance instead of looking faded out.
  const heartBgWished =
    'color-mix(in srgb, var(--primary) 14%, transparent)'
  const heartBgIdle = 'var(--card-soft)'

  return (
    <li
      className="rounded-3xl border p-4 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: product.isAvailable ? 1 : 0.6,
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
          <p
            className="mt-0.5 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {t('store.from')} {storeName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Wishlist heart — available regardless of stock since you can
              wish for items that are temporarily out. Filled when the
              product is already on the wishlist; clicks no-op in that
              state (button.disabled). */}
          <button
            type="button"
            onClick={onAddToWishlist}
            disabled={wishBusy || isWished}
            aria-label={t('wishlist.add')}
            aria-pressed={isWished}
            aria-busy={wishBusy || undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-default"
            style={{
              borderColor: isWished ? 'transparent' : 'var(--border)',
              background: isWished ? heartBgWished : heartBgIdle,
              color: 'var(--primary)',
              // Wished state stays vibrant; busy state dims to indicate
              // an in-flight request.
              opacity: wishBusy ? 0.6 : 1,
              boxShadow: isWished
                ? '0 4px 14px -6px color-mix(in srgb, var(--primary) 50%, transparent)'
                : undefined,
            }}
          >
            {wishBusy ? (
              <span
                aria-hidden
                className="qift-spin h-3.5 w-3.5 rounded-full border-2 border-[var(--primary)]/30 border-t-[var(--primary)]"
              />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill={isWished ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform"
                style={{ transform: isWished ? 'scale(1.06)' : 'scale(1)' }}
              >
                <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
              </svg>
            )}
          </button>
          <span
            className="rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: 'var(--ring)',
              color: 'var(--primary)',
            }}
          >
            {product.price}
          </span>
        </div>
      </div>
      {product.isAvailable ? (
        <Link
          href={sendHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {t('stores.send_as_gift')}
        </Link>
      ) : (
        <span
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--muted)',
          }}
        >
          {t('store.out_of_stock')}
        </span>
      )}
    </li>
  )
}

function adaptApiStore(s: ApiStore): DisplayStore {
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    district: '',
    rating: 5,
    tags: [],
    blurb: '',
    source: 'api',
  }
}

function adaptApiProduct(p: ApiProduct): DisplayProduct {
  return {
    id: p.id,
    name: p.name,
    price: `${p.price.toLocaleString('ar-SA')} ر.س`,
    isAvailable: p.isAvailable && p.stockStatus === 'in_stock',
    isReal: true,
  }
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
