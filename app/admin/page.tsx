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
import {
  type AdminGift,
  type AdminOpsCounts,
  type AdminReport,
  type AdminStore,
  type AdminSystem,
  type AdminUser,
  SECTIONS,
  type Section,
  sectionFromHash,
} from './_types'
import {
  AdminOpsSummary,
  AdminSkeleton,
  Empty,
  RoleBadge,
  StoreStatusBadge,
} from './_components/atoms'
import { DiagRow, SectionTitle } from './_components/diag-atoms'
import { MerchantReviewModal } from './_components/MerchantReviewModal'
import AdminConfirmModal from '@/components/AdminConfirmModal'
import AdminPurgeConfirmModal from '@/components/AdminPurgeConfirmModal'
import { AdminGlobalSearch } from './_sections/GlobalSearch'
import { TeamSection } from './_sections/TeamSection'
import { FinanceSection } from './_sections/FinanceSection'
import { BetaSection } from './_sections/BetaSection'
import { AuditSection } from './_sections/AuditSection'
import { CorporateSection } from './_sections/CorporateSection'
import { BusinessSection } from './_sections/BusinessSection'
import { WorkersSection } from './_sections/WorkersSection'
import { fetchMyOpsAccess } from '@/lib/opsRoles'

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

// Types, Section enum, hash resolver, SECTIONS list — all moved
// to `./_types.ts`. Shared atoms (Empty, AdminSkeleton, KPI tiles,
// RoleBadge, StoreStatusBadge) live in `./_components/atoms`.
// The Search / Team / Finance section bodies live in
// `./_sections/*`.

// PR 10 — permission-aware rendering. `Can` answers "may the
// current operator use this action?" from the SERVER-computed
// permission set (GET /admin/me/ops-roles). Three states:
//   - perms loaded + has(p)      → true (render the control)
//   - perms loaded + !has(p)     → false (hide it)
//   - perms UNKNOWN (fetch
//     failed / old backend)      → true — FAIL OPEN. Hiding a
//     button the operator is actually allowed to use is the worse
//     failure for an ops tool; the backend guards still 403 any
//     real overreach. This is presentation, never authorization.
export type Can = (permission: string) => boolean

// Tabs whose entire surface is useless without a permission. The
// remaining tabs stay visible for every admin (their read surfaces
// are coarse-admin-gated only).
const SECTION_PERMISSION: Partial<Record<Section, string>> = {
  team: 'user.assign_ops_role',
  finance: 'finance.read_payouts',
  beta: 'beta.manage',
  audit: 'audit.read',
  corporate: 'org.review',
  business: 'store.review',
}

