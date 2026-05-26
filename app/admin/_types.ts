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
  { id: 'gifts', labelKey: 'admin.section_gifts' },
  { id: 'reports', labelKey: 'admin.section_reports' },
  { id: 'team', labelKey: 'admin.section_team' },
  { id: 'finance', labelKey: 'admin.section_finance' },
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
    'system',
    'diagnostics',
  ]
  return (known as string[]).includes(clean) ? (clean as Section) : null
}
