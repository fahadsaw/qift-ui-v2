'use client'

import { useI18n } from '@/lib/i18n'
import type { StorefrontStore } from '../types'

// StoreHeader — cover + logo + name + city + category badge.
//
// Canonical primitive for the storefront identity strip. Themes
// can decide WHETHER to render it and where to place it, but the
// visual identity itself is centralized here so a Classic
// storefront feels consistent with a Gallery storefront when it
// comes to merchant identity.
//
// `themeConfig.bannerImageUrl` is the merchant's chosen banner;
// when null we fall back to `store.coverImageUrl` (legacy field)
// and then to a calm gradient.
export default function StoreHeader({
  store,
  showCover = true,
}: {
  store: StorefrontStore
  // Some themes want a minimal header (no cover image); they can
  // collapse this prop to false.
  showCover?: boolean
}) {
  const { t } = useI18n()
  const accent = store.themeConfig.accentColor ?? 'var(--primary)'
  const banner =
    store.themeConfig.bannerImageUrl ?? store.coverImageUrl ?? null
  const headline = store.themeConfig.heroHeadline ?? store.name
  const subhead = store.themeConfig.heroSubhead ?? null

  return (
    <header className="qift-fade-in">
      {showCover && (
        <div
          className="relative h-32 w-full overflow-hidden rounded-3xl sm:h-40"
          style={{
            background: banner
              ? undefined
              : `linear-gradient(135deg, color-mix(in srgb, ${accent} 22%, transparent) 0%, color-mix(in srgb, var(--accent, ${accent}) 22%, transparent) 100%)`,
          }}
        >
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element -- next/image needs configured remotePatterns per store; raw <img> is fine until that config is in place.
            <img
              src={banner}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* Subtle bottom gradient for the headline overlay. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent"
          />
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt=""
            className="h-14 w-14 rounded-2xl object-cover"
            style={{ boxShadow: 'var(--shadow-soft)' }}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, var(--primary-dark) 100%)`,
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {store.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-xl font-extrabold leading-tight"
            style={{ color: 'var(--ink)' }}
          >
            {headline}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
            {store.city && <span>{store.city}</span>}
            {store.city && store.category && (
              <span aria-hidden className="opacity-50">·</span>
            )}
            {store.category && <span>{t(`stores.category_${store.category}`)}</span>}
          </div>
        </div>
      </div>
      {subhead && (
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {subhead}
        </p>
      )}
    </header>
  )
}
