'use client'

import Link from 'next/link'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'

type CommonProps = {
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  className?: string
  style?: CSSProperties
}

const baseClass =
  'group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl px-8 py-[1.15rem] text-base font-semibold text-white transition-all duration-[400ms] ease-out hover:-translate-y-1 hover:scale-[1.015] active:translate-y-0 active:scale-[0.99] active:duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100'

function buttonStyle(disabled: boolean | undefined): CSSProperties {
  return {
    backgroundImage:
      'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
    boxShadow: disabled
      ? '0 8px 20px -10px rgba(123,92,245,0.25), inset 0 1px 0 rgba(255,255,255,0.18)'
      : 'var(--shadow-cta)',
  }
}

function handleEnter(disabled: boolean | undefined) {
  return (e: MouseEvent<HTMLElement>) => {
    if (disabled) return
    ;(e.currentTarget as HTMLElement).style.boxShadow =
      'var(--shadow-cta-hover)'
  }
}

function handleLeave(disabled: boolean | undefined) {
  return (e: MouseEvent<HTMLElement>) => {
    if (disabled) return
    ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-cta)'
  }
}

function Inner({
  children,
  showArrow,
  loading,
}: {
  children: ReactNode
  showArrow: boolean
  loading?: boolean
}) {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full bg-gradient-to-l from-white/25 via-white/10 to-transparent opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100"
      />
      {loading ? (
        <span
          aria-hidden
          className="relative inline-flex h-5 w-5 items-center justify-center"
        >
          <span
            className="qift-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          />
        </span>
      ) : (
        <>
          <span className="relative">{children}</span>
          {showArrow && (
            <span
              aria-hidden
              className="relative ms-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-all duration-300 group-hover:-translate-x-1 group-hover:bg-white/25 rtl:group-hover:translate-x-0 rtl:group-hover:-translate-x-1"
            >
              ←
            </span>
          )}
        </>
      )}
    </>
  )
}

type LinkProps = CommonProps & {
  href: string
  type?: never
  onClick?: never
  showArrow?: boolean
}

type ButtonProps = CommonProps & {
  href?: never
  type?: 'submit' | 'button'
  onClick?: () => void
  showArrow?: boolean
}

export default function PrimaryButton(props: LinkProps | ButtonProps) {
  const showArrow = props.showArrow !== false
  const isBusy = !!props.loading
  const isDisabled = props.disabled || isBusy

  if ('href' in props && props.href) {
    return (
      <Link
        href={props.href}
        aria-busy={isBusy || undefined}
        className={[baseClass, props.className].filter(Boolean).join(' ')}
        style={{ ...buttonStyle(isDisabled), ...props.style }}
        onMouseEnter={handleEnter(isDisabled)}
        onMouseLeave={handleLeave(isDisabled)}
      >
        <Inner showArrow={showArrow} loading={isBusy}>{props.children}</Inner>
      </Link>
    )
  }

  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={isDisabled}
      aria-busy={isBusy || undefined}
      className={[baseClass, props.className].filter(Boolean).join(' ')}
      style={{ ...buttonStyle(isDisabled), ...props.style }}
      onMouseEnter={handleEnter(isDisabled)}
      onMouseLeave={handleLeave(isDisabled)}
    >
      <Inner showArrow={showArrow} loading={isBusy}>{props.children}</Inner>
    </button>
  )
}
