'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { LANGUAGES, type Lang } from '@/lib/translations'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('language.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 opacity-70"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 010 18" />
          <path d="M12 3a14 14 0 000 18" />
        </svg>
        <span className="font-semibold">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-11 z-50 min-w-[10rem] overflow-hidden rounded-2xl border p-1 shadow-2xl backdrop-blur-xl"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
          }}
        >
          {LANGUAGES.map((l) => {
            const active = l.code === lang
            return (
              <button
                key={l.code}
                role="menuitem"
                onClick={() => {
                  setLang(l.code as Lang)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? 'var(--ring)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--text-soft)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span>{l.label}</span>
                <span
                  className="text-[0.65rem] font-semibold tracking-widest opacity-70"
                  style={{ color: 'var(--muted-2)' }}
                >
                  {l.code.toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
