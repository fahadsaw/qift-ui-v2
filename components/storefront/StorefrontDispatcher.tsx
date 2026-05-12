'use client'

import { resolveThemeManifest } from './themes'
import type { StorefrontThemeProps } from './types'

// StorefrontDispatcher — picks the theme renderer based on the
// store payload's `themeSlug`. The slug has already been
// resolved server-side via `resolveActiveTheme()` (the backend's
// downgrade-safe resolver), so by the time the payload reaches
// here, an ineligible theme has ALREADY been folded back to
// 'classic'. The dispatcher therefore trusts the slug as the
// authoritative render decision.
//
// Defensive: an unknown slug (shouldn't happen — server controls
// the set) still falls back to Classic, so a stale frontend
// build with an unrecognized theme name doesn't render nothing.
export default function StorefrontDispatcher(props: StorefrontThemeProps) {
  const entry = resolveThemeManifest(props.store.themeSlug)
  const ThemeComponent = entry.Component
  return <ThemeComponent {...props} />
}
