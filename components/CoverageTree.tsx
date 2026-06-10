'use client'

// Hierarchical coverage editor.
//
// Replaces the old `<ZoneEditor>` row-and-add-button flow with a
// single checkbox tree:
//
//   Quick presets row     ──  "كل دول الخليج" · "السعودية فقط" · ...
//   Country list          ──  tap to expand, tri-state checkbox
//     Region list         ──  tap to expand, tri-state checkbox
//       City list         ──  tap to expand, tri-state checkbox
//         District chips  ──  binary selection
//   Summary chips         ──  what's selected; tap × to remove
//
// Checkbox states  (per lib/coverageSelection.ts):
//   empty       → tap = check everything below
//   partial (–) → tap = check everything below
//   all   (✓)   → tap = uncheck everything below
//
// Expansion + selection are independent — opening a country
// doesn't change selection, and toggling a row doesn't expand it.
//
// MOBILE
// Every node is one full-width tap target. The chevron is part of
// the row (no narrow icon-only hit target). The component renders
// inside any parent — it does NOT impose page padding or its own
// layout box, so it drops cleanly into the onboarding step card
// AND the live coverage page.
//
// RTL
// Native (the whole app runs RTL by default). Tab indent uses
// margin-inline-start so it respects the document direction.

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  citiesForRegion,
  COUNTRIES_LIST,
  districtsForCity,
  regionsForCountry,
} from '@/lib/locations'
import {
  cityState,
  countryState,
  districtState,
  hasAnyCoverage,
  regionState,
  removeOrphan,
  summaryChips,
  toggleCity,
  toggleCountry,
  toggleDistrict,
  toggleRegion,
  type CheckState,
  type CoverageSelection,
} from '@/lib/coverageSelection'

// CLOSED-BETA STOPGAP (PR 2a): the country-wide presets ("All
// GCC", "Saudi only", ...) and the country/region checkboxes are
// hidden because the backend matcher only supports city/district
// rows today — a wildcard selection would persist NARROWER
// coverage than the merchant believes (the backend write path
// drops city-less rows). Country/region nodes remain as
// expand-only headers; city + district selection is unchanged.
// Restore the presets + checkboxes in PR 2b once the backend
// wildcard matching ships.

// Countries the tree renders, in display order. We deliberately
// omit OTHER (the catch-all) from the coverage editor — a
// merchant either delivers to a country we have catalogue data
// for, or they don't deliver there. Free-text country support
// can come later if a real merchant asks for it.
const TREE_COUNTRY_CODES = ['SA', 'KW', 'AE', 'QA', 'BH', 'OM'] as const

