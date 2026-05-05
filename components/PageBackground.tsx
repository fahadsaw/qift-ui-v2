// Ambient page scenography. Six layers (back to front):
//   1. Base linear gradient
//   2. Top-right primary purple orb (drifts)
//   3. Bottom-left blue orb (drifts on opposite schedule)
//   4. Center luminance (static)
//   5. Two small upper accent shapes near the heading area (drift, offset delays)
//   6. Noise grain
//
// All motion suppressed under prefers-reduced-motion via the global rule
// in globals.css. Orbs use translate3d only — GPU-cheap.
const orbBase = 'pointer-events-none fixed -z-10'

export default function PageBackground() {
  return (
    <>
      {/* Base gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          background:
            'linear-gradient(180deg, var(--bg-base) 0%, var(--bg-soft) 100%)',
        }}
      />

      {/* Top-right primary orb */}
      <div
        aria-hidden
        className={`${orbBase} qift-orb-a`}
        style={{
          top: '-22%',
          right: '-18%',
          width: '90vmin',
          height: '90vmin',
          background:
            'radial-gradient(closest-side, var(--glow-1) 0%, rgba(0,0,0,0) 72%)',
        }}
      />

      {/* Bottom-left blue secondary orb */}
      <div
        aria-hidden
        className={`${orbBase} qift-orb-b`}
        style={{
          bottom: '-28%',
          left: '-20%',
          width: '85vmin',
          height: '85vmin',
          background:
            'radial-gradient(closest-side, var(--glow-2) 0%, rgba(0,0,0,0) 75%)',
        }}
      />

      {/* Center luminance */}
      <div
        aria-hidden
        className={orbBase}
        style={{
          top: '42%',
          left: '50%',
          width: '60vmin',
          height: '60vmin',
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(closest-side, var(--glow-center) 0%, rgba(0,0,0,0) 75%)',
        }}
      />

      {/* Heading-area violet accent (drifts) */}
      <div
        aria-hidden
        className={`${orbBase} qift-orb-a`}
        style={{
          top: '6%',
          left: '12%',
          width: '46vmin',
          height: '46vmin',
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--accent-2) 40%, transparent) 0%, rgba(0,0,0,0) 78%)',
          animationDelay: '-7s',
        }}
      />

      {/* Small floating pink accent — adds warmth without competing */}
      <div
        aria-hidden
        className={`${orbBase} qift-orb-b`}
        style={{
          top: '20%',
          right: '8%',
          width: '32vmin',
          height: '32vmin',
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 28%, transparent) 0%, rgba(0,0,0,0) 78%)',
          animationDelay: '-12s',
        }}
      />

      {/* Faint indigo wash mid-right for depth on long pages */}
      <div
        aria-hidden
        className={`${orbBase} qift-orb-a`}
        style={{
          top: '60%',
          right: '-10%',
          width: '52vmin',
          height: '52vmin',
          background:
            'radial-gradient(closest-side, rgba(96, 132, 255, 0.28) 0%, rgba(0,0,0,0) 78%)',
          animationDelay: '-3s',
        }}
      />

      {/* Noise grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 mix-blend-multiply"
        style={{
          opacity: 'var(--noise-opacity)',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  )
}
