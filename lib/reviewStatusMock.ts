// Mock data for the admin "Review status" surface.
//
// Surfaces the BLOCKING accountant + legal sign-offs documented in
// the platform repo (FINANCIAL_REVIEW_PACK.md § 19 and
// LEGAL_REVIEW_PACK.md § 22, both at v1.1). At this stage there is
// no backend behind the review queue — the data is a static const
// rendered as-is. This is the "UI/mock only, no real workflow"
// posture the operator authorised for the current session.
//
// WHEN A REAL BACKEND ARRIVES
// ---------------------------
// Replace this module with a fetcher that hits an admin endpoint
// (e.g., /admin/review-status) and returns the same shape. The
// section component renders against the shape, not against this
// specific module, so the swap is mechanical.
//
// SHAPE DESIGN
// ------------
// Two groups (accountant, legal) → many items. Each item carries:
//   - id            stable string for keys + audit references
//   - decisionId    decision ID from the architecture docs
//                   (D3.10, D4.7, D17.W4.6, D17.W5.12, etc.)
//   - title         short human-readable label
//   - description   one-paragraph context for the reviewer
//   - blocksStage   which Stage 10.x can't proceed until this closes
//   - status        pending | in_review | returned | approved
//
// All items are 'pending' by design — no real engagement has begun
// yet. As external review work progresses, statuses migrate
// forward through in_review → returned/approved. The UI uses these
// transitions to drive the badge colour.

export type ReviewStatus =
  | 'pending'
  | 'in_review'
  | 'returned'
  | 'approved'

export type ReviewItem = {
  id: string
  decisionId: string
  title: string
  description: string
  blocksStage: string
  status: ReviewStatus
}

export type ReviewGroup = {
  // Translation key for the group heading. Render via i18n so the
  // group title flips with the lang toggle alongside the per-item
  // status badges.
  labelKey: 'admin.review_group_accountant' | 'admin.review_group_legal'
  items: ReviewItem[]
}

// Accountant sign-offs. The four BLOCKING items from Financial
// Review Pack v1.1 § 19 are the load-bearing ones; the others are
// supporting accountant questions the operator is also tracking.
const ACCOUNTANT_ITEMS: ReviewItem[] = [
  {
    id: 'acct-d3-10',
    decisionId: 'D3.10',
    title: 'Chart-of-accounts mapping for the 13 payout ledger event types',
    description:
      'Confirm or revise the debit/credit treatment for every payout ledger event (eligibility recognised, dispatched, completed, returned, superseded, reversed, refund clawbacks, fee deducted, tax recorded, manual adjustment).',
    blocksStage: 'Stage 10.4 / 10.5',
    status: 'pending',
  },
  {
    id: 'acct-d4-7',
    decisionId: 'D4.7',
    title: 'Chart-of-accounts mapping for the 8 reserve ledger event types',
    description:
      'Confirm or revise the debit/credit treatment for every reserve ledger event (deposit, release, refund clawback, chargeback clawback, dispute clawback, manual adjustment, legal disposition, closing settlement).',
    blocksStage: 'Stage 10.5',
    status: 'pending',
  },
  {
    id: 'acct-d17-w4-6',
    decisionId: 'D17.W4.6',
    title: 'Discount-treatment-by-funder in TaxEngine',
    description:
      'Confirm or revise the taxable-base treatment for each discount funder type (merchant-funded, Qift-funded, PSP-funded, BNPL-funded, loyalty-account, mixed). Especially the Qift-funded shipping subsidy case.',
    blocksStage: 'Stage 10.3',
    status: 'pending',
  },
  {
    id: 'acct-d17-w5-12',
    decisionId: 'D17.W5.12',
    title: 'Multi-recipient + multi-merchant VAT distribution treatment',
    description:
      'Confirm or revise how VAT is computed when a session-wide reduction distributes across multiple MerchantOrders going to multiple recipients.',
    blocksStage: 'Stage 10.3',
    status: 'pending',
  },
]

