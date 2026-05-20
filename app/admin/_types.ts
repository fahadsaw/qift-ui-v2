// Shared types for the /admin surface and its split-out sections.
// Lives alongside `page.tsx` instead of in `lib/` because nothing
// outside /admin should import these — keeping the admin shape
// scoped here makes the privacy boundary easier to audit.

export type Section =
  | 'users'
  | 'stores'
  | 'gifts'
  | 'reports'
  // Team / RBAC management. Per-user ops-role assignment.
  // Gated by `user.assign_ops_role` permission server-side; the
  // tab still renders for any admin, but mutations 403 if the
  // operator doesn't hold a role that grants the permission.
  | 'team'
  // Finance operations console. Per-store balances + event
  // ledger. Gated by `finance.read_payouts` / `finance.record_payout_event`.
  | 'finance'
  | 'system'
  // Operational diagnostics surface.
  | 'diagnostics'
  // Review status — read-only preview of the BLOCKING accountant +
  // legal sign-offs that gate Stage 10. Mock data only; UI is
  // surfaced via NEXT_PUBLIC_SHOW_REVIEW_STATUS=1 in admin/page.tsx.
  | 'review-status'
  // Financial configuration — read-only preview of fee / shipping /
  // reserve rules. Mock data only; all inputs disabled. UI is
  // surfaced via NEXT_PUBLIC_SHOW_FINANCIAL_CONFIG=1 in admin/page.tsx.
  | 'financial-config'
  // Payout + reserve overview — cross-merchant operator view of
  // upcoming payouts, reserve balances, and risk indicators. Mock
  // data only; all actions disabled. UI is surfaced via
  // NEXT_PUBLIC_SHOW_PAYOUT_RESERVE_OVERVIEW=1 in admin/page.tsx.
  | 'payout-reserve-overview'

export type AdminUser = {
  id: string
  qiftUsername: string
  fullName: string | null
  phone: string
  email: string | null
  role: 'user' | 'store' | 'admin' | string
  createdAt: string
  phoneVerifiedAt: string | null
  emailVerifiedAt: string | null
}

export type AdminStore = {
  id: string
  name: string
  city: string
  category: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended' | string
  // Marketplace surfacing flag. Optional on the wire so older
  // admin caches still typecheck during the rollout.
  featured?: boolean
  // Merchant tier — informational here so the admin can see at
  // a glance which stores are on which plan.
  plan?: string
  integrationStatus: string
  integrationType: string
  createdAt: string
  ownerId: string
  owner: { id: string; qiftUsername: string } | null
}

export type AdminGift = {
  id: string
  productName: string
  storeName: string
  status: string
  isAnonymous: boolean
  createdAt: string
  sender: { id: string; qiftUsername: string } | null
  receiver: { id: string; qiftUsername: string } | null
}

export type AdminReport = {
  id: string
  reason: string
  details: string | null
  status: string
  createdAt: string
  reporter: { id: string; qiftUsername: string } | null
  reportedUser: { id: string; qiftUsername: string | null }
}

export type AdminSystem = {
  counts: {
    users: number
    stores: number
    pendingStores: number
    gifts: number
    openReports: number
  }
  integrations: {
    r2: boolean
    push: boolean
    sms: boolean
    merchantApi: boolean
  }
}

// Top-of-page ops summary. Pulls counts from /admin/system once on
// mount and renders as a KPI strip above the tab bar so the page
// reads as a control center, not a list with tabs.
export type AdminOpsCounts = {
  users: number
  stores: number
  pendingStores: number
  gifts: number
  openReports: number
} | null

// Base sections — always available. The review-status tab is
// conditionally appended in admin/page.tsx behind
// NEXT_PUBLIC_SHOW_REVIEW_STATUS so production builds don't
// surface a preview UI by default.
export const SECTIONS: { id: Section; labelKey: string }[] = [
  { id: 'users', labelKey: 'admin.section_users' },
  { id: 'stores', labelKey: 'admin.section_stores' },
  { id: 'gifts', labelKey: 'admin.section_gifts' },
  { id: 'reports', labelKey: 'admin.section_reports' },
  { id: 'team', labelKey: 'admin.section_team' },
  { id: 'finance', labelKey: 'admin.section_finance' },
  { id: 'system', labelKey: 'admin.section_system' },
  { id: 'diagnostics', labelKey: 'admin.section_diagnostics' },
]

// Optional review-status tab descriptor — page-level code appends
// this to the SECTIONS list when the flag is on. Kept here so the
// id + labelKey stay alongside the other section descriptors.
export const REVIEW_STATUS_SECTION: { id: Section; labelKey: string } = {
  id: 'review-status',
  labelKey: 'admin.section_review_status',
}

// Optional financial-config tab descriptor — page-level code appends
// this to the SECTIONS list when NEXT_PUBLIC_SHOW_FINANCIAL_CONFIG=1
// is set. Mock data, read-only, all inputs disabled.
export const FINANCIAL_CONFIG_SECTION: { id: Section; labelKey: string } = {
  id: 'financial-config',
  labelKey: 'admin.section_financial_config',
}

// Optional payout-reserve-overview tab descriptor — appended when
// NEXT_PUBLIC_SHOW_PAYOUT_RESERVE_OVERVIEW=1 is set. Mock data,
// read-only, every action button disabled.
export const PAYOUT_RESERVE_OVERVIEW_SECTION: { id: Section; labelKey: string } = {
  id: 'payout-reserve-overview',
  labelKey: 'admin.section_payout_reserve_overview',
}

// Read the URL hash and resolve it to a section id. Used by the
// admin BottomNav tabs to deep-link into /admin#users / #stores /
// #reports etc. without rebuilding the section state machine.
//
// NOTE: this resolver only checks the id allow-list — it does NOT
// know about feature flags. Callers MUST still validate flag-gated
// preview ids (review-status / financial-config / payout-reserve-
// overview) against their NEXT_PUBLIC_* flag before activating the
// section, otherwise a stale URL hash can resolve to a tab whose
// render branch is skipped and the content area renders empty.
export function sectionFromHash(hash: string): Section | null {
  const clean = hash.replace(/^#/, '')
  const known: Section[] = [
    'users',
    'stores',
    'gifts',
    'reports',
    'team',
    'finance',
    'system',
    'diagnostics',
    'review-status',
    'financial-config',
    'payout-reserve-overview',
  ]
  return (known as string[]).includes(clean) ? (clean as Section) : null
}
