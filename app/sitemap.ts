import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/siteOrigin'

// Static sitemap. Lists only the public, indexable surfaces — every
// disallowed path in robots.ts is also absent here. We don't enumerate
// per-store / per-user URLs yet because they're too many and most
// don't add SEO value at the current scale; that's a future addition
// when we want product / merchant pages to rank.

const PUBLIC_ROUTES = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/stores', changeFrequency: 'daily', priority: 0.8 },
  { path: '/explore', changeFrequency: 'daily', priority: 0.7 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
