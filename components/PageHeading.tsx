import type { ReactNode } from 'react'
import GradientText from './GradientText'

export default function PageHeading({
  badge,
  line1,
  gradient,
  line3,
  subtitle,
  size = 'md',
}: {
  badge?: ReactNode
  line1: ReactNode
  gradient: ReactNode
  line3?: ReactNode
  subtitle?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const headlineClass =
    size === 'lg'
      ? 'text-[3rem] sm:text-[3.8rem]'
      : size === 'sm'
      ? 'text-[2.4rem] sm:text-[3rem]'
      : 'text-[2.6rem] sm:text-[3.2rem]'

  return (
    <div className="relative flex flex-col">
      {/* Soft colored backdrop blob behind the heading area */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 left-0 -z-10 h-40 w-64"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--primary) 32%, transparent) 0%, rgba(0,0,0,0) 75%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Lit-from-above hairline above the badge */}
      <span
        aria-hidden
        className="mb-4 block h-px w-12"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--primary) 70%, transparent) 50%, transparent 100%)',
        }}
      />

      {badge && <div className="mb-5">{badge}</div>}

      <h1
        className={`${headlineClass} font-extrabold leading-[1.1] tracking-tight`}
        style={{ color: 'var(--ink)' }}
      >
        {line1}
        <br />
        <span className="relative inline-block">
          {/* Strong luminance behind the gradient line */}
          <span
            aria-hidden
            className="qift-headline-gradient pointer-events-none absolute inset-0 select-none"
            style={{
              filter: 'blur(28px)',
              opacity: 0.75,
              transform: 'translateY(2px) scale(1.05)',
            }}
          >
            {gradient}
          </span>
          <GradientText>{gradient}</GradientText>
        </span>
        {line3 && (
          <>
            <br />
            {line3}
          </>
        )}
      </h1>

      {subtitle && (
        <p
          className="mt-4 max-w-md text-base leading-relaxed sm:text-lg"
          style={{ color: 'var(--text-soft)' }}
        >
          {subtitle}
        </p>
      )}

      {/* Accent bar — visual full-stop */}
      <span
        aria-hidden
        className="mt-6 block h-1 w-12 rounded-full"
        style={{
          background:
            'linear-gradient(90deg, var(--primary) 0%, var(--accent-2) 100%)',
          boxShadow:
            '0 6px 18px -4px color-mix(in srgb, var(--primary) 80%, transparent)',
        }}
      />
    </div>
  )
}
