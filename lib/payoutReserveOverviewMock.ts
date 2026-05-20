// Mock data for the admin payout + reserve operator overview.
//
// Surfaces the cross-merchant control-room view documented in
// Financial Review Pack v1.1 §§ 3.8-3.38 (payout state machine),
// §§ 4.7-4.46 (reserve onboarding workflow), and § 19 (RBAC +
// approval boundaries). This is the OPERATOR view of the same
// substrate the merchant dashboard (item 1) shows from a single
// merchant's perspective — same data shape, different lens.
//
// NUMBERS ARE PLAUSIBLE FICTION
// -----------------------------
// Sized for a hypothetical mid-stage marketplace with ~210 active
// merchants (45 New / 120 Established / 38 Trusted / 4 Restricted
// / 2 Frozen / 1 Enterprise). All SAR. Every value here is mock —
// nothing is read from any backend, nothing affects production
// state. The shape mirrors what a future GET
// /admin/payout-reserve-overview endpoint would return so the
// section component is portable.
//
// SAFETY
// ------
// Module is import-safe in any build — pure data, no env reads,
// no network. The feature flag controlling the route lives in the
// section component (PayoutReserveOverviewSection.tsx).

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type Money = number // SAR — display only, not parsed

// ---------------------------------------------------------------
// PAYOUT — upcoming batch summary
// ---------------------------------------------------------------

export type ApprovalState =
  | 'proposed'
  | 'under_review'
  | 'pending_approval'
  | 'partial_approved_1'
  | 'approved'
  | 'disbursing'
  | 'disbursed'
  | 'rejected'
  | 'failed'

export type UpcomingPayoutBatch = {
  id: string
  scheduledFor: string // ISO date
  cadenceTag: string // e.g., 'twice_weekly_thu_2026-05-21'
  merchantCount: number
  payoutCount: number
  proposedTotal: Money
  state: ApprovalState
  // Approval chain — populated as signers complete their steps.
  submittedBy: string | null
  approver1: string | null
  approver2: string | null
}

const UPCOMING_BATCH: UpcomingPayoutBatch = {
  id: 'pb-2026-05-21',
  scheduledFor: isoDaysFromNow(2),
  cadenceTag: 'twice_weekly_thu',
  merchantCount: 142,
  payoutCount: 178,
  proposedTotal: 487_320.5,
  state: 'pending_approval',
  submittedBy: 'qift_finance_admin (user-2284)',
  approver1: null,
  approver2: null,
}

// ---------------------------------------------------------------
// PAYOUT — batches by status
// ---------------------------------------------------------------

export type BatchStatusCount = {
  state: ApprovalState
  batchCount: number
  totalAmount: Money
}

const BATCHES_BY_STATUS: BatchStatusCount[] = [
  { state: 'proposed', batchCount: 1, totalAmount: 487_320.5 },
  { state: 'under_review', batchCount: 1, totalAmount: 487_320.5 },
  { state: 'pending_approval', batchCount: 1, totalAmount: 487_320.5 },
  { state: 'approved', batchCount: 0, totalAmount: 0 },
  { state: 'disbursing', batchCount: 0, totalAmount: 0 },
  { state: 'disbursed', batchCount: 4, totalAmount: 1_842_700.0 },
  { state: 'rejected', batchCount: 0, totalAmount: 0 },
  { state: 'failed', batchCount: 0, totalAmount: 0 },
]

// ---------------------------------------------------------------
// PAYOUT — merchants pending payout (top N for the next batch)
// ---------------------------------------------------------------

export type MerchantPendingPayout = {
  merchantId: string
  merchantDisplay: string
  band: 'new_probation' | 'established_standard' | 'trusted_standard'
  netPayable: Money
  // Number of allocations rolling up into this payout.
  allocationCount: number
}

const MERCHANTS_PENDING_PAYOUT: MerchantPendingPayout[] = [
  {
    merchantId: 'STORE-1108',
    merchantDisplay: 'Zahrat Al Madinah',
    band: 'established_standard',
    netPayable: 12_840.0,
    allocationCount: 38,
  },
  {
    merchantId: 'STORE-3219',
    merchantDisplay: 'Lulu Confections',
    band: 'trusted_standard',
    netPayable: 9_215.5,
    allocationCount: 22,
  },
  {
    merchantId: 'STORE-2244',
    merchantDisplay: 'Atelier Riyadh',
    band: 'established_standard',
    netPayable: 6_120.75,
    allocationCount: 15,
  },
  {
    merchantId: 'STORE-5678',
    merchantDisplay: 'Oud Souq',
    band: 'established_standard',
    netPayable: 4_890.0,
    allocationCount: 11,
  },
  {
    merchantId: 'STORE-7733',
    merchantDisplay: 'Nakheel Florist',
    band: 'new_probation',
    netPayable: 1_245.0,
    allocationCount: 6,
  },
]