export default function CoverageTree({
  selection,
  onChange,
}: {
  selection: CoverageSelection
  onChange: (next: CoverageSelection) => void
}) {
  const { t } = useI18n()

  // Independent expansion state. Persisted across re-renders via
  // a Set of dot-joined keys ("SA", "SA/منطقة الرياض", "SA/منطقة الرياض/الرياض").
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const chips = useMemo(() => summaryChips(selection), [selection])
  const empty = !hasAnyCoverage(selection)

  return (
    <div className="flex flex-col gap-3">
      {/* ─ Closed-beta scope note ────────────────────────────────── */}
      {/* Country/region wildcards + the bulk presets are hidden for
          the closed beta (see file header). The calm note tells the
          merchant what to do instead and that broader scopes are
          coming — no error styling, this is expected behaviour. */}
      <div
        className="flex flex-col gap-2 rounded-2xl border px-3 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
        }}
      >
        <p
          className="text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('coverage.beta_scope_note')}
        </p>
        <div>
          <PresetButton
            label={t('coverage.preset_clear')}
            subtle
            onClick={() => onChange({ countries: {}, orphans: [] })}
          />
        </div>
      </div>

      {/* ─ Country tree ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl border"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        {TREE_COUNTRY_CODES.map((code, idx) => {
          const meta = COUNTRIES_LIST.find((c) => c.code === code)
          if (!meta) return null
          const state = countryState(selection, code)
          const open = expanded.has(code)
          return (
            <div
              key={code}
              style={{
                borderTop:
                  idx === 0 ? 'none' : '1px solid var(--hairline)',
              }}
            >
              {/* Beta stopgap: no country checkbox — the row is an
                  expand-only header. Children render even when the
                  state collapsed to 'all' (ticking every region
                  promotes the country) so the merchant can always
                  drill back in and untick a city. */}
              <Row
                level="country"
                state={state}
                open={open}
                hasChildren
                onToggleOpen={() => toggleExpand(code)}
                label={
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{meta.flag}</span>
                    <span>{meta.name.ar}</span>
                  </span>
                }
              />
              {open && (
                <RegionList
                  selection={selection}
                  onChange={onChange}
                  country={code}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ─ Summary chips ─────────────────────────────────────────── */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if (chip.isOrphan && typeof chip.orphanIndex === 'number') {
                  onChange(removeOrphan(selection, chip.orphanIndex))
                  return
                }
                if (chip.country && !chip.region && !chip.city) {
                  onChange(toggleCountry(selection, chip.country))
                  return
                }
                if (chip.country && chip.region && !chip.city) {
                  onChange(toggleRegion(selection, chip.country, chip.region))
                  return
                }
                if (chip.country && chip.region && chip.city) {
                  onChange(
                    toggleCity(selection, chip.country, chip.region, chip.city),
                  )
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold"
              style={{
                background:
                  'color-mix(in srgb, var(--primary) 14%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <span>{chip.label}</span>
              <span aria-hidden style={{ opacity: 0.6 }}>
                ×
              </span>
            </button>
          ))}
        </div>
      ) : (
        empty && (
          <p className="text-[0.72rem]" style={{ color: 'var(--muted)' }}>
            {t('coverage.empty_hint')}
          </p>
        )
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// PRESET BUTTON
// ──────────────────────────────────────────────────────────────────

function PresetButton({
  label,
  onClick,
  subtle,
}: {
  label: string
  onClick: () => void
  subtle?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors"
      style={{
        borderColor: subtle
          ? 'var(--border)'
          : 'color-mix(in srgb, var(--primary) 30%, var(--border))',
        background: subtle
          ? 'var(--card-soft)'
          : 'color-mix(in srgb, var(--primary) 8%, var(--card))',
        color: subtle ? 'var(--text-soft)' : 'var(--primary)',
      }}
    >
      {label}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────
// ROW PRIMITIVE
// ──────────────────────────────────────────────────────────────────
//
// One tap-line. Renders a tri-state checkbox + label + (optional)
// expand chevron. The checkbox and the rest of the row are
// independent tap targets so the merchant can expand without
// committing to a selection.
//
// `onToggleCheck` is optional during the closed-beta stopgap:
// country/region rows omit it and render as expand-only headers
// (no checkbox), because the backend can't honour wildcard
// coverage yet. City rows always pass it.

function Row({
  level,
  state,
  open,
  hasChildren,
  onToggleCheck,
  onToggleOpen,
  label,
  trailing,
}: {
  level: 'country' | 'region' | 'city'
  state: CheckState
  open: boolean
  hasChildren: boolean
  onToggleCheck?: () => void
  onToggleOpen?: () => void
  label: React.ReactNode
  trailing?: React.ReactNode
}) {
  // Indent grows with level depth. Country = 0, region = 1, city = 2.
  const indentRem =
    level === 'country' ? 0 : level === 'region' ? 1.25 : 2.5
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5"
      style={{ paddingInlineStart: `${0.75 + indentRem}rem` }}
    >
      {onToggleCheck && <Checkbox state={state} onClick={onToggleCheck} />}
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={!hasChildren}
        className="flex flex-1 items-center justify-between gap-2 text-start text-sm font-semibold disabled:cursor-default"
        style={{
          color: state === 'empty' ? 'var(--text-soft)' : 'var(--ink)',
        }}
      >
        <span className="truncate">{label}</span>
        {hasChildren && (
          <Chevron open={open} />
        )}
      </button>
      {trailing}
    </div>
  )
}

function Checkbox({
  state,
  onClick,
}: {
  state: CheckState
  onClick: () => void
}) {
  // 22px box, primary fill when all, partial-tint when partial,
  // hollow border when empty. The check / dash glyph is rendered
  // as an inline SVG so it inherits theme colours.
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={
        state === 'all' ? true : state === 'partial' ? 'mixed' : false
      }
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="relative flex h-[1.35rem] w-[1.35rem] shrink-0 items-center justify-center rounded-md border transition-colors"
      style={{
        borderColor:
          state === 'empty'
            ? 'var(--border)'
            : 'color-mix(in srgb, var(--primary) 60%, var(--border))',
        background:
          state === 'all'
            ? 'var(--primary)'
            : state === 'partial'
              ? 'color-mix(in srgb, var(--primary) 22%, transparent)'
              : 'var(--card)',
      }}
    >
      {state === 'all' && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden
        >
          <path d="M5 12l4.5 4.5L19 7" />
        </svg>
      )}
      {state === 'partial' && (
        <span
          aria-hidden
          className="block h-[2px] w-3 rounded-full"
          style={{ background: 'var(--primary)' }}
        />
      )}
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0 transition-transform"
      style={{
        color: 'var(--muted)',
        transform: open ? 'rotate(180deg)' : 'rotate(0)',
      }}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────────
// REGION / CITY / DISTRICT LISTS
// ──────────────────────────────────────────────────────────────────

function RegionList({
  selection,
  onChange,
  country,
  expanded,
  toggleExpand,
}: {
  selection: CoverageSelection
  onChange: (next: CoverageSelection) => void
  country: string
  expanded: Set<string>
  toggleExpand: (key: string) => void
}) {
  const { t } = useI18n()
  const regions = regionsForCountry(country)
  if (regions.length === 0) {
    return (
      <div
        className="px-12 pb-3 text-[0.7rem]"
        style={{ color: 'var(--muted)' }}
      >
        {t('coverage.no_regions')}
      </div>
    )
  }
  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      {regions.map((region) => {
        const state = regionState(selection, country, region)
        const key = `${country}/${region}`
        const open = expanded.has(key)
        return (
          <div key={region}>
            {/* Beta stopgap: no region checkbox — expand-only header,
                children always render when open (see country rows). */}
            <Row
              level="region"
              state={state}
              open={open}
              hasChildren
              onToggleOpen={() => toggleExpand(key)}
              label={region}
            />
            {open && (
              <CityList
                selection={selection}
                onChange={onChange}
                country={country}
                region={region}
                expanded={expanded}
                toggleExpand={toggleExpand}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CityList({
  selection,
  onChange,
  country,
  region,
  expanded,
  toggleExpand,
}: {
  selection: CoverageSelection
  onChange: (next: CoverageSelection) => void
  country: string
  region: string
  expanded: Set<string>
  toggleExpand: (key: string) => void
}) {
  const { t } = useI18n()
  const cities = citiesForRegion(country, region)
  if (cities.length === 0) {
    return (
      <div
        className="pb-3 ps-16 text-[0.7rem]"
        style={{ color: 'var(--muted)' }}
      >
        {t('coverage.no_cities')}
      </div>
    )
  }
  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      {cities.map((city) => {
        const state = cityState(selection, country, region, city)
        const districts = districtsForCity(country, city)
        const hasDistricts = districts.length > 0
        const key = `${country}/${region}/${city}`
        const open = expanded.has(key) && hasDistricts
        return (
          <div key={city}>
            <Row
              level="city"
              state={state}
              open={open}
              hasChildren={hasDistricts}
              onToggleCheck={() =>
                onChange(toggleCity(selection, country, region, city))
              }
              onToggleOpen={
                hasDistricts ? () => toggleExpand(key) : undefined
              }
              label={city}
            />
            {open && state !== 'all' && (
              <DistrictChips
                selection={selection}
                onChange={onChange}
                country={country}
                region={region}
                city={city}
                districts={districts}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DistrictChips({
  selection,
  onChange,
  country,
  region,
  city,
  districts,
}: {
  selection: CoverageSelection
  onChange: (next: CoverageSelection) => void
  country: string
  region: string
  city: string
  districts: ReadonlyArray<string>
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5 px-3 py-3 ps-16"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      {districts.map((d) => {
        const checked =
          districtState(selection, country, region, city, d) === 'all'
        return (
          <button
            key={d}
            type="button"
            onClick={() =>
              onChange(toggleDistrict(selection, country, region, city, d))
            }
            className="rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors"
            style={{
              borderColor: checked ? 'transparent' : 'var(--border)',
              background: checked ? 'var(--primary)' : 'var(--card)',
              color: checked ? '#fff' : 'var(--text-soft)',
              fontWeight: checked ? 600 : 500,
            }}
          >
            {d}
          </button>
        )
      })}
    </div>
  )
}
