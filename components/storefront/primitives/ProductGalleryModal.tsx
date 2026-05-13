'use client'

// ProductGalleryModal — premium full-screen image viewer for the
// storefront product gallery.
//
// Used when a storefront product has more than one image. The
// ProductCard renders its primary image inline; tapping the image
// area opens this modal with the full ordered gallery and a
// horizontal-swipe pattern matching the GiftPostViewer's image
// carousel (consistent swipe grammar across the app).
//
// Design choices:
//   - Single-axis swipe (horizontal only). Vertical drag does
//     nothing — there's only one product per modal.
//   - Image fills the viewport via object-contain so portrait
//     shots of perfumes / jewelry / flowers aren't cropped.
//   - Counter chip ("2 / 5") + dot indicators give the visitor
//     two parallel ways to read position. Dots stay calm at small
//     gallery counts; the counter handles larger sets.
//   - Backdrop click closes; clicks on the image itself do NOT
//     close (prevents misfires when the visitor is mid-swipe).
//   - Keyboard: Esc closes, ← → step images. Same grammar as
//     every other modal in the app.
//
// Privacy: no per-image analytics, no view tracking, no autoplay
// of anything. Purely passive viewer for the product gallery.
//
// Body-scroll lock on open; restored on close.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'

// Swipe thresholds in px / px-per-ms. Tuned to feel snappy without
// triggering on a tap-with-slight-jitter. Mirrors the values used
// in GiftPostViewer for consistency.
const HSWIPE_THRESHOLD_PX = 70
const SWIPE_VELOCITY_THRESHOLD = 0.5

export default function ProductGalleryModal({
  images,
  initialIndex = 0,
  productName,
  onClose,
}: {
  // Ordered list of image URLs. Caller guarantees length >= 1; we
  // still guard defensively (a stale prop with [] would render
  // nothing rather than crash).
  images: string[]
  // Image to land on when opening — usually 0, but a future card
  // with a swipeable inline carousel could deep-link into a
  // specific index.
  initialIndex?: number
  // Accessibility label for the dialog; falls back to a generic
  // "product gallery" if the caller can't provide a name.
  productName?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const safeImages = images.filter(Boolean)
  const total = safeImages.length
  // Clamp the initial index; an out-of-range value lands on 0.
  const [index, setIndex] = useState(
    Math.max(0, Math.min(initialIndex, Math.max(0, total - 1))),
  )
  // Horizontal drag offset. Reset between gestures.
  const [dragX, setDragX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const dragStart = useRef<{ x: number; t: number } | null>(null)

  const goPrev = useCallback(() => {
    if (index <= 0) return
    setIndex((i) => Math.max(0, i - 1))
  }, [index])
  const goNext = useCallback(() => {
    if (index >= total - 1) return
    setIndex((i) => Math.min(total - 1, i + 1))
  }, [index, total])

  // ESC closes, arrows nav. Same shortcuts as GiftPostViewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goPrev, goNext])

  // Body-scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Pointer-drag swipe. Locked to horizontal only — vertical drag
  // is ignored (single product, no inter-product swipe here).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Don't start a drag on interactive controls (close button,
    // dot indicators) so taps register as taps.
    if (target.closest('button')) return
    dragStart.current = { x: e.clientX, t: e.timeStamp }
    setTransitioning(false)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    // Resistance at the edges — drag past the first / last image
    // moves the strip a third of the distance instead of full
    // travel. Feels rubbery without locking the gesture out.
    const pastStart = index === 0 && dx > 0
    const pastEnd = index === total - 1 && dx < 0
    setDragX(pastStart || pastEnd ? dx / 3 : dx)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dt = Math.max(1, e.timeStamp - dragStart.current.t)
    const velocity = dx / dt
    dragStart.current = null
    setTransitioning(true)
    setDragX(0)
    if (dx < -HSWIPE_THRESHOLD_PX || velocity < -SWIPE_VELOCITY_THRESHOLD) {
      goNext()
    } else if (dx > HSWIPE_THRESHOLD_PX || velocity > SWIPE_VELOCITY_THRESHOLD) {
      goPrev()
    }
  }

  const onPointerCancel = () => {
    dragStart.current = null
    setTransitioning(true)
    setDragX(0)
  }

  if (total === 0) {
    // Defensive: caller promised >= 1 image, but if we got nothing,
    // close immediately rather than render an empty stage.
    onClose()
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={productName ?? t('storefront.gallery_label')}
      // Backdrop tap closes. The inner image + controls stop
      // propagation so an accidental backdrop hit during a swipe
      // doesn't close the modal.
      onClick={onClose}
      className="qift-fade-in fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'rgba(8, 6, 16, 0.92)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Top bar — counter + close. Pinned to safe area on iOS. */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="rounded-full px-3 py-1 text-xs font-bold tabular-nums"
          style={{
            background: 'rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
          aria-live="polite"
        >
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('gifts.lightbox_close')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.10)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Image stage. The strip translates horizontally; each cell
          contains one image at viewport width. `touch-action: pan-y`
          lets vertical browser scroll-locks pass through naturally
          while we own the horizontal axis. */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
            transition: transitioning
              ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          }}
        >
          {safeImages.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="flex h-full w-full shrink-0 items-center justify-center px-4"
              style={{ direction: 'ltr' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                draggable={false}
                // Only the active slide eagerly loads; neighbours
                // load lazily so a 12-image gallery doesn't fire
                // 12 requests on open. The next/prev still feel
                // instant because the swipe animation gives the
                // browser time to fetch.
                loading={i === index ? 'eager' : 'lazy'}
                decoding="async"
                className="max-h-full max-w-full select-none object-contain"
                style={{
                  // Soft drop shadow to lift the product off the
                  // dark backdrop without making the photo itself
                  // feel heavy.
                  filter: 'drop-shadow(0 24px 60px rgba(0,0,0,0.45))',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators — only when there's more than one image
          AND not too many (after 8, the dot strip gets noisy and
          the top-bar counter alone is clearer). */}
      {total > 1 && total <= 8 && (
        <div
          className="flex shrink-0 items-center justify-center gap-1.5 pb-6"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {safeImages.map((_, i) => {
            const active = i === index
            return (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1} / ${total}`}
                aria-current={active ? 'true' : undefined}
                className="h-1.5 rounded-full transition-all active:scale-95"
                style={{
                  width: active ? 18 : 6,
                  background: active
                    ? 'rgba(255,255,255,0.95)'
                    : 'rgba(255,255,255,0.30)',
                }}
              />
            )
          })}
        </div>
      )}

      {/* Larger-set spacer: when we've hidden the dots (8+ images),
          keep the bottom safe-area padding so the image stage
          isn't flush against the gesture bar on iOS. */}
      {total > 8 && (
        <div
          aria-hidden
          className="shrink-0"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
          }}
        />
      )}
    </div>
  )
}
