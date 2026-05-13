// Storefront primitive contract — the SHARED prop types every
// primitive + theme consumes. Single source of truth so themes
// can't drift on what they receive.
//
// See `project_storefront_architecture.md` Section 5 (theme
// contract).

// Sanitized public product. Whatever the storefront primitives
// receive is what reaches themes; metrics that aren't opted in
// via Store.metricsVisibility don't appear on this type.
export type StorefrontProduct = {
  id: string
  name: string
  description: string | null
  price: number
  currency: string | null
  category: string | null
  // Primary image URL (cached snapshot). The full gallery rides on
  // `images` (Phase 4 Product gallery work); legacy paths still
  // render imageUrl when images is empty.
  imageUrl: string | null
  images: string[]
  isAvailable: boolean
  stockStatus: 'in_stock' | 'out_of_stock'
  isFastDelivery: boolean
  // OPT-IN metrics — present only when the merchant explicitly
  // flipped the corresponding `Store.metricsVisibility` key on.
  // The <MetricChip> primitive renders nothing for missing keys.
  metrics?: {
    wishlistSaves?: number
    purchaseCount?: number
    giftedCount?: number
    popularityScore?: number
    ratingsCount?: number
    stockCount?: number
    soldCount?: number
    trendingIndicator?: boolean
  }
}

// Public store identity for the storefront. Carries enough to
// render header + branding + theme dispatch; never carries
// owner-private fields (commercial registration, webhook secret,
// etc.) — those live on the merchant dashboard projection.
export type StorefrontStore = {
  id: string
  name: string
  city: string | null
  category: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  websiteUrl: string | null
  instagramHandle: string | null
  tiktokHandle: string | null
  snapchatHandle: string | null
  // Theme + bounded config from the backend. Resolved against the
  // store's live plan server-side — themes never re-check
  // eligibility.
  themeSlug: 'classic' | 'gallery' | 'editorial'
  themeConfig: ResolvedThemeConfig
}

// Bounded theme config — only the universally-supported keys are
// surfaced on the contract. Theme-specific config lives in a
// nested dict that each theme component types internally.
export type ResolvedThemeConfig = {
  accentColor: string | null
  bannerImageUrl: string | null
  heroHeadline: string | null
  heroSubhead: string | null
  themeSpecific?: Record<string, unknown>
}

// Viewer context. Themes use this to decide whether to show
// "sign in to wishlist" hints, never to make business decisions.
export type StorefrontViewer = {
  userId: string | null
  isAuthenticated: boolean
  // Recipient username when arriving via the gift funnel
  // (/stores?to=<username>). The buy-as-gift CTA threads it
  // through to /send so the recipient is preselected.
  recipientUsername: string | null
}

// Slot data context (V1 — every slot is currently empty; the
// contract is the deliverable). Future plugin instances receive
// this and render into the slot.
export type SlotContext = {
  slotId: SlotId
  store: { id: string; name: string; accentColor: string | null }
  // Sanitized product list — same shape themes get.
  products: StorefrontProduct[]
  viewer: StorefrontViewer
}

// All recognized slot ids. Adding a new one is a deliberate
// architectural choice — see project_storefront_architecture.md
// Section 8.
export type SlotId =
  | 'hero'
  | 'aboveGrid'
  | 'belowGrid'
  | 'sidebar'
  | 'aboveFooter'

// The unified theme prop. Every theme component receives this
// SAME shape — no theme-specific extensions allowed.
//
// `wishedProductIds` + `onWishlistChanged` are owned by the
// dispatcher wrapper, NOT by themes. The wrapper hydrates the
// Set once (fetchMyWishes) and threads the same reference to
// every primitive. This is what makes the heart toggle feel
// instant + lets every theme show consistent wishlist state
// without per-tile API calls.
export type StorefrontThemeProps = {
  store: StorefrontStore
  products: StorefrontProduct[]
  viewer: StorefrontViewer
  // O(1) lookup per tile. Empty Set for guests.
  wishedProductIds: Set<string>
  // Notified after a successful toggle so the wrapper can update
  // its local Set without re-fetching. Themes pass this straight
  // through to ProductGrid → ProductCard → HeartButton.
  onWishlistChanged: (productId: string, isWished: boolean) => void
}

// Heart-toggle + buy-as-gift handler signatures, used by the
// primitives that wrap them. Themes don't see these directly —
// the primitives encapsulate the wish-toggle logic and only
// expose a `productId` callback surface.
export type WishlistToggleHandler = (
  product: StorefrontProduct,
  next: boolean,
) => Promise<void> | void