// ---------------------------------------------------------------
// PAYOUT — active payout holds (cross-merchant)
// ---------------------------------------------------------------

export type PayoutHoldKind =
  | 'risk_review'
  | 'kyc_re_verification'
  | 'iban_unverified'
  | 'legal_hold'
  | 'manual_review'

export type ActivePayoutHold = {
  id: string
  merchantId: string
  merchantDisplay: string
  amount: Money
  kind: PayoutHoldKind
  placedAt: string
  placedBy: string
}

const ACTIVE_PAYOUT_HOLDS: ActivePayoutHold[] = [
  {
    id: 'phold-001',
    merchantId: 'STORE-9112',
    merchantDisplay: 'Hijaz Goods',
    amount: 8_410.0,
    kind: 'risk_review',
    placedAt: isoDaysFromNow(-2),
    placedBy: 'qift_risk_analyst (user-1101)',
  },
  {
    id: 'phold-002',
    merchantId: 'STORE-4502',
    merchantDisplay: 'Najd Sweets',
    amount: 1_220.0,
    kind: 'kyc_re_verification',
    placedAt: isoDaysFromNow(-5),
    placedBy: 'qift_finance_admin (user-2284)',
  },
  {
    id: 'phold-003',
    merchantId: 'STORE-6688',
    merchantDisplay: 'Asir Crafts',
    amount: 540.5,
    kind: 'iban_unverified',
    placedAt: isoDaysFromNow(-1),
    placedBy: 'system (cron)',
  },
]

// ---------------------------------------------------------------
// PAYOUT — delay reason summary (categorical counts)
// ---------------------------------------------------------------

export type PayoutDelayCategory =
  | 'cadence_window'
  | 'minimum_amount_not_met'
  | 'iban_verification_pending'
  | 'kyc_pending'
  | 'risk_hold'
  | 'awaiting_approval'

export type DelayCategoryCount = {
  category: PayoutDelayCategory
  merchantCount: number
}

const DELAY_CATEGORY_COUNTS: DelayCategoryCount[] = [
  { category: 'cadence_window', merchantCount: 132 },
  { category: 'minimum_amount_not_met', merchantCount: 18 },
  { category: 'iban_verification_pending', merchantCount: 4 },
  { category: 'kyc_pending', merchantCount: 2 },
  { category: 'risk_hold', merchantCount: 3 },
  { category: 'awaiting_approval', merchantCount: 1 },
]

// ---------------------------------------------------------------
// PAYOUT — bounced / failed examples
// ---------------------------------------------------------------

export type FailureKind = 'bounced' | 'failed' | 'timed_out'

export type FailedPayoutExample = {
  id: string
  merchantId: string
  merchantDisplay: string
  amount: Money
  kind: FailureKind
  reasonCode: string // operational code; display only
  failedAt: string
  // Whether automatic-retry is allowed for this failure mode. Per
  // FRP § 3.18: adapter failures retry, bounces never, timed-out
  // never (manual reconcile required).
  autoRetry: boolean
}

const FAILED_PAYOUTS: FailedPayoutExample[] = [
  {
    id: 'fp-101',
    merchantId: 'STORE-4419',
    merchantDisplay: 'Hail Honey',
    amount: 3_240.0,
    kind: 'bounced',
    reasonCode: 'BANK_ACCOUNT_CLOSED',
    failedAt: isoDaysFromNow(-3),
    autoRetry: false,
  },
  {
    id: 'fp-102',
    merchantId: 'STORE-7811',
    merchantDisplay: 'Hijaz Goods',
    amount: 1_870.0,
    kind: 'timed_out',
    reasonCode: 'WEBHOOK_NOT_RECEIVED',
    failedAt: isoDaysFromNow(-4),
    autoRetry: false,
  },
  {
    id: 'fp-103',
    merchantId: 'STORE-5021',
    merchantDisplay: 'Tabuk Treats',
    amount: 92.5,
    kind: 'failed',
    reasonCode: 'ADAPTER_HTTP_500',
    failedAt: isoDaysFromNow(-1),
    autoRetry: true,
  },
]

