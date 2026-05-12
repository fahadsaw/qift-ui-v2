'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  createWish,
  deleteWishByProduct,
} from '@/lib/social'
import type { StorefrontProduct } from '../types'

// HeartButton — toggles the linked product on the viewer's wishlist.
//
// Canonical primitive for "❤️ this product" across the storefront.
// Themes consume this; they MUST NOT reimplement the toggle logic —
// the shared component is the single source of truth for the
// wishlist toggle invariants (product-linked vs legacy free-text,
// idempotent server-side, auth gating, toast surfaces, optimistic
// UX).
//
// Privacy / business-logic invariants preserved here:
//   - createWish / deleteWishByProduct already encapsulate the
//     wishlistedByCount denormalization on the backend.
//   - Anonymous viewers are redirected to /login; we never queue
//     a wishlist write for an unauthenticated session.
//   - The button is inert on out-of-stock / deactivated products
//     (returning the disabled visual; the server would reject
//     anyway, but we avoid a round-trip).
//
// Themes can choose the SIZE + POSITION of the button but cannot
// replace its behavior.
export default function HeartButton({
  product,
  storeId,
  storeName,
  isWished,
  onChanged,
  size = 'md',
}: {
  product: StorefrontProduct
  storeId: string
  storeName: string
  // Authoritative wished state — owned by the parent (typically
  // the ProductCard reads from the store-level wishlist set).
  isWished: boolean
  // Called after a successful toggle so the parent can update its
  // local set without re-fetching.
  onChanged: (productId: string, nowWished: boolean) => void
  // Visual size token. The actual classes are theme-agnostic; a
  // theme can wrap the button in a container that overrides
  // positioning but the button itself stays predictable.
  size?: 'sm' | 'md' | 'lg'
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accessToken } = useAuth()
  const [busy, setBusy] = useState(false)

  const isDisabled = !product.isAvailable || product.stockStatus !== 'in_stock'

  const onToggle = async () => {
    if (busy || isDisabled) return
    if (!accessToken) {
      router.push('/login')
      return
    }
    setBusy(true)
    try {
      if (isWished) {
        await deleteWishByProduct(product.id)
        onChanged(product.id, false)
        toast.show(t('wishlist.removed_product_toast'))
      } else {
        await createWish({
          productId: product.id,
          storeId,
          productName: product.name,
          storeName,
          imageUrl: product.imageUrl,
          price: product.price,
          currency: product.currency ?? undefined,
          visibility: 'public',
        })
        onChanged(product.id, true)
        toast.show(t('wishlist.added_product_toast'))
      }
    } catch {
      toast.show(t('wishlist.add_failed_toast'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  // Size tokens. The button is a circle so any theme can drop it
  // in without conflicting with rectangular price chips / CTAs.
  const dim = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const iconDim = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={busy || isDisabled}
      aria-pressed={isWished}
      aria-label={
        isWished ? t('wishlist.remove') : t('wishlist.added_product_toast')
      }
      className={`qift-press inline-flex items-center justify-center rounded-full border backdrop-blur transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${dim}`}
      style={{
        borderColor: isWished ? 'transparent' : 'var(--border)',
        background: isWished
          ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
          : 'var(--card-soft)',
        color: 'var(--primary)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill={isWished ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconDim}
        aria-hidden
      >
        <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
      </svg>
    </button>
  )
}
