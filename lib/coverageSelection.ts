// Coverage selection tree — the canonical in-memory state for the
// new CoverageTree UI.
//
// PURPOSE
// The persisted wire shape (lib/deliveryZones.ts → DeliveryZone[])
// is a flat list of zones, each carrying just enough scope to
// match an address. That's the right shape for the matcher, but
// it's a bad shape for the editor: a merchant ticking "All Saudi"
// shouldn't have to author 200 city rows, and an editor working
// directly on the wire array would need to constantly re-collapse
// and re-expand selections.
//
// CoverageSelection is the editor-side normal form. It mirrors the
// catalogue hierarchy (country → region → city → district), with
// an `all` flag at every level that means "everything below is
// covered, ignore the children dictionary". Toggling a parent is
// O(1) at the model level — projection to the wire shape happens
// once at save time via `zonesFromSelection`.
//
// The functions here are PURE — no React, no fetch, no DOM. They
// can be unit-tested in isolation and reused by any future surface
// that wants to reason about coverage (e.g. an analytics report
// of "what does my coverage look like across stores").
//
// WIRE COMPATIBILITY
// `selectionFromZones` recovers a tree from a persisted array,
// including the legacy `{ city }` rows that pre-date the wildcard
// extension. Legacy rows are reverse-looked-up via the static
// catalog to find their (country, region) — when the city isn't
// in the catalog the row is preserved verbatim as a so-called
// "orphan" entry so a future save round-trips it unchanged.

import {
  citiesForRegion,
  districtsForCity,
  regionsForCountry,
  SUPPORTED_COUNTRY_CODES,
} from './locations'
import type { DeliveryZone } from './deliveryZones'

// ──────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────

export type CitySelection = {
  // True = whole city (every district included, no district list
  // emitted on save). False = use the districts array below.
  all: boolean
  districts: string[]
}

export type RegionSelection = {
  // True = whole region (every city included). When true the
  // `cities` dict is ignored at projection time.
  all: boolean
  cities: Record<string, CitySelection>
}

export type CountrySelection = {
  // True = whole country (every region included). When true the
  // `regions` dict is ignored at projection time.
  all: boolean
  regions: Record<string, RegionSelection>
}

// Orphan rows — city-bearing zones whose city isn't in the static
// catalog (a merchant typed something we don't recognise). We
// preserve them verbatim so a save → load → save round-trip is
// stable even if the catalog hasn't caught up. The UI shows them
// as a separate "Other locations" section with a remove × button.
export type OrphanZone = {
  // ISO country code if the zone carried one; otherwise undefined.
  country?: string
  region?: string
  city: string
  districts?: string[]
  note?: string
}

export type CoverageSelection = {
  countries: Record<string, CountrySelection>
  orphans: OrphanZone[]
}

export const EMPTY_SELECTION: CoverageSelection = {
  countries: {},
  orphans: [],
}

// ──────────────────────────────────────────────────────────────────
// CATALOG REVERSE-LOOKUP
// ──────────────────────────────────────────────────────────────────
//
// Build (city-name → region-name) and (district-name → city-name)
// indexes for each country once. The static catalog doesn't change
// between renders, so we memoise on first access.

type CityToRegion = Record<string, string>

const cityRegionIndexCache = new Map<string, CityToRegion>()

function cityToRegionIndex(country: string): CityToRegion {
  const cached = cityRegionIndexCache.get(country)
  if (cached) return cached
  const out: CityToRegion = {}
  for (const region of regionsForCountry(country)) {
    for (const city of citiesForRegion(country, region)) {
      // Last writer wins. The static catalogs avoid duplicate
      // city names across regions, so this is effectively a
      // pure inverse map.
      out[city] = region
    }
  }
  cityRegionIndexCache.set(country, out)
  return out
}

// Try to determine which country a city belongs to when the zone
// row didn't carry one. We walk every known country and use the
// first that has the city in its catalog. SA is checked first to
// preserve the pre-extension default behaviour (existing code
// defaulted to 'SA' on hydrate).
export function inferCountryForCity(city: string): string | undefined {
  if (!city) return undefined
  for (const code of ['SA', ...SUPPORTED_COUNTRY_CODES.filter((c) => c !== 'SA')]) {
    const idx = cityToRegionIndex(code)
    if (idx[city]) return code
  }
  return undefined
}

