'use client'

import StoreHeader from '../../primitives/StoreHeader'
import ProductGrid from '../../primitives/ProductGrid'
import Slot from '../../primitives/Slot'
import type { StorefrontThemeProps, SlotContext } from '../../types'

// GalleryTheme — magazine-grid layout. Large product images,
// minimal text per card, image-led. Suits flowers / perfumes /
// jewelry / accessories where the visual is the entire pitch.
//
// What's different from Classic:
//   - density='grid' on ProductGrid (2-col mobile, 3-col tablet+)
//   - StoreHeader keeps its full cover (Classic does too; the
//     difference is the grid below)
//   - The slot positions are identical — themes share the slot
//     contract by design.
//
// Plan gate: requires `theme_gallery` capability (Pro+). The
// server-side dispatcher won't route a Starter store here even
// if the stored themeSlug = 'gallery' (it falls back to Classic);
// this component is therefore only ever rendered for eligible
// merchants.
export default function GalleryTheme({
  store,
  products,
  viewer,
  wishedProductIds,
  onWishlistChanged,
}: StorefrontThemeProps) {
  // Same contract as ClassicTheme: wished-state set + change
  // callback are owned by the dispatcher wrapper; we just thread.
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
        density="grid"
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
