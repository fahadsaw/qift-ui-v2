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
//     spaces, dashes, parens — we throw all of it away)
//   - if the local part already begins with the picker's dial code
//     (with or without a leading `+` / `00` international prefix),
//     strip it before re-prepending so a paste of `+966501234567`
//     or `00966501234567` while the picker is on `+966` doesn't
//     produce the duplicate `+966966501234567`. Same defence for
//     a rogue 0 left between the dial code and the local part
//     (`+9660501234567`).
//   - drop any leading 0s on the resulting local part (Saudi etc.
//     write numbers as 05x; canonical E.164 is just 5x)
//   - prepend the dial code (already starts with `+`)
// Returns '' when the local part is empty so callers can decline to
// submit.
export function composeE164(dial: string, local: string): string {
  // Dial code as bare digits — the picker stores it as `+966`, but
  // for prefix matching against pasted input we want the `966`.
  const dialDigits = dial.replace(/\D+/g, '')
  let digits = (local ?? '').replace(/\D+/g, '')
  // International `00` prefix is the same as `+`. Strip BEFORE
  // matching the dial code so `00966501234567` is recognised as
  // already-country-coded.
  if (digits.startsWith('00')) digits = digits.slice(2)
  // If the local part already starts with the picker's dial code,
  // peel it off so we don't double-prepend below. Then strip a
  // single rogue 0 that some users leave between the country code
  // and the local part (`+9660501234567` style mis-pastes).
  if (dialDigits && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length)
  }
  digits = digits.replace(/^0+/, '')
  if (!digits) return ''
  return `${dial}${digits}`
}

// Country-aware shape check on the local-format digits (after the
// composeE164 normalization has stripped leading 0s + non-digits).
//
// We deliberately keep this loose — false positives ("looks valid"
// but isn't deliverable) are caught downstream by Taqnyat / the OTP
// flow, but false negatives ("invalid" on a legit number) block
// real users at the registration door. So we only validate the
// shapes we're confident about:
//   - SA: must start with 5 and have 9 digits total (5XXXXXXXX)
//   - GCC neighbours: 8-9 digits, no specific prefix
//   - everything else: any 5+ digits accepted
//
// Returns null on success, or a short i18n KEY the caller can show.
export function validatePhoneShape(
  countryCode: string,
  local: string,
): string | null {
  const digits = (local ?? '').replace(/\D+/g, '').replace(/^0+/, '')
  if (!digits) return 'register.error_phone_required'
  switch (countryCode.toUpperCase()) {
    case 'SA':
      // Saudi mobiles in MSISDN form are 5XXXXXXXX (9 digits, leading 5).
      // Landlines are 1XXXXXXX / 2XXXXXXX / etc. but for OTP we only
      // support mobile-routable numbers, so 5-prefix is the right gate.
      if (!/^5\d{8}$/.test(digits)) return 'register.error_phone_saudi'
      return null
    case 'AE':
    case 'KW':
    case 'QA':
    case 'BH':
    case 'OM':
      if (digits.length < 7 || digits.length > 9)
        return 'register.error_phone_length'
      return null
    default:
      if (digits.length < 5) return 'register.error_phone_length'
      return null
  }
}
