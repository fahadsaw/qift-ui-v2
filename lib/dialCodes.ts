// Tight allow-list of dial-code countries the registration page
// surfaces. Ordered by GCC priority + a few large MENA / global
// neighbours we expect testers from. Extend per market.
//
// Each entry has a stable `code` (ISO-3166 alpha-2 used elsewhere in
// the app for address schemas) and the dial code in its E.164
// canonical form (no spaces, leading +).

export type DialCountry = {
  code: string
  name: string
  // Native-script name where it differs — surfaced on the picker for
  // Arabic-first users without forcing a full i18n table.
  nameAr?: string
  dial: string
  // Unicode flag emoji. Cheap visual without bundling SVGs.
  flag: string
}

export const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'SA', name: 'Saudi Arabia',         nameAr: 'السعودية',     dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'United Arab Emirates',  nameAr: 'الإمارات',     dial: '+971', flag: '🇦🇪' },
  { code: 'KW', name: 'Kuwait',                nameAr: 'الكويت',       dial: '+965', flag: '🇰🇼' },
  { code: 'QA', name: 'Qatar',                 nameAr: 'قطر',          dial: '+974', flag: '🇶🇦' },
  { code: 'BH', name: 'Bahrain',               nameAr: 'البحرين',      dial: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman',                  nameAr: 'عُمان',         dial: '+968', flag: '🇴🇲' },
  { code: 'EG', name: 'Egypt',                 nameAr: 'مصر',          dial: '+20',  flag: '🇪🇬' },
  { code: 'JO', name: 'Jordan',                nameAr: 'الأردن',       dial: '+962', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon',               nameAr: 'لبنان',        dial: '+961', flag: '🇱🇧' },
  { code: 'IQ', name: 'Iraq',                  nameAr: 'العراق',       dial: '+964', flag: '🇮🇶' },
  { code: 'YE', name: 'Yemen',                 nameAr: 'اليمن',        dial: '+967', flag: '🇾🇪' },
  { code: 'TR', name: 'Türkiye',               nameAr: 'تركيا',        dial: '+90',  flag: '🇹🇷' },
  { code: 'GB', name: 'United Kingdom',        nameAr: 'بريطانيا',     dial: '+44',  flag: '🇬🇧' },
  { code: 'US', name: 'United States',         nameAr: 'الولايات المتحدة', dial: '+1',   flag: '🇺🇸' },
]

// Look up a dial-country row by ISO-2 code. Falls back to SA so the
// picker has a sensible default when called with stale data.
export function dialCountryFor(code: string): DialCountry {
  return (
    DIAL_COUNTRIES.find((c) => c.code === code.toUpperCase()) ??
    DIAL_COUNTRIES[0]
  )
}

// Compose a phone in E.164. We:
//   - strip every non-digit from the local part (users paste with
//     spaces, dashes, parens, leading-zero — we throw all of it away)
//   - drop any leading 0s on the local part (Saudi etc. write
//     numbers as 05x; canonical E.164 is just 5x)
//   - prepend the dial code (already starts with `+`)
// Returns '' when the local part is empty so callers can decline to
// submit.
export function composeE164(dial: string, local: string): string {
  const digits = (local ?? '').replace(/\D+/g, '').replace(/^0+/, '')
  if (!digits) return ''
  return `${dial}${digits}`
}
