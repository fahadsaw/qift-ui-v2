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

// One coverage zone. The `districts` array is the granular control
// — when populated, the store ONLY delivers to those neighbourhoods
// within `city`. Stores can declare multiple zones to cover several
// cities, each with its own district list.
export type DeliveryZone = {
  city: string
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

// Run an address against a list of zones. Returns the first match
// and stops; otherwise compiles a no-match summary so the UI can
// render the full coverage list.
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

  const addrCity = (address.city ?? '').trim()
  if (!addrCity) {
    // Address is too sparse to evaluate. The UI offers a "fill in
    // your city" CTA rather than a hard "wrong city" message.
    return { ok: false, reason: 'missing_city' }
  }

  const addrDistrict = (address.district ?? '').trim()

  for (const zone of zones) {
    if (!sameName(addrCity, zone.city)) continue
    // City matches. Now check districts.
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
  for (const zone of zones) {
    const city = zone.city.trim()
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

// Format zones for display under "Supported delivery area:".
// Falls back to the simple comma-separated city list when the
// caller doesn't want district detail.
//
// Returns:
//   "الرياض"                          (single zone, all districts)
//   "الرياض (العليا، الملقا)"          (single zone, listed districts)
//   "الرياض، جدة"                     (multiple zones, all districts each)
//   "الرياض (العليا، الملقا)، جدة"    (mixed)
export function formatCoverageList(zones: DeliveryZone[]): string {
  if (!Array.isArray(zones) || zones.length === 0) return ''
  return zones
    .map((z) => {
      const city = z.city.trim()
      const ds = (z.districts ?? [])
        .map((d) => d.trim())
        .filter(Boolean)
      if (ds.length === 0) return city
      return `${city} (${ds.join('، ')})`
    })
    .join('، ')
}

// ──────────────────────────────────────────────────────────────────
// BACKEND CONTRACT (documentation)
// ──────────────────────────────────────────────────────────────────
// To make zone-based coverage authoritative the backend needs to:
//
//   1. Add a `deliveryZones` JSONB column on the Store model:
//        deliveryZones: { city: string; districts?: string[]; note?: string }[]
//   2. Surface a merchant config screen at /store-dashboard/coverage
//      so the merchant picks (city, districts[]) tuples per store.
//      The cities/districts dropdowns can read from the existing
//      lib/locations catalog so vocabulary stays consistent.
//   3. Snapshot the zones onto the Order/Gift at create time so a
//      mid-flight zone change at the merchant doesn't invalidate
//      an existing gift. The Gift response then ships back the
//      same `deliveryZones` array.
//   4. On POST /gifts/:id/confirm-address, server-side
//      matchAddressToZones with the snapshotted zones and reject
//      with 422 + code `address_unsupported_for_store` (carrying
//      the zone list) when the recipient picks a non-covered
//      address. Frontend already handles that error code.
//
// Until the backend ships these fields the frontend gracefully
// falls back to the single-city legacy path: a Gift with only
// `storeCity` populated still gets a working coverage check via
// `zonesFromLegacyCity`.
