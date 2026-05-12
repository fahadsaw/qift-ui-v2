'use client'

import ProductCard from './ProductCard'
import type { StorefrontProduct, StorefrontStore } from '../types'

// ProductGrid — canonical product list primitive.
//
// Themes pick the layout via the `density` prop. Each theme is
// responsible for choosing the right density for its visual
// identity:
//   - Classic: density='list' (horizontal rows)
//   - Gallery: density='grid' (vertical cards in a magazine grid)
//   - Editorial: density='list' with story-blocks interleaved by
//     the Editorial theme (NOT this primitive — Editorial composes
//     its own layout that uses ProductGrid for product runs)
//
// The grid IS the wishlist-aware container — it carries the
// owner's wishlist Set so HeartButtons resolve their initial
// state without per-tile API calls. The parent (theme) provides
// the set; the grid just threads it through.
export default function ProductGrid({
  products,
  store,
  recipientUsername,
  wishedProductIds,
  onWishlistChanged,
  density = 'list',
}: {
  products: StorefrontProduct[]
  store: StorefrontStore
  recipientUsername: string | null
  // Set of product ids the current viewer has wishlisted. The
  // theme/page is responsible for hydrating this once (from
  // fetchMyWishes()) and updating it via onWishlistChanged. We
  // pass a Set for O(1) `has()` per tile.
  wishedProductIds: Set<string>
  onWishlistChanged: (productId: string, nowWished: boolean) => void
  density?: 'list' | 'grid'
}) {
  if (products.length === 0) return null

  const className =
    density === 'grid'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
      : 'flex flex-col gap-2.5'

  return (
    <ul className={className}>
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          store={store}
          recipientUsername={recipientUsername}
          isWished={wishedProductIds.has(p.id)}
          onWishlistChanged={onWishlistChanged}
          density={density}
        />
      ))}
    </ul>
  )
}
