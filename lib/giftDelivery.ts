// Recipient-side delivery eligibility checks.
//
// CONTEXT
// The /send flow already validates the receiver's *default* address
// against the store's coverage at order time. The bug fixed by this
// module: at confirm-address time the recipient could pick ANY of
// their saved addresses — including ones in a city the merchant
// doesn't deliver to — and the app accepted the choice. For
// time-sensitive categories (flowers, chocolate, cake,
// perishable) that produces an undeliverable order.
//
// RESPONSIBILITY
// `canDeliverTo(address, store)` is the single source of truth used
// by the gift detail page to:
//   1. Mark unsupported saved addresses as ineligible in the picker.
//   2. Block the "confirm" button when the chosen address is
//      ineligible.
//   3. Surface a clear reason ("This store only delivers to
//      Riyadh") instead of a generic toast.
//
// PRIVACY
// The check runs entirely on the recipient's device. The sender
// never sees the recipient's addresses or this eligibility result.
// The store's city is public information (the sender picked the
// store), so surfacing it on the receiver's screen leaks nothing.
//
// BACKEND CONTRACT (documented, not enforced here)
// The frontend ALSO needs the backend to mirror this rule on the
// confirm-address endpoint as a defence-in-depth — a tampered
// client can always submit any address id. The backend should
// re-check the chosen address against the gift's order
// (storeCity / category / isFastDelivery) and 422 when the address
// city doesn't match. Documented at the bottom of this file.

import { isFastDeliveryCategory, type StoreCategory } from './sampleData'
import {
  matchAddressToZones,
  zonesFromLegacyCity,
  type DeliveryZone,
  type ZoneEligibility,
} from './deliveryZones'

export type { DeliveryZone } from './deliveryZones'

// Subset of the receiver's address shape this module needs. The
// real BackendAddress on /gifts/[id] has more fields; we accept any
// object with these optional location markers.
export type AddressLike = {
  country?: string | null
  region?: string | null
  city?: string | null
  governorate?: string | null
  district?: string | null
}

// What we know about the gift's source store. The preferred shape
// is `deliveryZones` — an explicit list of (city, districts?)
// tuples the merchant has opted into. When that's absent we fall
// back to `storeCity` (legacy single-city gate). Either way the
// matcher decides eligibility against zones; the legacy path just
// builds a one-element zone list.
export type StoreCoverage = {
  // Explicit coverage zones. Authoritative when present.
  // - { city: 'الرياض' }                      — covers all of Riyadh
  // - { city: 'الرياض', districts: [...] }    — only those neighbourhoods
  // - multiple entries                        — multi-city merchant
  // Stores that haven't opted in yet leave this absent and the
  // legacy `storeCity` field below kicks in.
  deliveryZones?: DeliveryZone[] | null
  // Legacy single-city fallback. Empty / null means the gift
  // detail response didn't include coverage info at all — we then
  // SKIP the check and behave as if any saved address works
  // (legacy gifts created before zones shipped).
  storeCity?: string | null
  // Optional country (only matters when the store and recipient
  // are in different countries). When missing we don't enforce
  // country match — same conservative posture as storeCity.
  storeCountry?: string | null
  // Either the explicit boolean (preferred — backend has computed
  // it from the product / store record) OR the category name we
  // derive it from. If neither is supplied we default to "not
  // fast-delivery" and the eligibility check no-ops.
  isFastDelivery?: boolean | null
  category?: StoreCategory | string | null
}

// Eligibility result. Every blocking branch carries `reason` so the
// UI can render a specific message instead of "cannot deliver".
//
// New zone-based fields:
//   - `coveredCities`: the cities the store actually serves.
//     Used in the no-match copy ("This store delivers to X, Y").
//   - `coverageByCity`: per-city district lists (when the
//     merchant restricted districts within a covered city).
//   - `matchedZone`: the zone that matched on success — exposed
//     so the UI can render confirmation context if needed.
export type Eligibility =
  | {
      ok: true
      reason: 'allowed' | 'not_fast' | 'unknown_coverage'
      matchedZone?: DeliveryZone
    }
  | {
      ok: false
      reason: 'unsupported_city'
      storeCity: string
      coveredCities: string[]
      coverageByCity: Record<string, string[]>
    }
  | {
      ok: false
      reason: 'missing_city'
      storeCity: string
    }

// City / district normalization lives in lib/deliveryZones.ts so
// every match runs through the same Arabic-aware rules. This file
// no longer needs its own normalizer.

// Decide whether the gift's product is time-sensitive. Three input
// channels:
//   1. Explicit boolean → trust it (backend has the canonical view).
//   2. Category → use isFastDeliveryCategory.
//   3. Neither → return false (we don't enforce coverage on
//      categories we can't classify).
function inferIsFast(store: StoreCoverage): boolean {
  if (store.isFastDelivery === true) return true
  if (store.isFastDelivery === false) return false
  if (typeof store.category === 'string' && store.category) {
    return isFastDeliveryCategory(store.category as StoreCategory)
  }
  return false
}

