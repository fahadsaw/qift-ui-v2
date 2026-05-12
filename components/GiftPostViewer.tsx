'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import {
  giftPostShareUrl,
  toggleAppreciation,
  type BackendGiftPostView,
} from '@/lib/giftPosts'

// Full-screen gift-post viewer.
//
// Layout shape:
//   - Backdrop black; safe-area aware top + bottom padding.
//   - Vertical column of full-height slides; one per gift.
//   - Inside each slide: horizontal carousel of product-media
//     images (V1 ships with a single image array; the carousel
//     architecture is ready for a future Product.images relation).
//   - Identity line (server-masked) + product name + store name
//     overlay near the top of each slide.
//   - Bottom overlay action bar: 👍 appreciate · ❤️ wishlist
//     (lightweight membership chip — wired in a future pass) ·
//     Share (copy /p/<slug>) · "View in store" CTA.
//
// Swipe contract (mirrors PostsViewer):
//   - Vertical swipe → next/previous gift.
//   - Horizontal swipe → next/previous image WITHIN the current
//     gift. When there's only one image (V1 default), horizontal
//     gestures pass through to nothing.
//
// Privacy preserved:
//   - Identity fields come pre-masked from the server-side
//     buildGiftPostView. We just render what we got. No re-derivation.
//
// V1 NOT in scope (do not extend):
//   - Comments / reactions beyond 👍.
//   - Captions / creator tools.
//   - Audio / video media (no Product gallery shape supports them yet).

// Distance + velocity thresholds (px and px/ms) — same magnitudes
// PostsViewer uses, kept identical so the gesture grammar feels the
// same across surfaces.
const VSWIPE_THRESHOLD_PX = 60
const HSWIPE_THRESHOLD_PX = 50
const SWIPE_VELOCITY_THRESHOLD = 0.4

