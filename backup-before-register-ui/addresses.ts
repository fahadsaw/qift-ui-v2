// Country-specific address field schemas (UI-only).
//
// IMPORTANT: `key` is the canonical name of a column on the backend `Address`
// model (apps/api/prisma/schema.prisma). Using the same names everywhere
// means the form state can be POSTed straight to the API without a
// per-country mapping layer.
//
// Universal optional add-ons (deliveryPhone, additionalNumber, shortAddress,
// label) are appended at the end of every schema so they're available
// regardless of country.
//
// `labelKey` references a string in lib/translations.ts.

export type FieldDef = {
  key: string
  labelKey: string
  optional?: boolean
  dirOverride?: 'ltr' | 'rtl'
  placeholder?: string
}

export type CountrySchema = {
  code: string
  name: { ar: string; en: string }
  flag: string
  fields: FieldDef[]
}

// Universal extras tacked onto every country schema. They're optional in the
// UI but, when filled, are persisted to dedicated columns.
const UNIVERSAL_EXTRAS: FieldDef[] = [
  {
    key: 'shortAddress',
    labelKey: 'addr.short_address',
    optional: true,
    dirOverride: 'ltr',
  },
  {
    key: 'additionalNumber',
    labelKey: 'addr.additional_number',
    optional: true,
    dirOverride: 'ltr',
  },
  {
    key: 'deliveryPhone',
    labelKey: 'addr.delivery_phone',
    optional: true,
    dirOverride: 'ltr',
  },
  {
    key: 'label',
    labelKey: 'addr.label',
    optional: true,
  },
]

// Helper so the per-country `fields` arrays stay readable.
const withExtras = (core: FieldDef[]): FieldDef[] => [...core, ...UNIVERSAL_EXTRAS]

export const COUNTRIES: CountrySchema[] = [
  {
    code: 'SA',
    name: { ar: 'السعودية', en: 'Saudi Arabia' },
    flag: '🇸🇦',
    fields: withExtras([
      { key: 'region', labelKey: 'addr.region', optional: true },
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.district' },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.building', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
      { key: 'postalCode', labelKey: 'addr.postal', dirOverride: 'ltr' },
    ]),
  },
  {
    code: 'KW',
    name: { ar: 'الكويت', en: 'Kuwait' },
    flag: '🇰🇼',
    fields: withExtras([
      { key: 'governorate', labelKey: 'addr.governorate' },
      { key: 'city', labelKey: 'addr.area' },
      { key: 'district', labelKey: 'addr.block' },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.house', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
    ]),
  },
  {
    code: 'AE',
    name: { ar: 'الإمارات', en: 'United Arab Emirates' },
    flag: '🇦🇪',
    fields: withExtras([
      { key: 'region', labelKey: 'addr.emirate' },
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.area', optional: true },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.building', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
    ]),
  },
  {
    code: 'QA',
    name: { ar: 'قطر', en: 'Qatar' },
    flag: '🇶🇦',
    fields: withExtras([
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.area' },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.building', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
    ]),
  },
  {
    code: 'BH',
    name: { ar: 'البحرين', en: 'Bahrain' },
    flag: '🇧🇭',
    fields: withExtras([
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.block', dirOverride: 'ltr' },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.building', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
    ]),
  },
  {
    code: 'OM',
    name: { ar: 'عُمان', en: 'Oman' },
    flag: '🇴🇲',
    fields: withExtras([
      { key: 'governorate', labelKey: 'addr.governorate' },
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.wilayat', optional: true },
      { key: 'street', labelKey: 'addr.street' },
      { key: 'buildingNumber', labelKey: 'addr.house', dirOverride: 'ltr' },
      { key: 'unitNumber', labelKey: 'addr.unit', optional: true, dirOverride: 'ltr' },
    ]),
  },
  // Catch-all for countries we haven't tailored yet. Keep the fields generic
  // enough that we can still ship to any address Aramex/DHL would understand.
  {
    code: 'OTHER',
    name: { ar: 'دولة أخرى', en: 'Other country' },
    flag: '🌍',
    fields: withExtras([
      { key: 'region', labelKey: 'addr.region', optional: true },
      { key: 'city', labelKey: 'addr.city' },
      { key: 'district', labelKey: 'addr.district' },
      { key: 'street', labelKey: 'addr.street', optional: true },
      { key: 'buildingNumber', labelKey: 'addr.building', optional: true, dirOverride: 'ltr' },
      { key: 'postalCode', labelKey: 'addr.postal', optional: true, dirOverride: 'ltr' },
    ]),
  },
]

export function schemaFor(code: string): CountrySchema | undefined {
  return COUNTRIES.find((c) => c.code === code)
}

// Build the canonical create-address payload for the backend out of the
// AddressForm `details` map. Fields not in the schema are dropped, which
// keeps stale UI keys from leaking into the database.
export function buildAddressPayload(
  country: string,
  details: Record<string, string>,
  opts: { isDefault?: boolean } = {},
) {
  const schema = schemaFor(country)
  const out: Record<string, string | boolean | null | undefined> = {
    country,
    isDefault: opts.isDefault === true,
  }
  if (!schema) {
    out.city = details.city ?? '—'
    out.district = details.district ?? '—'
    out.details = JSON.stringify(details)
    return out
  }
  for (const field of schema.fields) {
    const v = (details[field.key] ?? '').trim()
    if (v) out[field.key] = v
  }
  // `details` is a single-string fallback the backend uses for display when
  // the more granular columns are missing — we always populate it so we
  // never end up with a totally blank address.
  out.details = schema.fields
    .map((f) => details[f.key])
    .filter(Boolean)
    .join(', ')
  return out
}
