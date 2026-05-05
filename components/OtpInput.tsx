'use client'

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

type Props = {
  length?: number
  value: string
  onChange: (next: string) => void
  onComplete?: (code: string) => void
  autoFocus?: boolean
  disabled?: boolean
  error?: boolean
}

// Premium 4-box OTP input. Each box is a single-digit cell that:
//   - auto-advances on input,
//   - moves back on Backspace from an empty cell,
//   - accepts a paste of the full code,
//   - fires `onComplete` once `length` digits are filled.
export default function OtpInput({
  length = 4,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  error,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const writeAt = (index: number, char: string) => {
    const digits = value.split('').slice(0, length)
    while (digits.length < length) digits.push('')
    digits[index] = char
    const next = digits.join('').slice(0, length)
    onChange(next)
    if (next.length === length && onComplete) onComplete(next)
  }

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    writeAt(index, digit)
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      e.preventDefault()
      writeAt(index - 1, '')
      refs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!text) return
    e.preventDefault()
    onChange(text)
    if (text.length === length && onComplete) onComplete(text)
    refs.current[Math.min(text.length, length - 1)]?.focus()
  }

  const cells = Array.from({ length }, (_, i) => i)

  return (
    <div
      dir="ltr"
      className="flex items-center justify-center gap-2"
    >
      {cells.map((i) => {
        const filled = !!value[i]
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={value[i] ?? ''}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className="h-14 w-12 rounded-2xl border text-center text-xl font-bold transition-all focus:outline-none disabled:opacity-50 sm:h-16 sm:w-14 sm:text-2xl"
            style={{
              borderColor: error
                ? 'rgba(220, 90, 110, 0.55)'
                : filled
                ? 'var(--input-border-focus)'
                : 'var(--border)',
              background: 'var(--card)',
              color: 'var(--ink)',
              boxShadow: filled
                ? 'var(--input-shadow-focus)'
                : 'var(--input-shadow)',
            }}
          />
        )
      })}
    </div>
  )
}
