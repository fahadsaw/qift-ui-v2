'use client'

import { useI18n } from '@/lib/i18n'

// MetricChip — renders a single opt-in storefront metric.
//
// CRITICAL PRIVACY INVARIANT: this primitive is the SINGLE PLACE
// where merchant-controlled metric visibility is realized in the
// UI. The API projection drops hidden metric fields server-side;
// here we additionally guard at render time. When `value` is
// undefined / null, the chip renders nothing — no placeholder,
// no zero, no "—". The metric is invisible to the visitor.
//
// Themes consume this primitive; they MUST NOT render raw metric
// counts themselves (the prop contract gives them an opt-in
// `product.metrics` dict, and the only correct way to render
// from it is through this chip — see
// `project_storefront_architecture.md` Section 7.3).
//
// Adding a new metric:
//   1. Add the key to METRICS_VISIBILITY_KEYS in
//      apps/api/src/stores/storefront-themes.ts.
//   2. Extend the public-projection helper (sanitize + read) to
//      ship it when opted in.
//   3. Add a localized label key here.
//   4. Themes pick which chips to render where.

// V1 ships two countable metrics — wishlist saves + gifted count.
// trendingIndicator is a separate boolean chip below.
//
// The original draft included purchaseCount / soldCount /
// stockCount / ratingsCount / popularityScore. All were trimmed
// in the storefront refinement pass — see the backend's
// METRICS_VISIBILITY_KEYS comment for the philosophy.
const LABEL_KEY_BY_METRIC: Record<MetricChipKey, string> = {
  wishlistSaves: 'storefront.metric_wishlist_saves',
  giftedCount: 'storefront.metric_gifted_count',
}

export type MetricChipKey = 'wishlistSaves' | 'giftedCount'

export default function MetricChip({
  metric,
  value,
}: {
  metric: MetricChipKey
  // Undefined/null = merchant hasn't opted this metric public →
  // render nothing. Themes pass `product.metrics?.<key>` so the
  // missing-key case is the common path.
  value: number | undefined | null
}) {
  const { t } = useI18n()
  if (value === undefined || value === null) return null
  if (value <= 0) return null // never render a stale zero
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      <span className="tabular-nums">{value}</span>
      <span>{t(LABEL_KEY_BY_METRIC[metric])}</span>
    </span>
  )
}

// Trending indicator — a separate boolean chip (not a count).
// Rendered when the merchant opted in `trendingIndicator` AND
// the API projection deemed the product trending. Hidden by
// default like every other metric.
export function TrendingChip({ trending }: { trending: boolean | undefined }) {
  const { t } = useI18n()
  if (!trending) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
      style={{
        background:
          'color-mix(in srgb, var(--primary) 14%, transparent)',
        color: 'var(--primary)',
      }}
    >
      <span aria-hidden>✨</span>
      <span>{t('storefront.trending')}</span>
    </span>
  )
}
