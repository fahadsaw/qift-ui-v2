'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Field from './Field'
import { COUNTRIES, schemaFor, type CountrySchema } from '@/lib/addresses'
import { useI18n } from '@/lib/i18n'

export type AddressValue = {
  country: string
  details: Record<string, string>
}

export default function AddressForm({
  value,
  onChange,
}: {
  value: AddressValue
  onChange: (next: AddressValue) => void
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, COUNTRIES.findIndex((c) => c.code === value.country)),
  )

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const schema: CountrySchema | undefined = useMemo(
    () => schemaFor(value.country),
    [value.country],
  )

  const updateField = (key: string, v: string) => {
    onChange({
      ...value,
      details: { ...value.details, [key]: v },
    })
  }

  const selectCountry = (code: string) => {
    onChange({ country: code, details: {} })
    setOpen(false)
  }

  // Close on outside click + Escape; refocus the trigger on close.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-country-index="${activeIndex}"]`,
    )
    el?.focus()
  }, [open, activeIndex])

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    }
  }

  const onOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i + 1) % COUNTRIES.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i - 1 + COUNTRIES.length) % COUNTRIES.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(COUNTRIES.length - 1)
    }
  }

  const current = schemaFor(value.country)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                'linear-gradient(135deg, var(--primary), var(--accent-2))',
              boxShadow:
                '0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent)',
            }}
          />
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--primary)' }}
          >
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span
            className="text-[0.65rem] font-semibold tracking-[0.35em]"
            style={{ color: 'var(--muted-2)' }}
          >
            {t('register.address_section')}
          </span>
        </div>
        <p
          className="mt-1.5 text-[0.8rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {t('register.address_subtitle')}
        </p>
      </div>

      <div ref={wrapRef} className="relative">
        <span
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('register.country_label')}
          <span
            aria-hidden
            className="ms-1 text-[0.7rem] font-bold"
            style={{ color: 'var(--primary)' }}
          >
            *
          </span>
        </span>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
          className="flex w-full items-center justify-between rounded-2xl border bg-[var(--card)] px-5 py-[1.05rem] text-base font-medium backdrop-blur-md transition-colors"
          style={{
            borderColor: 'var(--border)',
            color: current ? 'var(--text)' : 'var(--placeholder)',
          }}
        >
          <span className="flex items-center gap-2.5">
            {current ? (
              <>
                <span aria-hidden className="text-xl leading-none">
                  {current.flag}
                </span>
                <span>{current.name[lang === 'ar' ? 'ar' : 'en']}</span>
              </>
            ) : (
              t('register.country_placeholder')
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            ref={listRef}
            role="listbox"
            aria-label={t('register.country_label')}
            className="qift-fade-in absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-auto rounded-2xl border p-1.5 backdrop-blur-xl"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {COUNTRIES.map((c, i) => {
              const active = c.code === value.country
              return (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-country-index={i}
                  onClick={() => selectCountry(c.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      selectCountry(c.code)
                    } else {
                      onOptionKeyDown(e, i)
                    }
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-[0.875rem] transition-colors focus:outline-none"
                  style={{
                    background: active ? 'var(--ring)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--text-soft)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="text-xl leading-none">
                      {c.flag}
                    </span>
                    <span>{c.name[lang === 'ar' ? 'ar' : 'en']}</span>
                  </span>
                  {active && (
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'var(--primary)' }}
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {schema && (
        <div className="flex flex-col gap-3.5">
          {schema.fields.map((f) => (
            <Field
              key={f.key}
              label={t(f.labelKey)}
              value={value.details[f.key] ?? ''}
              onChange={(e) => updateField(f.key, e.target.value)}
              optional={f.optional ? t('common.optional') : undefined}
              requiredMark={!f.optional}
              dirOverride={f.dirOverride}
              placeholder={f.placeholder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
