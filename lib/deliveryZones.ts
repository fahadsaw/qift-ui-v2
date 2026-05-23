// Delivery coverage zones.
//
// WHY THIS EXISTS
// City-name normalization alone isn't enough to decide whether a
// store can deliver to a given address. Two real-world failure
// modes prove it:
//   1. Wadi Al-Dawasir is administratively in منطقة الرياض but
//      geographically ~600km from Riyadh city. A Riyadh same-day
//      flower shop shouldn't be expected to fulfil there even
//      though the region label matches.
//   2. Inside a single city like Riyadh, a Malqa flower shop might
//      only same-day deliver to a handful of northern districts —
//      a Suwaidi address (across town) is a same-day no-go even
//      though the city string matches.
//
// SHAPE
// A coverage zone is a (city, districts?) tuple:
//   - `city` is required; must match the recipient's address.city
//     after normalization.
//   - `districts` is optional. When present, the address.district
//     must be in the list. When absent, the zone covers ALL
//     districts in that city.
//
// A store has a list of zones. Eligibility = the recipient's
// (city, district) falls in ANY zone.
//
// MIGRATION POSTURE
// Stores without explicit zones fall back to a single-zone derived
// from `storeCity` (the legacy field). This keeps existing gifts
// working while the merchant catalog opts into explicit coverage.
// Backend roadmap at the bottom of the file.
//
// PRIVACY
// Zones are public information (a buyer can see a store's coverage
// before deciding to buy). No recipient data is read here; the
// matcher is invoked with a recipient address only on the
// recipient's own device.

