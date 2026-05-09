// App-level loading.tsx. Next.js shows this instantly on every
// route navigation while the target segment streams in — pairs
// with the per-page skeletons that already exist on individual
// routes (e.g. /gifts has its own GiftsSkeleton). This top-level
// fallback handles the brief gap before that page's skeleton
// component takes over.
//
// Branded treatment: the gradient dot from the Brand component
// (in its larger 0.55rem size) sits above a thin spinner and the
// wordmark. The whole stack stays vertically centered in the
// viewport so loading reads as a deliberate moment instead of an
// indeterminate flicker. Animation respects prefers-reduced-motion
// via the existing .qift-spin / .qift-fade-in rules in globals.css.
//
// Kept dependency-free on purpose: pulling i18n / auth here would
// make a render of the loading shell wait on context that may
// itself be loading. Plain markup with CSS-var-driven colors so
// it matches the active theme without any JS.

export default function Loading() {
  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        aria-label="Loading"
        role="status"
        className="qift-fade-in flex flex-col items-center gap-4"
      >
        {/* Gradient dot mark. Same stops as Brand. Slightly larger
            (0.65rem) than the navbar dot so the loading shell has
            a clear focal point — but still small enough to read
            as a brand cue rather than a hero graphic. */}
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: '0.65rem',
            height: '0.65rem',
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow:
              '0 4px 14px -4px rgba(123, 92, 245, 0.55), inset 0 0 0 1px rgba(255,255,255,0.22)',
          }}
        />
        {/* The spinner — kept thin (2px) so it doesn't compete with
            the dot above. */}
        <span
          aria-hidden
          className="qift-spin h-8 w-8 rounded-full"
          style={{
            border: '2px solid color-mix(in srgb, var(--primary) 18%, transparent)',
            borderTopColor: 'var(--primary)',
          }}
        />
        {/* Wordmark. Lower contrast than the dot so the dot remains
            the focal point. Letter-spacing matches Brand exactly so
            the loading shell feels continuous with the navbar that's
            about to render once the route streams in. */}
        <span
          aria-hidden
          className="text-[0.7rem] font-bold"
          style={{
            letterSpacing: '0.55em',
            paddingInlineStart: '0.1em',
            color: 'var(--muted)',
          }}
        >
          QIFT
        </span>
      </div>
    </main>
  )
}
