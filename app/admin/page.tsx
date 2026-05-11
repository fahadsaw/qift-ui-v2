'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { OPS_ROLES } from '@/lib/opsRoles'

// Admin dashboard. Hidden from normal users — discoverable only via:
//   1. Direct URL (`/admin`)
//   2. The conditional /settings entry rendered for role === 'admin'.
//
// Authoritative authorization is server-side via AdminGuard
// (apps/api/src/admin/admin.guard.ts). The frontend gate here is a
// UX shortcut — it redirects non-admins to /profile so they don't
// land on a broken page, but a tampered local state value can't
// reach any of the admin endpoints because every request is
// re-checked against User.role in the DB.
//
// The page renders one section at a time via a tabbed layout. Each
// section owns its own data fetch + mutation handlers; this keeps
// per-tab state fresh on switch and avoids one giant top-level fetch
// that pre-loads sections nobody is looking at.

type Section =
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
  // Operational diagnostics surface. Wraps the backend's
  // GET /admin/debug/latest-merchant-order endpoint so admins can
  // inspect the latest order/gift lineage from the authenticated
  // frontend instead of hitting the API host directly. Useful for
  // debugging "merchant doesn't see this order" reports without
  // Railway shell access.
  | 'diagnostics'

type AdminUser = {
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

type AdminStore = {
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

type AdminGift = {
  id: string
  productName: string
  storeName: string
  status: string
  isAnonymous: boolean
  createdAt: string
  sender: { id: string; qiftUsername: string } | null
  receiver: { id: string; qiftUsername: string } | null
}

type AdminReport = {
  id: string
  reason: string
  details: string | null
  status: string
  createdAt: string
  reporter: { id: string; qiftUsername: string } | null
  reportedUser: { id: string; qiftUsername: string | null }
}

type AdminSystem = {
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

const SECTIONS: { id: Section; labelKey: string }[] = [
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
function sectionFromHash(hash: string): Section | null {
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

// Top-of-page ops summary. Pulls counts from /admin/system once on
// mount and renders as a KPI strip above the tab bar so the page
// reads as a control center, not a list with tabs. Open reports
// gets warm/orange treatment because it's the actionable bucket.
type AdminOpsCounts = {
  users: number
  stores: number
  pendingStores: number
  gifts: number
  openReports: number
} | null

export default function AdminPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ready = useSimulatedReady(300)
  const { accessToken, user, isAuthenticated } = useAuth()
  const [section, setSection] = useState<Section>('users')
  const [opsCounts, setOpsCounts] = useState<AdminOpsCounts>(null)

  // Hash → section sync. Runs on mount + on every hashchange so a
  // BottomNav tap that updates the URL reflects in the active tab
  // without forcing a route reload.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apply = () => {
      const next = sectionFromHash(window.location.hash)
      if (next) setSection(next)
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  // Pull system counts for the ops summary header. Single GET on
  // mount; refreshing the page is enough to update — we don't need
  // realtime here. Failure is non-fatal: the header just doesn't
  // render and the page continues to work.
  useEffect(() => {
    if (!accessToken || user?.role !== 'admin') return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/system`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { counts?: AdminOpsCounts }
        if (data?.counts) setOpsCounts(data.counts)
      } catch {
        // non-fatal — header just stays hidden
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, user?.role])

  // UX-only role gate. Server-side AdminGuard is the real boundary.
  // We redirect to /profile rather than rendering a "forbidden" page
  // because admin is not a public concept — non-admins shouldn't
  // even know /admin exists.
  useEffect(() => {
    if (!ready) return
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    if (user && user.role !== 'admin') {
      router.replace('/profile')
    }
  }, [ready, isAuthenticated, user, router])

  if (!ready || !isAuthenticated || user?.role !== 'admin') {
    return <AdminSkeleton />
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('admin.badge')}</Badge>}
          line1={t('admin.title_1')}
          gradient={t('admin.title_2')}
          subtitle={t('admin.subtitle')}
          size="sm"
        />

        {/* Top-of-page ops summary. Five counters keyed off
            /admin/system. Open reports + pending stores get the
            warm treatment because they're the buckets that need
            admin attention. The other three are passive totals. */}
        {opsCounts && <AdminOpsSummary counts={opsCounts} />}

        {/* Global ops search. One input that fan-outs to the
            users / stores / gifts admin endpoints and surfaces
            top hits inline. Replaces the per-section searches as
            the primary "find anything by id / username / name"
            entry point. Per-section searches still work for
            paginated drilldown. */}
        <AdminGlobalSearch accessToken={accessToken} />

        <div className="mt-5 -mx-1 flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((s) => {
            const active = s.id === section
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSection(s.id)
                  // Mirror the active tab into the URL hash so the
                  // BottomNav highlight stays in sync and the user
                  // can deep-link / share an admin section URL.
                  // history.replaceState avoids an extra browser
                  // history entry per tab change.
                  if (typeof window !== 'undefined') {
                    history.replaceState(null, '', `#${s.id}`)
                  }
                }}
                className="shrink-0 rounded-full border px-4 py-2 text-xs transition-all duration-300 active:scale-95"
                style={{
                  borderColor: active ? 'transparent' : 'var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: active ? '#fff' : 'var(--text-soft)',
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? 'var(--shadow-soft)' : undefined,
                }}
              >
                {t(s.labelKey)}
              </button>
            )
          })}
        </div>

        <div key={section} className="mt-5 qift-fade-in">
          {section === 'users' && <UsersSection accessToken={accessToken} />}
          {section === 'stores' && <StoresSection accessToken={accessToken} />}
          {section === 'gifts' && <GiftsSection accessToken={accessToken} />}
          {section === 'reports' && (
            <ReportsSection accessToken={accessToken} />
          )}
          {section === 'team' && <TeamSection accessToken={accessToken} />}
          {section === 'finance' && (
            <FinanceSection accessToken={accessToken} />
          )}
          {section === 'system' && <SystemSection accessToken={accessToken} />}
          {section === 'diagnostics' && (
            <DiagnosticsSection accessToken={accessToken} />
          )}
        </div>
      </section>
    </PageContainer>
  )
}

// --- Users ---------------------------------------------------------

function UsersSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const url = new URL(`${API_BASE}/admin/users`)
      if (q.trim()) url.searchParams.set('q', q.trim())
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        setUsers([])
        return
      }
      setUsers((await res.json()) as AdminUser[])
    } catch {
      setUsers([])
    }
  }, [accessToken, q])

  useEffect(() => {
    // Async wrapper keeps the setState calls inside refresh() out
    // of the synchronous effect body — same pattern used elsewhere
    // in the codebase to satisfy react-hooks/set-state-in-effect.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const onChangeRole = async (id: string, role: string) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        toast.show(data?.message || t('admin.action_failed'), { tone: 'error' })
        return
      }
      const updated = (await res.json()) as AdminUser
      setUsers((list) =>
        (list ?? []).map((u) => (u.id === id ? updated : u)),
      )
      toast.show(t('admin.role_updated'))
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.search_users_ph')}
        className="rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      {users === null ? (
        <Skeleton className="h-24 w-full" rounded="2xl" />
      ) : users.length === 0 ? (
        <Empty messageKey="admin.no_users" />
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="rounded-2xl border p-3.5 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {u.fullName?.trim() || u.qiftUsername}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                    dir="ltr"
                  >
                    @{u.qiftUsername} · {u.phone}
                    {u.email ? ` · ${u.email}` : ''}
                  </p>
                </div>
                <RoleBadge role={u.role} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['user', 'store', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => void onChangeRole(u.id, r)}
                    disabled={u.role === r || busy === u.id}
                    className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor:
                        u.role === r ? 'var(--primary)' : 'var(--border)',
                      background:
                        u.role === r ? 'var(--ring)' : 'var(--card-soft)',
                      color:
                        u.role === r ? 'var(--primary)' : 'var(--text-soft)',
                    }}
                  >
                    {t(`admin.role_${r}`)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n()
  const color =
    role === 'admin'
      ? '#D55B6E'
      : role === 'store'
        ? '#3FA46A'
        : 'var(--muted)'
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color,
        background: 'var(--card-soft)',
      }}
    >
      {t(`admin.role_${role}`) || role}
    </span>
  )
}