// Single eligibility check used by every UI surface that needs to
// decide whether a saved address is valid for a given gift's
// store.
//
// Decision tree:
//   1. If the gift is NOT time-sensitive → always allow (broader
//      delivery logic). Return ok with reason `not_fast`.
//   2. Build the zone list:
//        - prefer `store.deliveryZones` when populated
//        - fall back to a single zone derived from `storeCity`
//        - if neither populated → `unknown_coverage` (allow)
//   3. Country mismatch (when both sides have country) → block.
//   4. Run matchAddressToZones against the zone list:
//        - missing_city → block with reason `missing_city`
//        - no match    → block with reason `unsupported_city`,
//                        carrying the full coverage list so the UI
//                        can render "we deliver to X, Y" copy.
//        - match       → allow.
//
// All matching happens via zone-aware matching (see
// lib/deliveryZones.ts). Even when the merchant only provided
// `storeCity` we wrap that into a single-element zone so the
// matcher path is unified.
export function canDeliverTo(
  address: AddressLike,
  store: StoreCoverage,
): Eligibility {
  const isFast = inferIsFast(store)
  if (!isFast) return { ok: true, reason: 'not_fast' }

  // Build the effective zone list. Explicit zones trump the
  // legacy single-city fallback so a merchant who has opted into
  // district-level coverage isn't widened back to "all districts"
  // by the legacy path.
  const explicitZones = Array.isArray(store.deliveryZones)
    ? store.deliveryZones.filter(
        (z) => z && typeof z.city === 'string' && z.city.trim().length > 0,
      )
    : []
  const zones =
    explicitZones.length > 0
      ? explicitZones
      : zonesFromLegacyCity(store.storeCity)

  // No coverage info at all → unknown. Legacy gifts (created
  // before the backend started forwarding coverage fields) take
  // this branch and the picker stays open.
  if (zones.length === 0) {
    return { ok: true, reason: 'unknown_coverage' }
  }

  // Country mismatch when both sides are populated. Less common
  // (most gifts are intra-country) but the data carries it so we
  // catch it. The "preferred" coverage city for the no-match copy
  // is the first zone — gives the UI something to anchor on.
  if (
    store.storeCountry &&
    address.country &&
    store.storeCountry.trim().toUpperCase() !==
      address.country.trim().toUpperCase()
  ) {
    return {
      ok: false,
      reason: 'unsupported_city',
      storeCity: zones[0]?.city ?? '',
      // Wildcard zones (no city set) are filtered out — the
      // no-match copy only enumerates city-level coverage. The
      // country-mismatch case is communicated by the
      // `unsupported_city` reason itself.
      coveredCities: zones
        .map((z) => z.city)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
      coverageByCity: collectCoverage(zones),
    }
  }

  const result: ZoneEligibility = matchAddressToZones(address, zones)
  if (result.ok) {
    return { ok: true, reason: 'allowed', matchedZone: result.matchedZone }
  }
  if (result.reason === 'missing_city') {
    // Legacy address has no granular city field. Surface a
    // "complete your address" CTA rather than a wrong-city
    // message.
    return {
      ok: false,
      reason: 'missing_city',
      storeCity: zones[0]?.city ?? '',
    }
  }
  return {
    ok: false,
    reason: 'unsupported_city',
    storeCity: zones[0]?.city ?? '',
    coveredCities: result.coveredCities,
    coverageByCity: result.coverageByCity,
  }
}

// Compose a per-city district map from a zone list. Used when
// building no-match results from country-mismatch / direct paths
// where matchAddressToZones didn't run. Wildcard rows (no city)
// are skipped — they don't contribute to per-city coverage detail.
function collectCoverage(
  zones: DeliveryZone[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const z of zones) {
    const city = (z.city ?? '').trim()
    if (!city) continue
    const ds = (z.districts ?? [])
      .map((d) => d.trim())
      .filter(Boolean)
    if (ds.length > 0) out[city] = [...(out[city] ?? []), ...ds]
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// BACKEND CONTRACT (documentation)
// ──────────────────────────────────────────────────────────────────
// This module is a frontend gate. The same rule MUST run on the
// backend's /gifts/:id/confirm-address endpoint as defense-in-
// depth. A tampered client can always POST any addressId; without
// a server-side check, the rule is unenforced.
//
// Required backend changes (when ready):
//   1. Add `deliveryZones` JSONB column on the Store model:
//        deliveryZones: { city: string; districts?: string[]; note?: string }[]
//      This is the canonical coverage definition. The legacy
//      `city` column on Store stays as a fallback display field
//      but the matcher reads zones first.
//   2. Snapshot `deliveryZones`, `storeCity`, `storeCountry`,
//      `isFastDelivery`, `category` on the Order at create time
//      and forward to Gift. Snapshotting (not joining live)
//      means a mid-flight zone change at the merchant doesn't
//      invalidate an existing gift.
//   3. Surface those fields on /gifts/:id and /gifts/me responses.
//   4. On POST /gifts/:id/confirm-address, server-side
//      canDeliverTo with the snapshotted coverage and reject with
//      422 + code `address_unsupported_for_store` (carrying the
//      coverage list) when the recipient picks a non-covered
//      address. Frontend already handles this code.
//
// Until the backend ships these fields the frontend gracefully
// falls back to "unknown coverage" mode for gifts without any
// coverage data, and to single-city-zone matching for gifts that
// only have the legacy `storeCity` field. No regressions for
// pre-existing gifts.
