'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { isSampleStoreId, type Store, type StoreTag } from '@/lib/sampleData'

// Shared store card. Two variants:
//
//   variant='rail' — used in horizontal home rails. 16:10 poster on
//                    top, info strip below. Designed to feel premium
//                    at the rail's natural ~64vw / 18rem width.
//
//   variant='list' — used on /stores. Full-width card with a 21:9
//                    poster, then a richer info block (name + rating,
//                    blurb, tag pills, "Browse store" CTA). Bigger
//                    visual surface so the discovery page reads as a
//                    storefront grid, not a list of forms.
//
// Both variants share:
//   - a deterministic gradient poster keyed off the store id (so the
//     same store always renders the same colors — looks intentional,
//     not random)
//   - the inner sheen for depth
//   - the top-end delivery-speed badge (when the store has a `fast`
//     or `same_day` tag — the badge surfaces the most-relevant
//     promise, not a wall of every tag)
//   - a verified glyph next to the name (currently driven by a
//     prop, not a backend column — once the schema lands, the
//     callsite passes `verified` from the API row and this just
//     starts rendering)
//
// Privacy / safety:
//   - The card is purely presentational. It never fetches anything,
//     never hits localStorage, never opens a modal. The Link wrapper
//     handles routing; the parent owns navigation.
//   - The deterministic gradient depends only on `store.id` — no
//     viewer identity leaks into the visual.

type Variant = 'rail' | 'list'

type Props = {
  store: Store
  variant: Variant
  // The /send funnel entry recipient (e.g. `?to=username`). Threaded
  // into the Browse-store href on the `list` variant so the recipient
  // stays prefilled all the way through. Ignored on `rail` because
  // home rails are part of the public discovery surface where the
  // funnel hasn't started yet.
  recipient?: string | null
  // True iff this is the last store the user opened a detail page
  // for. The card scrolls itself into view + renders a soft ring
  // so a profile detour back to /stores lands on the right card.
  // Only meaningful on the `list` variant.
  isLastOpened?: boolean
  // Extra forwarded ref so the parent (StoresInner) can scroll the
  // matched card into view. Kept opt-in so callsites that don't
  // care don't have to thread a noop.
  innerRef?: React.RefObject<HTMLLIElement | null>
}

// Two-stop palette used to seed the poster gradient. Six stops give
// enough variety that adjacent cards never feel like a duplicate
// without being so noisy the grid loses identity coherence.
const POSTER_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#F472B6', '#7B5CF5'],
  ['#FFD6B5', '#7B5CF5'],
  ['#7B5CF5', '#C084FC'],
  ['#A78BFA', '#F472B6'],
  ['#9AE6B4', '#7B5CF5'],
  ['#C084FC', '#F472B6'],
]

function gradientFor(storeId: string): readonly [string, string] {
  // Hash on the first + last char so similar prefixes (the seeded
  // `merchant-rosary`, `merchant-cocoa` ids) still spread across
  // the palette.
  if (storeId.length === 0) return POSTER_PALETTE[0]
  const idx =
    (storeId.charCodeAt(0) + storeId.charCodeAt(storeId.length - 1)) %
    POSTER_PALETTE.length
  return POSTER_PALETTE[idx]
}

