'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import Field from './Field'
import { COUNTRIES, schemaFor, type CountrySchema } from '@/lib/addresses'
import { useI18n } from '@/lib/i18n'
import {
  getLocationConfig,
  getTierOptions,
  type LocationField,
} from '@/lib/locations'

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

  // When the user changes a tier from the catalog dropdown, clear
  // every lower tier so a stale selection doesn't survive the parent
  // change. The catalog tiers are ordered broad → specific, so we
  // wipe everything that comes after the changed tier.
  //
  // Example: country=SA, region=منطقة الرياض, city=الرياض,
  // district=العليا. User changes city to جدة → district is cleared
  // because العليا doesn't belong to جدة.
  const updateTierField = (
    changedField: LocationField,
    nextValue: string,
  ) => {
    const config = getLocationConfig(value.country)
    if (!config) {
      // No catalog → fall back to plain field update.
      updateField(changedField, nextValue)
      return
    }
    const tierIndex = config.tiers.findIndex((t) => t.field === changedField)
    if (tierIndex < 0) {
      updateField(changedField, nextValue)
      return
    }
    const nextDetails = { ...value.details, [changedField]: nextValue }
    // Clear lower tiers (anything after the changed tier in the
    // tier sequence). Preserves non-tier fields (street, building,
    // etc.) untouched.
    for (let i = tierIndex + 1; i < config.tiers.length; i++) {
      const lowerField = config.tiers[i].field
      if (lowerField in nextDetails) delete nextDetails[lowerField]
    }
    onChange({ ...value, details: nextDetails })
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
          {schema.fields.map((f) => {
            // Saudi short-address gets a one-line hint right under the
            // input. The hint is honest about the current state: we
            // save the short address you type, and once the SPL
            // National Address API is wired up we'll populate the
            // other fields automatically. No fake "Autofill" button —
            // see #35 in the spec.
            const showShortAddressHint =
              f.key === 'shortAddress' && value.country === 'SA'

            // Catalog-aware rendering: when the field is one of the
            // structured location tiers (region/city/governorate/
            // district) AND the unified catalog has options for it
            // given the higher-tier selections, render a constrained
            // dropdown. Otherwise fall through to the free-text
            // Field below — same component used for street, building
            // number, etc.
            const tierInfo = resolveTier(value.country, f.key, value.details)
            if (tierInfo) {
              return (
                <LocationTierField
                  key={f.key}
                  field={f.key as LocationField}
                  label={t(f.labelKey)}
                  value={value.details[f.key] ?? ''}
                  options={tierInfo.options}
                  optional={f.optional}
                  parentSelected={tierInfo.parentSelected}
                  parentLabel={tierInfo.parentLabel}
                  onChange={(v) => updateTierField(f.key as LocationField, v)}
                />
              )
            }

            return (
              <div key={f.key}>
                <Field
                  label={t(f.labelKey)}
                  value={value.details[f.key] ?? ''}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  optional={f.optional ? t('common.optional') : undefined}
                  requiredMark={!f.optional}
                  dirOverride={f.dirOverride}
                  placeholder={f.placeholder}
                />
                {showShortAddressHint && (
                  <p
                    className="mt-1.5 text-[0.7rem] leading-relaxed"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('addr.short_address_hint_sa')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Resolve the tier metadata for a given backend field on the active
// country. Returns `null` when the field isn't a structured location
// tier or the catalog doesn't have entries for the parent selection
// (in which case the caller falls back to free-text).
function resolveTier(
  countryCode: string,
  fieldKey: string,
  details: Record<string, string>,
): {
  options: string[]
  parentSelected: boolean
  parentLabel: string | null
} | null {
  const config = getLocationConfig(countryCode)
  if (!config) return null
  const tierIndex = config.tiers.findIndex((t) => t.field === fieldKey)
  if (tierIndex < 0) return null
  const idx = (tierIndex + 1) as 1 | 2 | 3 | 4
  const parentValues = {
    tier1: details[config.tiers[0]?.field ?? ''] || undefined,
    tier2: details[config.tiers[1]?.field ?? ''] || undefined,
    tier3: details[config.tiers[2]?.field ?? ''] || undefined,
  }
  const options = getTierOptions(countryCode, idx, parentValues)
  if (idx > 1 && options.length === 0) {
    // Either the parent isn't selected yet OR the parent has no
    // catalog children — caller should fall back to free text.
    const parentField = config.tiers[idx - 2]?.field
    const parentValue = parentField ? details[parentField] : undefined
    return {
      options,
      parentSelected: !!parentValue,
      parentLabel: parentField ?? null,
    }
  }
  return { options, parentSelected: true, parentLabel: null }
}

// Single-tier dropdown UI. Shows a constrained list of options when
// the catalog has them. Falls back to a typed free-text input when
// either (a) the parent tier isn't selected yet (we tell the user
// to pick the parent first) or (b) the parent has no catalog
// children (we still want the user to be able to type their
// neighbourhood). The free-text fallback writes to the same backend
// column as the dropdown, so partial datasets never block sign-up.
function LocationTierField({
  field,
  label,
  value,
  options,
  optional,
  parentSelected,
  parentLabel,
  onChange,
}: {
  field: LocationField
  label: string
  value: string
  options: string[]
  optional?: boolean
  parentSelected: boolean
  parentLabel: string | null
  onChange: (v: string) => void
}) {
  const { t } = useI18n()
  const inputId = useId()
  const hasOptions = options.length > 0
  // When the parent isn't selected and we're not the top tier, lock
  // the field with a hint that the parent must be chosen first. Top
  // tier (parentLabel === null) always has options.
  const locked = !parentSelected && !!parentLabel

  if (hasOptions) {
    return (
      <div>
        <label
          htmlFor={inputId}
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {label}
          {!optional && (
            <span
              aria-hidden
              className="ms-1.5 text-[0.85rem] font-bold leading-none"
              style={{ color: 'var(--primary)' }}
            >
              *
            </span>
          )}
          {optional && (
            <span
              className="ms-2 text-[0.65rem] font-normal tracking-normal"
              style={{ color: 'var(--muted-2)' }}
            >
              ({t('common.optional')})
            </span>
          )}
        </label>
        <select
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-2xl border bg-[var(--card)] px-5 py-[1.05rem] text-base font-medium backdrop-blur-md transition-colors focus:outline-none"
          style={{
            borderColor: 'var(--border-strong)',
            color: value ? 'var(--text)' : 'var(--placeholder)',
          }}
          aria-required={!optional}
          aria-label={label}
          data-tier-field={field}
        >
          <option value="">{`${t('stores.choose')} ${label}`}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // No catalog options → free text. When the parent isn't picked
  // yet, render a disabled placeholder pointing the user upstream.
  if (locked) {
    return (
      <div>
        <label
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--muted-2)' }}
        >
          {label}
        </label>
        <div
          className="flex w-full items-center rounded-2xl border px-5 py-[1.05rem] text-sm"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--muted-2)',
          }}
          aria-disabled
        >
          {t('stores.select_country_first')}
        </div>
      </div>
    )
  }

  return (
    <Field
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      optional={optional ? t('common.optional') : undefined}
      requiredMark={!optional}
    />
  )
}
