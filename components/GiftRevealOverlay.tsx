'use client'

// Premium first-open reveal overlay for delivered gifts.
//
// WHEN IT FIRES
// Mounts only when the receiver lands on a *delivered* gift they
// haven't acknowledged yet. The detail page persists the
// acknowledgement to localStorage (`qift.giftOpenedIds`) the moment
// the user taps "open", so a second visit lands directly on the
// quiet detail layout instead of replaying the moment.
//
// THE SEQUENCE
// 1. Backdrop fades in with a soft radial halo (~280ms).
// 2. Wrapped gift card pops in centered (qift-reveal-pop, ~460ms).
// 3. Idle: the card breathes with qift-glow-pulse and the lid sits
//    on top with a horizontal ribbon. A "tap to open" CTA pulses
//    softly under the card.
// 4. User taps. The ribbon halves rotate apart, the lid lifts and
//    fades, the box itself shrinks and dissolves. Twelve small
//    confetti dots drift down from above the card (one-shot,
//    intentionally restrained — no fireworks). ~720ms total.
// 5. The whole overlay fades out and unmounts. The detail page
//    underneath is already visible and reads naturally.
//
// DESIGN NOTES
// - Mobile-first. Card is centered with `padding-bottom: env(safe-
//   area-inset-bottom)` so the CTA doesn't sit under the home
//   indicator. CTA is a thumb-reachable full-width button at ~70%
//   page height.
// - No autoplay sound or haptics. The reveal is visual.
// - Skip-on-back: pressing Escape, tapping the backdrop, or hitting
//   the close button skips the animation entirely (overlay just
//   fades) and still marks the gift as opened — re-replay is not a
//   value the user cares about; getting INTO the message is.
// - prefers-reduced-motion: animations collapse to instant via
//   globals.css; the overlay still renders so the moment is offered
//   but it doesn't move.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'

type Phase = 'idle' | 'opening' | 'closing'

