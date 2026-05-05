// Mirror of qift-platform/apps/api/src/payments/providers.ts so the
// checkout picker shows the same providers the backend would accept.
// Kept as a static map (not fetched) so the UI can render instantly.

export type PaymentProvider =
  | 'mada'
  | 'knet'
  | 'qpay'
  | 'benefit'
  | 'oman_net'
  | 'apple_pay'
  | 'visa'
  | 'mastercard'

const COUNTRY_PROVIDERS: Record<string, PaymentProvider[]> = {
  SA: ['mada', 'apple_pay', 'visa', 'mastercard'],
  KW: ['knet', 'apple_pay', 'visa', 'mastercard'],
  AE: ['apple_pay', 'visa', 'mastercard'],
  QA: ['qpay', 'apple_pay', 'visa', 'mastercard'],
  BH: ['benefit', 'apple_pay', 'visa', 'mastercard'],
  OM: ['oman_net', 'apple_pay', 'visa', 'mastercard'],
}

const FALLBACK: PaymentProvider[] = ['visa', 'mastercard']

export function getPaymentProvidersByCountry(
  country: string | null | undefined,
): PaymentProvider[] {
  if (!country) return FALLBACK
  return COUNTRY_PROVIDERS[country.trim().toUpperCase()] ?? FALLBACK
}

export const COUNTRY_CURRENCY: Record<string, string> = {
  SA: 'SAR',
  KW: 'KWD',
  AE: 'AED',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
}

export function currencyFor(country: string): string {
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? 'SAR'
}

export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
  { code: 'SA', name: 'السعودية' },
  { code: 'KW', name: 'الكويت' },
  { code: 'AE', name: 'الإمارات' },
  { code: 'QA', name: 'قطر' },
  { code: 'BH', name: 'البحرين' },
  { code: 'OM', name: 'عُمان' },
]
