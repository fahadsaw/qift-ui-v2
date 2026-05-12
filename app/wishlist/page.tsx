'use client'

// Wishlist — the meaningful-❤️ destination. Renders the JWT
// viewer's wishlist with rich product cards for product-linked
// entries (the new product-linked path) and compact rows for
// legacy free-text wishes (the original path).
//
// Privacy / behavior rules:
//   - Authenticated viewer only. Anonymous fallback shows a
//     "log in to see your wishlist" prompt; no sample fallback
//     here so a casual visitor doesn't see anyone's wishlist.
//   - Each card renders the snapshot fields (productName,
//     storeName, imageUrl, price, currency) so the wishlist keeps
//     rendering a real card even if the product is later edited
//     or deactivated.
//   - "Unheart" routes through DELETE /wishes/by-product/:id for
//     product-linked rows, DELETE /wishes/:id for legacy rows.
//   - Three card states: in-stock (default), temporarily-OOS
//     (the live product is currently `stock_status='out_of_stock'`
//     — we don't fetch that today; future enhancement reads from
//     Product on each render), and deactivated (the row carries
//     `deactivatedAt`).

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  createWish,
  deleteWish,
  deleteWishByProduct,
  fetchMyWishes,
  type OwnerWishItem,
} from '@/lib/social'

export default function WishlistPage() {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const [items, setItems] = useState<OwnerWishItem[] | null>(null)
  const [draft, setDraft] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setItems([])
      return
    }
    try {
      const data = await fetchMyWishes()
      setItems(data.items)
    } catch {
      setItems([])
    }
  }, [accessToken])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const addFreeText = async () => {
    const title = draft.trim()
    if (!title || busy) return
    if (!accessToken) {
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
      return
    }
    setBusy(true)
    try {
      const wish = await createWish({ title, visibility })
      setItems((list) => (list ? [wish, ...list] : [wish]))
      setDraft('')
      toast.show(t('wishlist.added_toast'))
    } catch {
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const removeOne = async (w: OwnerWishItem) => {
    if (busy) return
    setBusy(true)
    // Optimistic remove.
    setItems((list) => (list ? list.filter((x) => x.id !== w.id) : list))
    try {
      if (w.productId) {
        await deleteWishByProduct(w.productId)
      } else {
        await deleteWish(w.id)
      }
      toast.show(t('wishlist.removed_product_toast'))
    } catch {
      // Roll back on failure.
      await refresh()
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('wishlist.badge')}</Badge>}
          line1={t('wishlist.title_1')}
          gradient={t('wishlist.title_2')}
          subtitle={t('wishlist.subtitle')}
          size="sm"
        />

        {/* Legacy "add a quick wish" form. The product-anchored ❤️
            on storefronts is the primary path; this stays for
            users who want to jot down a wish without a specific
            merchant product in mind. */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void addFreeText()
          }}
          className="mt-6 flex flex-col gap-2 rounded-3xl border p-3 backdrop-blur-md sm:flex-row"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('wishlist.add_placeholder')}
            className="flex-1 bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          <div
            className="flex items-center overflow-hidden rounded-xl border p-1"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            {(['public', 'private'] as const).map((v) => {
              const active = visibility === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: active ? 'var(--surface)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--text-soft)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {t(`wishlist.${v}`)}
                </button>
              )
            })}
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('wishlist.add')}
          </button>
        </form>

        {items === null ? (
          <ul className="mt-6 flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-24 w-full" rounded="2xl" />
              </li>
            ))}
          </ul>
        ) : (() => {
          // Purchase fulfillment hides rows entirely (a recipient
          // shouldn't see "you got this" — preserves the surprise +
          // prevents accidental re-hearting that would un-deactivate
          // the row mid-flight). All other deactivation reasons
          // (product_deactivated, oos_grace_expired, etc.) stay
          // visible with the "no longer available" placeholder so
          // the user can clean them up explicitly.
          const visibleItems = items.filter(
            (w) => w.deactivatedReason !== 'purchased_for_recipient',
          )
          if (visibleItems.length === 0) {
            return <EmptyState authed={isAuthenticated} />
          }
          return (
            <ul className="mt-6 flex flex-col gap-3">
              {visibleItems.map((w) =>
                w.productId ? (
                  <ProductCard
                    key={w.id}
                    wish={w}
                    onRemove={() => void removeOne(w)}
                  />
                ) : (
                  <LegacyRow
                    key={w.id}
                    wish={w}
                    onRemove={() => void removeOne(w)}
                  />
                ),
              )}
            </ul>
          )
        })()}
      </section>
    </PageContainer>
  )
}