// ---------------------------------------------------------------
// RESERVE — total + by-band distribution
// ---------------------------------------------------------------

export type ReserveTotals = {
  currentBalance: Money
  currency: 'SAR'
  merchantCount: number
}

const RESERVE_TOTALS: ReserveTotals = {
  currentBalance: 642_185.25,
  currency: 'SAR',
  merchantCount: 210,
}

export type ReserveByBandRow = {
  band:
    | 'new_probation'
    | 'established_standard'
    | 'trusted_standard'
    | 'restricted_high_risk'
    | 'frozen'
    | 'enterprise_custom'
  merchantCount: number
  totalReserve: Money
}

const RESERVE_BY_BAND: ReserveByBandRow[] = [
  { band: 'new_probation', merchantCount: 45, totalReserve: 198_420.0 },
  {
    band: 'established_standard',
    merchantCount: 120,
    totalReserve: 312_055.25,
  },
  { band: 'trusted_standard', merchantCount: 38, totalReserve: 86_710.0 },
  {
    band: 'restricted_high_risk',
    merchantCount: 4,
    totalReserve: 38_500.0,
  },
  { band: 'frozen', merchantCount: 2, totalReserve: 4_200.0 },
  { band: 'enterprise_custom', merchantCount: 1, totalReserve: 2_300.0 },
]

// ---------------------------------------------------------------
// RESERVE — merchants with high exposure (top N)
// ---------------------------------------------------------------

export type MerchantHighReserve = {
  merchantId: string
  merchantDisplay: string
  band: ReserveByBandRow['band']
  reserveHeld: Money
  // Days of reserve coverage at the merchant's current chargeback
  // velocity. Higher = less exposure.
  coverageDays: number
}

const MERCHANTS_HIGH_RESERVE: MerchantHighReserve[] = [
  {
    merchantId: 'STORE-0001',
    merchantDisplay: 'Riyadh Marketplace Co.',
    band: 'enterprise_custom',
    reserveHeld: 84_220.0,
    coverageDays: 175,
  },
  {
    merchantId: 'STORE-9112',
    merchantDisplay: 'Hijaz Goods',
    band: 'restricted_high_risk',
    reserveHeld: 22_410.0,
    coverageDays: 92,
  },
  {
    merchantId: 'STORE-1108',
    merchantDisplay: 'Zahrat Al Madinah',
    band: 'established_standard',
    reserveHeld: 18_900.0,
    coverageDays: 128,
  },
]

// ---------------------------------------------------------------
// RESERVE — upcoming releases (cross-merchant)
// ---------------------------------------------------------------

export type UpcomingReserveReleaseRow = {
  id: string
  date: string
  merchantCount: number
  totalAmount: Money
}

const UPCOMING_RESERVE_RELEASES: UpcomingReserveReleaseRow[] = [
  { id: 'urr-1', date: isoDaysFromNow(2), merchantCount: 28, totalAmount: 11_240.0 },
  { id: 'urr-2', date: isoDaysFromNow(9), merchantCount: 41, totalAmount: 18_850.0 },
  { id: 'urr-3', date: isoDaysFromNow(16), merchantCount: 53, totalAmount: 24_300.0 },
  { id: 'urr-4', date: isoDaysFromNow(23), merchantCount: 47, totalAmount: 19_960.0 },
  { id: 'urr-5', date: isoDaysFromNow(30), merchantCount: 36, totalAmount: 14_120.0 },
]

// ---------------------------------------------------------------
// RESERVE — active reserve holds (FRP § 4.15 priority order)
// ---------------------------------------------------------------

export type ReserveHoldType =
  | 'refund_pending'
  | 'dispute_pending'
  | 'chargeback_pending'
  | 'manual_legal_hold'
  | 'regulatory_freeze'

export type ActiveReserveHold = {
  id: string
  merchantId: string
  merchantDisplay: string
  amount: Money
  type: ReserveHoldType
  placedAt: string
}

