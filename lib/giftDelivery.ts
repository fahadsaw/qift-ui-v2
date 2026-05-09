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

// What we know about the gift's source store. Three positive flags;
// any one of them is enough to determine fast-delivery status.
// `storeCity` is the only city the merchant fulfils from for
// fast-delivery items.
export type StoreCoverage = {
  // The store's city. Empty / null means the gift detail response
  // didn't include coverage info — we then SKIP the check and
  // behave as if any saved address works (legacy gifts created
  // before the field shipped).
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
export type Eligibility =
  | { ok: true; reason: 'allowed' | 'not_fast' | 'unknown_coverage' }
  | { ok: false; reason: 'unsupported_city'; storeCity: string }
  | { ok: false; reason: 'missing_city'; storeCity: string }

// Normalize an Arabic / Latin city string for matching. The catalog
// in lib/locations stores names like "الرياض" / "وادي الدواسر";
// user-entered legacy addresses might be "الرياض " (trailing
// whitespace), "الرياض" with diacritics, "Riyadh", or "ar-Riyadh".
// We collapse the most common variants so a Riyadh address still
// matches a Riyadh store regardless of how it was typed.
function normalizeCity(input: string | null | undefined): string {
  if (!input) return ''
  let s = input.trim().toLowerCase()
  // Strip Arabic diacritics (Tashkeel) and tatweel.
  s = s.replace(/[ً-ْٰـ]/g, '')
  // Normalize Hamza variants of Alef → bare Alef.
  s = s.replace(/[آأإٱ]/g, 'ا')
  // Normalize Yeh: Alef Maksura → Yeh.
  s = s.replace(/ى/g, 'ي')
  // Normalize Teh Marbuta → Heh.
  s = s.replace(/ة/g, 'ه')
  // Drop Arabic comma / RLM / LRM marks that sometimes sneak in.
  s = s.replace(/[؛؟،‎‏‪-‮]/g, '')
  // Drop the leading definite article "ال" — many users include
  // it on saved addresses but storefront catalogs sometimes omit
  // it. We compare on the bare noun so "الرياض" matches "الرياض"
  // either way.
  s = s.replace(/^ال/, '')
  // Latin transliteration normalizer: collapse "al-" / "el-" /
  // "al " prefixes and treat "riyadh" / "ar-riyadh" / "al-riyadh"
  // as equivalent. Lowercase already done above.
  s = s.replace(/^(al-|el-|ar-|el\s|al\s)/, '')
  // Collapse any remaining whitespace runs.
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCity(a)
  const nb = normalizeCity(b)
  if (!na || !nb) return false
  return na === nb
}

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
// decide whether a saved address is valid for a given gift's store.
//
// Decision tree:
//   1. If the gift is NOT time-sensitive → always allow (broader
//      delivery logic). Return ok with reason `not_fast` so the UI
//      can choose to still show a soft hint if it wants to.
//   2. If we don't know the store's city → allow (legacy gift /
//      missing field). Return ok with reason `unknown_coverage`
//      so the UI can render a "we can't verify coverage" hint
//      rather than a hard block.
//   3. If the address has no city granular field at all → block
//      with reason `missing_city`. Asking the receiver to fill it
//      in is better than auto-confirming a half-known address for
//      a fast-delivery order.
//   4. If the address city matches the store city → allow.
//   5. Otherwise → block with reason `unsupported_city`.
//
// The match in (4) tolerates the Arabic / Latin variants the
// normalizer in `normalizeCity` covers; case differences,
// definite-article variations, diacritics, and the common Latin
// transliteration prefixes all resolve to the same key.
export function canDeliverTo(
  address: AddressLike,
  store: StoreCoverage,
): Eligibility {
  const isFast = inferIsFast(store)
  if (!isFast) return { ok: true, reason: 'not_fast' }

  const storeCity = (store.storeCity ?? '').trim()
  if (!storeCity) return { ok: true, reason: 'unknown_coverage' }

  // Country mismatch is a hard block when both sides are populated.
  // Less common (most gifts are intra-country) but still worth
  // catching when the data is there. We don't surface country
  // separately in the reason — the UX treats it as an unsupported
  // location and points the user at the store's coverage city.
  if (
    store.storeCountry &&
    address.country &&
    store.storeCountry.trim().toUpperCase() !==
      address.country.trim().toUpperCase()
  ) {
    return { ok: false, reason: 'unsupported_city', storeCity }
  }

  const addrCity = (address.city ?? '').trim()
  if (!addrCity) {
    // Legacy address with no granular city field. We prefer
    // missing_city over unsupported_city so the UI can offer a
    // "fill in the city on this address" CTA rather than telling
    // the user the address is wrong.
    return { ok: false, reason: 'missing_city', storeCity }
  }

  if (sameCity(addrCity, storeCity)) {
    return { ok: true, reason: 'allowed' }
  }
  return { ok: false, reason: 'unsupported_city', storeCity }
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
//   1. Persist `storeCity`, `storeCountry`, `isFastDelivery`,
//      `category` on the Order at create time (already partly
//      in OrdersService.create — extend to forward to Gift).
//   2. Surface those fields on /gifts/:id and /gifts/me responses
//      so the frontend can render the picker correctly.
//   3. On POST /gifts/:id/confirm-address, look up the chosen
//      address, run the same canDeliverTo check, and return
//      422 with code `address_unsupported_for_store` (carrying
//      the store's city) when the address fails. The frontend
//      already knows how to map error codes → localised toasts
//      (see app/gifts/[id]/page.tsx `onConfirmAddress`).
//
// Until the backend ships these fields the frontend will fall
// back to "unknown coverage" mode and let the user confirm any
// address — same behaviour as before this fix, just with a UX
// hint that we can't verify coverage. No regressions for legacy
// gifts.
