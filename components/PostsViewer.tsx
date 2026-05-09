'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { deletePost, type BackendPost } from '@/lib/posts'

// Full-screen post viewer with swipe / keyboard navigation.
//
// Why this isn't a generic Modal + replace-children pattern:
//
//   - We want the user to swipe horizontally between posts without
//     re-mounting React subtrees on every change. Re-mounting an
//     <img> or <video> would dump the in-flight network buffer; the
//     <video> would also lose its play state. We keep all slides
//     mounted in one row and translate the row.
//
//   - The header / footer overlays must stay anchored while the
//     media slide moves. A vanilla "render one post, fade between
//     posts" solution would need two stacked layers and an animation
//     frame — much more code than the row-translate model below.
//
//   - The reveal needs to feel native: rubber-band at the edges,
//     velocity-snap rather than position-snap, real touch tracking.
//     One <div> with `transform: translateX(-100% * index + drag)`
//     gives us all three for free.
//
// Limitations of this implementation (acknowledged):
//   - Slides off-screen still buffer their <video> previews, which
//     is fine for posts (counts capped at 100 per user) but would
//     need windowing if we ever rendered hundreds. Out of scope.
//   - We don't pause off-screen videos automatically. The active
//     slide pauses when you swipe away because the viewer stops
//     rendering the controls overlay; native <video> elements keep
//     their play state. If feedback shows people leave a video
//     playing while they swipe to a photo and the audio bleeds
//     through, we'll add an effect to pause non-active slides.
//   - No double-tap-to-zoom on photos. Premium addition for a
//     follow-up batch.

const SWIPE_THRESHOLD_PX = 56
const SWIPE_VELOCITY_THRESHOLD = 0.4 // px/ms; above this we always snap