const ACTIVE_RESERVE_HOLDS: ActiveReserveHold[] = [
  {
    id: 'rhold-001',
    merchantId: 'STORE-4419',
    merchantDisplay: 'Hail Honey',
    amount: 4_810.0,
    type: 'chargeback_pending',
    placedAt: isoDaysFromNow(-7),
  },
  {
    id: 'rhold-002',
    merchantId: 'STORE-2244',
    merchantDisplay: 'Atelier Riyadh',
    amount: 320.0,
    type: 'dispute_pending',
    placedAt: isoDaysFromNow(-2),
  },
  {
    id: 'rhold-003',
    merchantId: 'STORE-1108',
    merchantDisplay: 'Zahrat Al Madinah',
    amount: 95.5,
    type: 'refund_pending',
    placedAt: isoDaysFromNow(-1),
  },
  {
    id: 'rhold-004',
    merchantId: 'STORE-9912',
    merchantDisplay: 'Qassim Goods',
    amount: 1_200.0,
    type: 'manual_legal_hold',
    placedAt: isoDaysFromNow(-15),
  },
]

// ---------------------------------------------------------------
// RESERVE — depletion examples (merchants in trouble)
// ---------------------------------------------------------------

export type ReserveDepletion = {
  merchantId: string
  merchantDisplay: string
  reserveBalance: Money
  pendingObligations: Money
  // Negative = depleted; recovery flow active
  netShortfall: Money
  state: 'depleted' | 'under_recovery'
}

const RESERVE_DEPLETIONS: ReserveDepletion[] = [
  {
    merchantId: 'STORE-7811',
    merchantDisplay: 'Hijaz Goods',
    reserveBalance: 8_410.0,
    pendingObligations: 12_200.0,
    netShortfall: -3_790.0,
    state: 'depleted',
  },
]

// ---------------------------------------------------------------
// RESERVE — recommendation queue summary
// ---------------------------------------------------------------

export type RecommendationQueueSummary = {
  pendingLoosen: number
  pendingTighten: number
  awaitingReviewDays: number
  totalQueued: number
}

const RECOMMENDATION_QUEUE: RecommendationQueueSummary = {
  pendingLoosen: 6,
  pendingTighten: 3,
  awaitingReviewDays: 4,
  totalQueued: 9,
}

// ---------------------------------------------------------------
// RISK / OPS — merchants needing review
// ---------------------------------------------------------------

