'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import BuyAsGiftButton from './BuyAsGiftButton'
import HeartButton from './HeartButton'
import MetricChip, { TrendingChip } from './MetricChip'
import ProductGalleryModal from './ProductGalleryModal'
import type { StorefrontProduct, StorefrontStore } from '../types'

// ProductCard — canonical product tile for the storefront.
//
// Themes consume this; they choose layout density (one column,
// 2-col grid, magazine grid) but the card's visual + behavior
// stay consistent so a customer recognizes the gifting CTA
// regardless of theme.
//
// Two density modes:
//   - 'list' (default): horizontal row, large image on the start,
//     content + CTAs on the end. Used by Classic / Editorial.
//   - 'grid': vertical card with image hero, then content + CTAs
//     stacked below. Used by Gallery (magazine layout).
//
// Privacy invariants:
//   - Metrics are gated by Store.metricsVisibility server-side;
//     this primitive renders ONLY what reaches it. <MetricChip>
//     itself guards on undefined / null so missing keys = no
//     visible chip.
//   - Heart toggle + buy-as-gift are CANONICAL primitives — they
//     own the wishlist + send routing invariants and can never
//     be bypassed by a theme.
export default function ProductCard({
  product,
  store,
  recipientUsername,
  isWished,
  onWishlistChanged,
  density = 'list',
}: {
  product: StorefrontProduct
  store: StorefrontStore
  recipientUsername: string | null
  isWished: boolean
  onWishlistChanged: (productId: string, nowWished: boolean) => void
  density?: 'list' | 'grid'
}) {
  const { t } = useI18n()
  const [imgErrored, setImgErrored] = useState(false)
  // Gallery modal is opt-in per product: only when the merchant
  // has uploaded multiple images. A single-image product keeps the
  // legacy non-interactive tile (tapping the image does nothing
  // special — focus stays on Heart / Buy-as-Gift).
  const [galleryOpen, setGalleryOpen] = useState(false)
  const isOutOfStock =
    !product.isAvailable || product.stockStatus !== 'in_stock'
  // Effective gallery: prefer the ordered `images` list from the
  // Phase-4 gallery; fall back to the cached `imageUrl` snapshot
  // for legacy products with no gallery rows.
  const galleryImages =
    product.images && product.images.length > 0
      ? product.images
      : product.imageUrl
        ? [product.imageUrl]
        : []
  const primaryImage = galleryImages[0] ?? null
  const hasMultipleImages = galleryImages.length > 1
  const showImage = primaryImage !== null && !imgErrored
  const priceLabel = formatPrice(product.price, product.currency)

  // Modal mount — shared by both density branches. Rendered as a
  // sibling of the <li> via a fragment so the dialog isn't a
  // descendant of <ul> (cleaner DOM semantics + position: fixed
  // works without ancestor overflow surprises).
  const galleryModal =
    galleryOpen && hasMultipleImages ? (
      <ProductGalleryModal
        images={galleryImages}
        productName={product.name}
        onClose={() => setGalleryOpen(false)}
      />
    ) : null

  if (density === 'grid') {
    return (
      <>
      <li
        className="overflow-hidden rounded-3xl border backdrop-blur-md transition-shadow duration-300"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
          opacity: isOutOfStock ? 0.65 : 1,
        }}
      >
        <div className="relative">
          {/* Image stage. When the product has multiple gallery
              images, the stage becomes a tap-target that opens the
              ProductGalleryModal. Single-image products keep the
              previous non-interactive tile (no nudge toward an
              experience that doesn't exist). The "+N more" badge
              advertises the gallery without being noisy. */}
          {hasMultipleImages ? (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              aria-label={t('storefront.gallery_view_more')}
              className="block w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                aspectRatio: '5 / 4',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
              }}
            >
              {showImage && primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImage}
                  alt={product.name}
                  loading="lazy"
                  onError={() => setImgErrored(true)}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-full w-full items-center justify-center text-4xl"
                >
                  🎁
                </div>
              )}
            </button>
          ) : (
            <div
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: '5 / 4',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
              }}
            >
              {showImage && primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImage}
                  alt={product.name}
                  loading="lazy"
                  onError={() => setImgErrored(true)}
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
            </div>
          )}
          {priceLabel && !isOutOfStock && (
            <span
              className="pointer-events-none absolute end-3 bottom-3 inline-flex rounded-full px-3 py-1 text-xs font-bold tabular-nums backdrop-blur"
              style={{
                background:
                  'color-mix(in srgb, var(--card) 88%, transparent)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
              }}
            >
              {priceLabel}
            </span>
          )}
          {hasMultipleImages && (
            <span
              className="pointer-events-none absolute start-3 bottom-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold backdrop-blur tabular-nums"
              style={{
                background: 'color-mix(in srgb, var(--card) 88%, transparent)',
                color: 'var(--text-soft)',
                border: '1px solid var(--border)',
              }}
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <rect x="3" y="3" width="14" height="14" rx="2" />
                <path d="M7 7l3 3 3-3M21 7v14H7" />
              </svg>
              {galleryImages.length}
            </span>
          )}
          <div className="absolute end-3 top-3">
            <HeartButton
              product={product}
              storeId={store.id}
              storeName={store.name}
              isWished={isWished}
              onChanged={onWishlistChanged}
              size="md"
            />
          </div>
          {isOutOfStock && (
            <span
              className="pointer-events-none absolute start-3 top-3 inline-flex rounded-full px-3 py-1 text-[0.65rem] font-bold backdrop-blur"
              style={{
                background: 'color-mix(in srgb, var(--card) 88%, transparent)',
                color: '#B83A50',
                border: '1px solid var(--border)',
              }}
            >
              {t('store.out_of_stock')}
            </span>
          )}
        </div>
        <div className="px-4 pb-4 pt-3">
          <h3
            className="text-base font-bold leading-tight"
            style={{ color: 'var(--ink)' }}
          >
            {product.name}
          </h3>
          {(product.metrics?.wishlistSaves ||
            product.metrics?.giftedCount ||
            product.metrics?.trendingIndicator) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <TrendingChip trending={product.metrics?.trendingIndicator} />
              <MetricChip metric="wishlistSaves" value={product.metrics?.wishlistSaves} />
              <MetricChip metric="giftedCount" value={product.metrics?.giftedCount} />
            </div>
          )}
          <div className="mt-3">
            <BuyAsGiftButton
              product={product}
              storeId={store.id}
              recipientUsername={recipientUsername}
              variant="primary"
            />
          </div>
        </div>
      </li>
      {galleryModal}
      </>
    )
  }

  // 'list' density — horizontal row used by Classic / Editorial.
  return (
    <>
    <li
      className="flex items-stretch gap-3 rounded-3xl border p-3 backdrop-blur-md transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: isOutOfStock ? 0.65 : 1,
      }}
    >
      {/* Image stage — same gallery-modal pattern as the grid
          density. The 96x96 thumbnail becomes a tap target when
          multiple images exist; single-image products stay static.
          The "+N" badge sits at the bottom-end corner so it
          doesn't compete with the price text on the right. */}
      {hasMultipleImages ? (
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          aria-label={t('storefront.gallery_view_more')}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:h-28 sm:w-28"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
          }}
        >
          {showImage && primaryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryImage}
              alt={product.name}
              loading="lazy"
              onError={() => setImgErrored(true)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-2xl"
            >
              🎁
            </div>
          )}
          <span
            aria-hidden
            className="absolute end-1.5 bottom-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold backdrop-blur tabular-nums"
            style={{
              background: 'color-mix(in srgb, var(--card) 88%, transparent)',
              color: 'var(--text-soft)',
              border: '1px solid var(--border)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
            >
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <path d="M7 7l3 3 3-3M21 7v14H7" />
            </svg>
            {galleryImages.length}
          </span>
        </button>
      ) : (
        <div
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl sm:h-28 sm:w-28"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
          }}
        >
          {showImage && primaryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryImage}
              alt={product.name}
              loading="lazy"
              onError={() => setImgErrored(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-2xl"
            >
              🎁
            </div>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-sm font-bold"
              style={{ color: 'var(--ink)' }}
            >
              {product.name}
            </h3>
            {priceLabel && (
              <p
                className="mt-0.5 text-xs font-semibold tabular-nums"
                style={{ color: 'var(--primary)' }}
              >
                {priceLabel}
              </p>
            )}
            {isOutOfStock && (
              <p
                className="mt-0.5 text-[0.65rem] font-bold"
                style={{ color: '#B83A50' }}
              >
                {t('store.out_of_stock')}
              </p>
            )}
          </div>
          <HeartButton
            product={product}
            storeId={store.id}
            storeName={store.name}
            isWished={isWished}
            onChanged={onWishlistChanged}
            size="sm"
          />
        </div>
        {(product.metrics?.wishlistSaves ||
          product.metrics?.giftedCount ||
          product.metrics?.trendingIndicator) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <TrendingChip trending={product.metrics?.trendingIndicator} />
            <MetricChip
              metric="wishlistSaves"
              value={product.metrics?.wishlistSaves}
            />
            <MetricChip
              metric="giftedCount"
              value={product.metrics?.giftedCount}
            />
          </div>
        )}
        <div className="mt-auto pt-3">
          <BuyAsGiftButton
            product={product}
            storeId={store.id}
            recipientUsername={recipientUsername}
            variant="primary"
          />
        </div>
      </div>
    </li>
    {galleryModal}
    </>
  )
}

function formatPrice(price: number, currency: string | null): string | null {
  if (!price || price <= 0) return null
  // Locale-formatted with Arabic-Saudi numerals as default; the
  // currency code falls back to SAR for legacy/sample products.
  const cur = currency ?? 'ر.س'
  return `${price.toLocaleString('ar-SA')} ${cur}`
}