// Legal sign-offs. The five BLOCKING milestones from Legal Review
// Pack v1.1 § 24 (was § 22 before the v1.1 renumber). Each milestone
// gates a specific Stage 10.x; collectively they gate the public
// launch path.
const LEGAL_ITEMS: ReviewItem[] = [
  {
    id: 'legal-stage-10-5',
    decisionId: 'L-10.5',
    title:
      'Merchant agreement + MoR framing + reserve disclosure + settlement-cycle framing',
    description:
      'Draft and review the merchant agreement establishing Qift-as-MoR, reserve disclosure language, merchant data-processor framing, the 180-day chargeback hold at offboarding, and controller/processor framing. Confirm Qift\'s settlement-cycle model is not regulated banking activity.',
    blocksStage: 'Stage 10.5',
    status: 'pending',
  },
  {
    id: 'legal-stage-10-6',
    decisionId: 'L-10.6',
    title:
      'Sender TOS + arbitration + PDPL lawful basis per data category',
    description:
      'Draft and review the sender Terms of Service including arbitration clause, dispute-resolution path, and PDPL lawful-basis disclosures for every personal-data category. Includes Intellectual Property licence sections (merchant content, sender content, recipient content) per the v1.1 expansion.',
    blocksStage: 'Stage 10.6',
    status: 'pending',
  },
  {
    id: 'legal-stage-10-7-8',
    decisionId: 'L-10.7/10.8',
    title: 'PSP contract + PDPL flowdown + KSA banking/AML framework',
    description:
      'Legal review of the chosen PSP contract (Moyasar / Tap / HyperPay), PDPL flowdown clauses for the PSP relationship, and confirmation of the KSA banking + AML/CFT framework that applies to Qift\'s activity volume.',
    blocksStage: 'Stage 10.7 / 10.8',
    status: 'pending',
  },
  {
    id: 'legal-stage-10-9',
    decisionId: 'L-10.9',
    title:
      'Recipient consent model + PDPL rights + data residency + breach notification + Arabic TOS + sanctions screening',
    description:
      'Confirm the recipient consent model (implied vs explicit per § 6.3.1), PDPL data-subject-rights mechanisms, KSA data-residency requirements, breach notification procedure, the Arabic-language TOS legal equivalent (required for KSA consumer contracts), and the sanctions-screening framework. Includes minimum-age / restricted-product taxonomy per § 15 of the v1.1 pack.',
    blocksStage: 'Stage 10.9',
    status: 'pending',
  },
  {
    id: 'legal-stage-10-11',
    decisionId: 'L-10.11',
    title: 'BNPL provider contracts + PDPL flowdown + disclosure compliance',
    description:
      'Legal review of Tabby and Tamara contracts (each separately), PDPL flowdown clauses for each BNPL provider, and confirmation that sender disclosure at BNPL selection complies with KSA financial-services regulations.',
    blocksStage: 'Stage 10.11',
    status: 'pending',
  },
]

export const REVIEW_GROUPS: ReviewGroup[] = [
  {
    labelKey: 'admin.review_group_accountant',
    items: ACCOUNTANT_ITEMS,
  },
  {
    labelKey: 'admin.review_group_legal',
    items: LEGAL_ITEMS,
  },
]

// Helper: maps a ReviewStatus to its translation key for the badge
// label. Centralised here so the section component doesn't bake the
// mapping into its render branches.
export function statusLabelKey(status: ReviewStatus): string {
  switch (status) {
    case 'pending':
      return 'admin.review_status_pending'
    case 'in_review':
      return 'admin.review_status_in_review'
    case 'returned':
      return 'admin.review_status_returned'
    case 'approved':
      return 'admin.review_status_approved'
  }
}

// Helper: maps a ReviewStatus to a CSS colour token. Pending is
// neutral; in-review tints toward primary; returned is warm to
// signal "action needed"; approved is green.
export function statusColor(status: ReviewStatus): {
  bg: string
  fg: string
} {
  switch (status) {
    case 'pending':
      return { bg: 'var(--card-soft)', fg: 'var(--text-soft)' }
    case 'in_review':
      return { bg: 'var(--primary-soft, #e8efff)', fg: 'var(--primary-dark)' }
    case 'returned':
      return { bg: 'var(--warning-soft, #fff3e0)', fg: 'var(--warning, #b35900)' }
    case 'approved':
      return { bg: 'var(--success-soft, #e6f5ea)', fg: 'var(--success, #2c7a3a)' }
  }
}
