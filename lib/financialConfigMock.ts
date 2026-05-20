// Mock data for the admin financial-configuration preview surface.
//
// Surfaces the three engine substrates documented in Financial
// Review Pack v1.1: FeeEngine rules (§ 5 + § 17.1), ShippingEngine
// rules (§ 6 + § 17.2), and ReserveBand assignments + per-merchant
// overrides (§ 8 + §§ 4.7-4.46). The data is a static constant —
// no backend, no real money, no side effects. The mock shape mirrors
// what a future GET /admin/financial-config endpoint would return so
// the section component can be re-pointed at a real source later.
//
// IMPORTANT: every UI surface rendering this data must keep edit /
// add / toggle controls DISABLED. Per FRP § 5.4 + § 8.2.1 + § 17.10
// + § 19, any real edit requires MFA + dual-control where applicable
// + a structured reason + an append-only audit-log entry + a new
// versioned rule snapshot. The preview surface exists only so
// operators can see the SHAPE of the future config UI before any of
// those workflows are wired.

// ---------------------------------------------------------------
// Common types
// ---------------------------------------------------------------

export type ConfigStatus = 'active' | 'draft' | 'archived' | 'scheduled'

// Funder taxonomy from FRP v1.1 § 10.4 — every reduction / fee has
// exactly one named funder so the accounting answers "who paid for
// this?" from the ledger alone.
export type Funder =
  | 'merchant'
  | 'qift'
  | 'psp'
  | 'bnpl'
  | 'loyalty_account'
  | 'mixed'

// ---------------------------------------------------------------
// Fee rules — FRP v1.1 § 5.4 (fee-bearing flexibility)
// ---------------------------------------------------------------

// Bearer model — who actually pays the Qift fee per the 5-model
// taxonomy in FRP § 5.4.1.
export type FeeBearerModel =
  | 'merchant_absorbed'
  | 'sender_absorbed'
  | 'shared'
  | 'qift_promotional_waiver'
  | 'psp_bnpl_funded_waiver'

// Scope at which a fee rule applies (FRP § 5.4.2).
export type FeeScope =
  | 'platform_default'
  | 'per_merchant'
  | 'per_category'
  | 'per_campaign'
  | 'per_contract'

export type FeeRule = {
  id: string
  // Translation key for the user-facing rule label.
  nameKey: string
  bearerModel: FeeBearerModel
  funder: Funder
  scope: FeeScope
  // Human-readable formula or amount (e.g., "2 SAR + 2%"). Not
  // parsed — display only.
  formula: string
  // Optional scope-detail string (merchant id, category, campaign,
  // contract). Surfaced under the rule name for context.
  scopeDetail?: string
  status: ConfigStatus
  // Effective dates for time-bound rules. Free-form display strings
  // (the mock doesn't model real Date objects).
  effectiveFrom?: string
  effectiveTo?: string
  // Translation key for a short rationale / description.
  noteKey?: string
}

