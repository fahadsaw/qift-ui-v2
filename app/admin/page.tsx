'use client'

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

type Section = 'users' | 'stores' | 'gifts' | 'reports' | 'system'

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
  { id: 'system', labelKey: 'admin.section_system' },
]

// Read the URL hash and resolve it to a section id. Used by the
// admin BottomNav tabs to deep-link into /admin#users / #stores /
// #reports etc. without rebuilding the section state machine.
function sectionFromHash(hash: string): Section | null {
  const clean = hash.replace(/^#/, '')
  const known: Section[] = ['users', 'stores', 'gifts', 'reports', 'system']
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
          {section === 'system' && <SystemSection accessToken={accessToken} />}
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
                    className="truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {s.name}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {s.city} · {s.category}
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
