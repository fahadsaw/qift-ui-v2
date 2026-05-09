// Shared types for the per-country location files. Kept in their own
// module so country files can import the contract without pulling in
// every other country's dataset.

export type LocationField = 'region' | 'city' | 'governorate' | 'district'

export type LocationTier = {
  field: LocationField
  labelKey: string
  optional?: boolean
}

export type LocationData = {
  tier1: string[]
  tier2?: Record<string, string[]>
  tier3?: Record<string, string[]>
  tier4?: Record<string, string[]>
}

export type CountryLocationConfig = {
  code: string
  name: { ar: string; en: string }
  flag: string
  tiers: LocationTier[]
  data: LocationData
}