// Rich product-linked card. Image hero, name, store, price, gifting
// CTA, unheart button. Visually mirrors the storefront product card
// so the wishlist feels like a personalized storefront — same hierarchy,
// same image treatment, same call-to-action grammar.
//
// Single source of truth: `wish.imageUrl` is the URL pointer to the
// linked Product's imageUrl (denormalized onto the Wish snapshot at
// upsert time so the wishlist keeps rendering even if the live Product
// is later edited). We do NOT copy the binary anywhere — see
// `project_product_media_single_source.md`.
function ProductCard({
  wish,
  onRemove,
}: {
  wish: OwnerWishItem
  onRemove: () => void
}) {
  const { t } = useI18n()
  const deactivated = wish.deactivatedAt !== null
  const productHref =
    wish.productId && wish.storeId && !deactivated
      ? `/stores/${wish.storeId}?product=${wish.productId}`
      : null
  const sendHref =
    wish.productId && wish.storeId && !deactivated
      ? `/send?store=${encodeURIComponent(wish.storeId)}&product=${encodeURIComponent(wish.productId)}&productId=${encodeURIComponent(wish.productId)}&storeIdRef=${encodeURIComponent(wish.storeId)}`
      : null
  const fmtPrice =
    wish.price !== null && wish.price !== undefined
      ? `${wish.price.toLocaleString('ar-SA')} ${wish.currency ?? 'ر.س'}`
      : null
  return (
    <li
      className="group overflow-hidden rounded-3xl border backdrop-blur-md transition-shadow duration-300"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: deactivated ? 0.6 : 1,
      }}
    >
      {/* Image hero. Tappable region routes to the product on the
          storefront when we have full FK context (productId +
          storeId + active). The hero is the dominant visual; the
          ❤️-pressed icon overlay (top-end) handles the unheart
          gesture without competing with the tap-to-open primary
          action. */}
      <div className="relative">
        <CardImageBlock
          imageUrl={wish.imageUrl}
          productName={wish.productName ?? wish.title}
          href={productHref}
          deactivated={deactivated}
          fmtPrice={fmtPrice}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('wishlist.remove')}
          className="qift-press absolute end-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-transform"
          style={{
            background: 'color-mix(in srgb, var(--card) 88%, transparent)',
            color: 'var(--primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
          </svg>
        </button>
        {deactivated && (
          <span
            className="absolute start-3 top-3 inline-flex rounded-full px-3 py-1 text-[0.65rem] font-bold backdrop-blur"
            style={{
              background: 'color-mix(in srgb, var(--card) 88%, transparent)',
              color: '#B83A50',
              border: '1px solid var(--border)',
            }}
          >
            {t('wishlist.no_longer_available')}
          </span>
        )}
      </div>

      {/* Body: name + store, then a dedicated CTA row. */}
      <div className="px-4 pb-4 pt-3 sm:px-5">
        <h3
          className="text-base font-bold leading-tight"
          style={{ color: 'var(--ink)' }}
        >
          {wish.productName ?? wish.title}
        </h3>
        {(wish.storeName ?? wish.store) && (
          <p
            className="mt-0.5 truncate text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {wish.storeName ?? wish.store}
          </p>
        )}

        <div
          className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          {sendHref && (
            <Link
              href={sendHref}
              className="qift-press inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                boxShadow: 'var(--shadow-cta)',
              }}
            >
              {t('stores.send_as_gift')}
              <span aria-hidden className="ms-1">
                🎁
              </span>
            </Link>
          )}
          {productHref && (
            <Link
              href={productHref}
              className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
                background: 'transparent',
              }}
            >
              {t('store.view_storefront')}
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

// Image / hero block. Split out because the wishlist + future
// surfaces (gift-post card, explore rail) all use the same shape:
// 5:4 image with a price chip overlay when available, calm gradient
// fallback when no imageUrl is on file. Tappable when href provided.
function CardImageBlock({
  imageUrl,
  productName,
  href,
  deactivated,
  fmtPrice,
}: {
  imageUrl: string | null
  productName: string
  href: string | null
  deactivated: boolean
  fmtPrice: string | null
}) {
  const [errored, setErrored] = useState(false)
  const showImage = !deactivated && imageUrl !== null && !errored
  const body = (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: '5 / 4',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
      }}
    >
      {showImage && imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image needs configured remotePatterns per store; raw <img> is fine until that config is in place.
        <img
          src={imageUrl}
          alt={productName}
          loading="lazy"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-4xl"
        >
          🎁
        </div>
      )}
      {fmtPrice && !deactivated && (
        <span
          className="absolute end-3 bottom-3 inline-flex rounded-full px-3 py-1 text-xs font-bold tabular-nums backdrop-blur"
          style={{
            background: 'color-mix(in srgb, var(--card) 88%, transparent)',
            color: 'var(--primary)',
            border: '1px solid var(--border)',
          }}
        >
          {fmtPrice}
        </span>
      )}
    </div>
  )
  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    )
  }
  return body
}

// Compact row for legacy free-text wishes (no productId). Pre-v2
// wishes use this layout so the user can still see / remove them.
function LegacyRow({
  wish,
  onRemove,
}: {
  wish: OwnerWishItem
  onRemove: () => void
}) {
  const { t } = useI18n()
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border p-4 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--primary)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-sm font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {wish.title}
        </h3>
        {wish.store && (
          <p
            className="truncate text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {wish.store}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('wishlist.remove')}
        className="shrink-0 rounded-full p-1.5 transition-colors"
        style={{ color: 'var(--muted-2)' }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  )
}

function EmptyState({ authed }: { authed: boolean | null }) {
  const { t } = useI18n()
  return (
    <div
      className="qift-fade-in mt-6 flex flex-col items-center rounded-3xl border p-8 text-center backdrop-blur-md"
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
        >
          <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
          <path d="M19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
        </svg>
      </span>
      <h3
        className="mt-4 text-base font-bold"
        style={{ color: 'var(--ink)' }}
      >
        {t('wishlist.empty_title')}
      </h3>
      <p
        className="mt-1.5 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('wishlist.empty_body')}
      </p>
      <Link
        href={authed ? '/stores' : '/login?next=/wishlist'}
        className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {t('wishlist.empty_cta')}
      </Link>
    </div>
  )
}