const FEE_RULES: FeeRule[] = [
  {
    id: 'fee-default',
    nameKey: 'admin.fincfg.fee.rule_default',
    bearerModel: 'merchant_absorbed',
    funder: 'merchant',
    scope: 'platform_default',
    formula: '2 SAR + 2%',
    status: 'active',
    noteKey: 'admin.fincfg.fee.note_default',
  },
  {
    id: 'fee-sender-disclosed',
    nameKey: 'admin.fincfg.fee.rule_sender_absorbed',
    bearerModel: 'sender_absorbed',
    funder: 'merchant',
    scope: 'per_merchant',
    formula: '2 SAR + 2%',
    scopeDetail: 'merchant: STORE-3219',
    status: 'draft',
    noteKey: 'admin.fincfg.fee.note_sender_disclosed',
  },
  {
    id: 'fee-shared-50-50',
    nameKey: 'admin.fincfg.fee.rule_shared',
    bearerModel: 'shared',
    funder: 'mixed',
    scope: 'per_merchant',
    formula: '2 SAR + 2% (50/50 split)',
    scopeDetail: 'merchant: STORE-1108',
    status: 'draft',
    noteKey: 'admin.fincfg.fee.note_shared',
  },
  {
    id: 'fee-qift-ramadan-waiver',
    nameKey: 'admin.fincfg.fee.rule_qift_promotional',
    bearerModel: 'qift_promotional_waiver',
    funder: 'qift',
    scope: 'per_campaign',
    formula: '100% Qift fee waived',
    scopeDetail: 'campaign: RAMADAN-2026',
    status: 'scheduled',
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-03-31',
    noteKey: 'admin.fincfg.fee.note_qift_promotional',
  },
  {
    id: 'fee-mada-friday',
    nameKey: 'admin.fincfg.fee.rule_psp_funded',
    bearerModel: 'psp_bnpl_funded_waiver',
    funder: 'psp',
    scope: 'per_campaign',
    formula: '100% Qift fee waived (PSP-reimbursed)',
    scopeDetail: 'campaign: MADA-FRIDAY-2026',
    status: 'draft',
    effectiveFrom: '2026-11-27',
    effectiveTo: '2026-11-29',
    noteKey: 'admin.fincfg.fee.note_psp_funded',
  },
  {
    id: 'fee-tabby-acquisition',
    nameKey: 'admin.fincfg.fee.rule_bnpl_funded',
    bearerModel: 'psp_bnpl_funded_waiver',
    funder: 'bnpl',
    scope: 'per_campaign',
    formula: '100% Qift fee waived (BNPL-reimbursed)',
    scopeDetail: 'campaign: TABBY-ACQ-2026',
    status: 'draft',
    noteKey: 'admin.fincfg.fee.note_bnpl_funded',
  },
  {
    id: 'fee-enterprise-z',
    nameKey: 'admin.fincfg.fee.rule_enterprise_contract',
    bearerModel: 'merchant_absorbed',
    funder: 'merchant',
    scope: 'per_contract',
    formula: '0.5% (no fixed component)',
    scopeDetail: 'contract: ENT-2026-007',
    status: 'active',
    noteKey: 'admin.fincfg.fee.note_enterprise',
  },
  {
    id: 'fee-staples-category',
    nameKey: 'admin.fincfg.fee.rule_category_override',
    bearerModel: 'merchant_absorbed',
    funder: 'merchant',
    scope: 'per_category',
    formula: '1.5% (reduced from 2%)',
    scopeDetail: 'category: staples',
    status: 'draft',
    noteKey: 'admin.fincfg.fee.note_category_override',
  },
  {
    id: 'fee-eid-discount',
    nameKey: 'admin.fincfg.fee.rule_time_bound_campaign',
    bearerModel: 'qift_promotional_waiver',
    funder: 'qift',
    scope: 'per_campaign',
    formula: '50% Qift fee discount',
    scopeDetail: 'campaign: EID-2026',
    status: 'scheduled',
    effectiveFrom: '2026-04-08',
    effectiveTo: '2026-04-22',
    noteKey: 'admin.fincfg.fee.note_time_bound',
  },
]

// ---------------------------------------------------------------
// Shipping rules — FRP v1.1 § 6 + § 17.2 + § 17.11
// ---------------------------------------------------------------

export type ShippingScope =
  | 'merchant_default'
  | 'per_merchant_order_threshold'
  | 'per_recipient_threshold'
  | 'per_session_threshold'
  | 'per_category_surcharge'
  | 'platform_campaign'
  | 'future_qift_provided_label'

export type ShippingFunder = 'merchant' | 'qift' | 'sender' | 'future_carrier_adapter'

