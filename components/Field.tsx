'use client'

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

type BaseProps = {
  label: string
  helper?: string
  error?: string
  trailing?: ReactNode
  prefix?: ReactNode
  optional?: string
  requiredMark?: boolean
  dirOverride?: 'ltr' | 'rtl'
}

type InputProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
    multiline?: false
  }

type TextareaProps = BaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true
    rows?: number
  }

type Props = InputProps | TextareaProps

function fieldShellStyle(focused: boolean, hasError: boolean) {
  const focusBorder = hasError
    ? 'rgba(220, 90, 110, 0.65)'
    : 'var(--input-border-focus)'
  return {
    borderColor: focused ? focusBorder : 'var(--border-strong)',
    background: focused
      ? 'color-mix(in srgb, var(--surface-2) 88%, transparent)'
      : 'var(--card)',
    boxShadow: focused
      ? hasError
        ? '0 0 0 5px rgba(220,90,110,0.16), 0 18px 44px -14px rgba(220,90,110,0.40)'
        : 'var(--input-shadow-focus)'
      : 'var(--input-shadow)',
    transform: focused ? 'translateY(-1px)' : 'translateY(0)',
  }
}

const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, Props>(
  function Field(props, _ref) {
    const id = useId()
    const [focused, setFocused] = useState(false)
    const hasError = !!props.error

    const labelRow = (
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-xs font-semibold transition-all duration-200"
          style={{
            color: focused ? 'var(--ink)' : 'var(--text-soft)',
            letterSpacing: focused ? '0.22em' : '0.2em',
          }}
        >
          {props.label}
          {props.requiredMark && !props.optional && (
            <span
              aria-hidden
              className="ms-1.5 text-[0.85rem] font-bold leading-none"
              style={{ color: 'var(--primary)' }}
            >
              *
            </span>
          )}
          {props.optional && (
            <span
              className="ms-2 text-[0.65rem] font-normal tracking-normal"
              style={{ color: 'var(--muted-2)' }}
            >
              ({props.optional})
            </span>
          )}
        </label>
        {props.trailing}
      </div>
    )

    const messageRow =
      props.error ? (
        <span
          role="alert"
          className="qift-fade-in mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{
            background: 'rgba(220, 90, 110, 0.10)',
            color: '#D55B6E',
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <span>{props.error}</span>
        </span>
      ) : props.helper ? (
        <span
          className="mt-2 block text-[0.7rem] font-normal"
          style={{ color: 'var(--muted-2)' }}
        >
          {props.helper}
        </span>
      ) : null

    const ariaRequired =
      props.requiredMark && !props.optional ? true : undefined

    const sharedInputClass =
      'w-full bg-transparent px-5 py-[1.05rem] text-base font-medium focus:outline-none'
    const sharedInputStyle = {
      color: 'var(--text)',
    } as const

    const shellClass =
      'relative flex items-center overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-300'
    const shellStyle = fieldShellStyle(focused, hasError)

    if ('multiline' in props && props.multiline) {
      const {
        label: _l,
        helper: _h,
        error: _e,
        trailing: _t,
        prefix: _p,
        optional: _o,
        requiredMark: _rm,
        dirOverride: _d,
        multiline: _m,
        rows,
        ...rest
      } = props
      return (
        <label className="block">
          {labelRow}
          <div className={shellClass} style={shellStyle}>
            <textarea
              {...rest}
              id={id}
              rows={rows ?? 4}
              dir={props.dirOverride}
              aria-required={ariaRequired}
              aria-invalid={hasError || undefined}
              onFocus={(e) => {
                setFocused(true)
                rest.onFocus?.(e)
              }}
              onBlur={(e) => {
                setFocused(false)
                rest.onBlur?.(e)
              }}
              className={`${sharedInputClass} resize-none placeholder:text-[var(--placeholder)]`}
              style={sharedInputStyle}
            />
          </div>
          {messageRow}
        </label>
      )
    }

    const {
      label: _l,
      helper: _h,
      error: _e,
      trailing: _t,
      prefix,
      optional: _o,
      requiredMark: _rm,
      dirOverride,
      ...rest
    } = props as InputProps

    return (
      <label className="block">
        {labelRow}
        <div className={shellClass} style={shellStyle}>
          {prefix && (
            <span
              className="pointer-events-none select-none ps-5 text-lg font-medium"
              style={{ color: 'var(--muted-2)' }}
            >
              {prefix}
            </span>
          )}
          <input
            {...rest}
            id={id}
            dir={dirOverride}
            aria-required={ariaRequired}
            aria-invalid={hasError || undefined}
            onFocus={(e) => {
              setFocused(true)
              rest.onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              rest.onBlur?.(e)
            }}
            className={`${sharedInputClass} placeholder:text-[var(--placeholder)] ${prefix ? 'ps-2' : ''}`}
            style={sharedInputStyle}
          />
        </div>
        {messageRow}
      </label>
    )
  },
)

export default Field
