// Coverage zone draft + helpers shared between the merchant
// onboarding flow (/store-dashboard/new) and the live coverage
// editor (/store-dashboard/coverage). Both writers PATCH /stores/:id
// with the same `{ city, districts? }[]` payload — keeping the draft
// shape and validation in one place stops them drifting.

// Zone shape persisted on the backend.
export type DeliveryZone = {
  city: string
  districts?: string[]
  note?: string
}

// Editor-side draft. Carries `region` (tier 1) so the cascading
// dropdowns work, plus a stable `key` for React rendering. We
// strip both before posting.
export type ZoneDraft = {
  key: string
  country: string
  region: string
  city: string
  districts: string[]
}

// Fresh draft. The `key` is just a UI render key — never sent.
export function newZoneDraft(country: string): ZoneDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    country,
    region: '',
    city: '',
    districts: [],
  }
}

// Drop drafts that lack a city, then strip the editor-only fields
// to produce the canonical { city, districts? } payload for
// PATCH /stores/:id.
export function buildZonePayload(zones: ZoneDraft[]): DeliveryZone[] {
  return zones
    .filter((z) => z.city.trim().length > 0)
    .map((z) => ({
      city: z.city,
      ...(z.districts.length > 0 ? { districts: z.districts } : {}),
    }))
}

// Hydrate from the server's persisted shape into editor drafts.
// Country defaults to 'SA' since the persisted shape doesn't carry
// it (the backend matcher only cares about city + district).
// Region is left blank — the merchant re-picks it if they want to
// edit, otherwise the cascade is in display-only mode.
export function hydrateZoneDrafts(
  zones: DeliveryZone[] | null | undefined,
  defaultCountry = 'SA',
): ZoneDraft[] {
  if (!zones || zones.length === 0) return []
  return zones.map((z) => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    country: defaultCountry,
    region: '',
    city: z.city,
    districts: z.districts ?? [],
  }))
}
