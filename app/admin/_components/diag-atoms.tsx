'use client'

// Small label/value primitives used across the diagnostics +
// deployment-status surfaces. Extracted from page.tsx so the
// section files don't duplicate the same primitive.

export function DiagRow({
  label,
  value,
  mono,
  emphasise,
}: {
  label: string
  value: string
  mono?: boolean
  emphasise?: boolean
}) {
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3">
      <dt
        className="shrink-0 text-[0.65rem] font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </dt>
      <dd
        dir="ltr"
        className={`min-w-0 flex-1 text-end break-all ${
          mono ? 'font-mono text-[0.7rem]' : 'text-[0.75rem]'
        } font-medium`}
        style={{
          color: emphasise ? '#D55B6E' : 'var(--text)',
        }}
      >
        {value}
      </dd>
    </div>
  )
}

// Section heading used inside diagnostics + deployment cards.
// Identical shape across both surfaces so they read as one
// admin language.
export function SectionTitle({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <h3
      className="text-[0.78rem] font-bold tracking-[0.14em] uppercase"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </h3>
  )
}