function inferRegionForCity(country: string, city: string): string | undefined {
  return cityToRegionIndex(country)[city]
}

// ──────────────────────────────────────────────────────────────────
// FORWARD PROJECTION  (CoverageSelection → DeliveryZone[])
// ──────────────────────────────────────────────────────────────────
//
// Emit the SMALLEST equivalent zone list. Rules (per the design
// decisions encoded in the PR):
//
//   - country.all=true                  → one row { country }
//   - region.all=true                   → one row { country, region }
//   - city.all=true                     → one row { country, city }
//                                         (region omitted to keep the
//                                         shape "minimal" — country
//                                         is always present on
//                                         city-leaves for
//                                         disambiguation across
//                                         catalogues)
//   - city with explicit districts      → one row { country, city,
//                                                   districts: [...] }
//   - orphans                            → emitted verbatim
//
// Country code on city-leaves is ALWAYS present (the "Always
// include country" decision) so a same-name city across countries
// can never co-match.

export function zonesFromSelection(
  selection: CoverageSelection,
): DeliveryZone[] {
  const out: DeliveryZone[] = []

  for (const [country, csel] of Object.entries(selection.countries)) {
    if (csel.all) {
      out.push({ country })
      continue
    }
    for (const [region, rsel] of Object.entries(csel.regions)) {
      if (rsel.all) {
        out.push({ country, region })
        continue
      }
      for (const [city, citysel] of Object.entries(rsel.cities)) {
        if (citysel.all) {
          out.push({ country, city })
          continue
        }
        // Explicit district list. Skip if empty — an empty
        // city-row would match the whole city, which is NOT
        // what the merchant meant by "0 districts ticked".
        const ds = citysel.districts.filter((d) => d.trim().length > 0)
        if (ds.length === 0) continue
        out.push({ country, city, districts: ds })
      }
    }
  }

  for (const o of selection.orphans) {
    const row: DeliveryZone = { city: o.city }
    if (o.country) row.country = o.country
    if (o.region) row.region = o.region
    if (o.districts && o.districts.length > 0) row.districts = o.districts
    if (o.note) row.note = o.note
    out.push(row)
  }

  return out
}