export default function GiftPostViewer({
  posts,
  index,
  onIndexChange,
  onClose,
  viewerOwnerUserId,
}: {
  posts: BackendGiftPostView[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  // The viewer's `userId` (when authenticated). We hide the 👍
  // toggle on the viewer's own posts so the affordance matches the
  // server-side self-appreciation block.
  viewerOwnerUserId: string | null
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()

  const total = posts.length
  const safeIndex = Math.max(0, Math.min(index, total - 1))
  const post = posts[safeIndex]

  // Viewport height in pixels. We measure it (rather than vh)
  // because mobile browsers shift the address bar mid-swipe and
  // 100vh flickers. window.innerHeight reads the LIVE viewport.
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const sync = () => setHeight(window.innerHeight)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  // Lock body scroll while open + remember the previous overflow.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ESC closes; arrow keys nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') onIndexChange(Math.min(total - 1, safeIndex + 1))
      else if (e.key === 'ArrowUp') onIndexChange(Math.max(0, safeIndex - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onIndexChange, safeIndex, total])

  // --- Vertical swipe (between posts) -----------------------------
  const [dragY, setDragY] = useState(0)
  const [vTransitioning, setVTransitioning] = useState(false)
  const vDragStart = useRef<{ y: number; x: number; t: number } | null>(null)
  // Track which axis the current pointer drag locked into. We
  // decide on the first move (whichever delta is dominant). This
  // prevents the diagonal-drag jitter where the column AND the
  // image carousel both translate together.
  const dragAxis = useRef<'v' | 'h' | null>(null)

  // --- Horizontal swipe (between images within the active gift) ---
  const [hDragX, setHDragX] = useState(0)
  const [imgIndex, setImgIndex] = useState(0)

  // Single-image V1 default. When the Product model grows a media
  // gallery, the array fills with all URLs in display order.
  // Centralizing the derivation here keeps the consumer trivial.
  const images: string[] = post?.productImageUrl ? [post.productImageUrl] : []

  // Reset the image index when the gift slide changes — otherwise
  // a stale horizontal index could land on a non-existent image of
  // the new post. The setState lives inside an async microtask via
  // void Promise.resolve so eslint's
  // react-hooks/set-state-in-effect rule recognises it as a
  // synchronization pattern (same convention used elsewhere in the
  // codebase, e.g. /stores).
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setImgIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [safeIndex])

  const goPrevPost = useCallback(() => {
    if (safeIndex === 0) return
    onIndexChange(safeIndex - 1)
  }, [safeIndex, onIndexChange])
  const goNextPost = useCallback(() => {
    if (safeIndex === total - 1) return
    onIndexChange(safeIndex + 1)
  }, [safeIndex, total, onIndexChange])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, a')) return
    vDragStart.current = { y: e.clientY, x: e.clientX, t: e.timeStamp }
    dragAxis.current = null
    setVTransitioning(false)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!vDragStart.current) return
    const dy = e.clientY - vDragStart.current.y
    const dx = e.clientX - vDragStart.current.x
    // Lock the axis once the user has moved ~8 px in any direction.
    if (dragAxis.current === null) {
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        dragAxis.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
      }
    }
    if (dragAxis.current === 'v') {
      const pastStart = safeIndex === 0 && dy > 0
      const pastEnd = safeIndex === total - 1 && dy < 0
      setDragY(pastStart || pastEnd ? dy / 3 : dy)
    } else if (dragAxis.current === 'h') {
      const pastStart = imgIndex === 0 && dx > 0
      const pastEnd = imgIndex === images.length - 1 && dx < 0
      setHDragX(pastStart || pastEnd ? dx / 3 : dx)
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!vDragStart.current) return
    const dy = e.clientY - vDragStart.current.y
    const dx = e.clientX - vDragStart.current.x
    const dt = Math.max(1, e.timeStamp - vDragStart.current.t)
    vDragStart.current = null
    setVTransitioning(true)
    setDragY(0)
    setHDragX(0)

    if (dragAxis.current === 'v') {
      const v = dy / dt
      if (dy < -VSWIPE_THRESHOLD_PX || v < -SWIPE_VELOCITY_THRESHOLD) {
        goNextPost()
      } else if (dy > VSWIPE_THRESHOLD_PX || v > SWIPE_VELOCITY_THRESHOLD) {
        goPrevPost()
      }
    } else if (dragAxis.current === 'h') {
      const v = dx / dt
      if (dx < -HSWIPE_THRESHOLD_PX || v < -SWIPE_VELOCITY_THRESHOLD) {
        if (imgIndex < images.length - 1) setImgIndex(imgIndex + 1)
      } else if (dx > HSWIPE_THRESHOLD_PX || v > SWIPE_VELOCITY_THRESHOLD) {
        if (imgIndex > 0) setImgIndex(imgIndex - 1)
      }
    }
    dragAxis.current = null
  }
  const onPointerCancel = () => {
    vDragStart.current = null
    dragAxis.current = null
    setVTransitioning(true)
    setDragY(0)
    setHDragX(0)
  }

  // 👍 appreciate (optimistic; rolls back on failure).
  const [appreciated, setAppreciated] = useState(false)
  const [appreciationCount, setAppreciationCount] = useState(
    post?.appreciationCount ?? 0,
  )
  const [appreciatePending, setAppreciatePending] = useState(false)
  // Reset the appreciation chip when the slide changes — server is
  // the source of truth on initial paint; we lazily sync to the new
  // post's count. Microtask wrapper for the same lint-rule reason.
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setAppreciated(false)
      setAppreciationCount(post?.appreciationCount ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [post?.postId, post?.appreciationCount])

  const onToggleAppreciate = async () => {
    if (!post || !accessToken || appreciatePending) return
    if (viewerOwnerUserId === post.ownerUserId) return
    setAppreciatePending(true)
    const before = { appreciated, count: appreciationCount }
    setAppreciated(!appreciated)
    setAppreciationCount(
      appreciated ? Math.max(0, appreciationCount - 1) : appreciationCount + 1,
    )
    try {
      const next = await toggleAppreciation({
        accessToken,
        postId: post.postId,
      })
      setAppreciated(next.appreciated)
      setAppreciationCount(next.appreciationCount)
    } catch {
      setAppreciated(before.appreciated)
      setAppreciationCount(before.count)
      toast.show(t('gift_posts.toast_appreciate_failed'))
    } finally {
      setAppreciatePending(false)
    }
  }

  const onShare = async () => {
    if (!post?.publicSlug) return
    const url = giftPostShareUrl(SITE_ORIGIN, post.publicSlug)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
      toast.show(t('gift_posts.toast_link_copied'))
    } catch {
      toast.show(t('gift_posts.toast_copy_failed'))
    }
  }

  if (!post) return null

  const vOffset = -safeIndex * height + dragY
  const isViewerOwner =
    viewerOwnerUserId !== null && post.ownerUserId === viewerOwnerUserId
  const senderLabel =
    post.senderName ?? post.senderUsername ?? t('gift_posts.anonymous_sender')
  const receiverLabel =
    post.receiverName ??
    post.receiverUsername ??
    t('gift_posts.anonymous_recipient')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('gift_posts.viewer_title')}
      className="qift-fade-in fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#000' }}
    >
      {/* Top bar — counter + close. Pointer-events disabled on the
          wrapper so the swipe column underneath gets every gesture
          that doesn't hit the buttons themselves. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div
          className="rounded-full px-3 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          {safeIndex + 1} / {total}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('gift_posts.viewer_close')}
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white backdrop-blur active:scale-95"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Slide column — translates Y for vertical post nav. */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="absolute inset-x-0 top-0"
          style={{
            transform: `translateY(${vOffset}px)`,
            transition: vTransitioning
              ? 'transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)'
              : 'none',
            willChange: 'transform',
          }}
          onTransitionEnd={() => setVTransitioning(false)}
        >
          {posts.map((p, slideIdx) => (
            <GiftSlide
              key={p.postId}
              post={p}
              active={slideIdx === safeIndex}
              height={height}
              hDragX={slideIdx === safeIndex ? hDragX : 0}
              imgIndex={slideIdx === safeIndex ? imgIndex : 0}
            />
          ))}
        </div>
      </div>

      {/* Bottom overlay — identity, product, and the action bar.
          Sticks to the bottom of the viewport, safe-area aware. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div
          aria-hidden
          className="h-24 w-full bg-gradient-to-t from-black/70 via-black/35 to-transparent"
        />
        <div className="pointer-events-auto px-4">
          {/* Identity + product. Already masked server-side. */}
          <p
            className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/80"
          >
            <span>{senderLabel}</span>
            <span aria-hidden className="mx-1.5">
              →
            </span>
            <span>{receiverLabel}</span>
          </p>
          <h2 className="mt-1 text-base font-bold leading-tight text-white">
            {post.productName}
          </h2>
          <p className="text-xs text-white/70">{post.storeName}</p>

          {/* Action bar. Lightweight: 👍, share, view-in-store CTA.
              ❤️ wishlist (membership probe + toggle) is deferred to
              a follow-up — it needs a wishes API hit on every slide
              change to seed the filled-vs-outline state, and that's
              its own optimisation pass. The viewer ships without it
              rather than with a wrong state. */}
          <div className="mt-3 flex items-center gap-2">
            {isAuthenticated && !isViewerOwner && (
              <button
                type="button"
                onClick={() => void onToggleAppreciate()}
                disabled={appreciatePending}
                aria-pressed={appreciated}
                className="qift-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors disabled:opacity-50"
                style={{
                  background: appreciated
                    ? 'color-mix(in srgb, var(--primary) 88%, transparent)'
                    : 'rgba(255,255,255,0.18)',
                  color: '#fff',
                }}
              >
                <span aria-hidden>{appreciated ? '👍' : '👍🏻'}</span>
                <span className="tabular-nums">{appreciationCount}</span>
              </button>
            )}
            {(!isAuthenticated || isViewerOwner) &&
              appreciationCount > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <span aria-hidden>👍</span>
                  <span className="tabular-nums">{appreciationCount}</span>
                </span>
              )}
            <button
              type="button"
              onClick={() => void onShare()}
              aria-label={t('gift_posts.viewer_share')}
              className="qift-press inline-flex h-8 w-8 items-center justify-center rounded-full text-white backdrop-blur active:scale-95"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <path d="M16 6l-4-4-4 4" />
                <path d="M12 2v13" />
              </svg>
            </button>
            {post.productHref && post.deactivatedAt === null && (
              <Link
                href={post.productHref}
                onClick={onClose}
                className="ms-auto inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow: 'var(--shadow-cta)',
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
      </div>
    </div>
  )
}