export default function GiftRevealOverlay({
  onClose,
}: {
  // Called once after the user taps to open and the close animation
  // has run, OR immediately when the user dismisses (Esc, backdrop,
  // close button). Always idempotent — caller marks the gift as
  // opened in localStorage and unmounts this component.
  onClose: () => void
}) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('idle')

  // Skip — for Esc, backdrop, close button. Same end result as
  // tap-to-open, no animation. We still call onClose so the parent
  // marks the gift as opened (replaying the reveal on next visit
  // isn't useful).
  //
  // useCallback so the Esc-key effect can list it as a dep without
  // re-binding on every render.
  const skip = useCallback(() => {
    setPhase((cur) => {
      if (cur === 'closing') return cur
      setTimeout(() => onClose(), 180)
      return 'closing'
    })
  }, [onClose])

  // Tap-to-open: kick off the lid+ribbon animation, then close on a
  // timer. We don't wait for the CSS animationend events because
  // chained 'animationend' handlers across multiple elements with
  // different durations are fragile under reduced-motion (some
  // animations resolve instantly, fire end-events out of order).
  // A single timer matched to the longest animation is simpler and
  // resilient.
  const openIt = useCallback(() => {
    setPhase((cur) => {
      if (cur !== 'idle') return cur
      setTimeout(() => onClose(), 1100)
      return 'opening'
    })
  }, [onClose])

  // Esc dismisses — same effect as tapping the close (×) button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [skip])

  // Lock background scroll while the overlay is mounted so the page
  // beneath doesn't jiggle if the user scrolls during the moment.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t('gifts.reveal_overlay_label')}
      onClick={skip}
      className="qift-fade-in fixed inset-0 z-[60] flex items-center justify-center px-5"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 30%, color-mix(in srgb, var(--primary) 26%, rgba(15, 11, 24, 0.86)) 0%, rgba(15, 11, 24, 0.92) 70%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        opacity: phase === 'closing' ? 0 : 1,
        transition: 'opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Soft ambient halo behind the card — lives on its own layer
          so the pulse animation (slow scale) doesn't fight the
          card's pop animation. */}
      <span
        aria-hidden
        className="qift-glow-pulse pointer-events-none absolute"
        style={{
          width: 'min(540px, 92vw)',
          height: 'min(540px, 92vw)',
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--primary) 32%, transparent) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />

      {/* Confetti layer — only renders during the opening phase. The
          dots originate just above the card and drift down past it.
          Twelve total, mixed three keyframes + four lateral offsets +
          three colour stops so the cluster reads as deliberate but
          uncoordinated. */}
      {phase === 'opening' && <ConfettiBurst />}

      {/* Wrapped-gift card. Absolute width is bounded by min(380px,
          88vw) so the card never feels lost on a tablet but stays
          comfortably padded on a 375px iPhone. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          phase === 'opening'
            ? 'qift-box-open relative'
            : 'qift-reveal-pop relative'
        }
        style={{
          width: 'min(360px, 86vw)',
        }}
      >
        {/* The box body — gradient panel with the gift icon. The lid
            sits above this with absolute positioning. */}
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-[28px] border"
          style={{
            borderColor:
              'color-mix(in srgb, var(--primary) 60%, var(--border))',
            background:
              'linear-gradient(160deg, color-mix(in srgb, var(--primary) 22%, var(--card)) 0%, var(--card) 60%, color-mix(in srgb, var(--accent) 18%, var(--card)) 100%)',
            boxShadow:
              '0 36px 80px -22px color-mix(in srgb, var(--primary) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent)',
          }}
        >
          {/* Inner highlight — gives the card a soft glassy feel
              without leaning on backdrop-filter (which is expensive
              when stacked behind animated content). */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(80% 60% at 50% 18%, rgba(255,255,255,0.18) 0%, transparent 60%)',
            }}
          />

          {/* Gift icon centered on the box face. Sits below the lid
              + ribbon during the idle state; once the lid lifts it
              becomes the focus before the box itself dissolves. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              aria-hidden
              className="flex h-24 w-24 items-center justify-center rounded-3xl text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                boxShadow:
                  '0 18px 44px -12px color-mix(in srgb, var(--primary) 70%, transparent)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-12 w-12"
              >
                <path d="M20 12v9H4v-9" />
                <path d="M2 7h20v5H2z" />
                <path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
              </svg>
            </span>
          </div>

          {/* Lid — sits on top of the box face. During idle it covers
              roughly the top third; on tap it lifts away. */}
          <span
            aria-hidden
            className={`absolute inset-x-0 top-0 h-[42%] origin-top ${phase === 'opening' ? 'qift-lid-lift' : ''}`}
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--primary) 35%, var(--card)) 0%, color-mix(in srgb, var(--primary) 18%, var(--card)) 100%)',
              borderBottom:
                '1px solid color-mix(in srgb, var(--primary) 40%, var(--border))',
              boxShadow: '0 8px 24px -10px rgba(0,0,0,0.4)',
            }}
          />

          {/* Ribbon — two halves of a horizontal strip that meet in the
              center. They overlap by a few pixels during idle so the
              seam reads as a tied bow when paired with the central
              knot below. */}
          <span
            aria-hidden
            className={`absolute top-[36%] h-3 origin-right ${phase === 'opening' ? 'qift-ribbon-left' : ''}`}
            style={{
              left: 0,
              right: '50%',
              background:
                'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)',
              boxShadow:
                '0 4px 14px -4px color-mix(in srgb, var(--primary) 70%, transparent)',
            }}
          />
          <span
            aria-hidden
            className={`absolute top-[36%] h-3 origin-left ${phase === 'opening' ? 'qift-ribbon-right' : ''}`}
            style={{
              right: 0,
              left: '50%',
              background:
                'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)',
              boxShadow:
                '0 4px 14px -4px color-mix(in srgb, var(--primary) 70%, transparent)',
            }}
          />
          {/* Knot — small rounded square where the two halves meet. */}
          <span
            aria-hidden
            className={`absolute top-[34%] left-1/2 h-5 w-5 -translate-x-1/2 rounded-md ${phase === 'opening' ? 'qift-box-open' : ''}`}
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              boxShadow:
                '0 6px 14px -4px color-mix(in srgb, var(--primary) 70%, transparent)',
            }}
          />
        </div>

        {/* Title + CTA below the card. The eye lands on the card,
            then drifts down to read the headline, then to the CTA —
            standard premium-product visual hierarchy. */}
        <div className="mt-7 text-center">
          <p
            className="text-[1.05rem] font-bold tracking-tight"
            style={{ color: '#fff' }}
          >
            {t('gifts.reveal_title')}
          </p>
          <p
            className="mt-1.5 text-xs leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.72)' }}
          >
            {t('gifts.reveal_subtitle')}
          </p>
          <button
            type="button"
            onClick={openIt}
            disabled={phase !== 'idle'}
            className="qift-press qift-pulse-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[0.95rem] font-bold text-white transition-all disabled:opacity-80"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow:
                '0 16px 36px -10px color-mix(in srgb, var(--primary) 75%, transparent)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M12 2v8" />
              <path d="M5 10h14l-1.4 11.2a1 1 0 01-1 .8H7.4a1 1 0 01-1-.8L5 10z" />
              <path d="M9 10V8a3 3 0 016 0v2" />
            </svg>
            {t('gifts.reveal_cta')}
          </button>
          <button
            type="button"
            onClick={skip}
            className="mt-3 text-[0.7rem] font-medium tracking-wide"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            {t('gifts.reveal_skip')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Twelve confetti particles. Mixed across three keyframe variants
// and four lateral starting offsets so the cluster looks
// uncoordinated. Restrained palette — primary / accent / soft pink
// — keeps the moment elegant rather than carnival.
function ConfettiBurst() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    cls: ['qift-confetti-a', 'qift-confetti-b', 'qift-confetti-c'][i % 3],
    left: `${10 + ((i * 7) % 80)}%`,
    delay: `${(i % 6) * 50}ms`,
    color: ['var(--primary)', 'var(--accent)', '#F8A5D0'][i % 3],
    size: i % 4 === 0 ? 8 : 6,
    radius: i % 2 === 0 ? '50%' : '2px',
  }))
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        top: '20%',
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className={p.cls}
          style={{
            position: 'absolute',
            top: 0,
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.radius,
            animationDelay: p.delay,
            boxShadow:
              '0 2px 8px -2px color-mix(in srgb, var(--primary) 40%, transparent)',
          }}
        />
      ))}
    </div>
  )
}
