import Link from 'next/link'

// Brand wordmark surfaced in the top header and a couple of empty
// states. Two visual cues:
//
//   1. The QIFT wordmark itself, in tracked-out caps with a slightly
//      heavier weight than body copy. This is the historic shape; we
//      kept the letterform and spacing so the brand doesn't suddenly
//      look "different" in the same session a returning user opens.
//
//   2. A small gradient dot ahead of the wordmark, in the same
//      primary→accent stops the CTAs already use. The dot reads as a
//      tiny logo-mark without committing to a full custom glyph
//      (which would need real design work). It also gives the eye a
//      stable anchor when the wordmark sits inside a translucent
//      blurred header — the dot is the highest-contrast pixel in the
//      Brand and pulls focus.
//
// Sizes scale every dimension proportionally so the dot/wordmark
// relationship stays visually constant. The component is wrapped in
// a Link to / so the navbar Brand is always tappable as "go home".
export default function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg'
  const dotSize = isLg ? '0.55rem' : '0.45rem'
  const fontSize = isLg ? '1.1rem' : '0.95rem'
  return (
    <Link
      href="/"
      aria-label="Qift"
      className="inline-flex items-center gap-[0.55em] transition-opacity hover:opacity-80"
      style={{ color: 'var(--ink)' }}
    >
      {/* Gradient dot. Tiny — never wider than the wordmark's stroke
          weight times ~3 — so it reads as a mark, not a graphic. The
          subtle drop-shadow lifts it off the blurred header surface
          without competing with the wordmark itself. aria-hidden
          because the surrounding Link already labels the whole
          element as "Qift" for screen readers. */}
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow:
            '0 2px 6px -1px rgba(123, 92, 245, 0.45), inset 0 0 0 1px rgba(255,255,255,0.18)',
        }}
      />
      <span
        style={{
          fontWeight: 700,
          letterSpacing: '0.55em',
          paddingInlineStart: '0.1em',
          fontSize,
        }}
      >
        QIFT
      </span>
    </Link>
  )
}