export type ShippingRule = {
  id: string
  nameKey: string
  scope: ShippingScope
  funder: ShippingFunder
  // Display formula / threshold text — not parsed.
  formula: string
  scopeDetail?: string
  status: ConfigStatus
  // Effective dates for time-bound rules (e.g., platform campaigns).
  // Free-form display strings; the mock doesn't model real Dates.
  effectiveFrom?: string
  effectiveTo?: string
  // For 'future_qift_provided_label': this flag forces the row to
  // render with reduced opacity + a "future / Stage 13+" tag so it
  // reads as deferred regardless of normal status colour.
  isFuture?: boolean
  noteKey?: string
}

const SHIPPING_RULES: ShippingRule[] = [
  {
    id: 'ship-merchant-default',
    nameKey: 'admin.fincfg.ship.rule_merchant_default',
    scope: 'merchant_default',
    funder: 'sender',
    formula: 'merchant-set fixed amount (pass-through)',
    status: 'active',
    noteKey: 'admin.fincfg.ship.note_merchant_default',
  },
  {
    id: 'ship-free-over-200',
    nameKey: 'admin.fincfg.ship.rule_per_mo_threshold',
    scope: 'per_merchant_order_threshold',
    funder: 'merchant',
    formula: 'free shipping when MO total ≥ 200 SAR',
    scopeDetail: 'merchant: STORE-1108',
    status: 'draft',
    noteKey: 'admin.fincfg.ship.note_per_mo_threshold',
  },
  {
    id: 'ship-recipient-300',
    nameKey: 'admin.fincfg.ship.rule_per_recipient_threshold',
    scope: 'per_recipient_threshold',
    funder: 'qift',
    formula: 'free shipping when recipient total ≥ 300 SAR',
    status: 'draft',
    noteKey: 'admin.fincfg.ship.note_per_recipient_threshold',
  },
  {
    id: 'ship-session-500',
    nameKey: 'admin.fincfg.ship.rule_per_session_threshold',
    scope: 'per_session_threshold',
    funder: 'qift',
    formula: 'free shipping when session total ≥ 500 SAR',
    status: 'draft',
    noteKey: 'admin.fincfg.ship.note_per_session_threshold',
  },
  {
    id: 'ship-bf-2026',
    nameKey: 'admin.fincfg.ship.rule_platform_campaign',
    scope: 'platform_campaign',
    funder: 'qift',
    formula: 'free shipping for all merchants',
    scopeDetail: 'campaign: BF-2026 (3 days)',
    status: 'scheduled',
    effectiveFrom: '2026-11-27',
    effectiveTo: '2026-11-29',
    noteKey: 'admin.fincfg.ship.note_platform_campaign',
  },
  {
    id: 'ship-flowers-next-day',
    nameKey: 'admin.fincfg.ship.rule_category_surcharge',
    scope: 'per_category_surcharge',
    funder: 'sender',
    formula: '+15 SAR next-day delivery surcharge',
    scopeDetail: 'category: flowers',
    status: 'active',
    noteKey: 'admin.fincfg.ship.note_category_surcharge',
  },
  {
    id: 'ship-future-qift-label',
    nameKey: 'admin.fincfg.ship.rule_future_qift_label',
    scope: 'future_qift_provided_label',
    funder: 'future_carrier_adapter',
    formula: '(Stage 13+ — optional, per-order opt-in)',
    status: 'draft',
    isFuture: true,
    noteKey: 'admin.fincfg.ship.note_future_qift_label',
  },
] satisfies ShippingRule[]

// ---------------------------------------------------------------
// Reserve bands + overrides + recommendations — FRP v1.1 § 8
// ---------------------------------------------------------------

export type ReserveBandCode =
  | 'new_probation'
  | 'established_standard'
  | 'trusted_standard'
  | 'restricted_high_risk'
  | 'frozen'
  | 'enterprise_custom'

export type ReserveBand = {
  code: ReserveBandCode
  labelKey: string
  // Display strings — not parsed numbers.
  reservePercent: string
  holdPeriod: string
  eligibilityKey: string
  status: ConfigStatus
}