export default function StoreCard({
  store,
  variant,
  recipient,
  isLastOpened,
  innerRef,
}: Props) {
  const { t } = useI18n()
  const [a, b] = gradientFor(store.id)

  // Sample stores live alongside real merchant stores in the home
  // rails + /stores list, but the buyer can't actually purchase
  // from them (the funnel deliberately omits productId/storeIdRef
  // for sample products → backend creates an unlinked order, the
  // merchant never sees it). We surface a Demo chip on every
  // sample card so buyers don't tap into a dead-end purchase
  // funnel. Detection: probe the in-memory STORES list — a cuid
  // shape check would falsely flag seeded merchant stores (whose
  // ids look like `store-riyadh-flowers`) as demo.
  const isDemo = isSampleStoreId(store.id)

  // Tag display: prefer same_day > fast > nearby for the badge
  // overlay. The full tag list still renders below in the list
  // variant; this is just "what's the most-relevant promise to
  // surface on the poster".
  const speedTag: StoreTag | null = store.tags.includes('same_day')
    ? 'same_day'
    : store.tags.includes('fast')
      ? 'fast'
      : null
  const speedTagText: Record<StoreTag, string> = {
    fast: t('stores.tag_fast'),
    same_day: t('stores.tag_same_day'),
    nearby: t('stores.tag_nearby'),
  }

  // Resolve the localized category label. Categories outside the chip
  // list (e.g. 'perishable' from sample data) gracefully fall through
  // to the lower-case key.
  const categoryLabel = t(`stores.cat_${store.category}`)

  // Browse href. List variant carries the recipient so the funnel
  // stays connected; rail variant doesn't because the home page is
  // upstream of the funnel.
  const browseQs = new URLSearchParams()
  if (variant === 'list' && recipient) browseQs.set('to', recipient)
  const browseHref =
    browseQs.toString().length > 0
      ? `/stores/${store.id}?${browseQs.toString()}`
      : `/stores/${store.id}`

  if (variant === 'rail') {
    return (
      <Link
        href={browseHref}
        className="qift-press block overflow-hidden rounded-3xl border backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <Poster
          a={a}
          b={b}
          ratio="16/10"
          speedTagText={speedTag ? speedTagText[speedTag] : null}
          category={categoryLabel}
        />
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              <span className="min-w-0 truncate">{store.name}</span>
              {isDemo && <DemoChip />}
            </h3>
            <RatingChip rating={store.rating} compact />
          </div>
          <p
            className="mt-0.5 truncate text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {store.city}
            {store.district ? ` · ${store.district}` : ''}
          </p>
        </div>
      </Link>
    )
  }

  // List variant — full-width store card on /stores.
  return (
    <li
      ref={innerRef}
      data-store-id={store.id}
      className="qift-press overflow-hidden rounded-3xl border backdrop-blur-md"
      style={{
        borderColor: isLastOpened
          ? 'color-mix(in srgb, var(--primary) 55%, var(--border))'
          : 'var(--border)',
        background: 'var(--card)',
        boxShadow: isLastOpened
          ? '0 14px 36px -16px color-mix(in srgb, var(--primary) 55%, transparent)'
          : 'var(--shadow-card)',
      }}
    >
      <Link
        href={browseHref}
        className="block"
        style={{ color: 'inherit' }}
      >
        <Poster
          a={a}
          b={b}
          ratio="21/9"
          speedTagText={speedTag ? speedTagText[speedTag] : null}
          category={categoryLabel}
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight"
                style={{ color: 'var(--ink)' }}
              >
                <span className="min-w-0 truncate">{store.name}</span>
                {isDemo && <DemoChip />}
              </h3>
              <p
                className="mt-0.5 truncate text-xs"
                style={{ color: 'var(--muted)' }}
              >
                {store.city}
                {store.district ? ` · ${store.district}` : ''}
              </p>
            </div>
            <RatingChip rating={store.rating} compact={false} />
          </div>

          {store.blurb && (
            <p
              className="mt-2 line-clamp-2 text-sm leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {store.blurb}
            </p>
          )}

          {store.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {store.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {speedTagText[tag]}
                </span>
              ))}
            </div>
          )}

          <div
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('stores.browse_cta')}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Optional public-facing URL (the merchant's own site).
          Hidden for stores that don't expose one. Sits OUTSIDE the
          main Link so the click doesn't get intercepted; opens in a
          new tab; rel="noopener" prevents the target from snooping. */}
      {store.officialUrl && (
        <a
          href={store.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="qift-press flex items-center justify-center gap-1.5 border-t px-5 py-2.5 text-xs font-medium"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M14 3h7v7" />
            <path d="M21 3l-9 9" />
            <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
          </svg>
          {t('stores.official_link')}
        </a>
      )}
    </li>
  )
}

// Reusable poster panel — gradient block with sheen, optional
// delivery-speed badge (top-end) and category chip (bottom-start).
// The `ratio` is passed as the Tailwind aspect-[…] value so callers
// can choose between a tall card (21/9) and a wide card (16/10).
function Poster({
  a,
  b,
  ratio,
  speedTagText,
  category,
}: {
  a: string
  b: string
  ratio: '16/10' | '21/9'
  speedTagText: string | null
  category: string
}) {
  return (
    <div
      aria-hidden
      className={`relative w-full ${ratio === '21/9' ? 'aspect-[21/9]' : 'aspect-[16/10]'}`}
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
    >
      {/* Inner sheen. Soft top-down highlight that lifts the gradient
          off the card and gives it dimensionality without an actual
          image. Becomes more visible at large card sizes (list
          variant) but stays subtle at thumb size (rail). */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 60%)',
        }}
      />
      {/* Delivery-speed badge. Top-end so the eye picks it up at the
          same time as the rating chip (which sits below on the info
          strip). White text + 50% black backdrop reads against any
          gradient pairing in the palette. */}
      {speedTagText && (
        <span
          className="absolute top-2 end-2 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold backdrop-blur"
          style={{
            background: 'rgba(15,11,24,0.55)',
            color: '#fff',
          }}
        >
          {speedTagText}
        </span>
      )}
      {/* Category chip. Bottom-start, lighter weight than the speed
          badge so the eye reads them as parallel info, not redundant
          calls to action. */}
      <span
        className="absolute bottom-2 start-2 rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium backdrop-blur"
        style={{
          background: 'rgba(255,255,255,0.78)',
          color: 'var(--ink)',
        }}
      >
        {category}
      </span>
    </div>
  )
}

// Rating chip with star glyph. `compact` matches the rail variant's
// tighter info row (12.5px vs 13px text).
function RatingChip({
  rating,
  compact,
}: {
  rating: number
  compact: boolean
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-0.5 rounded-full font-semibold ${
        compact ? 'px-2 py-0.5 text-[0.65rem]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        background: 'var(--ring)',
        color: 'var(--primary)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}
        aria-hidden
      >
        <path d="M12 2l2.6 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.4-.5z" />
      </svg>
      {rating}
    </span>
  )
}

// Small "Demo" chip rendered next to a sample-store name so buyers
// can tell the demo catalog apart from real merchant stores. Same
// warm palette used elsewhere for "needs attention" surfaces (the
// queued-orders KPI tile, the address-required banner) so it reads
// as informational rather than alarming.
function DemoChip() {
  const { t } = useI18n()
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider"
      style={{
        background: 'rgba(232, 155, 58, 0.18)',
        color: '#E89B3A',
      }}
    >
      {t('stores.demo_chip')}
    </span>
  )
}

// Re-export the gradient helper so /stores/[id] can use the same
// deterministic poster on the storefront banner — the user sees the
// SAME colors on the card and the storefront top, which reinforces
// "this is the same store".
export { gradientFor }
