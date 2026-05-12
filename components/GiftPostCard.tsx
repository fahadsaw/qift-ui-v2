'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  toggleAppreciation,
  type BackendGiftPostView,
} from '@/lib/giftPosts'

// One card in a Gift Wall list (or on the /p/<slug> page).
//
// Visual layout: product image hero on top (gift-anchored single
// source of truth — never copied, just referenced), then a gentle
// identity line, then the product / store, then a footer row with
// 👍 appreciation, view-in-store, and the owner-only state pill.
//
// Renders:
//   - Anonymous (or revealed) sender/receiver labels — identity is
//     ALREADY masked server-side via buildGiftPostView, so we just
//     render what we got.
//   - Product image from post.productImageUrl (the linked Product
//     row's imageUrl — the single source of truth; we never copy).
//   - 👍 appreciation toggle (counter is denormalized + idempotent
//     server-side; we keep optimistic UI on the client side).
//   - State pill for the owner ("Public" / "Private" / "Draft").
//
// V1 scope (do not extend without an architecture change):
//   - No comments.
//   - No follow CTA from this card.
//   - No nested "see more" — the slug URL is /p/<slug>; we link
//     there only when the post is public and `linkToSlug` is on.
//
// Props:
//   - `post`         : the view payload from the backend.
//   - `viewerIsOwner`: when true, render the owner-only state pill
//                       and skip the 👍 toggle (no self-appreciation
//                       — server enforces this, we just hide the UI).
//   - `linkToSlug`   : when true, wrap the card in a /p/<slug> link.
//                       Default false (caller controls navigation).
export default function GiftPostCard({
  post,
  viewerIsOwner = false,
  linkToSlug = false,
}: {
  post: BackendGiftPostView
  viewerIsOwner?: boolean
  linkToSlug?: boolean
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const [count, setCount] = useState(post.appreciationCount)
  const [appreciated, setAppreciated] = useState(false)
  const [pending, setPending] = useState(false)
  const [imageError, setImageError] = useState(false)

  const senderLabel =
    post.senderName ?? post.senderUsername ?? t('gift_posts.anonymous_sender')
  const receiverLabel =
    post.receiverName ??
    post.receiverUsername ??
    t('gift_posts.anonymous_recipient')

  const onAppreciate = async () => {
    if (!accessToken || viewerIsOwner || pending) return
    setPending(true)
    // Optimistic update — the server returns the canonical state on
    // success and we reconcile. On error we roll back.
    const before = { count, appreciated }
    setAppreciated(!appreciated)
    setCount(appreciated ? Math.max(0, count - 1) : count + 1)
    try {
      const next = await toggleAppreciation({
        accessToken,
        postId: post.postId,
      })
      setAppreciated(next.appreciated)
      setCount(next.appreciationCount)
    } catch {
      setAppreciated(before.appreciated)
      setCount(before.count)
      toast.show(t('gift_posts.toast_appreciate_failed'))
    } finally {
      setPending(false)
    }
  }

  const productHref = post.productHref ?? null
  const isDeactivated = post.deactivatedAt !== null
  const showImage =
    !isDeactivated && post.productImageUrl !== null && !imageError
  const ownerStatePill = viewerIsOwner
    ? post.publishedAt === null
      ? t('gift_posts.state_draft')
      : post.visibility === 'public'
        ? t('gift_posts.state_public')
        : t('gift_posts.state_private')
    : null

  const inner = (
    <article
      className="mt-3 overflow-hidden rounded-3xl border backdrop-blur-md transition-shadow duration-300"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
        opacity: isDeactivated ? 0.65 : 1,
      }}
    >
      {/* Product image hero. We render an aspect-ratio container so
          the card height stays predictable across rows (Gift Wall
          scrolls beautifully) and the image fills it via object-cover.
          When no image is available (legacy gift / deactivated /
          load error) we show a calm gradient placeholder, never the
          alt text. The identity line + product label still carry the
          gifting context. */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '5 / 4',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
        }}
      >
        {showImage && post.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image needs configured remote patterns per store; raw <img> is fine for first paint and avoids a dynamic-config bottleneck. Swap to next/image once the remote-patterns config is settled.
          <img
            src={post.productImageUrl}
            alt={post.productName}
            loading="lazy"
            onError={() => setImageError(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-4xl"
          >
            🎁
          </div>
        )}
        {/* Soft gradient overlay at the bottom so the identity line
            (rendered below the image) feels visually connected, and
            the owner-state pill (top-right) reads cleanly against
            any image background. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-12"
          style={{
            background:
              'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--card) 60%, transparent))',
          }}
        />
        {ownerStatePill && (
          <span
            className="absolute end-3 top-3 inline-flex items-center rounded-full px-3 py-1 text-[0.7rem] font-semibold backdrop-blur"
            style={{
              background: 'color-mix(in srgb, var(--card) 85%, transparent)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {ownerStatePill}
          </span>
        )}
        {isDeactivated && (
          <span
            className="absolute start-3 top-3 inline-flex items-center rounded-full px-3 py-1 text-[0.7rem] font-semibold backdrop-blur"
            style={{
              background: 'color-mix(in srgb, var(--card) 85%, transparent)',
              color: 'var(--text-soft)',
              border: '1px solid var(--border)',
            }}
          >
            {t('gift_posts.product_unavailable')}
          </span>
        )}
      </div>

      {/* Body. Padding-only inside Card-style block so the image goes
          edge-to-edge above. */}
      <div className="px-4 py-4 sm:px-5">
        {/* Identity line — masked server-side; we just render it.
            Composed locally because t() doesn't interpolate; the
            format is `<sender> → <receiver>` in every language and
            the arrow stays the same character. */}
        <div
          className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-soft)' }}
        >
          <span>{senderLabel}</span>
          <span aria-hidden className="mx-1.5">
            →
          </span>
          <span>{receiverLabel}</span>
        </div>

        {/* Product + store. Snapshot fields kept in sync with the
            catalog by the deactivation hook on Product/Store delete. */}
        <h3
          className="mt-2 text-base font-bold leading-tight"
          style={{ color: 'var(--text)' }}
        >
          {isDeactivated
            ? t('gift_posts.product_unavailable')
            : post.productName}
        </h3>
        {!isDeactivated && (
          <p
            className="mt-1 text-xs"
            style={{ color: 'var(--text-soft)' }}
          >
            {post.storeName}
          </p>
        )}

        <div
          className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          {/* 👍 toggle — hidden when viewer is the owner, when the
              user isn't signed in (we don't show a login wall on a
              read-only public page), or when the post is deactivated. */}
          {!viewerIsOwner && isAuthenticated && !isDeactivated && (
            <button
              type="button"
              onClick={(e) => {
                // When wrapped in a slug link, the appreciate button
                // shouldn't navigate. Stop the bubble.
                e.preventDefault()
                e.stopPropagation()
                void onAppreciate()
              }}
              disabled={pending}
              aria-pressed={appreciated}
              className="qift-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: appreciated ? 'var(--primary)' : 'var(--border)',
                color: appreciated ? 'var(--primary)' : 'var(--text)',
                background: appreciated
                  ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                  : 'transparent',
              }}
            >
              <span aria-hidden>{appreciated ? '👍' : '👍🏻'}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          )}
          {(viewerIsOwner || !isAuthenticated || isDeactivated) &&
            count > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-soft)',
                }}
              >
                <span aria-hidden>👍</span>
                <span className="tabular-nums">{count}</span>
              </span>
            )}
          {productHref && !isDeactivated && (
            <Link
              href={productHref}
              onClick={(e) => e.stopPropagation()}
              className="ms-auto inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                color: 'var(--primary)',
                background:
                  'color-mix(in srgb, var(--primary) 10%, transparent)',
              }}
            >
              {t('gift_posts.view_in_store')}
              <span aria-hidden className="ms-1">
                →
              </span>
            </Link>
          )}
        </div>
      </div>
    </article>
  )

  if (linkToSlug && post.publicSlug && !isDeactivated) {
    return (
      <Link href={`/p/${post.publicSlug}`} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}
