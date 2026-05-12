'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import type { StorefrontProduct } from '../types'

// BuyAsGiftButton — routes to /send pre-filled with the product +
// optional recipient. Canonical primitive for the gift-purchase
// CTA across the storefront.
//
// Privacy / business-logic invariants preserved here:
//   - The buy-as-gift flow goes through the regular /send route,
//     which already enforces sender masking / coverage / address
//     gating / payment guards. This button NEVER bypasses /send.
//   - Recipient username is threaded via the URL — it's already
//     public info (the funnel arrives via /stores?to=<u>).
//   - No client-side trust on availability; the inert disabled
//     state matches the server's stock guard. The server would
//     reject anyway; we avoid the round-trip.
//
// Themes can choose the SIZE + POSITION but cannot replace the
// behavior or skip the /send routing.
export default function BuyAsGiftButton({
  product,
  storeId,
  recipientUsername,
  variant = 'primary',
}: {
  product: StorefrontProduct
  storeId: string
  // Pre-filled recipient from the funnel. Null when the visitor
  // arrived directly at the storefront with no recipient context.
  recipientUsername: string | null
  // Visual variant. Primary is the heavy gradient CTA; secondary
  // is a softer outline. Themes pick which fits their layout.
  variant?: 'primary' | 'secondary'
}) {
  const { t } = useI18n()

  const isDisabled =
    !product.isAvailable || product.stockStatus !== 'in_stock'

  // Build the /send URL. All real merchant products carry
  // productId + storeIdRef so the send flow can attach the gift
  // to the proper catalog entry.
  const qs = new URLSearchParams()
  qs.set('store', storeId)
  qs.set('product', product.id)
  qs.set('productId', product.id)
  qs.set('storeIdRef', storeId)
  if (recipientUsername) qs.set('to', recipientUsername)
  const href = `/send?${qs.toString()}`

  if (isDisabled) {
    // Render as an inert span so screen readers don't announce a
    // link/button that won't work. Matches the visual style of
    // the chosen variant.
    return (
      <span
        className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold opacity-50"
        style={{
          background:
            variant === 'primary'
              ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
              : 'var(--card-soft)',
          color: variant === 'primary' ? '#fff' : 'var(--text-soft)',
        }}
        aria-disabled
      >
        {t('store.out_of_stock')}
      </span>
    )
  }

  if (variant === 'secondary') {
    return (
      <Link
        href={href}
        className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text)',
          background: 'transparent',
        }}
      >
        {t('stores.send_as_gift')}
      </Link>
    )
  }

  return (
    <Link
      href={href}
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
  )
}
