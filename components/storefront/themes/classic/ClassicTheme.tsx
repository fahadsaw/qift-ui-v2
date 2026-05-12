'use client'

import StoreHeader from '../../primitives/StoreHeader'
import ProductGrid from '../../primitives/ProductGrid'
import Slot from '../../primitives/Slot'
import type { StorefrontThemeProps, SlotContext } from '../../types'

// ClassicTheme — the default storefront layout.
//
// Visual identity: cover image + logo strip header, optional
// hero subhead, single-column product list with horizontal-row
// cards. Designed to preserve the storefront's pre-theme visual
// identity exactly — every existing store renders as Classic
// after the Phase 5 migration backfill.
//
// Composition rules followed:
//   - Themes ONLY compose primitives. We never render a heart /
//     buy-as-gift / metric chip directly here — the primitives
//     own that visual language.
//   - No direct API calls. No service imports. No raw product
//     data shaping beyond what reaches the prop contract.
//   - All slots scaffolded (V1 renders nothing — see Slot.tsx).
//
// Adding theme-specific config (V2+): pull from
// `store.themeConfig.themeSpecific.classic.*` — the backend
// validator passes it through; the component decides what to do.
export default function ClassicTheme({
  store,
  products,
  viewer,
}: StorefrontThemeProps) {
  // Per-tile wished-state hydration lives in the theme — the page
  // wrapper passes a Set once; we thread it through to the grid.
  // V1 placeholder: every tile starts unwished. Wired by the
  // dispatcher wrapper (Commit 5 next steps) when it knows the
  // viewer's full wishlist.
  const wishedProductIds = new Set<string>()
  const onWishlistChanged = (_id: string, _next: boolean) => {
    // V1 — themes are stateless about the wishlist set. The
    // dispatcher wrapper owns the set and re-renders on change.
    // This callback is forwarded; the parent re-fetches or
    // optimistically updates.
    void _id
    void _next
  }

  const slotContextBase = {
    store: { id: store.id, name: store.name, accentColor: store.themeConfig.accentColor },
    products,
    viewer,
  }

  return (
    <div className="flex flex-col gap-5">
      <StoreHeader store={store} showCover />

      <Slot
        id="hero"
        context={{ slotId: 'hero', ...slotContextBase } as SlotContext}
      />
      <Slot
        id="aboveGrid"
        context={{ slotId: 'aboveGrid', ...slotContextBase } as SlotContext}
      />

      <ProductGrid
        products={products}
        store={store}
        recipientUsername={viewer.recipientUsername}
        wishedProductIds={wishedProductIds}
        onWishlistChanged={onWishlistChanged}
        density="list"
      />

      <Slot
        id="belowGrid"
        context={{ slotId: 'belowGrid', ...slotContextBase } as SlotContext}
      />
      <Slot
        id="aboveFooter"
        context={{ slotId: 'aboveFooter', ...slotContextBase } as SlotContext}
      />
    </div>
  )
}
