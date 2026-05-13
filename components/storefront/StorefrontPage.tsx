'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { fetchMyWishes } from '@/lib/social'
import type { ApiProduct, ApiStore } from '@/lib/storesApi'
import StorefrontDispatcher from './StorefrontDispatcher'
import type {
  ResolvedThemeConfig,
  StorefrontProduct,
  StorefrontStore,
  StorefrontViewer,
} from './types'

// StorefrontPage — the wrapper that owns viewer/wishlist state
// and mounts the theme dispatcher.
//
// This is the bridge between the wire-format `ApiStore`/`ApiProduct`
// payloads and the storefront's internal `StorefrontStore`/
// `StorefrontProduct` contract. By owning the bridge here, themes
// stay completely free of API calls, type adaptation, or wishlist
// state — they just render the props they receive.
//
// Wishlist Set ownership
// ---------------------
// The wishlist Set is hydrated ONCE per mount via `fetchMyWishes`
// and threaded through to every product tile (O(1) `has()`). The
// `onWishlistChanged` callback updates the Set locally after a
// successful heart toggle — no re-fetch, no per-tile API calls.
// Anonymous viewers get an empty Set; the heart primitive routes
// them to /login on click.
//
// Theme system invariants this wrapper preserves:
//   - The wrapper NEVER decides which theme renders — the server
//     has already resolved `themeSlug` through
//     `resolveActiveTheme(stored, plan)` (downgrade-safe) by the
//     time the payload reaches us. The dispatcher just renders.
//   - The wrapper does NOT add presentation. Wrapping chrome
//     (recipient banner, back link, demo banners) lives on the
//     route page, not in this component — themes own the entire
//     storefront body.
//   - Adapters are PURE: they map shapes, they don't fetch, they
//     don't decide visibility (the backend already projected only
//     the merchant-allowed metric keys before the wire).
export default function StorefrontPage({
  store,
  products,
  recipientUsername,
}: {
  store: ApiStore
  products: ApiProduct[]
  recipientUsername: string | null
}) {
  const { accessToken, userId, isAuthenticated } = useAuth()
  const [wishedProductIds, setWishedProductIds] = useState<Set<string>>(
    new Set(),
  )

  // Hydrate the wishlist Set once per auth-state change. Mirrors
  // the legacy /stores/[id] behavior: log in mid-session, set
  // refills; log out, set empties. Failures are non-fatal — the
  // tiles just render as un-hearted.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) {
        if (!cancelled) setWishedProductIds(new Set())
        return
      }
      try {
        const list = await fetchMyWishes()
        if (cancelled) return
        const ids = new Set<string>()
        for (const w of list.items) {
          // Deactivated rows (recipient-purchased / product-deactivated
          // / oos-grace-expired) don't count as hearted. The
          // /stores/[id] legacy renderer did the same gate.
          if (w.deactivatedAt) continue
          if (w.productId) ids.add(w.productId)
        }
        setWishedProductIds(ids)
      } catch (err) {
        console.error('[StorefrontPage] fetchMyWishes failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Heart-toggle callback. Themes pass this straight through to
  // every HeartButton via ProductGrid → ProductCard. The button
  // calls it after the server confirms the toggle (createWish /
  // deleteWishByProduct) so the Set always reflects on-disk state.
  const handleWishlistChanged = useCallback(
    (productId: string, isWished: boolean) => {
      setWishedProductIds((prev) => {
        const next = new Set(prev)
        if (isWished) next.add(productId)
        else next.delete(productId)
        return next
      })
    },
    [],
  )

  const storefrontStore = adaptApiStore(store)
  const storefrontProducts = products.map(adaptApiProduct)
  const viewer: StorefrontViewer = {
    userId: userId ?? null,
    isAuthenticated,
    recipientUsername,
  }

  return (
    <StorefrontDispatcher
      store={storefrontStore}
      products={storefrontProducts}
      viewer={viewer}
      wishedProductIds={wishedProductIds}
      onWishlistChanged={handleWishlistChanged}
    />
  )
}

// Adapter — `ApiStore` (wire) → `StorefrontStore` (theme contract).
//
// Pure. The backend has ALREADY resolved theme eligibility and
// sanitized themeConfig through the bounded allow-list. We just
// rename + default-fill optional fields so themes never have to
// defensively coalesce.
//
// Exported for tests + for future SSR variants that need to render
// a storefront fragment outside the StorefrontPage wrapper.
export function adaptApiStore(s: ApiStore): StorefrontStore {
  return {
    id: s.id,
    name: s.name,
    city: s.city ?? null,
    category: s.category ?? null,
    logoUrl: s.logoUrl ?? null,
    coverImageUrl: s.coverImageUrl ?? null,
    websiteUrl: s.websiteUrl ?? null,
    instagramHandle: s.instagramHandle ?? null,
    tiktokHandle: s.tiktokHandle ?? null,
    snapchatHandle: s.snapchatHandle ?? null,
    // Server-resolved slug; trust as authoritative. Defensive
    // fallback to 'classic' for pre-Phase-5 caches that lack the
    // field — the dispatcher also falls back, so this is defence
    // in depth.
    themeSlug: s.themeSlug ?? 'classic',
    themeConfig: adaptThemeConfig(s.themeConfig),
  }
}

function adaptThemeConfig(
  raw: ApiStore['themeConfig'],
): ResolvedThemeConfig {
  if (!raw) {
    return {
      accentColor: null,
      bannerImageUrl: null,
      heroHeadline: null,
      heroSubhead: null,
    }
  }
  return {
    accentColor: raw.accentColor ?? null,
    bannerImageUrl: raw.bannerImageUrl ?? null,
    heroHeadline: raw.heroHeadline ?? null,
    heroSubhead: raw.heroSubhead ?? null,
    themeSpecific: raw.themeSpecific,
  }
}

// Adapter — `ApiProduct` (wire) → `StorefrontProduct` (theme
// contract). Pure: shape mapping only.
//
// Gallery derivation:
//   - When the API ships `images: [...]`, use those URLs in
//     displayOrder sequence (the backend already orders ASC).
//   - When `images` is missing (legacy/older cache) and
//     `imageUrl` is set, synthesize a single-item gallery from
//     the primary image. Themes that don't need the gallery
//     still read `imageUrl` directly.
//   - When neither is set, the gallery is empty and themes render
//     their placeholder (e.g. ProductCard's emoji fallback).
//
// Metrics: the backend's PUBLIC_PRODUCT_SELECT does not yet
// surface opt-in metrics on the wire (that's a Phase 5.5 item —
// the projection needs to read Store.metricsVisibility and gate
// per-key). Until then, `metrics` is intentionally undefined so
// no chip ever renders. The MetricChip primitive guards on
// undefined values, so themes don't need to know this.
export function adaptApiProduct(p: ApiProduct): StorefrontProduct {
  const galleryFromApi = p.images
    ? p.images
        // Defensive sort — the API orders ASC but a stale cache
        // might not.
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((row) => row.url)
    : null
  const fallbackGallery = p.imageUrl ? [p.imageUrl] : []
  const images =
    galleryFromApi && galleryFromApi.length > 0
      ? galleryFromApi
      : fallbackGallery

  return {
    id: p.id,
    name: p.name,
    description: null,
    price: p.price,
    // The wire format doesn't carry currency yet — every catalog
    // is SAR for V1. The ProductCard renders 'ر.س' as the default.
    currency: null,
    category: p.category ?? null,
    imageUrl: p.imageUrl ?? null,
    images,
    isAvailable: p.isAvailable,
    stockStatus: p.stockStatus,
    isFastDelivery: p.isFastDelivery,
    // Metrics live on `Store.metricsVisibility` (opt-in per
    // merchant). The current public projection doesn't yet
    // include them; when it does, this is where we read them.
    metrics: undefined,
  }
}
