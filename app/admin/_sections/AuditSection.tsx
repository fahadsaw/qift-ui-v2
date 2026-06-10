'use client'

// Admin → Audit Log viewer (PR 11). Read-only window over the
// persistent AuditLog rows that AuditService writes for every
// state-changing admin action and the self-serve contact changes.
//
// Backed by GET /admin/audit-log (audit.read — super_admin /
// operations_manager / trust_safety). The tab itself is hidden for
// operators without the permission (SECTION_PERMISSION in
// page.tsx), and this component additionally renders a calm
// forbidden state on a 403 so a stale tab can't look broken.
//
// Filters are server-side: exact actor id, action PREFIX (so
// 'admin.store' covers the family), target type. "Load older"
// pages with ?before=<createdAt of the last row> — recency
// browsing, no offset math.
//
// PII note: metadata can carry old/new contact values by design
// (takeover forensics). That is exactly why the route is
// permission-gated; this component renders metadata only inside a
// collapsed <details> so values aren't splashed by default.

import { useCallback, useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'

type AuditRow = {
  id: string
  actorUserId: string | null
  actorType: string
  action: string
  targetType: string
  targetId: string | null
  metadata: unknown
  createdAt: string
}

const TARGET_TYPES = ['', 'user', 'store', 'system'] as const
const PAGE_SIZE = 50

export function AuditSection({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()

  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // True once a page comes back shorter than PAGE_SIZE — there is
  // nothing older to fetch.
  const [exhausted, setExhausted] = useState(false)

  // Draft filters bind to the inputs; applied filters drive the
  // fetch. Split so typing doesn't refetch per keystroke.
  const [draftActor, setDraftActor] = useState('')
  const [draftAction, setDraftAction] = useState('')
  const [draftTarget, setDraftTarget] = useState<string>('')
  const [applied, setApplied] = useState({
    actor: '',
    action: '',
    target: '',
  })

  const fetchPage = useCallback(
    async (before: string | null): Promise<AuditRow[] | 'forbidden' | null> => {
      if (!accessToken) return null
      const params = new URLSearchParams()
      if (applied.actor) params.set('actor', applied.actor)
      if (applied.action) params.set('action', applied.action)
      if (applied.target) params.set('targetType', applied.target)
      if (before) params.set('before', before)
      params.set('take', String(PAGE_SIZE))
      try {
        const res = await fetch(
          `${API_BASE}/admin/audit-log?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (res.status === 403) return 'forbidden'
        if (!res.ok) return null
        const data = (await res.json()) as { rows?: AuditRow[] }
        return Array.isArray(data.rows) ? data.rows : []
      } catch {
        return null
      }
    },
    [accessToken, applied],
  )

  // First page — re-runs whenever the applied filters change. The
  // skeleton/flag RESETS live in onApply (event-driven), not here:
  // the project's react-hooks/set-state-in-effect rule forbids
  // synchronous setState inside effect bodies, and the initial
  // mount already starts from the reset state.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const page = await fetchPage(null)
      if (cancelled) return
      if (page === 'forbidden') {
        setForbidden(true)
        setRows([])
        return
      }
      setRows(page ?? [])
      if (page && page.length < PAGE_SIZE) setExhausted(true)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  const onLoadOlder = async () => {
    if (!rows || rows.length === 0 || loadingMore || exhausted) return
    setLoadingMore(true)
    const page = await fetchPage(rows[rows.length - 1].createdAt)
    if (page && page !== 'forbidden') {
      setRows((prev) => [...(prev ?? []), ...page])
      if (page.length < PAGE_SIZE) setExhausted(true)
    }
    setLoadingMore(false)
  }

  const onApply = (e?: React.FormEvent) => {
    e?.preventDefault()
    // Reset to the skeleton state here (event handler) — the fetch
    // effect above only loads and sets results.
    setRows(null)
    setExhausted(false)
    setForbidden(false)
    setApplied({
      actor: draftActor.trim(),
      action: draftAction.trim(),
      target: draftTarget,
    })
  }

  if (forbidden) {
    return (
      <div
        className="rounded-2xl border px-4 py-5 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--card-soft)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
          {t('admin.audit_forbidden')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.78rem]" style={{ color: 'var(--text-soft)' }}>
        {t('admin.audit_intro')}
      </p>

      {/* ─ Filters ─────────────────────────────────────────────── */}
      <form
        onSubmit={onApply}
        className="flex flex-wrap items-end gap-2 rounded-2xl border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span
            className="text-[0.65rem] font-semibold tracking-[0.12em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.audit_filter_action')}
          </span>
          <input
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
            placeholder="admin.store"
            dir="ltr"
            spellCheck={false}
            className="rounded-xl border bg-transparent px-2.5 py-2 font-mono text-xs focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span
            className="text-[0.65rem] font-semibold tracking-[0.12em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.audit_filter_actor')}
          </span>
          <input
            value={draftActor}
            onChange={(e) => setDraftActor(e.target.value)}
            placeholder="usr_…"
            dir="ltr"
            spellCheck={false}
            className="rounded-xl border bg-transparent px-2.5 py-2 font-mono text-xs focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span
            className="text-[0.65rem] font-semibold tracking-[0.12em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.audit_filter_target')}
          </span>
          <select
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
            className="rounded-xl border bg-transparent px-2.5 py-2 text-xs focus:outline-none"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text)',
              background: 'var(--card)',
            }}
          >
            {TARGET_TYPES.map((tt) => (
              <option key={tt || 'all'} value={tt}>
                {tt === ''
                  ? t('admin.audit_target_all')
                  : t(`admin.audit_target_${tt}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl border px-3.5 py-2 text-xs font-bold"
          style={{
            borderColor: 'color-mix(in srgb, var(--primary) 35%, var(--border))',
            background: 'color-mix(in srgb, var(--primary) 10%, var(--card-soft))',
            color: 'var(--primary)',
          }}
        >
          {t('admin.audit_apply')}
        </button>
      </form>

      {/* ─ Rows ────────────────────────────────────────────────── */}
      {rows === null ? (
        <Skeleton className="h-24 w-full" rounded="2xl" />
      ) : rows.length === 0 ? (
        <div
          className="rounded-2xl border px-4 py-5 text-center"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {t('admin.audit_empty')}
          </p>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.audit_empty_hint')}
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border p-3"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="font-mono text-xs font-bold"
                    dir="ltr"
                    style={{ color: 'var(--primary)' }}
                  >
                    {r.action}
                  </span>
                  <span
                    className="text-[0.65rem] tabular-nums"
                    dir="ltr"
                    style={{ color: 'var(--muted)' }}
                  >
                    {new Date(r.createdAt).toLocaleString('ar-SA')}
                  </span>
                </div>
                <div
                  className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]"
                  style={{ color: 'var(--text-soft)' }}
                >
                  <span>
                    {t('admin.audit_row_actor')}:{' '}
                    <span className="font-mono" dir="ltr">
                      {/* Legacy week2-era rows carry no actor id. */}
                      {r.actorUserId ?? t('admin.audit_actor_unknown')}
                    </span>{' '}
                    ({r.actorType})
                  </span>
                  <span>
                    {t('admin.audit_row_target')}:{' '}
                    <span className="font-mono" dir="ltr">
                      {r.targetType}
                      {r.targetId ? `:${r.targetId}` : ''}
                    </span>
                  </span>
                </div>
                {r.metadata != null && (
                  <details className="mt-1.5">
                    <summary
                      className="cursor-pointer text-[0.68rem] font-semibold"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t('admin.audit_metadata')}
                    </summary>
                    <pre
                      dir="ltr"
                      className="mt-1 overflow-x-auto rounded-xl p-2 text-[0.65rem] leading-relaxed"
                      style={{
                        background: 'var(--surface-2)',
                        color: 'var(--text-soft)',
                      }}
                    >
                      {JSON.stringify(r.metadata, null, 2).slice(0, 2000)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>

          <div className="flex justify-center">
            {exhausted ? (
              <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                {t('admin.audit_no_more')}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void onLoadOlder()}
                disabled={loadingMore}
                className="rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card-soft)',
                  color: 'var(--text-soft)',
                }}
              >
                {loadingMore
                  ? t('admin.audit_loading')
                  : t('admin.audit_load_older')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
