'use client'

import { useMemo, useState } from 'react'
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

  const current = schemaFor(value.country)

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <span
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('register.country_label')}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
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
            className="h-4 w-4 opacity-60"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            className="mt-2 overflow-hidden rounded-2xl border p-1 backdrop-blur-xl"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {COUNTRIES.map((c) => {
              const active = c.code === value.country
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCountry(c.code)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
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
                  <span
                    className="text-[0.65rem] font-semibold tracking-widest opacity-70"
                  >
                    {c.code}
                  </span>
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
              dirOverride={f.dirOverride}
              placeholder={f.placeholder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