const RESERVE_BANDS: ReserveBand[] = [
  {
    code: 'new_probation',
    labelKey: 'admin.fincfg.reserve.band_new',
    reservePercent: '100%',
    holdPeriod: '7 days',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_new',
    status: 'active',
  },
  {
    code: 'established_standard',
    labelKey: 'admin.fincfg.reserve.band_established',
    reservePercent: '10%',
    holdPeriod: '30 days (rolling)',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_established',
    status: 'active',
  },
  {
    code: 'trusted_standard',
    labelKey: 'admin.fincfg.reserve.band_trusted',
    reservePercent: '5%',
    holdPeriod: '30 days (rolling)',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_trusted',
    status: 'active',
  },
  {
    code: 'restricted_high_risk',
    labelKey: 'admin.fincfg.reserve.band_restricted',
    reservePercent: '25%',
    holdPeriod: '60 days (rolling)',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_restricted',
    status: 'active',
  },
  {
    code: 'frozen',
    labelKey: 'admin.fincfg.reserve.band_frozen',
    reservePercent: '100%',
    holdPeriod: '(indefinite)',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_frozen',
    status: 'active',
  },
  {
    code: 'enterprise_custom',
    labelKey: 'admin.fincfg.reserve.band_enterprise',
    reservePercent: '(per contract)',
    holdPeriod: '(per contract)',
    eligibilityKey: 'admin.fincfg.reserve.eligibility_enterprise',
    status: 'active',
  },
]

// Per-merchant override example. Surfaces the FRP § 8.2 framing
// that the operator can override the band default per merchant via
// dual-control + audit-logged change.
export type ReserveOverride = {
  id: string
  merchantId: string
  baseBand: ReserveBandCode
  overrideReservePercent: string
  overrideHoldPeriod: string
  reasonKey: string
  cosignedBy: string
}

const RESERVE_OVERRIDES: ReserveOverride[] = [
  {
    id: 'rov-001',
    merchantId: 'STORE-5678',
    baseBand: 'established_standard',
    overrideReservePercent: '15%',
    overrideHoldPeriod: '30 days (rolling)',
    reasonKey: 'admin.fincfg.reserve.override_reason_elevated',
    cosignedBy: 'qift_payout_approver',
  },
]

// Recommendation engine examples. Per FRP § 8.5 the monitoring
// system surfaces these to operators for review; nothing
// auto-applies at launch. Direction encodes whether the proposed
// move is toward lower-risk (loosen) or higher-risk (tighten).
export type ReserveRecommendation = {
  id: string
  merchantId: string
  direction: 'loosen' | 'tighten'
  currentBand: ReserveBandCode
  proposedBand: ReserveBandCode
  // Translation key for the human-readable rationale.
  rationaleKey: string
  confidence: 'low' | 'medium' | 'high'
}

const RESERVE_RECOMMENDATIONS: ReserveRecommendation[] = [
  {
    id: 'rrec-001',
    merchantId: 'STORE-2244',
    direction: 'loosen',
    currentBand: 'established_standard',
    proposedBand: 'trusted_standard',
    rationaleKey: 'admin.fincfg.reserve.rec_loosen_rationale',
    confidence: 'high',
  },
  {
    id: 'rrec-002',
    merchantId: 'STORE-9112',
    direction: 'tighten',
    currentBand: 'established_standard',
    proposedBand: 'restricted_high_risk',
    rationaleKey: 'admin.fincfg.reserve.rec_tighten_rationale',
    confidence: 'high',
  },
]

// ---------------------------------------------------------------
// Bundled export
// ---------------------------------------------------------------

export const FINANCIAL_CONFIG_MOCK = {
  feeRules: FEE_RULES,
  shippingRules: SHIPPING_RULES,
  reserveBands: RESERVE_BANDS,
  reserveOverrides: RESERVE_OVERRIDES,
  reserveRecommendations: RESERVE_RECOMMENDATIONS,
}

// ---------------------------------------------------------------
// Label / colour helpers
// ---------------------------------------------------------------