export default function AdminPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ready = useSimulatedReady(300)
  const { accessToken, user, isAuthenticated } = useAuth()
  const [section, setSection] = useState<Section>('users')
  const [opsCounts, setOpsCounts] = useState<AdminOpsCounts>(null)
  // null = unknown (still loading or fetch failed) → fail open.
  const [myPerms, setMyPerms] = useState<Set<string> | null>(null)

  const can: Can = useCallback(
    (permission: string) => myPerms === null || myPerms.has(permission),
    [myPerms],
  )

  // Load the viewer's server-computed permission set once. Failure
  // leaves myPerms null — every control stays visible and the
  // backend guards remain the only (real) boundary.
  useEffect(() => {
    if (!accessToken || user?.role !== 'admin') return
    let cancelled = false
    void (async () => {
      const access = await fetchMyOpsAccess(API_BASE, accessToken)
      if (!cancelled && access) setMyPerms(new Set(access.permissions))
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, user?.role])

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
          {SECTIONS.filter((s) => {
            // Hide tabs whose whole surface needs a permission the
            // operator lacks. Unknown perms (null) keep every tab.
            const required = SECTION_PERMISSION[s.id]
            return !required || can(required)
          }).map((s) => {
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
          {section === 'users' && (
            <UsersSection accessToken={accessToken} can={can} />
          )}
          {section === 'stores' && (
            <StoresSection accessToken={accessToken} can={can} />
          )}
          {section === 'gifts' && <GiftsSection accessToken={accessToken} />}
          {section === 'reports' && (
            <ReportsSection accessToken={accessToken} />
          )}
          {section === 'team' && <TeamSection accessToken={accessToken} />}
          {section === 'finance' && (
            <FinanceSection accessToken={accessToken} />
          )}
          {section === 'corporate' && (
            <CorporateSection accessToken={accessToken} />
          )}
          {section === 'business' && (
            <BusinessSection accessToken={accessToken} />
          )}
          {section === 'beta' && <BetaSection accessToken={accessToken} />}
          {section === 'audit' && <AuditSection accessToken={accessToken} />}
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

// Pending admin action target. Tracks which user is staged for a
// destructive operation and which kind, so the confirm modal can
// render the right copy. Null = no action staged. Stored in a
// single state slot so opening Disable for user A and then
// switching to Restore for user B atomically swaps both.
type PendingUserAction =
  | { kind: 'disable'; user: AdminUser }
  | { kind: 'restore'; user: AdminUser }
  // Purge is structurally a separate flow (type-to-confirm modal,
  // dedicated error-code mapping). Keeping it in the same union
  // lets the busy-spinner + close-on-success plumbing stay shared,
  // but the modal rendered for `kind: 'purge'` is
  // <AdminPurgeConfirmModal>, not <AdminConfirmModal>.
  | { kind: 'purge'; user: AdminUser }
  | null

function UsersSection({
  accessToken,
  can,
}: {
  accessToken: string | null
  // Permission-aware rendering (PR 10) — presentation only; the
  // backend re-checks every mutation.
  can: Can
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { user: viewerUser } = useAuth()
  const viewerId = viewerUser?.id ?? null
  const [q, setQ] = useState('')
  // includeDisabled — when on, the GET /admin/users call appends
  // ?includeDisabled=1 so the backend returns soft-deleted rows.
  // Off by default to keep the normal browse view free of disabled
  // noise (matches the backend default).
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingUserAction>(null)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const url = new URL(`${API_BASE}/admin/users`)
      if (q.trim()) url.searchParams.set('q', q.trim())
      if (includeDisabled) url.searchParams.set('includeDisabled', '1')
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
  }, [accessToken, q, includeDisabled])

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

  // Disable + restore share the same backend contract shape (PATCH,
  // empty body, returns the updated AdminUser row). Single helper
  // takes the action name + the success-toast key so the diff
  // between the two flows is just the URL path + the staged
  // PendingUserAction kind.
  const runUserAction = async (
    id: string,
    action: 'disable' | 'restore',
  ) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}/${action}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          code?: string
          message?: string
        } | null
        // 403 — admin lacks the user.suspend or user.restore ops
        // permission. Surface a permission-specific message so the
        // operator knows the action is gated rather than failing.
        //
        // `user_purged_irreversible` is the new backend response
        // (commit backend/user-purge) when a Restore is attempted
        // against a purged row. Surfacing it as its own toast lets
        // the operator know the row is permanently anonymised, not
        // just disabled — disable-vs-purge is a distinction with
        // real consequences for the regulator-facing audit trail.
        const msg =
          res.status === 403
            ? t('admin.user_action_no_permission')
            : data?.code === 'user_not_disabled'
              ? t('admin.user_not_disabled')
              : data?.code === 'user_purged_irreversible'
                ? t('admin.user_purged_irreversible')
                : data?.message || t('admin.action_failed')
        toast.show(msg, { tone: 'error' })
        return
      }
      const updated = (await res.json()) as AdminUser
      // Decide whether the updated row should stay visible in the
      // current list. A disable on an active row with
      // includeDisabled=false should drop it; a restore on a
      // disabled row with includeDisabled=true keeps it visible
      // (now active). The simplest correct merge is: replace the
      // row in place and let the next refresh tidy up — but we
      // also re-fetch so the count + ordering reflect the new
      // state immediately.
      setUsers((list) =>
        (list ?? []).map((u) => (u.id === id ? updated : u)),
      )
      toast.show(
        t(
          action === 'disable'
            ? 'admin.user_disabled_toast'
            : 'admin.user_restored_toast',
        ),
      )
      // Re-fetch in the background so the row visibility matches
      // the includeDisabled gate. Fire-and-forget; the in-place
      // merge above already produced the correct local state.
      void refresh()
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
      setPending(null)
    }
  }

  // Permanent purge — separate from runUserAction because the
  // endpoint takes a body ({ confirmUsername }), has its own
  // error-code surface, and a successful response shape is
  // { id, purgedAt } rather than the full AdminUser row. We
  // synthesise the row update locally from the existing target +
  // the returned purgedAt so the badge swap is instant without a
  // round-trip.
  //
  // Error codes the backend can return for this endpoint:
  //   403 cannot_purge_self          (defensive; the button is
  //                                   hidden on the viewer's row,
  //                                   but a tampered client could
  //                                   reach this)
  //   403 cannot_purge_admin          (target.role === 'admin')
  //   403 permission_denied (RBAC)    (admin lacks user.purge ops
  //                                   permission)
  //   409 user_owns_stores
  //   409 user_has_inflight_gifts
  //   400 confirmation_mismatch
  const runPurgeAction = async (
    id: string,
    confirmUsername: string,
  ) => {
    if (!accessToken || busy) return
    setBusy(id)
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}/purge`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmUsername }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          code?: string
          message?: string
        } | null
        // Map each backend code to a calm, specific toast. The
        // generic message at the end catches both legitimate
        // never-seen-before responses (e.g. 502 from a flaky
        // upstream) and the deliberate-403-without-a-code path
        // (RBAC denial wraps its message inside `message`).
        const code = data?.code ?? ''
        const msg =
          code === 'cannot_purge_self'
            ? t('admin.purge_error_self')
            : code === 'cannot_purge_admin'
              ? t('admin.purge_error_admin')
              : code === 'user_owns_stores'
                ? t('admin.purge_error_owns_stores')
                : code === 'user_has_inflight_gifts'
                  ? t('admin.purge_error_inflight_gifts')
                  : code === 'confirmation_mismatch'
                    ? t('admin.purge_error_confirmation_mismatch')
                    : res.status === 403
                      ? t('admin.user_action_no_permission')
                      : data?.message || t('admin.action_failed')
        toast.show(msg, { tone: 'error' })
        return
      }
      const body = (await res.json()) as { id: string; purgedAt: string }
      // Merge in place. The backend returns { id, purgedAt } only —
      // the row's PII columns have been anonymised server-side, but
      // we don't refetch the AdminUser projection here; instead we
      // stamp the visible chip + dim the actions via the local
      // purgedAt flag and trust the next refresh() to pull the
      // anonymised values for display. The frontend never shows the
      // sentinel phone/username text; the row becomes "Purged
      // account" until the refresh hydrates the tombstone shape.
      setUsers((list) =>
        (list ?? []).map((u) =>
          u.id === id
            ? { ...u, purgedAt: body.purgedAt, deletedAt: body.purgedAt }
            : u,
        ),
      )
      toast.show(t('admin.user_purged_toast'))
      void refresh()
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(null)
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.search_users_ph')}
          className="flex-1 rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        {/* Toggle: surface soft-deleted rows. Off by default so the
            regular browse view stays free of disabled noise. The
            label flips depending on the current state so the tap
            target reads as a switch, not a filter chip. */}
        <button
          type="button"
          onClick={() => setIncludeDisabled((v) => !v)}
          aria-pressed={includeDisabled}
          className="inline-flex h-10 items-center justify-center rounded-xl border px-3 text-[0.72rem] font-semibold transition-colors"
          style={{
            borderColor: includeDisabled
              ? 'color-mix(in srgb, var(--primary) 35%, var(--border))'
              : 'var(--border)',
            background: includeDisabled
              ? 'color-mix(in srgb, var(--primary) 10%, var(--card-soft))'
              : 'var(--card-soft)',
            color: includeDisabled ? 'var(--primary)' : 'var(--text-soft)',
          }}
        >
          {includeDisabled
            ? t('admin.toggle_disabled_on')
            : t('admin.toggle_disabled_off')}
        </button>
      </div>

      {users === null ? (
        <Skeleton className="h-24 w-full" rounded="2xl" />
      ) : users.length === 0 ? (
        <Empty messageKey="admin.no_users" />
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => {
            const isPurged = Boolean(u.purgedAt)
            const isDisabled = Boolean(u.deletedAt) && !isPurged
            const isSelf = viewerId !== null && u.id === viewerId
            // Display strings collapse to "anonymous" labels for
            // purged rows so the operator never sees the
            // `__purged__:<id>` sentinels the backend writes to the
            // @unique columns. The fullName / email columns are
            // already null on the tombstone, so this only really
            // affects qiftUsername + phone.
            const displayName = isPurged
              ? t('admin.purged_display_name')
              : u.fullName?.trim() || u.qiftUsername
            const displaySub = isPurged
              ? t('admin.purged_display_sub')
              : `@${u.qiftUsername} · ${u.phone}${
                  u.email ? ` · ${u.email}` : ''
                }`
            return (
              <li
                key={u.id}
                className="rounded-2xl border p-3.5 backdrop-blur-md"
                style={{
                  // Purged rows get a stronger red treatment than
                  // disabled. Both share the warm-red hue family but
                  // purged is darker + with no opacity dim — the
                  // operator should read it as PERMANENT, not just
                  // "currently inactive."
                  borderColor: isPurged
                    ? 'color-mix(in srgb, #B53349 55%, var(--border))'
                    : isDisabled
                      ? 'color-mix(in srgb, #D55B6E 35%, var(--border))'
                      : 'var(--border)',
                  background: isPurged
                    ? 'color-mix(in srgb, #B53349 10%, var(--card))'
                    : isDisabled
                      ? 'color-mix(in srgb, #D55B6E 6%, var(--card))'
                      : 'var(--card)',
                  // Slight dim so a disabled row reads as muted
                  // without becoming illegible. Purged rows do NOT
                  // dim — they need to be fully readable since the
                  // operator may need to look up the historical
                  // tombstone for an audit follow-up.
                  opacity: isDisabled ? 0.92 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-bold"
                      style={{
                        color: isPurged ? 'var(--muted)' : 'var(--ink)',
                        fontStyle: isPurged ? 'italic' : 'normal',
                      }}
                    >
                      {displayName}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: 'var(--muted)' }}
                      dir={isPurged ? undefined : 'ltr'}
                    >
                      {displaySub}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {!isPurged && <RoleBadge role={u.role} />}
                    {isPurged ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.06em]"
                        style={{
                          background:
                            'color-mix(in srgb, #B53349 18%, transparent)',
                          color: '#B53349',
                        }}
                      >
                        {t('admin.chip_purged')}
                      </span>
                    ) : isDisabled ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.06em]"
                        style={{
                          background:
                            'color-mix(in srgb, #D55B6E 14%, transparent)',
                          color: '#D55B6E',
                        }}
                      >
                        {t('admin.chip_disabled')}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Role pills + Disable/Restore + Purge actions —
                    ALL inert on a purged row. Purge is permanent;
                    showing live action buttons on an anonymised
                    tombstone would suggest the row is salvageable
                    when it isn't. A small hint paragraph replaces
                    the action area instead. */}
                {isPurged ? (
                  <p
                    className="mt-3 text-[0.7rem] leading-relaxed"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('admin.purged_row_hint')}
                  </p>
                ) : (
                  <>
    {/* Role pills. Disabled rows still show them
                        for context but the chips themselves are
                        inert (backend setUserRole rejects
                        deletedAt rows with a 404). Hidden entirely
                        without user.set_role (PR 10). */}
                    {can('user.set_role') && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(['user', 'store', 'admin'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => void onChangeRole(u.id, r)}
                          disabled={
                            u.role === r || busy === u.id || isDisabled
                          }
                          className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            borderColor:
                              u.role === r
                                ? 'var(--primary)'
                                : 'var(--border)',
                            background:
                              u.role === r
                                ? 'var(--ring)'
                                : 'var(--card-soft)',
                            color:
                              u.role === r
                                ? 'var(--primary)'
                                : 'var(--text-soft)',
                          }}
                        >
                          {t(`admin.role_${r}`)}
                        </button>
                      ))}
                    </div>
                    )}

                    {/* Action row. Hidden entirely on the viewer's
                        own row — backend rejects self-disable /
                        self-purge with 403, but hiding the buttons
                        is the upstream UX guarantee. Each action is
                        additionally permission-gated (PR 10). */}
                    {!isSelf && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {isDisabled ? (
                          can('user.restore') && (
                          <button
                            type="button"
                            onClick={() =>
                              setPending({ kind: 'restore', user: u })
                            }
                            disabled={busy === u.id}
                            className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              borderColor:
                                'color-mix(in srgb, var(--primary) 35%, var(--border))',
                              background:
                                'color-mix(in srgb, var(--primary) 10%, var(--card-soft))',
                              color: 'var(--primary)',
                            }}
                          >
                            {t('admin.action_restore')}
                          </button>
                          )
                        ) : (
                          can('user.suspend') && (
                          <button
                            type="button"
                            onClick={() =>
                              setPending({ kind: 'disable', user: u })
                            }
                            disabled={busy === u.id}
                            className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              borderColor:
                                'color-mix(in srgb, #D55B6E 35%, var(--border))',
                              background:
                                'color-mix(in srgb, #D55B6E 8%, var(--card-soft))',
                              color: '#D55B6E',
                            }}
                          >
                            {t('admin.action_disable')}
                          </button>
                          )
                        )}

                        {/* Permanent purge. Available on BOTH active
                            and disabled rows — disable + purge are
                            independent operations (purge doesn't
                            require pre-disable). The button uses a
                            darker red than disable to signal the
                            harder consequence; clicking opens the
                            type-to-confirm modal. super_admin-only
                            permission — hidden for everyone else. */}
                        {can('user.purge') && (
                        <button
                          type="button"
                          onClick={() =>
                            setPending({ kind: 'purge', user: u })
                          }
                          disabled={busy === u.id}
                          className="rounded-full border px-3 py-1 text-[0.7rem] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            borderColor:
                              'color-mix(in srgb, #B53349 50%, var(--border))',
                            background:
                              'color-mix(in srgb, #B53349 12%, var(--card-soft))',
                            color: '#B53349',
                          }}
                        >
                          {t('admin.action_purge')}
                        </button>
                        )}
                      </div>
                    )}

                    {/* Self-row hint. Surfaces the reason the
                        destructive action buttons are missing so an
                        operator viewing their own row doesn't think
                        the UI is broken. */}
                    {isSelf && (
                      <p
                        className="mt-2 text-[0.68rem]"
                        style={{ color: 'var(--muted)' }}
                      >
                        {t('admin.self_row_hint')}
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Disable / Restore — shared two-button confirm. Open only
          when the pending action is disable or restore; the purge
          modal below handles its own kind exclusively so the two
          dialogs never co-exist on screen. */}
      <AdminConfirmModal
        open={pending?.kind === 'disable' || pending?.kind === 'restore'}
        title={
          pending?.kind === 'disable'
            ? t('admin.confirm_disable_title')
            : t('admin.confirm_restore_title')
        }
        body={
          pending && pending.kind !== 'purge' ? (
            <div className="flex flex-col gap-2">
              <p style={{ color: 'var(--text-soft)' }}>
                {pending.kind === 'disable'
                  ? t('admin.confirm_disable_body')
                  : t('admin.confirm_restore_body')}
              </p>
              <p
                className="rounded-xl border px-3 py-2 text-[0.78rem]"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card-soft)',
                  color: 'var(--ink)',
                }}
                dir="ltr"
              >
                @{pending.user.qiftUsername}
                {pending.user.fullName
                  ? ` — ${pending.user.fullName}`
                  : ''}
              </p>
            </div>
          ) : null
        }
        confirmLabel={
          pending?.kind === 'disable'
            ? t('admin.confirm_disable_cta')
            : t('admin.confirm_restore_cta')
        }
        cancelLabel={t('admin.confirm_cancel')}
        tone={pending?.kind === 'disable' ? 'danger' : 'caution'}
        busy={pending !== null && busy === pending.user.id}
        onCancel={() => {
          if (pending !== null && busy === pending.user.id) return
          setPending(null)
        }}
        onConfirm={() => {
          if (!pending || pending.kind === 'purge') return
          void runUserAction(pending.user.id, pending.kind)
        }}
      />

      {/* Permanent purge — type-to-confirm dialog. Owns its own
          input state + 3-second unlock delay (see
          AdminPurgeConfirmModal). Mounted independently of the
          disable/restore modal so the two never share state. */}
      <AdminPurgeConfirmModal
        open={pending?.kind === 'purge'}
        targetUsername={
          pending?.kind === 'purge' ? pending.user.qiftUsername : ''
        }
        targetFullName={
          pending?.kind === 'purge' ? pending.user.fullName : null
        }
        busy={
          pending?.kind === 'purge' && busy === pending.user.id
        }
        onCancel={() => {
          if (pending?.kind === 'purge' && busy === pending.user.id) return
          setPending(null)
        }}
        onConfirm={(confirmUsername) => {
          if (pending?.kind !== 'purge') return
          void runPurgeAction(pending.user.id, confirmUsername)
        }}
      />
    </div>
  )
}


// --- Stores --------------------------------------------------------

function StoresSection({
  accessToken,
  can,
}: {
  accessToken: string | null
  // Permission-aware rendering (PR 10) — presentation only; the
  // backend re-checks every mutation.
  can: Can
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [stores, setStores] = useState<AdminStore[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Active merchant-review modal target. Null = closed. The modal
  // owns its own data-fetch lifecycle; this section only tracks
  // which store id is open and merges the patched row back into
  // the list once the operator saves.
  const [reviewStoreId, setReviewStoreId] = useState<string | null>(null)

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
                {/* Onboarding-v2 review modal. Slice-1 of the
                    operational-UI phase. Surfaces the merchant's
                    full application + uploaded documents + lets the
                    operator approve / reject / request_changes with
                    a reason. The legacy status chips below remain
                    as the "quick override" path for suspended /
                    re-approve cases the v2 review action doesn't
                    cover. */}
                {can('store.review') && (
                <button
                  type="button"
                  onClick={() => setReviewStoreId(s.id)}
                  disabled={busy === s.id}
                  className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: 'var(--primary)',
                    color: 'var(--primary)',
                    background: 'var(--card-soft)',
                  }}
                >
                  {t('admin.store_review_cta')}
                </button>
                )}
                {can('store.set_status') &&
                (
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
                {can('store.set_featured') && (
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
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewStoreId && accessToken && (
        <MerchantReviewModal
          storeId={reviewStoreId}
          accessToken={accessToken}
          onClose={() => setReviewStoreId(null)}
          onReviewed={(updated) => {
            // Merge the patched row back into the list inline so
            // the status chip refreshes without a full refetch.
            setStores((list) =>
              (list ?? []).map((s) => (s.id === updated.id ? updated : s)),
            )
          }}
        />
      )}
    </div>
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
              {r.gift && (
                <p
                  dir="ltr"
                  className="mt-0.5 select-all font-mono text-[0.68rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {r.gift.fulfillmentNumber ?? r.gift.id}
                </p>
              )}
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

      {/* Phase 7 internal-canary console — workers + notification
          operations. Wires the four real /admin/workers/* endpoints
          (status, run-reminders, run-digest, cleanup-stale-claims)
          into a calm operational surface. Everything beyond those
          four endpoints renders as status-only on the readiness
          matrix — no fake buttons. */}
      <WorkersSection accessToken={accessToken} />

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



// Top-of-page operational summary. Reads the same /admin/system
// counts the SystemSection pulls — duplicated GET on first load is
// cheap and keeps each section's data fetch logic isolated. We
// surface five tiles so the admin opens the page and immediately
// sees the work that needs attention (open reports, pending
// stores) alongside the passive totals (users, stores, gifts).


// ── Global ops search ──────────────────────────────────────────────
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

// Local title — keeps the diagnostics card titles consistent
// without exporting the existing SystemSection helper. Same
// shape used elsewhere in this file's other section components.