// Normalize Arabic / Latin city or district strings for matching.
// Same rules as lib/giftDelivery.ts (intentionally duplicated so
// that file stays the single import point for old call-sites that
// only need the legacy single-city check).
//
// Cases handled:
//   - leading/trailing whitespace, mixed case
//   - Arabic Tashkeel + tatweel
//   - Hamza variants of Alef (آأإٱ → ا)
//   - Alef Maksura → Yeh (ى → ي)
//   - Teh Marbuta → Heh (ة → ه)
//   - directional marks (RLM/LRM and friends)
//   - the optional definite article "ال" prefix
//   - common Latin transliteration prefixes (al-, el-, ar-)
function normalizeArabic(input: string | null | undefined): string {
  if (!input) return ''
  let s = input.trim().toLowerCase()
  s = s.replace(/[ً-ْٰـ]/g, '')
  s = s.replace(/[آأإٱ]/g, 'ا')
  s = s.replace(/ى/g, 'ي')
  s = s.replace(/ة/g, 'ه')
  s = s.replace(/[؛؟،‎‏‪-‮]/g, '')
  s = s.replace(/^ال/, '')
  s = s.replace(/^(al-|el-|ar-|el\s|al\s)/, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function sameName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeArabic(a)
  const nb = normalizeArabic(b)
  if (!na || !nb) return false
  return na === nb
}

// One coverage zone.
//
// The shape supports four progressively-narrower scopes by leaving
// each field optional. Inheritance reads broadest → narrowest:
// any unset level is a wildcard that matches anything.
//
//   { country: 'SA' }                                — all of Saudi Arabia
//   { country: 'SA', region: 'منطقة الرياض' }         — all of Riyadh region
//   { country: 'SA', city: 'الرياض' }                — all districts of Riyadh
//   { country: 'SA', city: 'الرياض', districts: [...] } — only those neighbourhoods
//   { city: 'الرياض' }                                — LEGACY rows from before
//                                                     the country/region keys
//                                                     existed. Matched as
//                                                     "country wildcard +
//                                                     this city" so existing
//                                                     persisted data keeps
//                                                     working unchanged.
//
// A store can mix scopes freely — one `{ country: 'SA' }` row alongside
// district-level rows for Kuwait, for example. Match is "ANY zone matches".
export type DeliveryZone = {
  // ISO country code (e.g. 'SA', 'AE'). When set alone, this row
  // matches every address in that country. When set alongside
  // city/region, it narrows the match so a same-name city across
  // two countries doesn't accidentally co-match.
  country?: string
  // Region name in Arabic, matching the catalog in
  // lib/locations/<country>.ts. When set alone, this row matches
  // every city + district inside that region.
  region?: string
  // City name. When set alone (no districts), matches every
  // district in that city. The historical wire format had this
  // as required — left optional now so wildcard rows can omit it.
  city?: string
  // Optional whitelist. Empty / undefined = "every district in
  // this city". When the merchant cares about district granularity
  // they enumerate; when they cover the whole city they leave it
  // off. Same-day Malqa flowers vs. citywide Riyadh chocolates is
  // the classic split.
  districts?: string[]
  // Optional human note shown to recipients on the gift detail
  // page. Lets a merchant clarify nuance ("delivers within 5km of
  // store") that doesn't fit the structured fields.
  note?: string
}

// Predicate: does a zone narrow at ANY level?
// A zone with every field unset is a degenerate "matches anything"
// row that the editor never emits, but the matcher treats it
// safely (returns no-match because we require at least one field
// to be set — keeps "empty array" semantically distinct from
// "wildcard everything"). See matchAddressToZones below.
function zoneHasAnyScope(z: DeliveryZone): boolean {
  return Boolean(z.country || z.region || z.city || (z.districts && z.districts.length > 0))
}

// What we know about the recipient's address. Same shape as the
// AddressLike in giftDelivery.ts — a subset of BackendAddress.
export type AddressLike = {
  country?: string | null
  region?: string | null
  city?: string | null
  governorate?: string | null
  district?: string | null
}

// Per-zone eligibility decision. The matcher returns the reason
// for the LAST evaluated zone when nothing matches; the UI uses it
// to render a precise explanation ("this store delivers to Riyadh
// city but only in these districts: ...").
export type ZoneEligibility =
  | { ok: true; matchedZone: DeliveryZone }
  | {
      ok: false
      reason: 'no_zone_match'
      // The cities the store actually serves. Renders as a
      // comma-separated list under "Supported delivery area".
      coveredCities: string[]
      // Per-city district breakdown for richer "we deliver to X
      // (only in A, B, C)" copy. Empty array for cities that
      // cover all districts.
      coverageByCity: Record<string, string[]>
    }
  | { ok: false; reason: 'missing_city' }

// Country comparison is case-insensitive on the trimmed value.
// We don't normalise like sameName() because country codes are
// ISO and short — 'SA' / 'sa' / ' SA ' should all match, but
// nothing fancier needed.
function sameCountry(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  return a.trim().toUpperCase() === b.trim().toUpperCase()
}

// Run an address against a list of zones. Returns the first match
// and stops; otherwise compiles a no-match summary so the UI can
// render the full coverage list.
//
// Wildcard inheritance (broadest → narrowest):
//   - zone.country unset → matches any country
//   - zone.region  unset → matches any region (within country gate)
//   - zone.city    unset → matches any city (within region/country gate)
//   - zone.districts empty/undefined → matches any district
// A zone with NO scope set at all is rejected up-front (the editor
// never emits one — see zoneHasAnyScope).
//
// We still require the address to carry a city for the
// "missing_city" UX path (asking the user to complete their
// address) — but only when none of the zones is a pure country
// wildcard. A pure-country zone can match a partial address.
export function matchAddressToZones(
  address: AddressLike,
  zones: DeliveryZone[],
): ZoneEligibility {
  if (!Array.isArray(zones) || zones.length === 0) {
    return {
      ok: false,
      reason: 'no_zone_match',
      coveredCities: [],
      coverageByCity: {},
    }
  }

  // Filter out any pathological "empty scope" rows — the editor
  // never emits one, but a malformed JSONB row could exist.
  const live = zones.filter(zoneHasAnyScope)
  if (live.length === 0) {
    return {
      ok: false,
      reason: 'no_zone_match',
      coveredCities: [],
      coverageByCity: {},
    }
  }

  const addrCountry = (address.country ?? '').trim()
  const addrRegion = (address.region ?? '').trim()
  const addrCity = (address.city ?? '').trim()
  const addrDistrict = (address.district ?? '').trim()

  // Pure country-or-broader zones (no city, no district restriction)
  // can match before we even know the address's city. Process them
  // first so a "we deliver everywhere in Saudi" merchant doesn't
  // get a "missing_city" rejection for an address with only the
  // country populated.
  for (const zone of live) {
    if (zone.city || (zone.districts && zone.districts.length > 0)) continue
    // Country gate.
    if (zone.country && addrCountry && !sameCountry(zone.country, addrCountry)) {
      continue
    }
    // Region gate.
    if (zone.region && addrRegion && !sameName(zone.region, addrRegion)) {
      continue
    }
    // Country wildcard with no country set on the address —
    // conservative: skip. Otherwise we'd green-light an address
    // missing its country field.
    if (zone.country && !addrCountry) continue
    if (zone.region && !addrRegion) continue
    return { ok: true, matchedZone: zone }
  }

  // City-bearing zones still need a city to compare against.
  if (!addrCity) {
    // Address is too sparse to evaluate against city-level zones.
    // The UI offers a "fill in your city" CTA rather than a hard
    // "wrong city" message.
    return { ok: false, reason: 'missing_city' }
  }

  for (const zone of live) {
    // Skip the pure country/region wildcards we already evaluated above.
    if (!zone.city && (!zone.districts || zone.districts.length === 0)) continue

    // Country gate (when the zone specifies one).
    if (zone.country && addrCountry && !sameCountry(zone.country, addrCountry)) {
      continue
    }
    // Region gate (when the zone specifies one).
    if (zone.region && addrRegion && !sameName(zone.region, addrRegion)) {
      continue
    }
    // City gate (when the zone specifies one).
    if (zone.city && !sameName(addrCity, zone.city)) continue

    // District gate.
    const ds = (zone.districts ?? []).filter(
      (d) => typeof d === 'string' && d.trim().length > 0,
    )
    if (ds.length === 0) {
      // Whole-city coverage — district doesn't matter.
      return { ok: true, matchedZone: zone }
    }
    // District-restricted coverage.
    if (!addrDistrict) {
      // City matches but the address doesn't carry a district —
      // we can't safely confirm without one. Treat as miss; the
      // UI renders the same coverage list and prompts the user
      // to update their address.
      continue
    }
    const districtMatch = ds.some((d) => sameName(addrDistrict, d))
    if (districtMatch) return { ok: true, matchedZone: zone }
  }

  // No match — compile the coverage summary.
  const coveredCities: string[] = []
  const coverageByCity: Record<string, string[]> = {}
  for (const zone of live) {
    const city = (zone.city ?? '').trim()
    if (!city) continue
    if (!coveredCities.includes(city)) coveredCities.push(city)
    const ds = (zone.districts ?? []).filter(
      (d) => typeof d === 'string' && d.trim().length > 0,
    )
    if (ds.length > 0) {
      coverageByCity[city] = [...(coverageByCity[city] ?? []), ...ds]
    }
  }
  return {
    ok: false,
    reason: 'no_zone_match',
    coveredCities,
    coverageByCity,
  }
}

// Build a zone list from the legacy single-city field. Used as a
// fallback so a store that hasn't opted into explicit zones still
// gets a sensible default — "all districts in storeCity". Returns
// an empty array when storeCity is missing; callers treat that as
// "unknown coverage" rather than enforcing an empty zone list
// (which would block everything).
export function zonesFromLegacyCity(
  storeCity: string | null | undefined,
): DeliveryZone[] {
  const c = (storeCity ?? '').trim()
  if (!c) return []
  return [{ city: c }]
}

// Country-code → human label (Arabic primary). Used only for
// formatCoverageList — keeps the BCP-47 boundary clean. New
// countries added to lib/locations/ should be added here too.
// Falls back to the raw code so a missing label can't crash the
// matcher's display layer.
const COUNTRY_LABEL_AR: Record<string, string> = {
  SA: 'المملكة العربية السعودية',
  KW: 'الكويت',
  AE: 'الإمارات',
  QA: 'قطر',
  BH: 'البحرين',
  OM: 'عُمان',
}

function countryLabel(code: string | undefined): string {
  if (!code) return ''
  const trimmed = code.trim().toUpperCase()
  return COUNTRY_LABEL_AR[trimmed] ?? trimmed
}

// Format zones for display under "Supported delivery area:".
// Falls back to the simple comma-separated city list when the
// caller doesn't want district detail.
//
// Returns:
//   "كل المملكة العربية السعودية"     (country-wildcard zone)
//   "كل منطقة الرياض"                  (region-wildcard zone)
//   "الرياض"                          (single zone, all districts)
//   "الرياض (العليا، الملقا)"          (single zone, listed districts)
//   "الرياض، جدة"                     (multiple zones, all districts each)
//   "الرياض (العليا، الملقا)، جدة"    (mixed)
export function formatCoverageList(zones: DeliveryZone[]): string {
  if (!Array.isArray(zones) || zones.length === 0) return ''
  return zones
    .map((z) => {
      const city = (z.city ?? '').trim()
      const region = (z.region ?? '').trim()
      const country = (z.country ?? '').trim()
      const ds = (z.districts ?? [])
        .map((d) => d.trim())
        .filter(Boolean)

      // Wildcard rows (no city) — format with the "all of X"
      // prefix using the narrowest set scope.
      if (!city) {
        if (region) return `كل ${region}`
        if (country) return `كل ${countryLabel(country)}`
        return '' // degenerate: empty zone (filtered by zoneHasAnyScope upstream)
      }

      // City-bearing rows — same as the historical formatter.
      if (ds.length === 0) return city
      return `${city} (${ds.join('، ')})`
    })
    .filter(Boolean)
    .join('، ')
}

// ──────────────────────────────────────────────────────────────────
// BACKEND CONTRACT (documentation)
// ──────────────────────────────────────────────────────────────────
// The `deliveryZones` JSONB column already exists. This module
// extends the row shape with two NEW optional fields — `country`
// and `region` — to support broader-scope wildcards. The schema
// is additive: an existing `{ city, districts? }` row continues to
// work, and Prisma's JSONB column accepts the new optional keys
// silently. NO schema migration is required for the frontend
// rollout.
//
// CURRENT WIRE SHAPE (extended):
//
//   {
//     country?: string        // ISO code, e.g. 'SA' — wildcard when only
//                             // this field is set; disambiguator when
//                             // city is also set.
//     region?:  string        // Region/emirate name — wildcard when set
//                             // alone with country.
//     city?:    string        // City name — when set alone (no
//                             // districts), means "whole city".
//     districts?: string[]    // Optional whitelist within city.
//     note?:    string
//   }
//
// MATCH RULE (broadest → narrowest):
//   - Any unset field is a wildcard.
//   - country mismatch (both sides populated) → reject.
//   - region mismatch (both sides populated) → reject.
//   - city mismatch (zone has city) → reject.
//   - districts non-empty → address.district must be in the list.
//
// BACKEND TODO — Phase 2 (defense-in-depth, not blocking
// closed beta):
//
//   1. Extend the validator on POST/PATCH /stores to accept the
//      new optional `country` + `region` fields on each
//      deliveryZones row. (Today these would be stored verbatim
//      by Prisma's JSONB column but rejected by a strict zod
//      schema — relax the schema.)
//   2. Snapshot the (possibly wildcard) zones onto Order/Gift at
//      create time. Same as today — the shape change is
//      transparent to snapshot logic since JSONB just stores
//      what it's given.
//   3. Mirror this file's matchAddressToZones() in the server-
//      side address-confirm endpoint so a tampered client can't
//      pick an unsupported address. The match rule is small
//      (~50 lines); port directly.
//   4. Until step 3 ships, the frontend gates the picker —
//      backend defense-in-depth becomes soft for wildcard zones.
//      Acceptable for closed beta.
//
// LEGACY ROW BEHAVIOUR:
//   Rows persisted before this extension (no `country`, no
//   `region`) match as "country wildcard + this city" — i.e.
//   identical to their historical behaviour. No data migration
//   is needed and no recipient eligibility check changes for
//   existing gifts.
