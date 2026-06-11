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
  // Closed Beta Gate management. Invite codes + email/phone
  // allowlist + gate status. Gated by `beta.manage` server-side;
  // the tab renders for any admin but mutations 403 without it.
  | 'beta'
  // Read-only viewer over the persistent AuditLog (PR 11). Tab
  // hidden without audit.read; route 403s without it server-side.
  | 'audit'
  | 'system'
  // Operational diagnostics surface.
  | 'diagnostics'
  // Corporate ops (pre-pilot screens): org review queue + campaign
  // oversight (full-granularity reports + claim-link export).
  // Tab gated by org.review.
  | 'corporate'
  // Qift Business eligibility queue (B1). Tab gated by store.review.
  | 'business'

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
  // Soft-delete timestamp. Non-null means the account is disabled —
  // hidden from search, login, public profile, and (by default) the
  // admin user list. The admin UI surfaces a Disabled chip on the
  // row and swaps the action buttons from "Disable" to "Restore".
  // The field is optional on the wire so older deployments that
  // pre-date the backend ADMIN_USER_SELECT extension still parse
  // cleanly (treated as null / active).
  deletedAt?: string | null
  // Permanent-deletion timestamp. Non-null means the account has
  // been purged — PII anonymised on the User row, identity-PII
  // tables hard-deleted, transactional / audit history preserved
  // with the FK pointing at the tombstone. The admin UI:
  //   - renders a permanent "Purged" chip
  //   - hides the role-change pills, the Disable button, and the
  //     Restore button (every state-changing action is inert)
  //   - shows the row with a stronger red treatment than disable
  // Optional on the wire so older deployments parse cleanly.
  // See backend/user-purge merge for the anonymisation contract.
  purgedAt?: string | null
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

export const SECTIONS: { id: Section; labelKey: string }[] = [
  { id: 'users', labelKey: 'admin.section_users' },
  { id: 'stores', labelKey: 'admin.section_stores' },
  { id: 'corporate', labelKey: 'admin.section_corporate' },
  { id: 'business', labelKey: 'admin.section_business' },
  { id: 'gifts', labelKey: 'admin.section_gifts' },
  { id: 'reports', labelKey: 'admin.section_reports' },
  { id: 'team', labelKey: 'admin.section_team' },
  { id: 'finance', labelKey: 'admin.section_finance' },
  { id: 'beta', labelKey: 'admin.section_beta' },
  { id: 'audit', labelKey: 'admin.section_audit' },
  { id: 'system', labelKey: 'admin.section_system' },
  { id: 'diagnostics', labelKey: 'admin.section_diagnostics' },
]

// Read the URL hash and resolve it to a section id. Used by the
// admin BottomNav tabs to deep-link into /admin#users / #stores /
// #reports etc. without rebuilding the section state machine.
export function sectionFromHash(hash: string): Section | null {
  const clean = hash.replace(/^#/, '')
  const known: Section[] = [
    'users',
    'stores',
    'gifts',
    'reports',
    'team',
    'finance',
    'beta',
    'audit',
    'system',
    'diagnostics',
  ]
  return (known as string[]).includes(clean) ? (clean as Section) : null
}
