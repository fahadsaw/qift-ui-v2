import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/siteOrigin'

// Crawler hygiene. We allow general crawling of public marketing /
// browse routes but explicitly disallow every path that requires an
// authenticated session. Crawlers can't sign in anyway, so they'd
// get redirected — disallowing keeps the noise out of search-index
// reports and prevents accidental indexing of user-shaped URLs
// (e.g. /u/<username>) that happen to be public-readable but that
// users may not want surfaced via Google.
//
// SITE_ORIGIN comes from lib/siteOrigin so this stays in sync with
// every other surface (OG metadata, share links, sitemap).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stores', '/explore', '/how-it-works', '/contact'],
        disallow: [
          // Personal / authenticated surfaces.
          '/profile',
          '/settings',
          '/preferences',
          '/wishlist',
          '/social-accounts',
          '/notifications',
          '/received',
          '/gifts',
          '/send',
          '/checkout',
          '/search',
          // Per-user public profile route. Some users may want to be
          // discoverable; defaulting to disallow keeps individual
          // accounts out of indices unless we add an opt-in flow.
          '/u/',
          // Dashboards.
          '/store-dashboard',
          '/admin',
          // Auth flows.
          '/login',
          '/register',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