export function configStatusLabelKey(status: ConfigStatus): string {
  switch (status) {
    case 'active':
      return 'admin.fincfg.status_active'
    case 'draft':
      return 'admin.fincfg.status_draft'
    case 'archived':
      return 'admin.fincfg.status_archived'
    case 'scheduled':
      return 'admin.fincfg.status_scheduled'
  }
}

export function configStatusColor(
  status: ConfigStatus,
): { bg: string; fg: string } {
  switch (status) {
    case 'active':
      return {
        bg: 'var(--success-soft, #e6f5ea)',
        fg: 'var(--success, #2c7a3a)',
      }
    case 'scheduled':
      return {
        bg: 'var(--primary-soft, #e8efff)',
        fg: 'var(--primary-dark)',
      }
    case 'draft':
      return { bg: 'var(--card-soft)', fg: 'var(--text-soft)' }
    case 'archived':
      return {
        bg: 'var(--card-soft)',
        fg: 'var(--text-soft)',
      }
  }
}

export function feeBearerLabelKey(model: FeeBearerModel): string {
  switch (model) {
    case 'merchant_absorbed':
      return 'admin.fincfg.fee.bearer_merchant'
    case 'sender_absorbed':
      return 'admin.fincfg.fee.bearer_sender'
    case 'shared':
      return 'admin.fincfg.fee.bearer_shared'
    case 'qift_promotional_waiver':
      return 'admin.fincfg.fee.bearer_qift'
    case 'psp_bnpl_funded_waiver':
      return 'admin.fincfg.fee.bearer_psp_bnpl'
  }
}

export function funderLabelKey(funder: Funder | ShippingFunder): string {
  switch (funder) {
    case 'merchant':
      return 'admin.fincfg.funder_merchant'
    case 'qift':
      return 'admin.fincfg.funder_qift'
    case 'psp':
      return 'admin.fincfg.funder_psp'
    case 'bnpl':
      return 'admin.fincfg.funder_bnpl'
    case 'loyalty_account':
      return 'admin.fincfg.funder_loyalty'
    case 'mixed':
      return 'admin.fincfg.funder_mixed'
    case 'sender':
      return 'admin.fincfg.funder_sender'
    case 'future_carrier_adapter':
      return 'admin.fincfg.funder_future_carrier'
  }
}

export function feeScopeLabelKey(scope: FeeScope): string {
  switch (scope) {
    case 'platform_default':
      return 'admin.fincfg.fee.scope_platform_default'
    case 'per_merchant':
      return 'admin.fincfg.fee.scope_per_merchant'
    case 'per_category':
      return 'admin.fincfg.fee.scope_per_category'
    case 'per_campaign':
      return 'admin.fincfg.fee.scope_per_campaign'
    case 'per_contract':
      return 'admin.fincfg.fee.scope_per_contract'
  }
}

export function shippingScopeLabelKey(scope: ShippingScope): string {
  switch (scope) {
    case 'merchant_default':
      return 'admin.fincfg.ship.scope_merchant_default'
    case 'per_merchant_order_threshold':
      return 'admin.fincfg.ship.scope_per_mo'
    case 'per_recipient_threshold':
      return 'admin.fincfg.ship.scope_per_recipient'
    case 'per_session_threshold':
      return 'admin.fincfg.ship.scope_per_session'
    case 'per_category_surcharge':
      return 'admin.fincfg.ship.scope_per_category'
    case 'platform_campaign':
      return 'admin.fincfg.ship.scope_platform_campaign'
    case 'future_qift_provided_label':
      return 'admin.fincfg.ship.scope_future_qift_label'
  }
}

export function reserveBandLabelKey(code: ReserveBandCode): string {
  switch (code) {
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

export function recommendationConfidenceLabelKey(
  c: ReserveRecommendation['confidence'],
): string {
  switch (c) {
    case 'low':
      return 'admin.fincfg.reserve.confidence_low'
    case 'medium':
      return 'admin.fincfg.reserve.confidence_medium'
    case 'high':
      return 'admin.fincfg.reserve.confidence_high'
  }
}
