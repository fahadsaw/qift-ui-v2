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
  // Local-format placeholder shown inside the phone input — what the
  // user is expected to type AFTER the dial-code picker. Critically
  // does NOT include a leading 0: the picker already carries the
  // country code, and our composeE164 / sanitizer always strips
  // leading 0s before submit, so showing `05xxxxxxxx` for Saudi was
  // misleading users into typing a digit we'd then throw away.
  // Width matches the local mobile MSISDN length per country
  // (SA/AE: 9 digits; KW/QA/BH/OM: 8 digits) so the visible field
  // also signals "number too short" without rendering an inline
  // error.
  mobileExample: string
}

export const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'SA', name: 'Saudi Arabia',         nameAr: 'السعودية',         dial: '+966', flag: '🇸🇦', mobileExample: '5XXXXXXXX' },
  { code: 'AE', name: 'United Arab Emirates', nameAr: 'الإمارات',         dial: '+971', flag: '🇦🇪', mobileExample: '5XXXXXXXX' },
  { code: 'KW', name: 'Kuwait',               nameAr: 'الكويت',           dial: '+965', flag: '🇰🇼', mobileExample: '5XXXXXXX'  },
  { code: 'QA', name: 'Qatar',                nameAr: 'قطر',              dial: '+974', flag: '🇶🇦', mobileExample: '3XXXXXXX'  },
  { code: 'BH', name: 'Bahrain',              nameAr: 'البحرين',          dial: '+973', flag: '🇧🇭', mobileExample: '3XXXXXXX'  },
  { code: 'OM', name: 'Oman',                 nameAr: 'عُمان',             dial: '+968', flag: '🇴🇲', mobileExample: '9XXXXXXX'  },
  { code: 'EG', name: 'Egypt',                nameAr: 'مصر',              dial: '+20',  flag: '🇪🇬', mobileExample: '1XXXXXXXXX'},
  { code: 'JO', name: 'Jordan',               nameAr: 'الأردن',           dial: '+962', flag: '🇯🇴', mobileExample: '7XXXXXXXX' },
  { code: 'LB', name: 'Lebanon',              nameAr: 'لبنان',            dial: '+961', flag: '🇱🇧', mobileExample: '3XXXXXX'   },
  { code: 'IQ', name: 'Iraq',                 nameAr: 'العراق',           dial: '+964', flag: '🇮🇶', mobileExample: '7XXXXXXXXX'},
  { code: 'YE', name: 'Yemen',                nameAr: 'اليمن',            dial: '+967', flag: '🇾🇪', mobileExample: '7XXXXXXXX' },
  { code: 'TR', name: 'Türkiye',              nameAr: 'تركيا',            dial: '+90',  flag: '🇹🇷', mobileExample: '5XXXXXXXXX'},
  { code: 'GB', name: 'United Kingdom',       nameAr: 'بريطانيا',         dial: '+44',  flag: '🇬🇧', mobileExample: '7XXXXXXXXX'},
  { code: 'US', name: 'United States',        nameAr: 'الولايات المتحدة', dial: '+1',   flag: '🇺🇸', mobileExample: 'XXXXXXXXXX'},
]

// Look up a dial-country row by ISO-2 code. Falls back to SA so the
// picker has a sensible default when called with stale data.
export function dialCountryFor(code: string): DialCountry {
  return (
    DIAL_COUNTRIES.find((c) => c.code === code.toUpperCase()) ??
    DIAL_COUNTRIES[0]
  )
}

// Sanitize a local-format phone string into the canonical digit-only
// shape that should appear in the input field, given the active dial
// code. The function is the single source of truth for "what does the
// user see in the input box" — it runs on every keystroke / paste in
// every phone input that pairs with the dial-code picker.
//
// Idempotent (sanitize(sanitize(x)) === sanitize(x)) so React's
// controlled-input pattern can call it on every render without
// thrashing the cursor.
//
// Behaviour, in order:
//
//   1. Strip everything that isn't a digit or a `+` (parens, spaces,
//      dashes, NBSPs, RTL marks, anything else).
//   2. Collapse multiple `+` to one at position 0 — legitimate E.164
//      has exactly one `+` and only at the start.
//   3. Convert a leading `00` to `+` (international-prefix
//      equivalence). After this step we know whether the original
//      input carried a country-code prefix.
//   4. Drop the leading `+` (the dial picker holds the country code,
//      not the input field).
//   5. If the input had a country prefix (`+` / `00`) AND the digits
//      now start with the picker's dial digits, drop the dial digits.
//      Same goes for bare-digits input that's longer than just the
//      dial code (e.g. `9665…` while picker = +966) — that's the
//      "user pasted an unprefixed E.164" case.
//   6. Drop any leading 0s — Saudi 05x style writes the local part
//      as `05XXXXXXXX`; canonical MSISDN is just `5XXXXXXXX`.
//
// Returns the cleaned local digits — possibly empty (`''`) when the
// input had nothing useful in it. Callers that want the full E.164
// should call composeE164() below, which is just dial + sanitize.
export function sanitizeLocalDigits(dial: string, raw: string): string {
  // 1: keep digits + `+` only.
  let s = (raw ?? '').replace(/[^\d+]/g, '')
  // 2: collapse multiple `+` to a single leading one.
  if (s.includes('+')) s = '+' + s.replace(/\+/g, '')
  // 3: `00` international prefix → `+`.
  const hadCountryPrefix = s.startsWith('+') || s.startsWith('00')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  // 4: drop the `+` — picker holds the country code.
  if (s.startsWith('+')) s = s.slice(1)
  // 5: dial-prefix strip. Two paths so mid-typing a Saudi number
  // doesn't clear the field the moment digits == "966":
  //   a) explicit prefix (`+` / `00`) → always strip the dial
  //      digits, even when the trailing local part is empty (the
  //      user clearly pasted a country code).
  //   b) bare digits → only strip when there's MORE than just the
  //      dial code, so character-by-character typing stays stable.
  const dialDigits = dial.replace(/\D+/g, '')
  if (
    dialDigits &&
    s.startsWith(dialDigits) &&
    (hadCountryPrefix || s.length > dialDigits.length)
  ) {
    s = s.slice(dialDigits.length)
  }
  // 6: leading-0 strip.
  s = s.replace(/^0+/, '')
  return s
}

// Compose a phone in E.164 from the picker's dial code + the input
// field's local digits. Always passes through sanitizeLocalDigits so
// the round-trip is guaranteed identical whether the input was
// already cleaned (typical) or carries a stale value (e.g. an
// uncontrolled paste path, an autofilled value, a test fixture).
//
// Returns '' when the sanitized local part is empty, so callers can
// decline to submit / disable the next-step button.
export function composeE164(dial: string, local: string): string {
  const digits = sanitizeLocalDigits(dial, local)
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