// --- Stores --------------------------------------------------------

function StoresSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [stores, setStores] = useState<AdminStore[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const url = new URL(`${API_BASE}/admin/stores`)
      if (q.trim()) url.searchParams.set('q', q.trim())
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        setStores([])
        return
      }
      setStores((await res.json()) as AdminStore[])
    } catch {
      setStores([])
    }
  }, [accessToken, q])

  useEffect(() => {
    // Async wrapper keeps the setState calls inside refresh() out
    // of the synchronous effect body — same pattern used elsewhere
    // in the codebase to satisfy react-hooks/set-state-in-effect.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const onChangeStatus = async (id: string, status: string) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        toast.show(t('admin.action_failed'), { tone: 'error' })
        return
      }
      const updated = (await res.json()) as AdminStore
      setStores((list) =>
        (list ?? []).map((s) => (s.id === id ? updated : s)),
      )
      toast.show(t('admin.store_updated'))
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // Featured marketplace toggle. Hits the same admin endpoint the
  // backend gates behind `store.set_featured` — operators without
  // the permission get a 403 (surfaced as the generic action-
  // failed toast). Optimistic local update keeps the toggle snappy.
  const onToggleFeatured = async (id: string, next: boolean) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${id}/featured`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ featured: next }),
      })
      if (!res.ok) {
        toast.show(t('admin.action_failed'), { tone: 'error' })
        return
      }
      const updated = (await res.json()) as AdminStore
      setStores((list) =>
        (list ?? []).map((s) => (s.id === id ? updated : s)),
      )
      toast.show(t('admin.store_updated'))
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.search_stores_ph')}
        className="rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      {stores === null ? (
        <Skeleton className="h-24 w-full" rounded="2xl" />
      ) : stores.length === 0 ? (
        <Empty messageKey="admin.no_stores" />
      ) : (
        <ul className="flex flex-col gap-2">
          {stores.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border p-3.5 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="flex items-center gap-1.5 truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    <span className="min-w-0 truncate">{s.name}</span>
                    {s.featured && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em]"
                        style={{
                          background:
                            'color-mix(in srgb, var(--accent) 18%, transparent)',
                          color: 'var(--accent)',
                        }}
                      >
                        {t('admin.store_featured_chip')}
                      </span>
                    )}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {s.city} · {s.category}
                    {s.plan ? ` · ${s.plan}` : ''}
                    {s.owner ? ` · @${s.owner.qiftUsername}` : ''}
                  </p>
                </div>
                <StoreStatusBadge status={s.status} />
              </div>
              {s.status === 'approved' && (
                // Approved stores get a one-tap into the merchant
                // fulfilment dashboard. Admin-only convenience — the
                // store dashboard itself authenticates separately.
                <p
                  className="mt-2 text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('admin.store_dashboard_link')}: /store-dashboard
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  ['pending', 'approved', 'rejected', 'suspended'] as const
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => void onChangeStatus(s.id, status)}
                    disabled={s.status === status || busy === s.id}
                    className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor:
                        s.status === status
                          ? 'var(--primary)'
                          : 'var(--border)',
                      background:
                        s.status === status
                          ? 'var(--ring)'
                          : 'var(--card-soft)',
                      color:
                        s.status === status
                          ? 'var(--primary)'
                          : 'var(--text-soft)',
                    }}
                  >
                    {t(`admin.store_status_${status}`)}
                  </button>
                ))}
                {/* Featured marketplace toggle — admin curates which
                    stores appear in the /stores Featured rail. Only
                    enabled for approved stores (featuring a
                    pending / rejected store would surface them in
                    a discovery rail before review completed). */}
                <button
                  type="button"
                  onClick={() => void onToggleFeatured(s.id, !s.featured)}
                  disabled={busy === s.id || s.status !== 'approved'}
                  className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: s.featured
                      ? 'transparent'
                      : 'var(--border)',
                    background: s.featured
                      ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'var(--card-soft)',
                    color: s.featured
                      ? 'var(--accent)'
                      : 'var(--text-soft)',
                  }}
                >
                  {s.featured
                    ? t('admin.store_unfeature_cta')
                    : t('admin.store_feature_cta')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StoreStatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const color =
    status === 'approved'
      ? '#3FA46A'
      : status === 'pending'
        ? '#E89B3A'
        : status === 'suspended'
          ? '#D55B6E'
          : 'var(--muted)'
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color,
        background: 'var(--card-soft)',
      }}
    >
      {t(`admin.store_status_${status}`) || status}
    </span>
  )
}

// --- Gifts ---------------------------------------------------------

function GiftsSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [gifts, setGifts] = useState<AdminGift[] | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/gifts`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setGifts([])
          return
        }
        const data = (await res.json()) as AdminGift[]
        if (!cancelled) setGifts(data)
      } catch {
        if (!cancelled) setGifts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  if (gifts === null) return <Skeleton className="h-24 w-full" rounded="2xl" />
  if (gifts.length === 0) return <Empty messageKey="admin.no_gifts" />

  return (
    <ul className="flex flex-col gap-2">
      {gifts.map((g) => (
        <li
          key={g.id}
          className="rounded-2xl border p-3.5 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-bold"
                style={{ color: 'var(--ink)' }}
              >
                {g.productName}
              </p>
              <p
                className="mt-0.5 truncate text-xs"
                style={{ color: 'var(--muted)' }}
              >
                {g.storeName} ·{' '}
                {g.sender ? `@${g.sender.qiftUsername}` : '—'}
                {' → '}
                {g.receiver ? `@${g.receiver.qiftUsername}` : '—'}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-soft)',
                background: 'var(--card-soft)',
              }}
            >
              {t(`gifts.status_${g.status}`) || g.status}
            </span>
          </div>
          <p
            className="mt-2 text-[0.65rem]"
            style={{ color: 'var(--muted-2)' }}
          >
            {new Date(g.createdAt).toLocaleString('ar-SA')}
            {g.isAnonymous && (
              <>
                {' · '}
                <span style={{ color: 'var(--primary)' }}>
                  {t('admin.gift_anonymous')}
                </span>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

// --- Reports -------------------------------------------------------

function ReportsSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const toast = useToast()
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetch(`${API_BASE}/admin/reports`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        setReports([])
        return
      }
      setReports((await res.json()) as AdminReport[])
    } catch {
      setReports([])
    }
  }, [accessToken])

  useEffect(() => {
    // Async wrapper keeps the setState calls inside refresh() out
    // of the synchronous effect body — same pattern used elsewhere
    // in the codebase to satisfy react-hooks/set-state-in-effect.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const onMarkReviewed = async (id: string) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: 'reviewed' }),
      })
      if (!res.ok) {
        toast.show(t('admin.action_failed'), { tone: 'error' })
        return
      }
      const updated = (await res.json()) as { id: string; status: string }
      setReports((list) =>
        (list ?? []).map((r) =>
          r.id === id ? { ...r, status: updated.status } : r,
        ),
      )
      toast.show(t('admin.report_reviewed'))
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (reports === null)
    return <Skeleton className="h-24 w-full" rounded="2xl" />
  if (reports.length === 0) return <Empty messageKey="admin.no_reports" />

  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border p-3.5 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-bold"
                style={{ color: 'var(--ink)' }}
              >
                {t(`profile.report_reason_${r.reason}`) || r.reason}
              </p>
              <p
                className="mt-0.5 truncate text-xs"
                style={{ color: 'var(--muted)' }}
              >
                {t('admin.report_from')}:{' '}
                {r.reporter ? `@${r.reporter.qiftUsername}` : '—'} →{' '}
                {t('admin.report_about')}:{' '}
                {r.reportedUser.qiftUsername
                  ? `@${r.reportedUser.qiftUsername}`
                  : '—'}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
              style={{
                borderColor: 'var(--border)',
                color:
                  r.status === 'open' ? '#E89B3A' : 'var(--text-soft)',
                background: 'var(--card-soft)',
              }}
            >
              {t(`admin.report_status_${r.status}`) || r.status}
            </span>
          </div>
          {r.details && (
            <p
              className="mt-2 text-xs leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {r.details}
            </p>
          )}
          {r.status === 'open' && (
            <button
              type="button"
              onClick={() => void onMarkReviewed(r.id)}
              disabled={busy === r.id}
              className="mt-3 rounded-full border px-3 py-1 text-[0.7rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--primary)',
              }}
            >
              {t('admin.mark_reviewed')}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// --- System --------------------------------------------------------

function SystemSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<AdminSystem | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/system`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        setStatus((await res.json()) as AdminSystem)
      } catch {
        // silent
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  if (!status) return <Skeleton className="h-32 w-full" rounded="2xl" />

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <h3
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('admin.section_counts')}
        </h3>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CountTile
            label={t('admin.count_users')}
            value={status.counts.users}
          />
          <CountTile
            label={t('admin.count_stores')}
            value={status.counts.stores}
          />
          <CountTile
            label={t('admin.count_pending_stores')}
            value={status.counts.pendingStores}
            highlight={status.counts.pendingStores > 0}
          />
          <CountTile
            label={t('admin.count_gifts')}
            value={status.counts.gifts}
          />
          <CountTile
            label={t('admin.count_open_reports')}
            value={status.counts.openReports}
            highlight={status.counts.openReports > 0}
          />
        </ul>
      </Card>

      <Card>
        <h3
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('admin.section_integrations')}
        </h3>
        <ul className="mt-3 flex flex-col gap-1.5">
          <IntegrationRow
            label={t('admin.integ_r2')}
            ok={status.integrations.r2}
          />
          <IntegrationRow
            label={t('admin.integ_push')}
            ok={status.integrations.push}
          />
          <IntegrationRow
            label={t('admin.integ_sms')}
            ok={status.integrations.sms}
          />
          <IntegrationRow
            label={t('admin.integ_merchant_api')}
            ok={status.integrations.merchantApi}
          />
        </ul>
      </Card>

      {/* Merchant API placeholder. The integrations row above already
          shows a 'not configured' chip. This card is the architectural
          stub the future merchant-key / webhook UI will live in — keeping
          it visible (but disabled) telegraphs to ops that the surface
          exists and where it will land. */}
      <Card>
        <h3
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('admin.merchant_api_title')}
        </h3>
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('admin.merchant_api_body')}
        </p>
        <button
          type="button"
          disabled
          className="mt-3 inline-flex cursor-not-allowed items-center rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold opacity-60"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('admin.merchant_api_coming_soon')}
        </button>
      </Card>
    </div>
  )
}

function CountTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <li
      className="rounded-2xl border p-3"
      style={{
        borderColor: highlight
          ? 'color-mix(in srgb, #E89B3A 50%, transparent)'
          : 'var(--border)',
        background: highlight
          ? 'color-mix(in srgb, #E89B3A 10%, var(--surface-2))'
          : 'var(--surface-2)',
      }}
    >
      <p
        className="text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-xl font-extrabold tracking-tight"
        style={{ color: highlight ? '#E89B3A' : 'var(--ink)' }}
      >
        {value}
      </p>
    </li>
  )
}

function IntegrationRow({ label, ok }: { label: string; ok: boolean }) {
  const { t } = useI18n()
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <span
        className="rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold"
        style={{
          borderColor: 'var(--border)',
          color: ok ? '#3FA46A' : 'var(--muted)',
          background: 'var(--card-soft)',
        }}
      >
        {ok ? t('admin.integ_configured') : t('admin.integ_not_configured')}
      </span>
    </li>
  )
}

// --- Shared --------------------------------------------------------

function Empty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border p-5 text-center text-xs"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      {t(messageKey)}
    </div>
  )
}

function AdminSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-20" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <div className="mt-5 -mx-1 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 shrink-0" rounded="full" />
          ))}
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full" rounded="2xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// Top-of-page operational summary. Reads the same /admin/system
// counts the SystemSection pulls — duplicated GET on first load is
// cheap and keeps each section's data fetch logic isolated. We
// surface five tiles so the admin opens the page and immediately
// sees the work that needs attention (open reports, pending
// stores) alongside the passive totals (users, stores, gifts).
function AdminOpsSummary({
  counts,
}: {
  counts: {
    users: number
    stores: number
    pendingStores: number
    gifts: number
    openReports: number
  }
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <AdminKpiTile
        labelKey="admin.kpi_open_reports"
        value={counts.openReports}
        accent="warn"
        emphasised={counts.openReports > 0}
      />
      <AdminKpiTile
        labelKey="admin.kpi_pending_stores"
        value={counts.pendingStores}
        accent="warn"
        emphasised={counts.pendingStores > 0}
      />
      <AdminKpiTile
        labelKey="admin.kpi_users"
        value={counts.users}
        accent="info"
      />
      <AdminKpiTile
        labelKey="admin.kpi_stores"
        value={counts.stores}
        accent="info"
      />
      <AdminKpiTile
        labelKey="admin.kpi_gifts"
        value={counts.gifts}
        accent="ok"
      />
    </div>
  )
}

function AdminKpiTile({
  labelKey,
  value,
  accent,
  emphasised,
}: {
  labelKey: string
  value: number
  accent: 'warn' | 'info' | 'ok'
  emphasised?: boolean
}) {
  const { t } = useI18n()
  const tone = {
    warn: { dot: '#E89B3A', glow: 'rgba(232, 155, 58, 0.18)' },
    info: {
      dot: 'var(--primary)',
      glow: 'color-mix(in srgb, var(--primary) 18%, transparent)',
    },
    ok: { dot: '#3FA46A', glow: 'rgba(63, 164, 106, 0.16)' },
  }[accent]
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: emphasised
          ? `color-mix(in srgb, ${tone.dot} 50%, var(--border))`
          : 'var(--border)',
        background: emphasised
          ? `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 65%)`
          : 'var(--card)',
        boxShadow: emphasised
          ? `0 12px 28px -16px ${tone.glow}`
          : 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone.dot }}
        />
        <span
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--muted)' }}
        >
          {t(labelKey)}
        </span>
      </div>
      <p
        className="mt-2 text-[1.45rem] font-extrabold leading-none tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  )
}

// ── Global ops search ──────────────────────────────────────────────
//
// One input → three result lists (users / stores / gifts) under a
// shared dropdown. Debounced 350ms so typing doesn't fire a request
// per keystroke. Hidden when query is below 2 chars (matches the
// backend's empty-result guard).
type SearchResults = {
  users: AdminUser[]
  stores: AdminStore[]
  gifts: { id: string; productName: string; storeName: string; status: string }[]
}

function AdminGlobalSearch({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const term = q.trim()

  useEffect(() => {
    if (!accessToken || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/admin/search?q=${encodeURIComponent(term)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          },
        )
        if (!res.ok) {
          setResults(null)
        } else {
          setResults((await res.json()) as SearchResults)
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setResults(null)
      } finally {
        setBusy(false)
      }
    }, 350)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [accessToken, term])

  const totalHits =
    (results?.users.length ?? 0) +
    (results?.stores.length ?? 0) +
    (results?.gifts.length ?? 0)

  return (
    <div className="mt-5">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.global_search_ph')}
        className="w-full rounded-2xl border bg-transparent px-4 py-2.5 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      {term.length >= 2 && (
        <div
          className="mt-2 rounded-2xl border p-3 text-[0.78rem]"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {busy ? (
            <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
          ) : totalHits === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {t('admin.global_search_empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {results!.users.length > 0 && (
                <SearchGroup labelKey="admin.section_users">
                  {results!.users.map((u) => (
                    <SearchLine
                      key={u.id}
                      title={`@${u.qiftUsername}`}
                      subtitle={`${u.fullName ?? ''} · ${u.role}`}
                    />
                  ))}
                </SearchGroup>
              )}
              {results!.stores.length > 0 && (
                <SearchGroup labelKey="admin.section_stores">
                  {results!.stores.map((s) => (
                    <SearchLine
                      key={s.id}
                      title={s.name}
                      subtitle={`${s.city} · ${s.status}${s.plan ? ` · ${s.plan}` : ''}`}
                      href={`/stores/${s.id}`}
                    />
                  ))}
                </SearchGroup>
              )}
              {results!.gifts.length > 0 && (
                <SearchGroup labelKey="admin.section_gifts">
                  {results!.gifts.map((g) => (
                    <SearchLine
                      key={g.id}
                      title={g.productName}
                      subtitle={`${g.storeName} · ${g.status}`}
                    />
                  ))}
                </SearchGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SearchGroup({
  labelKey,
  children,
}: {
  labelKey: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div>
      <h3
        className="mb-1 text-[0.62rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {t(labelKey)}
      </h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  )
}

function SearchLine({
  title,
  subtitle,
  href,
}: {
  title: string
  subtitle: string
  href?: string
}) {
  const body = (
    <>
      <p
        className="truncate font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </p>
      <p className="truncate" style={{ color: 'var(--muted)' }}>
        {subtitle}
      </p>
    </>
  )
  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="block rounded-xl border px-3 py-1.5 transition-colors hover:-translate-y-0.5"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card-soft)',
          }}
        >
          {body}
        </Link>
      </li>
    )
  }
  return (
    <li
      className="rounded-xl border px-3 py-1.5"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--card-soft)',
      }}
    >
      {body}
    </li>
  )
}

// ── Team / RBAC management ─────────────────────────────────────────
//
// Per-user ops-role assignment. Lists admins (User.role === 'admin'),
// shows their current ops-role assignments, and lets an operator
// with the `user.assign_ops_role` permission grant / revoke roles.
// The server-side OpsRoleGuard is authoritative — operators without
// the permission see toast errors when they try to mutate.
function TeamSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [admins, setAdmins] = useState<AdminUser[] | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const url = new URL(`${API_BASE}/admin/users`)
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setAdmins([])
          return
        }
        const list = (await res.json()) as AdminUser[]
        setAdmins(list.filter((u) => u.role === 'admin'))
      } catch {
        if (!cancelled) setAdmins([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  if (admins === null) return <Skeleton className="h-24 w-full" rounded="2xl" />
  if (admins.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t('admin.team_empty')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        className="text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.team_intro')}
      </p>
      <ul className="flex flex-col gap-2">
        {admins.map((u) => (
          <TeamMemberCard
            key={u.id}
            user={u}
            accessToken={accessToken}
          />
        ))}
      </ul>
    </div>
  )
}

function TeamMemberCard({
  user,
  accessToken,
}: {
  user: AdminUser
  accessToken: string | null
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [roles, setRoles] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetch(
        `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) {
        setRoles([])
        return
      }
      const list = (await res.json()) as { role: string }[]
      setRoles(list.map((r) => r.role))
    } catch {
      setRoles([])
    }
  }, [accessToken, user.id])

  useEffect(() => {
    // Wrap in IIFE so setState in refresh() doesn't fire
    // synchronously from the effect body.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const onToggle = async (role: string, currentlyOn: boolean) => {
    if (!accessToken || busy) return
    setBusy(true)
    try {
      const url = currentlyOn
        ? `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles/revoke`
        : `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles`
      const res = await fetch(url, {
        method: currentlyOn ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        toast.show(t('admin.action_failed'), { tone: 'error' })
        return
      }
      await refresh()
      toast.show(
        currentlyOn ? t('admin.role_revoked') : t('admin.role_granted'),
      )
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className="rounded-2xl border p-3 backdrop-blur-md"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <p
        className="text-sm font-bold"
        style={{ color: 'var(--ink)' }}
      >
        @{user.qiftUsername}
      </p>
      <p
        className="mt-0.5 text-xs"
        style={{ color: 'var(--muted)' }}
      >
        {user.fullName ?? '—'}
      </p>
      {roles === null ? (
        <Skeleton className="mt-2 h-6 w-full" rounded="full" />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {OPS_ROLES.map((r) => {
            const on = roles.includes(r)
            return (
              <button
                key={r}
                type="button"
                onClick={() => void onToggle(r, on)}
                disabled={busy}
                title={t(`admin.ops_role_${r}_desc`)}
                className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:opacity-60"
                style={{
                  borderColor: on ? 'transparent' : 'var(--border)',
                  background: on
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: on ? '#fff' : 'var(--text-soft)',
                }}
              >
                {t(`admin.ops_role_${r}`)}
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
}

// ── Finance operations ─────────────────────────────────────────────
//
// Per-store payout balance summary + drill-down event log. The
// PayoutEvent table is empty until real settlement work writes to
// it; today balances render as zeros across the board. Operators
// can still record events manually here when an adjustment is
// needed.
type FinanceStoreBalance = {
  storeId: string
  storeName: string
  ownerUsername: string | null
  currency: string
  accrued: number
  held: number
  released: number
  paid: number
  reversed: number
  adjustment: number
  pending: number
  lastEventAt: string | null
}

type FinancePayoutEvent = {
  id: string
  storeId: string
  giftId: string | null
  type: string
  amount: number
  currency: string
  reason: string | null
  recordedBy: string
  occurredAt: string
  createdAt: string
}

function FinanceSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [balances, setBalances] = useState<FinanceStoreBalance[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/finance/stores`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (res.status === 403) {
          setForbidden(true)
          setBalances([])
          return
        }
        if (!res.ok) {
          setBalances([])
          return
        }
        setBalances((await res.json()) as FinanceStoreBalance[])
      } catch {
        if (!cancelled) setBalances([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  if (forbidden) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t('admin.finance_forbidden')}
      </p>
    )
  }
  if (balances === null)
    return <Skeleton className="h-24 w-full" rounded="2xl" />
  if (balances.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t('admin.finance_empty')}
      </p>
    )
  }

  const fmt = (n: number, currency: string) =>
    `${n.toLocaleString('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency || 'SAR'}`

  return (
    <div className="flex flex-col gap-3">
      <p
        className="text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.finance_intro')}
      </p>
      <ul className="flex flex-col gap-2">
        {balances.map((b) => {
          const active = activeStoreId === b.storeId
          return (
            <li
              key={b.storeId}
              className="rounded-2xl border backdrop-blur-md"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <button
                type="button"
                onClick={() =>
                  setActiveStoreId((curr) =>
                    curr === b.storeId ? null : b.storeId,
                  )
                }
                className="flex w-full items-start justify-between gap-3 p-3 text-start"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {b.storeName}
                  </p>
                  <p
                    className="mt-0.5 text-[0.7rem]"
                    style={{ color: 'var(--muted)' }}
                  >
                    {b.ownerUsername ? `@${b.ownerUsername}` : '—'}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p
                    className="text-[0.6rem] font-bold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('admin.finance_pending_label')}
                  </p>
                  <p
                    className="tabular-nums text-base font-extrabold"
                    style={{ color: 'var(--primary)' }}
                  >
                    {fmt(b.pending, b.currency)}
                  </p>
                </div>
              </button>
              {active && (
                <FinanceStoreDetail
                  storeId={b.storeId}
                  accessToken={accessToken}
                  balance={b}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FinanceStoreDetail({
  storeId,
  accessToken,
  balance,
}: {
  storeId: string
  accessToken: string | null
  balance: FinanceStoreBalance
}) {
  const { t } = useI18n()
  const [events, setEvents] = useState<FinancePayoutEvent[] | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/admin/finance/stores/${encodeURIComponent(storeId)}/events`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (cancelled) return
        if (!res.ok) {
          setEvents([])
          return
        }
        setEvents((await res.json()) as FinancePayoutEvent[])
      } catch {
        if (!cancelled) setEvents([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, storeId])

  const fmt = (n: number) =>
    `${n.toLocaleString('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${balance.currency || 'SAR'}`

  return (
    <div
      className="border-t px-3 py-3 text-[0.72rem]"
      style={{ borderColor: 'var(--hairline)' }}
    >
      <dl className="grid grid-cols-2 gap-2">
        {(['accrued', 'held', 'released', 'paid', 'reversed', 'adjustment'] as const).map(
          (k) => (
            <div
              key={k}
              className="rounded-xl border px-2 py-1.5"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-soft)',
              }}
            >
              <dt
                className="text-[0.55rem] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--muted)' }}
              >
                {t(`admin.finance_bucket_${k}`)}
              </dt>
              <dd
                className="mt-0.5 tabular-nums"
                style={{ color: 'var(--ink)' }}
              >
                {fmt(balance[k])}
              </dd>
            </div>
          ),
        )}
      </dl>
      <h4
        className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('admin.finance_events_section')}
      </h4>
      {events === null ? (
        <Skeleton className="mt-2 h-12 w-full" />
      ) : events.length === 0 ? (
        <p className="mt-2" style={{ color: 'var(--muted)' }}>
          {t('admin.finance_no_events')}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-xl border px-3 py-1.5"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-soft)',
              }}
            >
              <span style={{ color: 'var(--ink)' }}>
                {t(`admin.finance_bucket_${e.type}`)}
                {e.reason ? ` · ${e.reason}` : ''}
              </span>
              <span
                className="tabular-nums font-bold"
                style={{ color: 'var(--primary)' }}
              >
                {fmt(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Diagnostics ────────────────────────────────────────────────────
//
// Wraps the backend's GET /admin/debug/latest-merchant-order endpoint
// so admins can read the latest order/gift lineage from inside the
// already-authenticated frontend. This avoids the CORS / cookie-
// scope problem of hitting the API host directly from a browser tab
// signed into the frontend domain.
//
// Privacy: backend returns identifiers + status fields only (no
// recipient address, no message/media, no secrets). The UI mirrors
// that posture — every field rendered below is what the backend
// chose to ship.
//
// State machine:
//   idle      — initial mount; auto-fetch on mount
//   loading   — request in-flight (refresh / mount / merchant filter)
//   ok        — payload rendered
//   error     — fetch failed; render the message + retry button

type DiagnosticsResponse = {
  latestOrder: DiagnosticsOrder | null
  latestGift: DiagnosticsGift | null
  merchantCheck: DiagnosticsMerchantCheck | null
}

type DiagnosticsOrder = {
  id: string
  userId: string
  productId: string | null
  storeId: string | null
  productName: string
  storeName: string
  status: string
  currency: string
  totalAmount: number
  paymentProvider: string
  giftId: string | null
  createdAt: string
}

type DiagnosticsGiftCore = {
  id: string
  productId: string | null
  storeId: string | null
  productName: string
  storeName: string
  status: string
  isAnonymous: boolean
  isSurprise: boolean
  addressId: string | null
  createdAt: string
  confirmedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
}

type DiagnosticsGift = {
  gift: DiagnosticsGiftCore
  order: {
    id: string
    buyerId: string
    productId: string | null
    storeId: string | null
    status: string
    createdAt: string
    storeIdMatchesGift: boolean
    productIdMatchesGift: boolean
  } | null
  product: {
    id: string
    storeId: string
    name: string
    isAvailable: boolean
    stockStatus: string
  } | null
  giftStore: {
    id: string
    name: string
    ownerId: string
    ownerUsername: string | null
    status: string
  } | null
  productStore: {
    id: string
    name: string
    ownerId: string
    ownerUsername: string | null
    status: string
  } | null
  merchant: { userId: string; qiftUsername: string } | null
  verdict: {
    wouldShowOnMerchantDashboard: boolean
    reason:
      | 'ok'
      | 'gift_storeId_null'
      | 'gift_store_not_found'
      | 'status_excluded'
    explain: string
  }
}

type DiagnosticsMerchantCheck = {
  username: string
  found: boolean
  role: string | null
  hasStoreRole: boolean
  ownedStoreCount: number
  ownsLatestGiftStore: boolean
  ownedStores?: { id: string; name: string; status: string }[]
  note: string
}

function DiagnosticsSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [data, setData] = useState<DiagnosticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [merchantInput, setMerchantInput] = useState('')

  // Stable fetch closure — captures the current merchantInput at
  // call time so a refresh tap re-uses whatever the user typed
  // last. Failure is non-fatal: the panel renders an error card
  // and lets the user retry without losing the input.
  const refresh = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${API_BASE}/admin/debug/latest-merchant-order`)
      const m = merchantInput.trim()
      if (m) url.searchParams.set('merchant', m)
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        // Surface 4xx/5xx with a stable code-or-message payload so
        // the operator can tell "no data yet" from "auth wrong".
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[]
        } | null
        const raw = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message ?? `HTTP ${res.status}`
        setError(typeof raw === 'string' ? raw : `HTTP ${res.status}`)
        setData(null)
        return
      }
      const json = (await res.json()) as DiagnosticsResponse
      setData(json)
    } catch (err) {
      setError((err as Error).message || 'network_error')
    } finally {
      setLoading(false)
    }
  }, [accessToken, merchantInput])

  useEffect(() => {
    // Wrap in an async IIFE so the synchronous setState calls inside
    // refresh() don't trip react-hooks/set-state-in-effect — same
    // pattern used by the other admin sections in this file.
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
    // We re-fetch when accessToken changes (login switch); the
    // merchantInput is read at click time, not on every keystroke,
    // so it's intentionally NOT in the deps array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  return (
    <div className="flex flex-col gap-3">
      {/* Deployment / seed status — top of the panel. Tells the
          operator what version is running and whether the
          production DB has the migration applied + the test
          merchants seeded. The "Seed test merchants" button
          (admin-guarded backend endpoint) closes the gap when
          prisma db seed didn't run on deploy. */}
      <DeploymentStatusCard accessToken={accessToken} />

      {/* Toolbar: merchant filter input + refresh button. */}
      <Card>
        <SectionTitle>{t('admin.diag_filter_title')}</SectionTitle>
        <p
          className="mt-1 text-[0.7rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.diag_filter_hint')}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={merchantInput}
            onChange={(e) => setMerchantInput(e.target.value)}
            placeholder={t('admin.diag_merchant_placeholder')}
            dir="ltr"
            className="min-w-0 flex-1 rounded-xl border bg-[var(--card-soft)] px-3 py-2 text-sm font-medium focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="qift-press inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-bold text-white transition-all disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {loading
              ? t('admin.diag_refreshing')
              : t('admin.diag_refresh')}
          </button>
        </div>
      </Card>

      {error && (
        <Card>
          <p className="text-sm font-bold" style={{ color: '#D55B6E' }}>
            {t('admin.diag_error_title')}
          </p>
          <p
            className="mt-1 break-words text-[0.7rem]"
            style={{ color: 'var(--muted)' }}
          >
            {error}
          </p>
        </Card>
      )}

      {loading && !data && (
        <Card>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </Card>
      )}

      {data && (
        <>
          {/* Verdict — top of the panel, biggest visual weight,
              picks tone from the boolean. This is the operator's
              one-line answer. */}
          {data.latestGift && (
            <VerdictCard verdict={data.latestGift.verdict} />
          )}

          {/* Source classification. Tells the operator at a glance
              whether the latest gift came from:
                - real merchant flow      (productId + storeId set)
                - sample/demo storefront  (both null — buyer hit
                                           the demo catalog by
                                           accident; expected
                                           outcome of "merchant
                                           doesn't see this")
                - manual / unlinked       (productId null but
                                           storeId set; admin tooling
                                           or future direct path)
              Derived purely from gift.productId / gift.storeId so
              there's no extra backend round-trip. */}
          {data.latestGift && (
            <SourceClassificationCard
              productId={data.latestGift.gift.productId}
              storeId={data.latestGift.gift.storeId}
            />
          )}

          {/* Latest Order */}
          {data.latestOrder ? (
            <Card>
              <SectionTitle>{t('admin.diag_latest_order')}</SectionTitle>
              <DiagRow label="id" value={data.latestOrder.id} mono />
              <DiagRow
                label="storeId"
                value={data.latestOrder.storeId ?? '(null)'}
                mono
                emphasise={!data.latestOrder.storeId}
              />
              <DiagRow
                label="productId"
                value={data.latestOrder.productId ?? '(null)'}
                mono
              />
              <DiagRow label="status" value={data.latestOrder.status} />
              <DiagRow
                label="giftId"
                value={data.latestOrder.giftId ?? '(null)'}
                mono
              />
              <DiagRow
                label="productName"
                value={data.latestOrder.productName}
              />
              <DiagRow label="storeName" value={data.latestOrder.storeName} />
              <DiagRow
                label="createdAt"
                value={new Date(data.latestOrder.createdAt).toLocaleString()}
              />
            </Card>
          ) : (
            <Card>
              <SectionTitle>{t('admin.diag_latest_order')}</SectionTitle>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {t('admin.diag_no_order')}
              </p>
            </Card>
          )}

          {/* Latest Gift core */}
          {data.latestGift && (
            <Card>
              <SectionTitle>{t('admin.diag_latest_gift')}</SectionTitle>
              <DiagRow label="id" value={data.latestGift.gift.id} mono />
              <DiagRow
                label="storeId"
                value={data.latestGift.gift.storeId ?? '(null)'}
                mono
                emphasise={!data.latestGift.gift.storeId}
              />
              <DiagRow
                label="productId"
                value={data.latestGift.gift.productId ?? '(null)'}
                mono
              />
              <DiagRow label="status" value={data.latestGift.gift.status} />
              <DiagRow
                label="addressId"
                value={data.latestGift.gift.addressId ?? '(null)'}
                mono
              />
              <DiagRow
                label="confirmedAt"
                value={
                  data.latestGift.gift.confirmedAt
                    ? new Date(
                        data.latestGift.gift.confirmedAt,
                      ).toLocaleString()
                    : '—'
                }
              />
            </Card>
          )}

          {/* Product → Store → owner */}
          {data.latestGift?.product && (
            <Card>
              <SectionTitle>{t('admin.diag_product')}</SectionTitle>
              <DiagRow label="id" value={data.latestGift.product.id} mono />
              <DiagRow
                label="storeId"
                value={data.latestGift.product.storeId}
                mono
              />
              <DiagRow label="name" value={data.latestGift.product.name} />
              <DiagRow
                label="isAvailable"
                value={String(data.latestGift.product.isAvailable)}
              />
              <DiagRow
                label="stockStatus"
                value={data.latestGift.product.stockStatus}
              />
            </Card>
          )}

          {data.latestGift?.giftStore && (
            <Card>
              <SectionTitle>{t('admin.diag_gift_store')}</SectionTitle>
              <DiagRow label="id" value={data.latestGift.giftStore.id} mono />
              <DiagRow
                label="ownerId"
                value={data.latestGift.giftStore.ownerId}
                mono
              />
              <DiagRow
                label="ownerUsername"
                value={
                  data.latestGift.giftStore.ownerUsername
                    ? `@${data.latestGift.giftStore.ownerUsername}`
                    : '—'
                }
              />
              <DiagRow label="name" value={data.latestGift.giftStore.name} />
              <DiagRow
                label="status"
                value={data.latestGift.giftStore.status}
              />
            </Card>
          )}

          {/* Drift indicator — render only when productStore differs
              from giftStore. Means someone moved the product between
              stores OR the gift's storeId was drifted away from the
              product's canonical owner. */}
          {data.latestGift?.productStore && (
            <Card>
              <SectionTitle>{t('admin.diag_product_store')}</SectionTitle>
              <p
                className="mb-2 rounded-lg px-2 py-1 text-[0.65rem] font-bold"
                style={{
                  background: 'rgba(232, 155, 58, 0.12)',
                  color: '#E89B3A',
                }}
              >
                ⚠ {t('admin.diag_drift_warning')}
              </p>
              <DiagRow
                label="id"
                value={data.latestGift.productStore.id}
                mono
              />
              <DiagRow
                label="ownerUsername"
                value={
                  data.latestGift.productStore.ownerUsername
                    ? `@${data.latestGift.productStore.ownerUsername}`
                    : '—'
                }
              />
              <DiagRow
                label="name"
                value={data.latestGift.productStore.name}
              />
            </Card>
          )}

          {/* Merchant ownership check — only when ?merchant was
              supplied. Surfaces the 4 failure modes the backend
              encodes in `note`. */}
          {data.merchantCheck && (
            <Card>
              <SectionTitle>{t('admin.diag_merchant_check')}</SectionTitle>
              <DiagRow
                label="username"
                value={`@${data.merchantCheck.username}`}
              />
              <DiagRow
                label="found"
                value={String(data.merchantCheck.found)}
                emphasise={!data.merchantCheck.found}
              />
              <DiagRow
                label="role"
                value={data.merchantCheck.role ?? '(null)'}
                emphasise={!data.merchantCheck.hasStoreRole}
              />
              <DiagRow
                label="ownedStoreCount"
                value={String(data.merchantCheck.ownedStoreCount)}
                emphasise={data.merchantCheck.ownedStoreCount === 0}
              />
              <DiagRow
                label="ownsLatestGiftStore"
                value={String(data.merchantCheck.ownsLatestGiftStore)}
                emphasise={!data.merchantCheck.ownsLatestGiftStore}
              />
              <p
                className="mt-3 text-[0.72rem] leading-relaxed"
                style={{ color: 'var(--text-soft)' }}
              >
                {data.merchantCheck.note}
              </p>
              {data.merchantCheck.ownedStores &&
                data.merchantCheck.ownedStores.length > 0 && (
                  <div
                    className="mt-3 rounded-xl border p-2.5"
                    style={{
                      borderColor: 'var(--hairline)',
                      background: 'var(--card-soft)',
                    }}
                  >
                    <p
                      className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t('admin.diag_owned_stores')}
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {data.merchantCheck.ownedStores.map((s) => (
                        <li
                          key={s.id}
                          className="text-[0.7rem]"
                          style={{ color: 'var(--text)' }}
                        >
                          <span dir="ltr" className="font-mono">
                            {s.id}
                          </span>{' '}
                          · {s.name} · {s.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// Source classification — derived from gift.productId / gift.storeId.
// Three buckets:
//   real_merchant: productId set AND storeId set      (canonical)
//   sample:        productId null AND storeId null    (demo catalog)
//   unlinked:      anything else                      (data drift)
//
// Surfaces the diagnosis in a single line so the operator can
// classify a missing-merchant-order report in under a second.
function SourceClassificationCard({
  productId,
  storeId,
}: {
  productId: string | null
  storeId: string | null
}) {
  const { t } = useI18n()
  let kind: 'real_merchant' | 'sample' | 'unlinked'
  if (productId && storeId) kind = 'real_merchant'
  else if (!productId && !storeId) kind = 'sample'
  else kind = 'unlinked'
  const tone = {
    real_merchant: { color: '#3FA46A', glow: 'rgba(63, 164, 106, 0.12)' },
    sample: { color: '#E89B3A', glow: 'rgba(232, 155, 58, 0.16)' },
    unlinked: { color: '#D55B6E', glow: 'rgba(220, 90, 110, 0.12)' },
  }[kind]
  const labelKey = `admin.diag_source_${kind}`
  const explainKey = `admin.diag_source_${kind}_explain`
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: `color-mix(in srgb, ${tone.color} 35%, var(--border))`,
        background: `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 100%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone.color }}
        />
        <p
          className="text-[0.62rem] font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.diag_source_label')}
        </p>
      </div>
      <p
        className="mt-1 text-sm font-bold"
        style={{ color: 'var(--ink)' }}
      >
        {t(labelKey)}
      </p>
      <p
        className="mt-0.5 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t(explainKey)}
      </p>
    </div>
  )
}

// ── Deployment + seed status ─────────────────────────────────────
//
// Top-of-diagnostics card that answers "is production actually
// running the new code AND has the new data been seeded?". Three
// signals on one card:
//
//   1. Frontend commit (this Vercel build's git SHA)
//        Source: NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, set by Vercel
//        on every build. Falls back to "unknown" in dev.
//
//   2. Backend commit + booted-at (from GET /health)
//        Source: process.env.RAILWAY_GIT_COMMIT_SHA (or others) on
//        the API; we render the short form so the operator can
//        git-log against it.
//
//   3. Schema migration applied + per-merchant seed probe (from
//      GET /admin/debug/seed-status)
//        Tells you whether the merchant-onboarding-v2 columns
//        landed AND whether the two test merchants exist with
//        their stores + products.
//
// The "Seed test merchants" button POSTs to /admin/debug/seed-
// merchants — admin-guarded, idempotent, safe to retry.
type FrontendCommitInfo = { commit: string; commitShort: string }
type BackendHealthInfo = {
  commit: string
  commitShort: string
  bootedAt: string
}
type SeedStatusInfo = {
  migrationApplied: boolean
  missingColumns: string[]
  merchants: {
    username: string
    userExists: boolean
    role: string | null
    phoneMasked: string | null
    ownedStoreCount: number
    productCount: number
    stores: { id: string; name: string; status: string | null }[]
  }[]
}

function readFrontendCommit(): FrontendCommitInfo {
  // Vercel sets this on every build. Other platforms set their
  // own; the fallback chain mirrors what the backend's /health
  // does so the surfaces stay consistent.
  const sha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    ''
  return {
    commit: sha || 'unknown',
    commitShort: sha ? sha.slice(0, 7) : 'unknown',
  }
}

function DeploymentStatusCard({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const [frontend] = useState<FrontendCommitInfo>(() => readFrontendCommit())
  const [backend, setBackend] = useState<BackendHealthInfo | null>(null)
  const [seed, setSeed] = useState<SeedStatusInfo | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    // Health is unauthenticated — anyone can hit it. We still wrap
    // in try/catch because a partial outage might fail the call.
    try {
      const h = await fetch(`${API_BASE}/health`)
      if (h.ok) {
        const j = (await h.json()) as Partial<BackendHealthInfo>
        if (typeof j.commit === 'string') {
          setBackend({
            commit: j.commit,
            commitShort: j.commitShort ?? j.commit.slice(0, 7),
            bootedAt: j.bootedAt ?? '',
          })
        }
      }
    } catch {
      // non-fatal
    }
    if (!accessToken) return
    try {
      const r = await fetch(`${API_BASE}/admin/debug/seed-status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (r.ok) {
        setSeed((await r.json()) as SeedStatusInfo)
      } else {
        setError(`HTTP ${r.status}`)
      }
    } catch (err) {
      setError((err as Error).message || 'network_error')
    }
  }, [accessToken])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await loadAll()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const onSeed = async () => {
    if (!accessToken || seeding) return
    setSeeding(true)
    setSeedResult(null)
    try {
      const r = await fetch(`${API_BASE}/admin/debug/seed-merchants`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as {
        seeded: string[]
        productCount: number
      }
      setSeedResult(
        t('admin.deploy_seed_done')
          .replace('{merchants}', j.seeded.length.toString())
          .replace('{products}', j.productCount.toString()),
      )
      await loadAll()
    } catch (err) {
      setError((err as Error).message || 'seed_failed')
    } finally {
      setSeeding(false)
    }
  }

  const allSeeded =
    !!seed &&
    seed.migrationApplied &&
    seed.merchants.every((m) => m.userExists && m.ownedStoreCount > 0)

  return (
    <Card>
      <SectionTitle>{t('admin.deploy_section_title')}</SectionTitle>
      <div className="mt-3 flex flex-col gap-2">
        <DiagRow
          label={t('admin.deploy_frontend_commit')}
          value={frontend.commitShort}
          mono
          emphasise={frontend.commit === 'unknown'}
        />
        <DiagRow
          label={t('admin.deploy_backend_commit')}
          value={backend?.commitShort ?? '…'}
          mono
          emphasise={!backend || backend.commit === 'unknown'}
        />
        {backend?.bootedAt && (
          <DiagRow
            label={t('admin.deploy_booted_at')}
            value={new Date(backend.bootedAt).toLocaleString()}
          />
        )}
        <DiagRow
          label={t('admin.deploy_migration')}
          value={
            seed
              ? seed.migrationApplied
                ? t('admin.deploy_migration_applied')
                : t('admin.deploy_migration_missing').replace(
                    '{cols}',
                    seed.missingColumns.join(', '),
                  )
              : '…'
          }
          emphasise={!!seed && !seed.migrationApplied}
        />
        {seed?.merchants.map((m) => (
          <div key={m.username} className="flex flex-col gap-1">
            <DiagRow
              label={`@${m.username}`}
              value={
                m.userExists
                  ? t('admin.deploy_merchant_ok')
                      .replace('{stores}', m.ownedStoreCount.toString())
                      .replace('{products}', m.productCount.toString())
                  : t('admin.deploy_merchant_missing')
              }
              emphasise={!m.userExists}
            />
            {m.stores.map((s) => (
              <SeededStoreRow key={s.id} store={s} />
            ))}
          </div>
        ))}
      </div>

      {seedResult && (
        <p
          className="mt-3 rounded-xl border px-3 py-2 text-[0.72rem] leading-relaxed"
          style={{
            borderColor:
              'color-mix(in srgb, #3FA46A 35%, var(--border))',
            background: 'rgba(63, 164, 106, 0.10)',
            color: 'var(--ink)',
          }}
        >
          {seedResult}
        </p>
      )}

      {error && (
        <p
          className="mt-3 break-words text-[0.7rem]"
          style={{ color: '#D55B6E' }}
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void loadAll()}
          className="rounded-xl border px-3 py-2 text-[0.72rem] font-semibold"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('admin.deploy_recheck')}
        </button>
        {!allSeeded && (
          <button
            type="button"
            onClick={() => void onSeed()}
            disabled={seeding}
            className="qift-press flex-1 rounded-xl px-3 py-2 text-[0.72rem] font-bold text-white disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {seeding
              ? t('admin.deploy_seeding')
              : t('admin.deploy_seed_button')}
          </button>
        )}
      </div>
    </Card>
  )
}

// Per-store sub-row inside the deployment panel. Surfaces the
// store status + a clickable public storefront URL so the
// operator can verify customer visibility in one click without
// leaving /admin#diagnostics.
function SeededStoreRow({
  store,
}: {
  store: { id: string; name: string; status: string | null }
}) {
  const { t } = useI18n()
  const isPublic = store.status === 'approved'
  const tone = isPublic ? '#3FA46A' : '#E89B3A'
  const statusLabel = store.status
    ? t(`store.status_${store.status}`)
    : t('admin.deploy_store_status_unknown')
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-[0.7rem]"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--card-soft)',
      }}
    >
      <Link
        href={`/stores/${store.id}`}
        className="min-w-0 truncate font-semibold underline-offset-4 hover:underline"
        style={{ color: 'var(--primary)' }}
      >
        /stores/{store.id}
      </Link>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold"
        style={{
          background: `color-mix(in srgb, ${tone} 18%, transparent)`,
          color: tone,
        }}
      >
        {statusLabel}
      </span>
    </div>
  )
}

function VerdictCard({
  verdict,
}: {
  verdict: DiagnosticsGift['verdict']
}) {
  const { t } = useI18n()
  const ok = verdict.wouldShowOnMerchantDashboard
  const tone = ok
    ? { bg: 'rgba(63, 164, 106, 0.12)', accent: '#3FA46A' }
    : { bg: 'rgba(220, 90, 110, 0.10)', accent: '#D55B6E' }
  return (
    <div
      className="rounded-3xl border p-5 backdrop-blur-md"
      style={{
        borderColor: `color-mix(in srgb, ${tone.accent} 35%, var(--border))`,
        background: `linear-gradient(135deg, ${tone.bg} 0%, var(--card) 100%)`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: tone.accent }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            {ok ? (
              <path d="M5 13l4 4L19 7" />
            ) : (
              <>
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </>
            )}
          </svg>
        </span>
        <h3
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {ok
            ? t('admin.diag_verdict_ok_title')
            : t('admin.diag_verdict_blocked_title')}
        </h3>
      </div>
      <p
        className="mt-2 text-[0.7rem] font-mono uppercase tracking-[0.14em]"
        style={{ color: 'var(--muted)' }}
      >
        {verdict.reason}
      </p>
      <p
        className="mt-1 text-[0.78rem] leading-relaxed"
        style={{ color: 'var(--text)' }}
      >
        {verdict.explain}
      </p>
    </div>
  )
}

// One labelled key/value row inside a diagnostic card. `mono`
// renders the value in a monospaced font (for ids), `emphasise`
// flips the value to a warning hue (used when a value is null /
// false / zero in a context where that's the symptom).
function DiagRow({
  label,
  value,
  mono,
  emphasise,
}: {
  label: string
  value: string
  mono?: boolean
  emphasise?: boolean
}) {
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3">
      <dt
        className="shrink-0 text-[0.65rem] font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </dt>
      <dd
        dir="ltr"
        className={`min-w-0 flex-1 text-end break-all ${mono ? 'font-mono text-[0.7rem]' : 'text-[0.75rem]'} font-medium`}
        style={{
          color: emphasise ? '#D55B6E' : 'var(--text)',
        }}
      >
        {value}
      </dd>
    </div>
  )
}

// Local title — keeps the diagnostics card titles consistent
// without exporting the existing SystemSection helper. Same
// shape used elsewhere in this file's other section components.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[0.78rem] font-bold tracking-[0.14em] uppercase"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </h3>
  )
}