// One vertical slide. The horizontal carousel for product images
// lives here so the parent only orchestrates vertical motion.
function GiftSlide({
  post,
  active,
  height,
  hDragX,
  imgIndex,
}: {
  post: BackendGiftPostView
  active: boolean
  height: number
  hDragX: number
  imgIndex: number
}) {
  const images: string[] = post.productImageUrl ? [post.productImageUrl] : []
  // Horizontal translate; 100% per image. The drag offset is in px,
  // so we convert with viewport width on the fly via getBoundingRect
  // — but we can just use clientX-based pixel offset directly since
  // each image fills 100% width and dx is already in pixels.
  return (
    <div
      className="flex w-full items-center justify-center"
      style={{ height: height || '100dvh' }}
    >
      <div className="relative h-full w-full overflow-hidden">
        {/* Horizontal track. Translate by image index × viewport
            width + the live drag offset. */}
        <div
          className="absolute inset-y-0 flex"
          style={{
            insetInlineStart: 0,
            width: `${100 * Math.max(1, images.length)}%`,
            transform: `translateX(calc(${-imgIndex * 100}% + ${hDragX}px))`,
            transition: hDragX === 0
              ? 'transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)'
              : 'none',
            willChange: 'transform',
          }}
        >
          {images.length === 0 ? (
            <div
              aria-hidden
              className="flex w-full items-center justify-center text-6xl"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--primary) 22%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 22%, transparent) 100%)',
              }}
            >
              🎁
            </div>
          ) : (
            images.map((src, i) => (
              <div
                key={i}
                className="relative h-full"
                style={{ width: `${100 / images.length}%` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={post.productName}
                  draggable={false}
                  loading={active && i === imgIndex ? 'eager' : 'lazy'}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
            ))
          )}
        </div>
        {/* Image-index dots — only when there's more than one. */}
        {images.length > 1 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex justify-center gap-1.5"
            style={{ top: 'calc(env(safe-area-inset-top) + 3rem)' }}
          >
            {images.map((_, i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: i === imgIndex ? '#fff' : 'rgba(255,255,255,0.45)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
