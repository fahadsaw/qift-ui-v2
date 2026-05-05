'use client'

import { useEffect, useState, type CSSProperties } from 'react'

export default function Skeleton({
  className,
  style,
  rounded = 'lg',
}: {
  className?: string
  style?: CSSProperties
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'
}) {
  const radius =
    rounded === 'full'
      ? '9999px'
      : rounded === 'sm'
      ? '8px'
      : rounded === 'md'
      ? '12px'
      : rounded === 'lg'
      ? '14px'
      : rounded === 'xl'
      ? '16px'
      : rounded === '2xl'
      ? '20px'
      : '24px'
  return (
    <div
      aria-hidden
      className={`qift-skeleton ${className ?? ''}`}
      style={{ borderRadius: radius, ...style }}
    />
  )
}

export function useSimulatedReady(delayMs = 500) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(id)
  }, [delayMs])
  return ready
}
