// Mock data for the merchant financial dashboard.
//
// Surfaces the 15 dashboard fields specified in Financial Review
// Pack v1.1 § 9.6: gross sales, Qift fees, VAT/tax lines, shipping
// fees, reserve withheld, reserve current balance, reserve release
// schedule, available balance, pending balance, next payout
// estimate, payout history, active holds, hold reasons, payout
// delay reasons, and the (disabled) review/escalation request
// path.
//
// SCOPE
// -----
// Read-only constant. No real money. No backend call. The shape
// of the data matches what a future /merchant/finance endpoint
// would return, so the dashboard page can render against the
// shape (not against this specific module) and the eventual
// swap is mechanical.
//
// NUMBERS ARE PLAUSIBLE FICTION
// -----------------------------
// The values are scaled for a hypothetical "established" merchant
// with a few weeks of activity, so the dashboard renders something
// representative. Currency is SAR throughout (launch posture per
// FRP v1.1 § 7.2).
//
// SAFETY
// ------
// Module is import-safe in any build — the constant is just data,
// no side effects, no environment reads, no network calls. The
// feature-flag gate that controls whether the dashboard is
// reachable lives in lib/merchantFinanceAccess.ts, not here.

export type Currency = 'SAR'

export type MerchantFinanceSummary = {
  currency: Currency
  // Lifetime aggregates for the current calendar period. The UI
  // shows a "this period" header so the operator understands the
  // window; range selection is out of scope for v1.0.
  periodLabelKey: 'merchant_finance.period_this_month'
  // === 15 dashboard fields per FRP v1.1 § 9.6 ===

  // 1. Gross sales — sum of merchant order subtotals in the period.
  grossSales: number
  // 2. Qift fees — sum of per-MerchantOrder Qift fees deducted.
  qiftFees: number
  // 3. VAT / tax lines — sum of VAT amounts on this merchant's
  //    sales in the period. Broken down per jurisdiction (SAR/15%
  //    at launch).
  vat: number
  // 4. Shipping fees — sum of shipping fees collected from senders
  //    + passed through to merchant (zero margin at launch).
  shippingFees: number
  // 5. Reserve withheld — sum of reserve deposits accumulated in
  //    the period (per the merchant's current ReserveBand).
  reserveWithheld: number
  // 6. Reserve current balance — point-in-time reserve balance
  //    held by Qift on the merchant's behalf.
  reserveCurrentBalance: number
  // 8. Available balance — liquid funds owed to the merchant ready
  //    for the next payout cycle. (Numbered to match FRP § 9.6.1.)
  availableBalance: number
  // 9. Pending balance — allocations accumulating but not yet
  //    eligible (in dispute window, under hold, etc.).
  pendingBalance: number
  // 10. Next payout estimate — date + amount for the next scheduled
  //     payout, given current eligibility.
  nextPayout: {
    estimatedDate: string // ISO 8601 yyyy-mm-dd
    estimatedAmount: number
  }
}

// 7. Reserve release schedule — upcoming reserve releases over the
//    next ~30/60/90 days. Sorted ascending by date.
export type ReserveRelease = {
  id: string
  date: string // ISO 8601
  amount: number
}

// 11. Payout history — past payouts with date, amount, bank account
//     (last4-only for privacy in the dashboard), status, and a
//     short reference id.
export type PayoutHistoryEntry = {
  id: string
  date: string
  amount: number
  bankAccountLast4: string
  // 'settled' is the steady-state success. 'bounced' / 'superseded'
  // are documented in FRP § 9.4 (failure handling). The UI renders
  // a status badge with colour per state.
  status: 'settled' | 'sent' | 'bounced' | 'superseded'
  // Short reference the merchant can quote when escalating.
  reference: string
}

// 12 + 13. Active holds + hold reasons. Each hold blocks a slice
// of the merchant's balance from releasing. Reason is a categorical
// code mapped to merchant-friendly copy via the i18n layer.
export type HoldReason =
  | 'refund_pending'
  | 'dispute_pending'
  | 'chargeback_pending'
  | 'risk_hold'
  | 'kyc_incomplete'
  | 'iban_missing'

export type ActiveHold = {
  id: string
  amount: number
  // Translation key the UI resolves to a merchant-friendly label.
  reason: HoldReason
  // Earliest date Qift estimates the hold will resolve (informational).
  expectedResolutionDate: string | null
  placedAt: string
}

// 14. Payout delay reasons. Surfaced when next-payout-estimate is
// later than the merchant might expect — explains why. Empty list
// means no delays.
export type PayoutDelayReason =
  | 'cadence_window' // simply not yet at next cycle (Mon/Thu)
  | 'minimum_amount_not_met' // balance below merchant's minimum
  | 'iban_verification_pending'
  | 'kyc_re_verification_pending'

export type PayoutDelay = {
  reason: PayoutDelayReason
  detail: string | null // optional short note in plain language
}

// Bundled response — what a future GET /merchant/finance would
// return. The dashboard page consumes a single object and renders
// each field independently. New fields appended at the end stay
// backward compatible.
export type MerchantFinanceData = {
  summary: MerchantFinanceSummary
  reserveReleases: ReserveRelease[]
  payoutHistory: PayoutHistoryEntry[]
  activeHolds: ActiveHold[]
  payoutDelays: PayoutDelay[]
  // Merchant's current reserve band + an educational copy key. Per
  // FRP § 9.6.2 the dashboard never exposes the numerical health
  // score — only the band name + an explanation.
  reserveBand: {
    code: 'new_probation' | 'established_standard' | 'trusted_standard'
    // Translation key for the friendly label + explainer copy.
    labelKey: string
    explainerKey: string
  }
}

