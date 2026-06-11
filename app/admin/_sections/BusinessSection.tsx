'use client'

// Qift Business eligibility queue (B1 admin screen, pre-pilot).
//
// Ops-initiated end to end for the concierge pilot: apply on the
// merchant's behalf (consumer-approved stores only — the backend
// enforces it), then approve / reject / suspend / reinstate per the
// explicit transition table. Business review NEVER touches the
// consumer store status — independence is the whole point of B1.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  applyStoreBusiness,
  listBusinessProfiles,
  reviewStoreBusiness,
  OrgAdminApiError,
  type BusinessProfile,
} from '@/lib/orgAdmin'

const QUEUE_FILTERS = ['applied', 'approved', 'suspended', 'all'] as const

export function BusinessSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]>('applied')
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyStoreId, setApplyStoreId] = useState('')
  const [reasonByStore, setReasonByStore] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!accessToken) return
    try {
      setProfiles(
        await listBusinessProfiles(
          accessToken,
          filter === 'all' ? undefined : filter,
        ),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof OrgAdminApiError ? e.message : 'load_failed')
    }
  }, [accessToken, filter])

  useEffect(() => {
    // False positive: async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof OrgAdminApiError ? e.message : 'request_failed')
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    ({
      borderColor: active
        ? 'color-mix(in srgb, var(--primary) 60%, transparent)'
        : 'var(--border)',
      background: active
        ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
        : 'var(--card)',
      color: active ? 'var(--ink)' : 'var(--text-soft)',
    }) as const

  const actionBtn =
    'rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4">
      {/* ── Apply on behalf (concierge) ── */}
      <div
        className="flex flex-col gap-2 rounded-2xl p-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {t('admin.biz_apply_title')}
        </p>
        <p className="text-[0.7rem]" style={{ color: 'var(--muted-2)' }}>
          {t('admin.biz_apply_help')}
        </p>
        <div className="flex gap-2">
          <input
            value={applyStoreId}
            onChange={(e) => setApplyStoreId(e.target.value)}
            placeholder="store id"
            dir="ltr"
            className="flex-1 rounded-xl border p-2.5 font-mono text-xs"
            style={{
              borderColor: 'var(--border-strong)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="button"
            disabled={busy || !applyStoreId.trim()}
            onClick={() =>
              void run(async () => {
                await applyStoreBusiness(accessToken, applyStoreId.trim())
                setApplyStoreId('')
              })
            }
            className={actionBtn}
            style={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            {t('admin.biz_apply_cta')}
          </button>
        </div>
      </div>

      {/* ── Queue ── */}
      <div className="flex gap-2">
        {QUEUE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={chip(filter === f)}
          >
            {t(`admin.biz_filter_${f}`)}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {t('admin.corp_error')}: {error}
        </p>
      )}
      {profiles === null && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('admin.corp_loading')}
        </p>
      )}
      {profiles?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('admin.biz_empty')}
        </p>
      )}

      {profiles?.map((p) => {
        const reason = reasonByStore[p.storeId] ?? ''
        const setReason = (v: string) =>
          setReasonByStore((m) => ({ ...m, [p.storeId]: v }))
        return (
          <div
            key={p.id}
            className="rounded-2xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {p.store.name}
                </p>
                <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                  {p.store.city} · {t('admin.biz_consumer_status')}:{' '}
                  {p.store.status}
                </p>
                {p.reason && (
                  <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                    {t('admin.corp_last_reason')}: {p.reason}
                  </p>
                )}
              </div>
              <span
                className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                style={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
              >
                {t(`admin.biz_status_${p.status}`)}
              </span>
            </div>

            {(p.status === 'applied' || p.status === 'approved') && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={1}
                placeholder={t('admin.corp_reason_ph')}
                className="mt-3 w-full rounded-xl border p-2.5 text-xs"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                }}
              />
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {p.status === 'applied' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        reviewStoreBusiness(accessToken, p.storeId, 'approve'),
                      )
                    }
                    className={actionBtn}
                    style={{ color: 'var(--success, #3dbf7f)', borderColor: 'var(--border)' }}
                  >
                    {t('admin.corp_approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(() =>
                        reviewStoreBusiness(
                          accessToken,
                          p.storeId,
                          'reject',
                          reason.trim(),
                        ),
                      )
                    }
                    className={actionBtn}
                    style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
                  >
                    {t('admin.corp_reject')}
                  </button>
                </>
              )}
              {p.status === 'approved' && (
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void run(() =>
                      reviewStoreBusiness(
                        accessToken,
                        p.storeId,
                        'suspend',
                        reason.trim(),
                      ),
                    )
                  }
                  className={actionBtn}
                  style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
                >
                  {t('admin.biz_suspend')}
                </button>
              )}
              {p.status === 'suspended' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      reviewStoreBusiness(accessToken, p.storeId, 'reinstate'),
                    )
                  }
                  className={actionBtn}
                  style={{ color: 'var(--success, #3dbf7f)', borderColor: 'var(--border)' }}
                >
                  {t('admin.biz_reinstate')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
