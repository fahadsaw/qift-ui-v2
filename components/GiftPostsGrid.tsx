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
  // Subtle direction badge — sent / received / self. Privacy-safe:
  // it reveals only the OWNER'S relation to the gift event, not the
  // counterparty. The owner is already implicit in WHOSE wall this
  // is, so the badge adds no identity information.
  const directionLabel: string | null =
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
        className="group block aspect-square w-full overflow-hidden rounded-xl transition-all active:scale-[0.97]"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
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
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full w-full items-center justify-center text-3xl"
          >
            🎁
          </div>
        )}
        {/* Bottom-edge gradient → makes the 👍 count + direction
            badge readable against ANY product photo without a heavy
            scrim. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent"
        />
        {directionLabel && (
          <span
            className="absolute start-1.5 top-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-semibold backdrop-blur"
            style={{
              background:
                'color-mix(in srgb, var(--card) 78%, transparent)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {directionLabel}
          </span>
        )}
        {post.appreciationCount > 0 && (
          <span
            className="absolute end-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold text-white tabular-nums"
            style={{
              background: 'rgba(0,0,0,0.45)',
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
                'color-mix(in srgb, var(--card) 82%, transparent)',
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