// ---------------------------------------------------------------
// THE STATIC MOCK
// ---------------------------------------------------------------
// Numbers chosen to make the dashboard render representative
// values, not to anchor any real merchant's expectations. All in
// SAR. Dates are relative-ish to a fixed reference so the dashboard
// always has "near-future" releases regardless of when it loads.

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const MERCHANT_FINANCE_MOCK: MerchantFinanceData = {
  summary: {
    currency: 'SAR',
    periodLabelKey: 'merchant_finance.period_this_month',
    grossSales: 18_450.0,
    qiftFees: 412.5,
    vat: 2_767.5,
    shippingFees: 985.0,
    reserveWithheld: 1_845.0,
    reserveCurrentBalance: 4_215.75,
    availableBalance: 2_835.25,
    pendingBalance: 1_120.0,
    nextPayout: {
      estimatedDate: isoDaysFromNow(2), // next Mon or Thu
      estimatedAmount: 2_835.25,
    },
  },
  reserveReleases: [
    { id: 'rr-1', date: isoDaysFromNow(4), amount: 215.5 },
    { id: 'rr-2', date: isoDaysFromNow(11), amount: 380.0 },
    { id: 'rr-3', date: isoDaysFromNow(18), amount: 412.25 },
    { id: 'rr-4', date: isoDaysFromNow(25), amount: 295.0 },
    { id: 'rr-5', date: isoDaysFromNow(32), amount: 540.0 },
  ],
  payoutHistory: [
    {
      id: 'p-001',
      date: isoDaysFromNow(-3),
      amount: 2_410.0,
      bankAccountLast4: '8842',
      status: 'settled',
      reference: 'QPT-2026-0421',
    },
    {
      id: 'p-002',
      date: isoDaysFromNow(-7),
      amount: 1_890.5,
      bankAccountLast4: '8842',
      status: 'settled',
      reference: 'QPT-2026-0418',
    },
    {
      id: 'p-003',
      date: isoDaysFromNow(-10),
      amount: 2_120.0,
      bankAccountLast4: '8842',
      status: 'settled',
      reference: 'QPT-2026-0414',
    },
    {
      id: 'p-004',
      date: isoDaysFromNow(-14),
      amount: 1_650.0,
      bankAccountLast4: '8842',
      status: 'settled',
      reference: 'QPT-2026-0411',
    },
  ],
  activeHolds: [
    {
      id: 'h-101',
      amount: 320.0,
      reason: 'dispute_pending',
      expectedResolutionDate: isoDaysFromNow(5),
      placedAt: isoDaysFromNow(-2),
    },
    {
      id: 'h-102',
      amount: 95.5,
      reason: 'refund_pending',
      expectedResolutionDate: isoDaysFromNow(1),
      placedAt: isoDaysFromNow(-1),
    },
  ],
  payoutDelays: [], // happy path — no delays today
  reserveBand: {
    code: 'established_standard',
    labelKey: 'merchant_finance.band_established',
    explainerKey: 'merchant_finance.band_established_explainer',
  },
}

// Helper: i18n key for a hold reason. Lets the dashboard render
// merchant-friendly copy without baking the mapping into JSX.
export function holdReasonLabelKey(reason: HoldReason): string {
  switch (reason) {
    case 'refund_pending':
      return 'merchant_finance.hold_refund_pending'
    case 'dispute_pending':
      return 'merchant_finance.hold_dispute_pending'
    case 'chargeback_pending':
      return 'merchant_finance.hold_chargeback_pending'
    case 'risk_hold':
      return 'merchant_finance.hold_risk'
    case 'kyc_incomplete':
      return 'merchant_finance.hold_kyc_incomplete'
    case 'iban_missing':
      return 'merchant_finance.hold_iban_missing'
  }
}

// Helper: i18n key for a payout delay reason.
export function payoutDelayLabelKey(reason: PayoutDelayReason): string {
  switch (reason) {
    case 'cadence_window':
      return 'merchant_finance.delay_cadence_window'
    case 'minimum_amount_not_met':
      return 'merchant_finance.delay_minimum_amount'
    case 'iban_verification_pending':
      return 'merchant_finance.delay_iban_verification'
    case 'kyc_re_verification_pending':
      return 'merchant_finance.delay_kyc_re_verification'
  }
}

// Helper: i18n key for a payout-history status badge.
export function payoutStatusLabelKey(
  status: PayoutHistoryEntry['status'],
): string {
  switch (status) {
    case 'settled':
      return 'merchant_finance.payout_status_settled'
    case 'sent':
      return 'merchant_finance.payout_status_sent'
    case 'bounced':
      return 'merchant_finance.payout_status_bounced'
    case 'superseded':
      return 'merchant_finance.payout_status_superseded'
  }
}

// Colour tokens per payout status. Settled is green (success);
// sent is neutral-warm (in flight); bounced is red (action needed);
// superseded is muted (informational).
export function payoutStatusColor(
  status: PayoutHistoryEntry['status'],
): { bg: string; fg: string } {
  switch (status) {
    case 'settled':
      return {
        bg: 'var(--success-soft, #e6f5ea)',
        fg: 'var(--success, #2c7a3a)',
      }
    case 'sent':
      return {
        bg: 'var(--primary-soft, #e8efff)',
        fg: 'var(--primary-dark)',
      }
    case 'bounced':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
    case 'superseded':
      return { bg: 'var(--card-soft)', fg: 'var(--text-soft)' }
  }
}
