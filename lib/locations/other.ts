// Catch-all "other country" config used when the user picks a country
// that isn't yet in the structured catalog. Surfaces a generic
// 3-tier free-text path (region → city → district) so registration
// and address entry never get stuck.

import type { CountryLocationConfig } from './types'

export const OTHER: CountryLocationConfig = {
  code: 'OTHER',
  name: { ar: 'دولة أخرى', en: 'Other country' },
  flag: '🌍',
  tiers: [
    { field: 'region', labelKey: 'addr.region', optional: true },
    { field: 'city', labelKey: 'addr.city' },
    { field: 'district', labelKey: 'addr.district', optional: true },
  ],
  data: {
    tier1: [],
  },
}
