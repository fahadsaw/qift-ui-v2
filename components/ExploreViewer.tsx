'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import type { ExploreItem } from '@/lib/sampleData'

// Full-screen explore-feed viewer. Same vertical-swipe grammar as
// PostsViewer (Reels / TikTok / Shorts), but slimmed for explore:
//
//   - Items are placeholder cards (no real media URL, just a two-stop
//     gradient + caption + @username), so the slide renderer is a
//     gradient block, not an <img> / <video>.
//
//   - No author block at the bottom (the @username already lives on
//     the slide itself), no delete affordance, no caption clamp —
//     captions in the explore dataset are intentionally short.
//
//   - Video items still get a play badge so the eye reads "this is
//     a video" identical to how it reads in PostsViewer + PostsGrid.
//     Tap is a no-op today (sample data has no real videoUrl); the
//     affordance is here so the day we wire a real explore feed,
//     this slot is the only thing that has to change.
//
// We deliberately keep this component SEPARATE from PostsViewer
// instead of generalising one viewer with a render-prop slide
// callback, because:
//
//   - PostsViewer just stabilised across three batches; the brief
//     explicitly says "do not break current profile viewer". A
//     dedicated viewer is the lower-risk move.
//
//   - The two viewers will diverge as their feeds diverge: explore
//     is destined to mix posts + stores + gifts + categories;
//     /profile stays per-user posts. Sharing scaffolding now would
//     lock in a contract that doesn't fit either side cleanly.
//
// Swipe / keyboard semantics are kept identical to PostsViewer so
// the gesture grammar is consistent across the app.

const SWIPE_THRESHOLD_PX = 48
const SWIPE_VELOCITY_THRESHOLD = 0.45 // px/ms

