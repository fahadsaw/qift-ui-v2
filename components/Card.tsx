import type { ReactNode } from 'react'

export default function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={`rounded-3xl border backdrop-blur-md transition-shadow duration-300 ${padded ? 'p-4 sm:p-5' : ''} ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {children}
    </div>
  )
}
