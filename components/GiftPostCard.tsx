'use client'

import Link from 'next/link'
import { useState } from 'react'
import Card from '@/components/Card'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  toggleAppreciation,
  type BackendGiftPostView,
} from '@/lib/giftPosts'

// One card in a Gift Wall list (or on the /p/<slug> page).
//
// Renders:
//   - Anonymous (or revealed) sender/receiver labels — identity is
//     ALREADY masked server-side via buildGiftPostView, so we just
//     render what we got.
//   - Product + store badge with a deep-link into the catalog.
//   - 👍 appreciation toggle (counter is denormalized + idempotent
//     server-side).
//   - State pill for the owner ("Public" / "Private" / "Draft").
//
// V1 scope (do not extend without an architecture change):
//   - No comments.
//   - No follow CTA from this card.
//   - No "see more" deep-link to a dedicated post page — the slug
//     URL is /p/<slug>; we link there only when the post is public
//     and the viewer isn't already on that route.
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
  const ownerStatePill = viewerIsOwner
    ? post.publishedAt === null
      ? t('gift_posts.state_draft')
      : post.visibility === 'public'
        ? t('gift_posts.state_public')
        : t('gift_posts.state_private')
    : null

  const inner = (
    <Card className="mt-3">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl"
          style={{
            background: 'var(--surface-soft)',
            color: 'var(--text)',
          }}
        >
          🎁
        </div>

        <div className="min-w-0 flex-1">
          {/* Identity line — masked server-side; we just render it.
              Composed locally because t() doesn't interpolate; the
              format is `<sender> → <receiver>` in every language and
              the arrow stays the same character. */}
          <div
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>{senderLabel}</span>
            <span aria-hidden className="mx-1.5">
              →
            </span>
            <span>{receiverLabel}</span>
          </div>

          {/* Product + store. Single source of truth — these are
              gift-anchored snapshot fields, kept in sync with the
              catalog by the deactivation hook on Product/Store delete. */}
          <div
            className="mt-1 text-base font-semibold leading-tight"
            style={{ color: 'var(--text)' }}
          >
            {isDeactivated ? t('gift_posts.product_unavailable') : post.productName}
          </div>
          {!isDeactivated && (
            <div
              className="mt-0.5 text-xs"
              style={{ color: 'var(--text-soft)' }}
            >
              {post.storeName}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: appreciated
                    ? 'var(--primary)'
                    : 'var(--border)',
                  color: appreciated ? 'var(--primary)' : 'var(--text)',
                  background: appreciated
                    ? 'var(--primary-tint)'
                    : 'transparent',
                }}
              >
                <span aria-hidden>{appreciated ? '👍' : '👍🏻'}</span>
                <span>{count}</span>
              </button>
            )}
            {(viewerIsOwner || !isAuthenticated || isDeactivated) &&
              count > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text-soft)',
                  }}
                >
                  <span aria-hidden>👍</span>
                  <span>{count}</span>
                </span>
              )}
            {ownerStatePill && (
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-soft)',
                  background: 'var(--surface-soft)',
                }}
              >
                {ownerStatePill}
              </span>
            )}
            {productHref && !isDeactivated && (
              <Link
                href={productHref}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                {t('gift_posts.view_in_store')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
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