type Props = {
  items: ExploreItem[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
}

export default function ExploreViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: Props) {
  const { t } = useI18n()

  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<{ y: number; t: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(0)
  const [transitioning, setTransitioning] = useState(true)

  const total = items.length
  const safeIndex = Math.max(0, Math.min(index, total - 1))
  const item = items[safeIndex]

  const goPrev = useCallback(() => {
    if (safeIndex > 0) onIndexChange(safeIndex - 1)
  }, [safeIndex, onIndexChange])
  const goNext = useCallback(() => {
    if (safeIndex < total - 1) onIndexChange(safeIndex + 1)
  }, [safeIndex, total, onIndexChange])

  // Layout / resize. The translateY math needs px, so we measure
  // the container height once on mount and on every resize.
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (el) setHeight(el.clientHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Body scroll-lock so iOS doesn't double-scroll the page behind.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Keyboard navigation. ArrowDown / Space / j → next, ArrowUp / k →
  // previous, Esc → close. RTL doesn't flip vertical axes, so the
  // mapping is the same in both directions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === ' ' ||
        e.key === 'j'
      ) {
        e.preventDefault()
        goNext()
      } else if (
        e.key === 'ArrowUp' ||
        e.key === 'PageUp' ||
        e.key === 'k'
      ) {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, onClose])

  // Pointer events: unify mouse + touch + pen. Vertical drags trigger
  // nav; horizontal drags pass through (room for a future left/right
  // gesture if we ever add per-slide carousels).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, a, video')) return
    dragStart.current = { y: e.clientY, t: e.timeStamp }
    setTransitioning(false)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dy = e.clientY - dragStart.current.y
    // Rubber-band edges: dy/3 past the first/last slide so the user
    // feels resistance rather than the column scrolling away.
    const wouldPullPastStart = safeIndex === 0 && dy > 0
    const wouldPullPastEnd = safeIndex === total - 1 && dy < 0
    setDragY(wouldPullPastStart || wouldPullPastEnd ? dy / 3 : dy)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dy = e.clientY - dragStart.current.y
    const dt = Math.max(1, e.timeStamp - dragStart.current.t)
    const velocity = dy / dt
    dragStart.current = null
    setTransitioning(true)
    setDragY(0)

    if (
      dy < -SWIPE_THRESHOLD_PX ||
      velocity < -SWIPE_VELOCITY_THRESHOLD
    ) {
      goNext()
    } else if (
      dy > SWIPE_THRESHOLD_PX ||
      velocity > SWIPE_VELOCITY_THRESHOLD
    ) {
      goPrev()
    }
  }
  const onPointerCancel = () => {
    dragStart.current = null
    setTransitioning(true)
    setDragY(0)
  }

  if (!item) return null

  const totalOffset = -safeIndex * height + dragY

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('viewer.title')}
      className="qift-fade-in fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#000' }}
    >
      {/* Top overlay: counter + close. Safe-area top so iPhones with
          a notch don't tuck the controls under the bezel. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div
          className="pointer-events-auto rounded-full bg-black/55 px-3 py-1 text-[0.72rem] font-semibold text-white backdrop-blur-md"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          {t('viewer.counter_format')
            .replace('{current}', String(safeIndex + 1))
            .replace('{total}', String(total))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('viewer.close')}
          className="qift-press pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Slide column. touchAction: pan-x lets a future per-slide
          left/right gesture pass through; we claim the vertical
          axis for between-slide nav. */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'pan-x' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="flex w-full flex-col"
          style={{
            transform: `translateY(${totalOffset}px)`,
            // Apple-style spring curve, ~220ms — same as PostsViewer.
            transition: transitioning
              ? 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
              : 'none',
            height: `${total * 100}%`,
            willChange: 'transform',
          }}
        >
          {items.map((it) => (
            <Slide key={it.id} item={it} heightPct={100 / total} />
          ))}
        </div>

        {/* Desktop prev/next, anchored to the right edge above /
            below the vertical center so they don't overlap the
            close X (top) or the bottom info strip. */}
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          aria-label={t('viewer.prev')}
          className="qift-press absolute end-3 top-[40%] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-30 sm:flex"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === total - 1}
          aria-label={t('viewer.next')}
          className="qift-press absolute end-3 top-[60%] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-30 sm:flex"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Bottom overlay: @username + caption + view-profile chip.
          Soft bottom-fade so the strip reads as a separate surface.
          Safe-area bottom for iPhone home-indicator. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
          paddingTop: '3.5rem',
          background:
            'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.78) 100%)',
        }}
      >
        <div className="pointer-events-auto flex items-end gap-3 text-white">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              boxShadow: '0 6px 16px -8px rgba(0,0,0,0.45)',
            }}
          >
            {item.name
              .split(' ')
              .filter(Boolean)
              .map((p) => p[0])
              .slice(0, 2)
              .join('') || '?'}
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold leading-tight">
                {item.name}
              </span>
              <span
                className="text-[0.7rem] leading-tight opacity-75"
                dir="ltr"
              >
                @{item.username}
              </span>
            </div>
            <p
              className="mt-0.5 line-clamp-2 text-sm leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {item.caption}
            </p>
          </div>
          <Link
            href={`/u/${item.username}`}
            className="qift-press shrink-0 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold backdrop-blur"
            style={{
              background: 'rgba(255,255,255,0.16)',
              color: '#fff',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
            }}
          >
            {t('explore.view_profile')}
          </Link>
        </div>
      </div>
    </div>
  )
}

// Single explore slide. Renders the gradient placeholder with a
// centered play badge for video kind. We deliberately don't try to
// auto-play anything — sample data carries no real mediaUrl, so the
// poster is the experience. The slot is here so a real explore feed
// can drop in <img> / <video> later without restructuring the viewer.
function Slide({
  item,
  heightPct,
}: {
  item: ExploreItem
  heightPct: number
}) {
  const [a, b] = item.gradient.split(',')
  return (
    <div
      className="flex w-full shrink-0 items-center justify-center"
      style={{ height: `${heightPct}%` }}
    >
      <div
        className="relative h-full w-full"
        style={{
          background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        }}
      >
        {/* Inner sheen for depth — same as the StoreCard poster, so
            the discovery surface and the storefront grid feel like
            one app. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 60%)',
          }}
        />
        {item.kind === 'video' && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.28) 100%)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow:
                    '0 18px 36px -12px rgba(123,92,245,0.55), inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="ms-[1px] h-6 w-6">
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}