// CLOSED-BETA STOPGAP PROJECTION (PR 2a).
//
// The backend matcher + write-path sanitizer currently support only
// city-bearing rows ({ city, districts? }); country/region wildcard
// rows are silently DROPPED on save (apps/api stores.service.ts
// sanitizeZones), which would persist narrower coverage than the
// merchant believes they configured. Until the backend wildcard
// support ships (PR 2b), every save path must emit city-level rows
// only.
//
// This wrapper runs the canonical minimal projection and then
// expands any wildcard rows into explicit { country, city } rows
// for every catalog city under that scope. Selections that are
// already city/district-scoped pass through byte-identical to
// zonesFromSelection — existing city/district merchants are
// unaffected.
//
// Wildcard STATE can still arise without the (now hidden) country/
// region checkboxes: the collapse helpers promote a region/country
// to `all` when the merchant individually ticks everything beneath
// it. Expanding here keeps that save lossless — the merchant gets
// exactly the catalog cities they ticked.
//
// DELETE this function in PR 2b and switch callers back to
// zonesFromSelection.
export function zonesFromSelectionCityDistrictOnly(
  selection: CoverageSelection,
): DeliveryZone[] {
  const out: DeliveryZone[] = []
  for (const z of zonesFromSelection(selection)) {
    if (z.city) {
      out.push(z)
      continue
    }
    const country = (z.country ?? '').trim()
    if (!country) continue // degenerate row — nothing to expand
    const regions = z.region ? [z.region] : regionsForCountry(country)
    for (const region of regions) {
      for (const city of citiesForRegion(country, region)) {
        out.push({ country, city })
      }
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// REVERSE PROJECTION  (DeliveryZone[] → CoverageSelection)
// ──────────────────────────────────────────────────────────────────
//
// Hydrate a tree from a persisted array. Legacy rows
// (city-only, no country, no region) are auto-attached to their
// (country, region) via the static-catalog reverse index. When
// the city isn't in the catalog the row falls into the `orphans`
// list so it survives a save round-trip.

export function selectionFromZones(
  zones: DeliveryZone[] | null | undefined,
): CoverageSelection {
  const sel: CoverageSelection = {
    countries: {},
    orphans: [],
  }
  if (!Array.isArray(zones)) return sel

  for (const z of zones) {
    const country = (z.country ?? '').trim()
    const region = (z.region ?? '').trim()
    const city = (z.city ?? '').trim()
    const districts = (z.districts ?? []).filter((d) => d.trim().length > 0)

    // ─ Pure country wildcard
    if (country && !region && !city) {
      ensureCountry(sel, country).all = true
      continue
    }

    // ─ Pure region wildcard
    if (country && region && !city) {
      const csel = ensureCountry(sel, country)
      if (csel.all) continue // already covered
      ensureRegion(csel, region).all = true
      continue
    }

    // ─ City-bearing row. Need both country and region.
    if (!city) {
      // Degenerate row (no scope set at all). Drop silently.
      continue
    }

    const resolvedCountry = country || inferCountryForCity(city)
    if (!resolvedCountry) {
      // Unknown city → preserve verbatim as orphan.
      sel.orphans.push({
        country: country || undefined,
        region: region || undefined,
        city,
        districts: districts.length > 0 ? districts : undefined,
        note: z.note,
      })
      continue
    }

    const resolvedRegion = region || inferRegionForCity(resolvedCountry, city)
    if (!resolvedRegion) {
      // City is known but its region isn't — also orphan.
      sel.orphans.push({
        country: resolvedCountry,
        region: region || undefined,
        city,
        districts: districts.length > 0 ? districts : undefined,
        note: z.note,
      })
      continue
    }

    const csel = ensureCountry(sel, resolvedCountry)
    if (csel.all) continue
    const rsel = ensureRegion(csel, resolvedRegion)
    if (rsel.all) continue
    const citysel = ensureCity(rsel, city)
    if (citysel.all) continue
    if (districts.length === 0) {
      citysel.all = true
    } else {
      for (const d of districts) {
        if (!citysel.districts.includes(d)) citysel.districts.push(d)
      }
    }
  }

  return sel
}

// ──────────────────────────────────────────────────────────────────
// IMMUTABLE TOGGLE HELPERS
// ──────────────────────────────────────────────────────────────────
//
// Every mutator returns a new CoverageSelection so React state
// updates work with referential-equality checks. No structural
// sharing tricks — coverage trees are small (6 countries × ~15
// regions max) and rebuilding on toggle keeps the data flow
// trivially correct.

function cloneSelection(sel: CoverageSelection): CoverageSelection {
  return {
    countries: Object.fromEntries(
      Object.entries(sel.countries).map(([k, v]) => [
        k,
        {
          all: v.all,
          regions: Object.fromEntries(
            Object.entries(v.regions).map(([rk, rv]) => [
              rk,
              {
                all: rv.all,
                cities: Object.fromEntries(
                  Object.entries(rv.cities).map(([ck, cv]) => [
                    ck,
                    { all: cv.all, districts: cv.districts.slice() },
                  ]),
                ),
              },
            ]),
          ),
        },
      ]),
    ),
    orphans: sel.orphans.map((o) => ({ ...o })),
  }
}

function ensureCountry(sel: CoverageSelection, country: string): CountrySelection {
  let csel = sel.countries[country]
  if (!csel) {
    csel = { all: false, regions: {} }
    sel.countries[country] = csel
  }
  return csel
}

function ensureRegion(csel: CountrySelection, region: string): RegionSelection {
  let rsel = csel.regions[region]
  if (!rsel) {
    rsel = { all: false, cities: {} }
    csel.regions[region] = rsel
  }
  return rsel
}

function ensureCity(rsel: RegionSelection, city: string): CitySelection {
  let citysel = rsel.cities[city]
  if (!citysel) {
    citysel = { all: false, districts: [] }
    rsel.cities[city] = citysel
  }
  return citysel
}

// Toggle "all of this country" on/off. Off = drop the country
// entirely (no partial state preserved across an explicit
// uncheck-from-all transition — matches what merchants expect
// when they untick a country).
export function toggleCountry(
  sel: CoverageSelection,
  country: string,
): CoverageSelection {
  const next = cloneSelection(sel)
  const cur = next.countries[country]
  if (cur?.all) {
    // Uncheck whole country.
    delete next.countries[country]
  } else {
    next.countries[country] = { all: true, regions: {} }
  }
  return next
}

// Helpers used by the toggle flows to "explode" a fully-checked
// parent into explicit children so we can carve one out without
// losing the rest. Each helper marks every known catalog entry
// at the next level as `all=true`.

function expandCountryIntoRegions(csel: CountrySelection, country: string): void {
  csel.all = false
  for (const r of regionsForCountry(country)) {
    ensureRegion(csel, r).all = true
  }
}

function expandRegionIntoCities(
  rsel: RegionSelection,
  country: string,
  region: string,
): void {
  rsel.all = false
  for (const c of citiesForRegion(country, region)) {
    ensureCity(rsel, c).all = true
  }
}

export function toggleRegion(
  sel: CoverageSelection,
  country: string,
  region: string,
): CoverageSelection {
  const next = cloneSelection(sel)
  const csel = ensureCountry(next, country)
  // If the country was "all", expand it into explicit regions so
  // we can carve one out.
  if (csel.all) {
    expandCountryIntoRegions(csel, country)
    // Drop the region we're toggling off.
    delete csel.regions[region]
    return next
  }
  const rsel = csel.regions[region]
  if (rsel?.all) {
    delete csel.regions[region]
  } else {
    csel.regions[region] = { all: true, cities: {} }
  }
  // If after the toggle the country has every region covered,
  // collapse to country-level. Display-only — the projection
  // already collapses — but keeping state minimal helps the UI
  // show a clean "country fully covered" checkmark.
  collapseCountryIfFull(next, country)
  return next
}

export function toggleCity(
  sel: CoverageSelection,
  country: string,
  region: string,
  city: string,
): CoverageSelection {
  const next = cloneSelection(sel)
  const csel = ensureCountry(next, country)
  if (csel.all) expandCountryIntoRegions(csel, country)
  const rsel = ensureRegion(csel, region)
  if (rsel.all) expandRegionIntoCities(rsel, country, region)
  const citysel = rsel.cities[city]
  if (citysel?.all) {
    delete rsel.cities[city]
  } else {
    rsel.cities[city] = { all: true, districts: [] }
  }
  collapseRegionIfFull(next, country, region)
  collapseCountryIfFull(next, country)
  return next
}

export function toggleDistrict(
  sel: CoverageSelection,
  country: string,
  region: string,
  city: string,
  district: string,
): CoverageSelection {
  const next = cloneSelection(sel)
  const csel = ensureCountry(next, country)
  if (csel.all) expandCountryIntoRegions(csel, country)
  const rsel = ensureRegion(csel, region)
  if (rsel.all) expandRegionIntoCities(rsel, country, region)
  const citysel = ensureCity(rsel, city)
  if (citysel.all) {
    // Expand city → explicit district list so we can carve one out.
    citysel.all = false
    citysel.districts = districtsForCity(country, city).filter(
      (d) => d !== district,
    )
    return next
  }
  if (citysel.districts.includes(district)) {
    citysel.districts = citysel.districts.filter((d) => d !== district)
    if (citysel.districts.length === 0) {
      delete rsel.cities[city]
    }
  } else {
    citysel.districts = [...citysel.districts, district]
    collapseCityIfFull(next, country, region, city)
    collapseRegionIfFull(next, country, region)
    collapseCountryIfFull(next, country)
  }
  return next
}

// Replace the whole selection with a flat list of country codes
// fully checked. Used by the quick-preset buttons.
export function selectionForCountries(
  countryCodes: ReadonlyArray<string>,
): CoverageSelection {
  const sel: CoverageSelection = { countries: {}, orphans: [] }
  for (const code of countryCodes) {
    sel.countries[code] = { all: true, regions: {} }
  }
  return sel
}

// Remove an orphan zone by index. Stable indexing — the editor
// renders orphans in array order.
export function removeOrphan(
  sel: CoverageSelection,
  index: number,
): CoverageSelection {
  const next = cloneSelection(sel)
  next.orphans.splice(index, 1)
  return next
}

// ──────────────────────────────────────────────────────────────────
// COLLAPSE HELPERS (keep state minimal)
// ──────────────────────────────────────────────────────────────────

function collapseCityIfFull(
  sel: CoverageSelection,
  country: string,
  region: string,
  city: string,
): void {
  const knownDistricts = districtsForCity(country, city)
  if (knownDistricts.length === 0) return
  const csel = sel.countries[country]
  if (!csel || csel.all) return
  const rsel = csel.regions[region]
  if (!rsel || rsel.all) return
  const citysel = rsel.cities[city]
  if (!citysel || citysel.all) return
  if (knownDistricts.every((d) => citysel.districts.includes(d))) {
    citysel.all = true
    citysel.districts = []
  }
}

function collapseRegionIfFull(
  sel: CoverageSelection,
  country: string,
  region: string,
): void {
  const knownCities = citiesForRegion(country, region)
  if (knownCities.length === 0) return
  const csel = sel.countries[country]
  if (!csel || csel.all) return
  const rsel = csel.regions[region]
  if (!rsel || rsel.all) return
  // Region collapses to "all" only when every catalog city is
  // present AND fully checked.
  const allCovered = knownCities.every((city) => {
    const citysel = rsel.cities[city]
    return citysel?.all === true
  })
  if (allCovered) {
    rsel.all = true
    rsel.cities = {}
  }
}

function collapseCountryIfFull(sel: CoverageSelection, country: string): void {
  const knownRegions = regionsForCountry(country)
  if (knownRegions.length === 0) return
  const csel = sel.countries[country]
  if (!csel || csel.all) return
  const allCovered = knownRegions.every((r) => {
    const rsel = csel.regions[r]
    return rsel?.all === true
  })
  if (allCovered) {
    csel.all = true
    csel.regions = {}
  }
}

// ──────────────────────────────────────────────────────────────────
// CHECKBOX-STATE QUERIES
// ──────────────────────────────────────────────────────────────────
//
// The UI calls these to decide whether a checkbox is empty,
// indeterminate (partial), or fully checked. Pure functions over
// the selection + the catalog.

export type CheckState = 'empty' | 'partial' | 'all'

export function countryState(
  sel: CoverageSelection,
  country: string,
): CheckState {
  const csel = sel.countries[country]
  if (!csel) return 'empty'
  if (csel.all) return 'all'
  // Any nested selection at all → partial.
  return Object.keys(csel.regions).length === 0 ? 'empty' : 'partial'
}

export function regionState(
  sel: CoverageSelection,
  country: string,
  region: string,
): CheckState {
  const csel = sel.countries[country]
  if (!csel) return 'empty'
  if (csel.all) return 'all'
  const rsel = csel.regions[region]
  if (!rsel) return 'empty'
  if (rsel.all) return 'all'
  return Object.keys(rsel.cities).length === 0 ? 'empty' : 'partial'
}

export function cityState(
  sel: CoverageSelection,
  country: string,
  region: string,
  city: string,
): CheckState {
  const csel = sel.countries[country]
  if (!csel) return 'empty'
  if (csel.all) return 'all'
  const rsel = csel.regions[region]
  if (!rsel) return 'empty'
  if (rsel.all) return 'all'
  const citysel = rsel.cities[city]
  if (!citysel) return 'empty'
  if (citysel.all) return 'all'
  return citysel.districts.length === 0 ? 'empty' : 'partial'
}

export function districtState(
  sel: CoverageSelection,
  country: string,
  region: string,
  city: string,
  district: string,
): CheckState {
  const csel = sel.countries[country]
  if (!csel) return 'empty'
  if (csel.all) return 'all'
  const rsel = csel.regions[region]
  if (!rsel) return 'empty'
  if (rsel.all) return 'all'
  const citysel = rsel.cities[city]
  if (!citysel) return 'empty'
  if (citysel.all) return 'all'
  return citysel.districts.includes(district) ? 'all' : 'empty'
}

// ──────────────────────────────────────────────────────────────────
// SUMMARY (for the chip strip at the bottom of the editor)
// ──────────────────────────────────────────────────────────────────

export type SummaryChip = {
  // Stable key for React render.
  key: string
  // Display label, Arabic primary.
  label: string
  // Levels for the remove-handler to know what to undo.
  country?: string
  region?: string
  city?: string
  isOrphan?: true
  orphanIndex?: number
}

const COUNTRY_LABEL_AR: Record<string, string> = {
  SA: 'السعودية',
  KW: 'الكويت',
  AE: 'الإمارات',
  QA: 'قطر',
  BH: 'البحرين',
  OM: 'عُمان',
}

function labelForCountry(code: string): string {
  return COUNTRY_LABEL_AR[code] ?? code
}

export function summaryChips(sel: CoverageSelection): SummaryChip[] {
  const chips: SummaryChip[] = []
  for (const [country, csel] of Object.entries(sel.countries)) {
    if (csel.all) {
      chips.push({
        key: `c:${country}`,
        label: `كل ${labelForCountry(country)}`,
        country,
      })
      continue
    }
    for (const [region, rsel] of Object.entries(csel.regions)) {
      if (rsel.all) {
        chips.push({
          key: `r:${country}:${region}`,
          label: `كل ${region}`,
          country,
          region,
        })
        continue
      }
      for (const [city, citysel] of Object.entries(rsel.cities)) {
        if (citysel.all) {
          chips.push({
            key: `cy:${country}:${region}:${city}`,
            label: city,
            country,
            region,
            city,
          })
          continue
        }
        if (citysel.districts.length > 0) {
          chips.push({
            key: `cyd:${country}:${region}:${city}`,
            label: `${city} (${citysel.districts.join('، ')})`,
            country,
            region,
            city,
          })
        }
      }
    }
  }
  sel.orphans.forEach((o, idx) => {
    chips.push({
      key: `o:${idx}:${o.city}`,
      label: o.city,
      isOrphan: true,
      orphanIndex: idx,
    })
  })
  return chips
}

// Pick a "primary city" out of the selection — the city we'll
// file on the legacy `Store.city` scalar column for display
// + the legacy single-city fallback path (zonesFromLegacyCity).
//
// Resolution order:
//   1. The first explicit city in any country (rsel.cities iteration).
//   2. The first known city under the first region of the first
//      country that's marked `all=true` at country or region scope.
//      Falls back to catalog data so an "All Saudi" merchant
//      still gets a sensible store.city (Riyadh, in practice).
//   3. The first orphan's city (verbatim — they're user-typed and
//      we shouldn't lose them).
//   4. null when the selection is empty.
//
// The merchant can edit Store.city later from the dashboard —
// this is just the closed-beta-friendly default that keeps the
// existing backend invariant ("Store.city is non-null") satisfied
// without bothering the operator for a value they've effectively
// already given us by ticking a country.
export function primaryCityFromSelection(
  sel: CoverageSelection,
): string | null {
  for (const csel of Object.values(sel.countries)) {
    if (csel.all) continue
    for (const rsel of Object.values(csel.regions)) {
      if (rsel.all) continue
      const cities = Object.keys(rsel.cities)
      if (cities.length > 0) return cities[0]
    }
  }
  // No explicit city found — walk the catalog for a sensible
  // default under the broadest selection.
  for (const [country, csel] of Object.entries(sel.countries)) {
    if (csel.all) {
      const regions = regionsForCountry(country)
      for (const r of regions) {
        const cities = citiesForRegion(country, r)
        if (cities.length > 0) return cities[0]
      }
      continue
    }
    for (const [region, rsel] of Object.entries(csel.regions)) {
      if (rsel.all) {
        const cities = citiesForRegion(country, region)
        if (cities.length > 0) return cities[0]
      }
    }
  }
  if (sel.orphans.length > 0) return sel.orphans[0].city
  return null
}

// Convenience predicate: does the selection have any coverage at
// all? Used by the editor to enable/disable Save.
export function hasAnyCoverage(sel: CoverageSelection): boolean {
  if (sel.orphans.length > 0) return true
  for (const csel of Object.values(sel.countries)) {
    if (csel.all) return true
    for (const rsel of Object.values(csel.regions)) {
      if (rsel.all) return true
      for (const citysel of Object.values(rsel.cities)) {
        if (citysel.all) return true
        if (citysel.districts.length > 0) return true
      }
    }
  }
  return false
}
