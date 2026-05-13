// Frontend theme manifest — mirror of the backend allow-list at
// `apps/api/src/stores/storefront-themes.ts`. Keep in sync.
//
// Adding a new theme:
//   1. Add entry to STOREFRONT_THEME_SLUGS on the backend.
//   2. Add the per-theme capability + config validator on the
//      backend (storefront-themes.ts) + a seed row in the migration.
//   3. Create the theme component at
//      components/storefront/themes/<slug>/<Slug>Theme.tsx.
//   4. Register here.
//
// The dispatcher reads `themeSlug` off the server payload and
// resolves to a component via this manifest. Unknown slugs fall
// back to `classic` defensively (the server should never ship one,
// but defense in depth).

import type { ComponentType } from 'react'
import type { StorefrontThemeProps } from './types'
import ClassicTheme from './themes/classic/ClassicTheme'
import GalleryTheme from './themes/gallery/GalleryTheme'

export type ThemeSlug = 'classic' | 'gallery' | 'editorial'

export type ThemeManifestEntry = {
  slug: ThemeSlug
  // Render function for this theme. Receives the canonical
  // StorefrontThemeProps shape — no theme-specific extensions.
  Component: ComponentType<StorefrontThemeProps>
  // Display metadata for the dashboard picker.
  // Localized via translation key — fall back to the English
  // `name` if the locale dict has no entry.
  name: string
  // Translation key for the picker description.
  descriptionKey: string
  // Plan tier this theme requires. Mirrors the backend's
  // capability gate but used here only for the dashboard picker
  // greying-out UX. The authoritative check is server-side.
  minPlan: 'starter' | 'pro' | 'enterprise'
  // R2 URL pointer to a static preview thumbnail. Live-rendered
  // previews are deferred per the architecture memory.
  previewUrl: string
}

// The manifest. Order matters — the dashboard picker renders
// themes in this order.
export const STOREFRONT_THEMES: Record<ThemeSlug, ThemeManifestEntry> = {
  classic: {
    slug: 'classic',
    Component: ClassicTheme,
    name: 'Classic',
    descriptionKey: 'themes.classic.description',
    minPlan: 'starter',
    // Inline-svg previews shipped with the bundle. Lightweight,
    // accessible (role="img"), and identity-aligned. When we move
    // to live merchant-photographed previews these paths swap to
    // R2-hosted PNG/WebP per the architecture memory.
    previewUrl: '/themes/classic.svg',
  },
  gallery: {
    slug: 'gallery',
    Component: GalleryTheme,
    name: 'Gallery',
    descriptionKey: 'themes.gallery.description',
    minPlan: 'pro',
    previewUrl: '/themes/gallery.svg',
  },
  editorial: {
    // Editorial V0 — ships as `classic` rendering for now (the
    // architecture is what matters; the visual polish is a
    // follow-up commit per the staged plan). Once the editorial
    // component lands, swap this line for an explicit
    // EditorialTheme import.
    slug: 'editorial',
    Component: ClassicTheme,
    name: 'Editorial',
    descriptionKey: 'themes.editorial.description',
    minPlan: 'enterprise',
    previewUrl: '/themes/editorial.svg',
  },
}

export function resolveThemeManifest(slug: string): ThemeManifestEntry {
  if (slug in STOREFRONT_THEMES) {
    return STOREFRONT_THEMES[slug as ThemeSlug]
  }
  return STOREFRONT_THEMES.classic
}

// Plan-eligibility helper. Used by the dashboard picker to grey
// out themes the merchant's current plan can't unlock. The
// authoritative check still lives server-side; this is UX only.
export function isThemeAvailable(
  plan: 'starter' | 'pro' | 'enterprise',
  theme: ThemeManifestEntry,
): boolean {
  if (theme.minPlan === 'starter') return true
  if (theme.minPlan === 'pro') return plan === 'pro' || plan === 'enterprise'
  if (theme.minPlan === 'enterprise') return plan === 'enterprise'
  return false
}
