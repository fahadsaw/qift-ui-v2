// Unified country-aware location catalog (entry point).
//
// PURPOSE
// Multiple surfaces in the app need to speak about places using the
// same vocabulary and the same dataset:
//   - Registration / address book (lib/addresses.ts schemas)
//   - Stores discovery filter (app/stores/page.tsx)
//   - Merchant store creation (app/store-dashboard/new)
//   - Recipient delivery context (checkout)
//
// This file is the public API. The actual datasets live in
// lib/locations/<country>.ts so each country can grow without
// bloating a single file. Adding a new country is two steps:
//   1. Drop a new file under lib/locations/ that exports a
//      CountryLocationConfig.
//   2. Register it in COUNTRY_LOCATIONS below.
//
// CONVENTIONS
// - `field` names match the canonical Address columns on the backend
//   (region, city, governorate, district). A form posting these
//   values needs no per-country mapping layer.
// - Tier order is broad → specific. Each country picks the tiers
//   that make sense for its administrative geography.
// - Names are stored in Arabic primary (the dominant locale). The
//   address record persists the Arabic value to the backend so a
//   record stays stable across language switches.
//
// FRONTEND-FIRST
// The catalog ships as static modules so registration / stores work
// today without a backend round-trip. The `BACKEND_LOCATION_FIELDS`
// constant at the bottom documents the exact columns a future
// /locations API would need to serve. When that lands, swap the
// static lookups below for fetched data — every consumer reads
// through the helpers (`getLocationConfig`, `getTierOptions`) so
// the transition is one file.

import { SA } from './locations/sa'
import { KW } from './locations/kw'
import { AE } from './locations/ae'
import { QA } from './locations/qa'
import { BH } from './locations/bh'
import { OM } from './locations/om'
import { OTHER } from './locations/other'
import type {
  CountryLocationConfig,
  LocationData,
  LocationField,
  LocationTier,
} from './locations/types'

export type { CountryLocationConfig, LocationData, LocationField, LocationTier }

export const COUNTRY_LOCATIONS: Record<string, CountryLocationConfig> = {
  SA,
  KW,
  AE,
  QA,
  BH,
  OM,
  OTHER,
}

// Display list for country pickers. Mirrors the iteration order used
// by AddressForm; "OTHER" is appended last as a catch-all.
export const COUNTRIES_LIST: {
  code: string
  name: { ar: string; en: string }
  flag: string
}[] = Object.values(COUNTRY_LOCATIONS).map((c) => ({
  code: c.code,
  name: c.name,
  flag: c.flag,
}))

// Convenience: just the supported country codes (for picker chips).
export const SUPPORTED_COUNTRY_CODES = Object.keys(COUNTRY_LOCATIONS).filter(
  (c) => c !== 'OTHER',
)

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

export function getLocationConfig(code: string): CountryLocationConfig | undefined {
  return COUNTRY_LOCATIONS[code]
}

// Resolve options for a given tier index (1-based) given the chosen
// values at higher tiers. Returns an empty array when:
//   - the country isn't in the catalog
//   - the tier doesn't exist for this country
//   - the parent tier value isn't selected yet
//   - no catalog entries exist for the parent value (caller can then
//     fall back to a free-text input)
export function getTierOptions(
  countryCode: string,
  tierIndex: 1 | 2 | 3 | 4,
  parentValues: { tier1?: string; tier2?: string; tier3?: string },
): string[] {
  const config = getLocationConfig(countryCode)
  if (!config) return []
  if (tierIndex > config.tiers.length) return []
  const data = config.data
  if (tierIndex === 1) return data.tier1 ?? []
  if (tierIndex === 2) {
    const parent = parentValues.tier1
    if (!parent) return []
    return data.tier2?.[parent] ?? []
  }
  if (tierIndex === 3) {
    const parent = parentValues.tier2
    if (!parent) return []
    return data.tier3?.[parent] ?? []
  }
  // tier4
  // For tier4 prefer tier3 as parent when set; fall back to tier2 if
  // the country skips tier3 (e.g. Saudi cities with no governorate
  // sub-zone — districts are keyed by city directly).
  const parent = parentValues.tier3 || parentValues.tier2
  if (!parent) return []
  return data.tier4?.[parent] ?? []
}

// Map a tier index back to the backend Address column name. Used when
// posting structured location values from a multi-tier picker.
export function fieldForTier(
  countryCode: string,
  tierIndex: 1 | 2 | 3 | 4,
): LocationField | null {
  const config = getLocationConfig(countryCode)
  if (!config) return null
  return config.tiers[tierIndex - 1]?.field ?? null
}

// Compose an `address.details` map keyed by the backend column names
// from a list of tier values, in tier order. Stops at the first
// undefined value so partial selections are persisted faithfully.
export function buildLocationDetails(
  countryCode: string,
  values: { tier1?: string; tier2?: string; tier3?: string; tier4?: string },
): Record<string, string> {
  const config = getLocationConfig(countryCode)
  if (!config) return {}
  const out: Record<string, string> = {}
  const all = [values.tier1, values.tier2, values.tier3, values.tier4]
  for (let i = 0; i < config.tiers.length; i++) {
    const v = all[i]
    if (!v) break
    const tier = config.tiers[i]
    out[tier.field] = v
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// BACKEND CONTRACT (documentation)
// ──────────────────────────────────────────────────────────────────
// The backend Address model already has dedicated columns for every
// field this catalog speaks about — values posted from the form land
// in the right place without a translation layer:
//
//   region        TEXT   – top admin division (region/emirate/etc.)
//   city          TEXT   – city or area
//   governorate   TEXT   – sub-municipality (used by SA/KW/BH/OM)
//   district      TEXT   – neighbourhood / block / wilayat
//   country       TEXT   – ISO code, e.g. 'SA'
//
// FUTURE: lift this catalog onto the backend as a /locations API
// keyed by country. Endpoint shape we'd want:
//
//   GET /locations?country=SA
//     → { tiers: [...], data: { tier1: [...], tier2: {...}, ... } }
//
// then this module becomes a thin client over a fetched dataset.
// Until then, every consumer reads through `getLocationConfig` so
// the migration is one file.

export const BACKEND_LOCATION_FIELDS: ReadonlyArray<LocationField> = [
  'region',
  'city',
  'governorate',
  'district',
] as const
