'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { BackendGiftPostView } from '@/lib/giftPosts'

// Instagram-style gifting grid (Qift edition).
//
// Square image tiles, mobile-first 3-column grid, subtle direction
// badge in the corner, and an optional 👍 count chip. Tapping a
// tile opens the full-screen GiftPostViewer; the viewer is a
// sibling render concern owned by the parent (GiftsSection) — the
// grid just emits an onOpen(index) callback so the parent can mount
// the viewer with the right starting position.
//
// Why a grid (not a stack):
//   - Mobile-first density. A scroll of three real images per row
//     reads as a gifting gallery, not a creator-economy feed of
//     oversized cards.
//   - Calm. Each tile renders the product photo and almost nothing
//     else. The viewer handles the rich payload.
//   - Image-led. Reinforces "Qift is about products and the act of
//     giving", not "Qift is about content".
//
// V1 scope (do not extend without architecture change):
//   - No double-tap-to-like inside the grid (the gesture would
//     compete with the open-viewer tap). 👍 lives in the viewer.
//   - No comments / captions on tiles.
//   - No story-style avatars row above the grid.
export default function GiftPostsGrid({
  posts,
  onOpen,
}: {
  posts: BackendGiftPostView[]
  onOpen: (index: number) => void
}) {
  return (
    <ul className="mt-3 grid grid-cols-3 gap-1.5">
      {posts.map((post, idx) => (
        <GiftTile
          key={post.postId}
          post={post}
          onOpen={() => onOpen(idx)}
        />
      ))}
    </ul>
  )
}

function GiftTile({
  post,
  onOpen,
}: {
  post: BackendGiftPostView
  onOpen: () => void
}) {
  const { t } = useI18n()
  const [errored, setErrored] = useState(false)
  const isDeactivated = post.deactivatedAt !== null
  const showImage = !isDeactivated && post.productImageUrl !== null && !errored
  // Subtle icon-only direction badge — sent / received / self.
  // Privacy-safe: reveals only the OWNER'S relation to the gift, not
  // the counterparty. Using an icon (not a localized word) keeps the
  // tile chrome calm and language-agnostic; the screen-reader label
  // is still localized.
  const directionA11y: string | null =
    post.direction === 'sent'
      ? t('gift_posts.direction_sent')
      : post.direction === 'received'
        ? t('gift_posts.direction_received')
        : post.direction === 'self'
          ? t('gift_posts.direction_self')
          : null

  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={post.productName}
        className="group block aspect-square w-full overflow-hidden rounded-2xl transition-all active:scale-[0.97]"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 12%, transparent) 100%)',
          opacity: isDeactivated ? 0.55 : 1,
        }}
      >
        {showImage && post.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image needs configured remotePatterns per store; raw <img> is fine until that config is in place.
          <img
            src={post.productImageUrl}
            alt={post.productName}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover transition-transform duration-700 group-active:scale-[1.02]"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full w-full items-center justify-center text-3xl"
          >
            🎁
          </div>
        )}
        {/* Bottom scrim — only render when there's content to show
            against it. Avoids scrimming an otherwise clean image. */}
        {(post.appreciationCount > 0 ||
          isDeactivated ||
          post.eventCount > 1) && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"
          />
        )}
        {directionA11y && (
          <span
            aria-label={directionA11y}
            title={directionA11y}
            className="absolute start-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full backdrop-blur"
            style={{
              background:
                'color-mix(in srgb, var(--card) 82%, transparent)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            <DirectionGlyph direction={post.direction} />
          </span>
        )}
        {/* ×N dedup badge — repeat gifts of the same product collapse
            into one tile with this count. Anchored top-end so it
            doesn't conflict with the appreciation chip (bottom-end).
            Subtle styling — informational, not vanity-driven. */}
        {post.eventCount > 1 && (
          <span
            aria-label={`×${post.eventCount}`}
            className="absolute end-1.5 top-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold backdrop-blur"
            style={{
              background:
                'color-mix(in srgb, var(--card) 82%, transparent)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            ×{post.eventCount}
          </span>
        )}
        {post.appreciationCount > 0 && (
          <span
            className="absolute end-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold text-white tabular-nums"
            style={{
              background: 'rgba(0,0,0,0.55)',
            }}
          >
            <span aria-hidden>👍</span>
            <span>{post.appreciationCount}</span>
          </span>
        )}
        {isDeactivated && (
          <span
            className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full px-2 py-0.5 text-center text-[0.6rem] font-semibold backdrop-blur"
            style={{
              background:
                'color-mix(in srgb, var(--card) 86%, transparent)',
              color: 'var(--text-soft)',
              border: '1px solid var(--border)',
            }}
          >
            {t('gift_posts.product_unavailable')}
          </span>
        )}
      </button>
    </li>
  )
}

// Direction icon — minimal language-agnostic glyph for the corner
// badge. Sent = arrow pointing outward (up-right), received =
// arrow pointing inward (down-left), self = small heart-circle.
// Rendered inside a 5x5 circular badge.
function DirectionGlyph({
  direction,
}: {
  direction: BackendGiftPostView['direction']
}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-2.5 w-2.5',
    'aria-hidden': true,
  }
  if (direction === 'sent') {
    return (
      <svg {...common}>
        <path d="M7 17L17 7" />
        <path d="M8 7h9v9" />
      </svg>
    )
  }
  if (direction === 'received') {
    return (
      <svg {...common}>
        <path d="M17 7L7 17" />
        <path d="M16 17H7V8" />
      </svg>
    )
  }
  // self — small dot inside a ring for "you to you"
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  )
}