export type MerchantNeedingReview = {
  merchantId: string
  merchantDisplay: string
  reasonKey: string // i18n key (e.g., admin.pro.risk.review_reason_*)
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

const MERCHANTS_NEEDING_REVIEW: MerchantNeedingReview[] = [
  {
    merchantId: 'STORE-9112',
    merchantDisplay: 'Hijaz Goods',
    reasonKey: 'admin.pro.risk.review_reason_refund_spike',
    priority: 'urgent',
  },
  {
    merchantId: 'STORE-4419',
    merchantDisplay: 'Hail Honey',
    reasonKey: 'admin.pro.risk.review_reason_chargeback_spike',
    priority: 'high',
  },
  {
    merchantId: 'STORE-5021',
    merchantDisplay: 'Tabuk Treats',
    reasonKey: 'admin.pro.risk.review_reason_fulfilment_delays',
    priority: 'medium',
  },
]

// ---------------------------------------------------------------
// RISK / OPS — exposure summary
// ---------------------------------------------------------------

export type ExposureSummary = {
  chargebackPending: Money
  chargebackMerchantCount: number
  refundPending: Money
  refundMerchantCount: number
  disputePending: Money
  disputeMerchantCount: number
}

const EXPOSURE_SUMMARY: ExposureSummary = {
  chargebackPending: 14_280.0,
  chargebackMerchantCount: 6,
  refundPending: 3_410.5,
  refundMerchantCount: 18,
  disputePending: 1_950.0,
  disputeMerchantCount: 9,
}

// ---------------------------------------------------------------
// RISK / OPS — reconciliation status
// ---------------------------------------------------------------

export type ReconciliationStatus = {
  lastCleanRunAt: string
  lastDriftDetectedAt: string | null
  currentDriftCount: number
  // Healthy = sum-of-ledger matches denormalised balances within
  // tolerance. Investigating = drift detected; not yet resolved.
  // P0 incident = current run mismatched.
  state: 'healthy' | 'investigating' | 'p0_incident'
}

const RECONCILIATION_STATUS: ReconciliationStatus = {
  lastCleanRunAt: isoDaysFromNow(0),
  lastDriftDetectedAt: null,
  currentDriftCount: 0,
  state: 'healthy',
}

// ---------------------------------------------------------------
// RISK / OPS — stale payout cases (timed-out / awaiting reconcile)
// ---------------------------------------------------------------

export type StalePayoutCase = {
  id: string
  merchantId: string
  merchantDisplay: string
  amount: Money
  stuckSinceDate: string
  // Days waiting in this state
  ageDays: number
  // operational disposition
  awaitingKey: string // i18n key
}

const STALE_PAYOUT_CASES: StalePayoutCase[] = [
  {
    id: 'sp-001',
    merchantId: 'STORE-7811',
    merchantDisplay: 'Hijaz Goods',
    amount: 1_870.0,
    stuckSinceDate: isoDaysFromNow(-4),
    ageDays: 4,
    awaitingKey: 'admin.pro.risk.stale_awaiting_bank_statement',
  },
]

// ---------------------------------------------------------------
// Bundled export — single object the section component consumes
// ---------------------------------------------------------------

export const PAYOUT_RESERVE_OVERVIEW_MOCK = {
  payout: {
    upcomingBatch: UPCOMING_BATCH,
    batchesByStatus: BATCHES_BY_STATUS,
    merchantsPending: MERCHANTS_PENDING_PAYOUT,
    activeHolds: ACTIVE_PAYOUT_HOLDS,
    delayCounts: DELAY_CATEGORY_COUNTS,
    failedPayouts: FAILED_PAYOUTS,
  },
  reserve: {
    totals: RESERVE_TOTALS,
    byBand: RESERVE_BY_BAND,
    highExposure: MERCHANTS_HIGH_RESERVE,
    upcomingReleases: UPCOMING_RESERVE_RELEASES,
    activeHolds: ACTIVE_RESERVE_HOLDS,
    depletions: RESERVE_DEPLETIONS,
    recommendationQueue: RECOMMENDATION_QUEUE,
  },
  risk: {
    merchantsNeedingReview: MERCHANTS_NEEDING_REVIEW,
    exposure: EXPOSURE_SUMMARY,
    reconciliation: RECONCILIATION_STATUS,
    stalePayouts: STALE_PAYOUT_CASES,
  },
}

// ---------------------------------------------------------------
// Label / colour helpers
// ---------------------------------------------------------------

export function approvalStateLabelKey(s: ApprovalState): string {
  switch (s) {
    case 'proposed':
      return 'admin.pro.payout.state_proposed'
    case 'under_review':
      return 'admin.pro.payout.state_under_review'
    case 'pending_approval':
      return 'admin.pro.payout.state_pending_approval'
    case 'partial_approved_1':
      return 'admin.pro.payout.state_partial_approved'
    case 'approved':
      return 'admin.pro.payout.state_approved'
    case 'disbursing':
      return 'admin.pro.payout.state_disbursing'
    case 'disbursed':
      return 'admin.pro.payout.state_disbursed'
    case 'rejected':
      return 'admin.pro.payout.state_rejected'
    case 'failed':
      return 'admin.pro.payout.state_failed'
  }
}

export function approvalStateColor(
  s: ApprovalState,
): { bg: string; fg: string } {
  switch (s) {
    case 'proposed':
    case 'under_review':
    case 'pending_approval':
    case 'partial_approved_1':
      return {
        bg: 'var(--primary-soft, #e8efff)',
        fg: 'var(--primary-dark)',
      }
    case 'approved':
    case 'disbursing':
      return {
        bg: 'var(--primary-soft, #e8efff)',
        fg: 'var(--primary-dark)',
      }
    case 'disbursed':
      return {
        bg: 'var(--success-soft, #e6f5ea)',
        fg: 'var(--success, #2c7a3a)',
      }
    case 'rejected':
    case 'failed':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
  }
}

export function payoutHoldKindLabelKey(k: PayoutHoldKind): string {
  switch (k) {
    case 'risk_review':
      return 'admin.pro.payout.hold_risk_review'
    case 'kyc_re_verification':
      return 'admin.pro.payout.hold_kyc_re_verification'
    case 'iban_unverified':
      return 'admin.pro.payout.hold_iban_unverified'
    case 'legal_hold':
      return 'admin.pro.payout.hold_legal'
    case 'manual_review':
      return 'admin.pro.payout.hold_manual_review'
  }
}

export function delayCategoryLabelKey(c: PayoutDelayCategory): string {
  switch (c) {
    case 'cadence_window':
      return 'admin.pro.payout.delay_cadence_window'
    case 'minimum_amount_not_met':
      return 'admin.pro.payout.delay_minimum_amount'
    case 'iban_verification_pending':
      return 'admin.pro.payout.delay_iban_verification'
    case 'kyc_pending':
      return 'admin.pro.payout.delay_kyc_pending'
    case 'risk_hold':
      return 'admin.pro.payout.delay_risk_hold'
    case 'awaiting_approval':
      return 'admin.pro.payout.delay_awaiting_approval'
  }
}

export function failureKindLabelKey(k: FailureKind): string {
  switch (k) {
    case 'bounced':
      return 'admin.pro.payout.failure_bounced'
    case 'failed':
      return 'admin.pro.payout.failure_failed'
    case 'timed_out':
      return 'admin.pro.payout.failure_timed_out'
  }
}

export function failureKindColor(
  k: FailureKind,
): { bg: string; fg: string } {
  switch (k) {
    case 'bounced':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
    case 'failed':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
    case 'timed_out':
      return {
        bg: 'var(--warning-soft, #fff3e0)',
        fg: 'var(--warning, #b35900)',
      }
  }
}

export function reserveBandLabelKeyAdmin(
  b: ReserveByBandRow['band'],
): string {
  // Reuse the financial-config band labels rather than introducing a
  // separate set — same human-readable names.
  switch (b) {
    case 'new_probation':
      return 'admin.fincfg.reserve.band_new'
    case 'established_standard':
      return 'admin.fincfg.reserve.band_established'
    case 'trusted_standard':
      return 'admin.fincfg.reserve.band_trusted'
    case 'restricted_high_risk':
      return 'admin.fincfg.reserve.band_restricted'
    case 'frozen':
      return 'admin.fincfg.reserve.band_frozen'
    case 'enterprise_custom':
      return 'admin.fincfg.reserve.band_enterprise'
  }
}

export function reserveHoldTypeLabelKey(t: ReserveHoldType): string {
  switch (t) {
    case 'refund_pending':
      return 'admin.pro.reserve.hold_refund_pending'
    case 'dispute_pending':
      return 'admin.pro.reserve.hold_dispute_pending'
    case 'chargeback_pending':
      return 'admin.pro.reserve.hold_chargeback_pending'
    case 'manual_legal_hold':
      return 'admin.pro.reserve.hold_legal'
    case 'regulatory_freeze':
      return 'admin.pro.reserve.hold_regulatory'
  }
}

export function priorityLabelKey(
  p: MerchantNeedingReview['priority'],
): string {
  switch (p) {
    case 'low':
      return 'admin.pro.risk.priority_low'
    case 'medium':
      return 'admin.pro.risk.priority_medium'
    case 'high':
      return 'admin.pro.risk.priority_high'
    case 'urgent':
      return 'admin.pro.risk.priority_urgent'
  }
}

export function priorityColor(
  p: MerchantNeedingReview['priority'],
): { bg: string; fg: string } {
  switch (p) {
    case 'low':
      return { bg: 'var(--card-soft)', fg: 'var(--text-soft)' }
    case 'medium':
      return {
        bg: 'var(--primary-soft, #e8efff)',
        fg: 'var(--primary-dark)',
      }
    case 'high':
      return {
        bg: 'var(--warning-soft, #fff3e0)',
        fg: 'var(--warning, #b35900)',
      }
    case 'urgent':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
  }
}

export function reconciliationStateLabelKey(
  s: ReconciliationStatus['state'],
): string {
  switch (s) {
    case 'healthy':
      return 'admin.pro.risk.recon_healthy'
    case 'investigating':
      return 'admin.pro.risk.recon_investigating'
    case 'p0_incident':
      return 'admin.pro.risk.recon_p0'
  }
}

export function reconciliationStateColor(
  s: ReconciliationStatus['state'],
): { bg: string; fg: string } {
  switch (s) {
    case 'healthy':
      return {
        bg: 'var(--success-soft, #e6f5ea)',
        fg: 'var(--success, #2c7a3a)',
      }
    case 'investigating':
      return {
        bg: 'var(--warning-soft, #fff3e0)',
        fg: 'var(--warning, #b35900)',
      }
    case 'p0_incident':
      return {
        bg: 'var(--danger-soft, #fde7e7)',
        fg: 'var(--danger, #b03030)',
      }
  }
}