type Props = {
  posts: BackendPost[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  authorName: string
  authorUsername: string
  // True when the viewer is on /profile (own account); false on
  // public /u/:username views. Renders the trash chip.
  canDelete: boolean
  onDeleted: (postId: string) => void
}

export default function PostsViewer({
  posts,
  index,
  onIndexChange,
  onClose,
  authorName,
  authorUsername,
  canDelete,
  onDeleted,
}: Props) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()

  // Drag state. `dragX` is the live offset in px; `dragStart` carries
  // the pointer-down position + timestamp so we can compute velocity
  // on release. Both null when the user isn't actively dragging.
  const [dragX, setDragX] = useState(0)
  const dragStart = useRef<{ x: number; t: number } | null>(null)
  // Width of the viewport row. Computed on mount + resize so the
  // translateX percentages convert cleanly to px during drag.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  // Suppress the snap transition during active drag so the slide
  // tracks the finger 1:1 instead of easing to a moving target.
  const [transitioning, setTransitioning] = useState(true)

  // Delete state — only relevant for the active slide.
  const [deleting, setDeleting] = useState(false)

  const total = posts.length
  const safeIndex = Math.max(0, Math.min(index, total - 1))
  const post = posts[safeIndex]

  const goPrev = useCallback(() => {
    if (safeIndex > 0) onIndexChange(safeIndex - 1)
  }, [safeIndex, onIndexChange])
  const goNext = useCallback(() => {
    if (safeIndex < total - 1) onIndexChange(safeIndex + 1)
  }, [safeIndex, total, onIndexChange])

  // --- Layout / resize ----------------------------------------------
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (el) setWidth(el.clientWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // --- Body scroll lock + theme tweak -------------------------------
  // Lock the page behind the viewer so iOS doesn't double-scroll the
  // background. The previous overflow value is restored on unmount
  // so closing the viewer never leaves the page locked.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // --- Keyboard navigation ------------------------------------------
  // ArrowLeft/Right adapt to RTL: in RTL, "next" is to the LEFT of
  // the current slide visually, so we flip the keys. Esc always
  // closes regardless of direction.
  useEffect(() => {
    const isRtl =
      typeof document !== 'undefined' &&
      document.documentElement.dir === 'rtl'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        if (isRtl) goNext()
        else goPrev()
      } else if (e.key === 'ArrowRight') {
        if (isRtl) goPrev()
        else goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, onClose])

  // --- Pointer / touch swipe ----------------------------------------
  //
  // Pointer events unify mouse + touch + pen. We capture the pointer
  // on the slide row so a fast swipe that exits the viewport still
  // reports its release. Only horizontal drags trigger nav — a
  // vertical drag (>= 24px without much horizontal motion) is
  // treated as a scroll attempt and ignored. This stops the
  // viewer from hijacking native vertical scroll on long captions.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't hijack drags that started on actual interactive children.
    // <video> controls and the close/delete buttons all live above
    // the slide row in the DOM; this guards against the slide row
    // intercepting their pointers.
    const target = e.target as HTMLElement
    if (target.closest('button, video, a')) return
    dragStart.current = { x: e.clientX, t: e.timeStamp }
    setTransitioning(false)
    // setPointerCapture so the up event still lands here even if the
    // pointer leaves the row.
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    // Cap rubber-band at the edges: if the drag would push past the
    // first or last slide, divide the delta by 3 so the user feels
    // resistance rather than the row scrolling off into space.
    const wouldPullPastStart = safeIndex === 0 && dx > 0
    const wouldPullPastEnd = safeIndex === total - 1 && dx < 0
    setDragX(wouldPullPastStart || wouldPullPastEnd ? dx / 3 : dx)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dt = Math.max(1, e.timeStamp - dragStart.current.t)
    const velocity = dx / dt // px per ms
    dragStart.current = null
    setTransitioning(true)
    setDragX(0)

    // Decision: snap to next/prev when EITHER the displacement
    // crosses the threshold OR the user flicked fast enough. RTL
    // flip is handled by the document direction at this point —
    // a positive dx in RTL means "go to a later post" (visually
    // toward the start-edge), so we negate.
    const isRtl =
      typeof document !== 'undefined' &&
      document.documentElement.dir === 'rtl'
    const advance = isRtl ? -dx : dx
    const advanceVel = isRtl ? -velocity : velocity
    if (
      advance < -SWIPE_THRESHOLD_PX ||
      advanceVel < -SWIPE_VELOCITY_THRESHOLD
    ) {
      goNext()
    } else if (
      advance > SWIPE_THRESHOLD_PX ||
      advanceVel > SWIPE_VELOCITY_THRESHOLD
    ) {
      goPrev()
    }
    // Otherwise let the row spring back to the active slide.
  }
  const onPointerCancel = () => {
    dragStart.current = null
    setTransitioning(true)
    setDragX(0)
  }

  // --- Delete --------------------------------------------------------
  const onDelete = async () => {
    if (!accessToken || !post || deleting) return
    if (!confirm(t('profile.post_delete_confirm'))) return
    setDeleting(true)
    try {
      await deletePost({ accessToken, postId: post.id })
      onDeleted(post.id)
    } catch (err) {
      console.error('[PostsViewer] deletePost failed', err)
      toast.show(t('profile.post_delete_failed'), { tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  if (!post) return null

  // For RTL, the slides still translate by -index * width in CSS
  // px terms — but the eye reads them in the opposite direction
  // because the parent has `direction: ltr` forced below. Forcing
  // LTR on the slide row is the simplest way to keep "swipe left"
  // == "go to next post" consistent across both directions, while
  // the overlay text stays in document direction.
  const totalOffset = -safeIndex * width + dragX

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('viewer.title')}
      className="qift-fade-in fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#000' }}
    >
      {/* Top overlay: counter on the leading edge, X on the trailing
          edge. Safe-area top padding so iPhones with a notch don't
          tuck the controls under the bezel. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        {/* Counter pill. Rendered as a div, not a button — it's purely
            informational. Localised via the viewer.counter_format key
            so RTL renders "٢ من ٨" instead of "2 / 8" when the active
            language is Arabic. */}
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
        <div className="pointer-events-auto flex items-center gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              aria-label={t('profile.post_delete')}
              className="qift-press flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md disabled:opacity-50"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('viewer.close')}
            className="qift-press flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
            style={{
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Slide row. Forced LTR so "translateX(-N * 100%)" always means
          "show slide N" regardless of document direction. The user-
          facing direction is preserved by the overlay text being in
          document direction. */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ direction: 'ltr', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${totalOffset}px)`,
            transition: transitioning
              ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
            width: `${total * 100}%`,
            // Don't let the browser fight us on swipe momentum.
            willChange: 'transform',
          }}
        >
          {posts.map((p, i) => (
            <Slide
              key={p.id}
              post={p}
              active={i === safeIndex}
              widthPct={100 / total}
            />
          ))}
        </div>

        {/* Desktop prev/next. Hidden on small screens — touch swipe
            is the canonical interaction there, and the buttons would
            just fight the swipe-from-edge gesture. Anchored to the
            leading/trailing edge of the slide row, vertically
            centered, with a generous tap target (h-12 w-12 = 48pt). */}
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          aria-label={t('viewer.prev')}
          className="qift-press absolute start-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-30 sm:flex"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === total - 1}
          aria-label={t('viewer.next')}
          className="qift-press absolute end-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-30 sm:flex"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Bottom overlay: author + caption. Positioned absolutely so
          it floats over wide-aspect-ratio media. Three-line caption
          clamp keeps it from eating the screen on long captions —
          tap the caption itself to expand (clamp toggles via state).
          Safe-area bottom padding for iPhone home-indicator. */}
      <BottomOverlay
        authorName={authorName}
        authorUsername={authorUsername}
        caption={post.caption}
      />
    </div>
  )
}

// One slide. Renders <img> for photos and <video controls> for
// videos. The `active` flag is used to pause off-screen video so
// audio doesn't bleed when the user swipes away mid-playback.
function Slide({
  post,
  active,
  widthPct,
}: {
  post: BackendPost
  active: boolean
  widthPct: number
}) {
  // Track whether the video has been activated. Until the user taps,
  // we render a poster overlay with a play button so the page doesn't
  // load full video bytes for every off-screen slide. Once tapped,
  // we mount the real <video controls> element.
  const [videoTapped, setVideoTapped] = useState(false)
  // Imperative ref to the <video controls> element. Used to pause
  // playback when this slide rotates off-screen — much cleaner than
  // tearing down + re-mounting the element (which would lose the
  // user's playhead and make swiping back feel destructive). We do
  // NOT auto-reset `videoTapped` to false: keeping it true means
  // swiping back to a video the user already started shows the
  // controls overlay, ready to resume from the same frame.
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (!active && videoElRef.current) {
      videoElRef.current.pause()
    }
  }, [active])

  return (
    <div
      className="flex h-full shrink-0 items-center justify-center"
      style={{ width: `${widthPct}%` }}
    >
      {post.mediaType === 'video' ? (
        videoTapped ? (
          <video
            ref={videoElRef}
            src={post.mediaUrl}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => setVideoTapped(true)}
            className="qift-press relative flex h-full w-full items-center justify-center"
            aria-label="Play video"
          >
            {/* Poster: same <video> with preload=metadata so the
                first frame paints. muted+playsInline keeps iOS from
                fullscreen-hijacking the poster. */}
            <video
              src={post.mediaUrl}
              muted
              playsInline
              preload="metadata"
              className="max-h-full max-w-full object-contain opacity-90"
            />
            {/* Centered play badge. Glassy disc with the same
                primary-gradient inside, so the play affordance is
                unmistakable but doesn't fight the dark backdrop. */}
            <span
              aria-hidden
              className="absolute flex h-20 w-20 items-center justify-center rounded-full text-white"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 75%)',
              }}
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow:
                    '0 22px 50px -16px rgba(123,92,245,0.65), inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="ms-[2px] h-6 w-6"
                >
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              </span>
            </span>
          </button>
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt={post.caption ?? ''}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      )}
    </div>
  )
}

// Bottom overlay: author block + caption. Caption clamps to 3 lines
// with a "see more" toggle on tap so a long story doesn't bury the
// media but is still reachable. The whole strip uses a soft
// bottom-fade so the overlay reads as a separate surface from the
// media itself.
function BottomOverlay({
  authorName,
  authorUsername,
  caption,
}: {
  authorName: string
  authorUsername: string
  caption: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
        paddingTop: '3.5rem',
        background:
          'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.78) 100%)',
      }}
    >
      <div className="pointer-events-auto flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow: '0 6px 16px -8px rgba(0,0,0,0.45)',
          }}
        >
          {authorName
            .split(' ')
            .filter(Boolean)
            .map((p) => p[0])
            .slice(0, 2)
            .join('') || '?'}
        </span>
        <div className="min-w-0 flex-1 text-white">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold leading-tight">
              {authorName}
            </span>
            <span
              className="text-[0.7rem] leading-tight opacity-75"
              dir="ltr"
            >
              @{authorUsername}
            </span>
          </div>
          {caption && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 block w-full text-start text-sm leading-relaxed"
              style={{
                color: 'rgba(255,255,255,0.92)',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: expanded ? 99 : 3,
                overflow: 'hidden',
              }}
            >
              {caption}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
