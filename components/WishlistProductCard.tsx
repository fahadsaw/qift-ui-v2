'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

// Shared wishlist product card — the SINGLE source of truth for the
// rich "wished product" presentation. Used by:
//   - /wishlist (owner's own wishlist; mode='owner')
//   - /profile  (owner's wishlist tab; mode='owner')
//   - /u/<username> (viewing another user's public wishlist;
//     mode='public' — no unheart, primary CTA is "Send as gift")
//
// Why one component for everything:
//   - The wishlist visual identity is part of Qift's product surface.
//     Drift across three pages would dilute it.
//   - Privacy / FK semantics are the same: a product-linked wish
//     carries productId + storeId + snapshot fields; rendering is the
//     same regardless of viewer.
//   - Single source of truth for product media (the imageUrl is a URL
//     pointer to the Product row, never a copy — see
//     `project_product_media_single_source.md`).
//
// Modes:
//   - 'owner'  : viewing your own wishlist. Shows unheart pill on the
//                hero, "Send as gift" + "View storefront" CTAs. (You
//                CAN send yourself a gift — it routes to /send with
//                your own handle, which the send flow blocks anyway,
//                so we hide the Send CTA in owner mode for clarity.)
//                Actually: in owner mode, primary CTA is "View
//                storefront" (open the product); the unheart pill
//                handles the remove gesture.
//   - 'public' : viewing another user's wishlist. NO unheart. Primary
//                CTA is "Send as gift" routed to /send?to=<username>;
//                secondary CTA is "View product".
//
// Privacy:
//   This component never reads sender / recipient identity. It only
//   knows the product anchor. There is no identity-leak surface here
//   to worry about.
export type WishlistProductInput = {
  // Stable client key.
  id: string
  // Required snapshot fields. We never block render on missing
  // product/store: legacy free-text wishes keep working with title +
  // store (string fallback) but the rich hero shows the placeholder.
  productName: string
  storeName: string | null
  imageUrl: string | null
  // FKs — required for the navigation CTAs to resolve. Public wishes
  // with productId=null are deactivated/legacy and render in a more
  // muted state (no CTAs).
  productId: string | null
  storeId: string | null
  // Optional price chip on the image hero.
  price: number | null
  currency: string | null
  // Deactivation cascade. The Wish row deactivates when the linked
  // Product or Store is removed.
  deactivatedAt: string | null
}

export default function WishlistProductCard({
  wish,
  mode,
  density = 'comfortable',
  recipientUsername,
  onRemove,
}: {
  wish: WishlistProductInput
  mode: 'owner' | 'public'
  // Visual density. 'comfortable' = full-width single-column with
  // 5:4 image hero, side-by-side CTA pills. 'compact' = optimized
  // for 2-column mobile grids: square image hero, smaller padding,
  // single-line product/store typography, CTAs collapse to icons
  // when space is tight. Default 'comfortable' preserves the legacy
  // single-column wishlist look.
  density?: 'comfortable' | 'compact'
  // Required in 'public' mode — the username to seed the gift-send
  // flow. Ignored in 'owner' mode.
  recipientUsername?: string | null
  // Required in 'owner' mode — handler for the unheart gesture.
  // Ignored in 'public' mode (no unheart UI rendered).
  onRemove?: () => void
}) {
  const { t } = useI18n()
  const deactivated = wish.deactivatedAt !== null
  const productHref =
    wish.productId && wish.storeId && !deactivated
      ? `/stores/${wish.storeId}?product=${wish.productId}`
      : null

  // Owner-side gift CTA hidden — sending a gift to yourself is a
  // no-op (the send flow blocks it). Public-side gift CTA routes
  // through /send with the recipient handle pre-filled.
  const sendHref =
    mode === 'public' &&
    wish.productId &&
    wish.storeId &&
    recipientUsername &&
    !deactivated
      ? `/send?to=${encodeURIComponent(recipientUsername)}&store=${encodeURIComponent(wish.storeId)}&product=${encodeURIComponent(wish.productId)}&productId=${encodeURIComponent(wish.productId)}&storeIdRef=${encodeURIComponent(wish.storeId)}`
      : null

  const fmtPrice =
    wish.price !== null && wish.price !== undefined
      ? `${wish.price.toLocaleString('ar-SA')} ${wish.currency ?? 'ر.س'}`
      : null

  return (
    <li
      className="overflow-hidden rounded-3xl border backdrop-blur-md transition-shadow duration-300"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: deactivated ? 0.6 : 1,
      }}
    >
      <div className="relative">
        <CardImageHero
          imageUrl={wish.imageUrl}
          productName={wish.productName}
          href={productHref}
          deactivated={deactivated}
          fmtPrice={fmtPrice}
          density={density}
        />
        {mode === 'owner' && onRemove && (
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
        )}
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

      <div
        className={
          density === 'compact'
            ? 'px-3 pb-3 pt-2.5'
            : 'px-4 pb-4 pt-3 sm:px-5'
        }
      >
        <h3
          className={
            density === 'compact'
              ? 'truncate text-sm font-bold leading-tight'
              : 'text-base font-bold leading-tight'
          }
          style={{ color: 'var(--ink)' }}
        >
          {wish.productName}
        </h3>
        {wish.storeName && (
          <p
            className="mt-0.5 truncate text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {wish.storeName}
          </p>
        )}

        {(sendHref || productHref) && density === 'comfortable' && (
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
        )}

        {/* Compact density — one primary action only. In 'public'
            mode this is "Send as gift" (the high-intent path); in
            'owner' mode this is "View storefront" since the unheart
            pill on the hero handles removal. Single CTA = less
            crowded 2-column mobile grid. */}
        {density === 'compact' && (sendHref || productHref) && (
          <div className="mt-2">
            {sendHref ? (
              <Link
                href={sendHref}
                className="qift-press inline-flex w-full items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  color: '#fff',
                  boxShadow: 'var(--shadow-cta)',
                }}
              >
                {t('stores.send_as_gift')}
              </Link>
            ) : productHref ? (
              <Link
                href={productHref}
                className="inline-flex w-full items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                {t('store.view_storefront')}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </li>
  )
}

// Reusable hero — 5:4 product image, calm gradient fallback, price
// chip overlay, tappable when href provided. Local to this file
// because every consumer of WishlistProductCard already imports
// it; exporting the inner block would be premature abstraction.
function CardImageHero({
  imageUrl,
  productName,
  href,
  deactivated,
  fmtPrice,
  density,
}: {
  imageUrl: string | null
  productName: string
  href: string | null
  deactivated: boolean
  fmtPrice: string | null
  density: 'comfortable' | 'compact'
}) {
  const [errored, setErrored] = useState(false)
  const showImage = !deactivated && imageUrl !== null && !errored
  // Compact density uses a square hero so a 2-column grid tiles
  // neatly; comfortable density keeps the legacy 5:4 hero for the
  // full-width single-column layout.
  const aspectRatio = density === 'compact' ? '1 / 1' : '5 / 4'
  const body = (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio,
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
          className={`absolute inset-0 flex items-center justify-center ${density === 'compact' ? 'text-3xl' : 'text-4xl'}`}
        >
          🎁
        </div>
      )}
      {fmtPrice && !deactivated && (
        <span
          className={`absolute end-2 bottom-2 inline-flex rounded-full ${density === 'compact' ? 'px-2 py-0.5 text-[0.65rem]' : 'px-3 py-1 text-xs'} font-bold tabular-nums backdrop-blur`}
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
