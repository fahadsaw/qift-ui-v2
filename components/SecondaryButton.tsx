'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  href?: string
  onClick?: () => void
  children: ReactNode
  className?: string
}

const cls =
  'inline-flex w-full items-center justify-center rounded-2xl border px-8 py-[1.1rem] text-base font-medium backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0'

const inlineStyle = {
  borderColor: 'var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
} as const

export default function SecondaryButton({
  href,
  onClick,
  children,
  className,
}: Props) {
  const handleEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'rgba(123,92,245,0.4)'
    e.currentTarget.style.boxShadow = 'var(--shadow-soft)'
    e.currentTarget.style.background = 'var(--surface)'
  }
  const handleLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--border)'
    e.currentTarget.style.boxShadow = 'none'
    e.currentTarget.style.background = 'var(--card)'
  }

  if (href) {
    return (
      <Link
        href={href}
        className={[cls, className].filter(Boolean).join(' ')}
        style={inlineStyle}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={[cls, className].filter(Boolean).join(' ')}
      style={inlineStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
    </button>
  )
}
