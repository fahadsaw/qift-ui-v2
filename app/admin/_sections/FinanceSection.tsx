'use client'

// Finance operations console — per-store payout balance summary +
// drill-down event log.
//
// Gated server-side by `finance.read_payouts` (read) and
// `finance.record_payout_event` (write). The PayoutEvent table is
// empty until real settlement work writes to it; balances render
// as zeros until then. Operators with the write permission can
// record events manually (UI for that not yet built; endpoint
// exists).

import { useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'

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

export function FinanceSection({
  accessToken,
}: {
  accessToken: string | null
}) {
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
        // Backend #96 (Scope E): the legacy reader is wrapped
        // { legacy, supersededBy, stores } — PayoutEvent is retired
        // as a truth source; this section is historical only.
        const body = (await res.json()) as
          | FinanceStoreBalance[]
          | { legacy: true; stores: FinanceStoreBalance[] }
        setBalances(Array.isArray(body) ? body : body.stores)
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
      {/* FINANCE OPS CONSOLE (PR 1): the authorized daily-operations
          surface lives at /admin/finance-ops; this section is a
          legacy historical view only. */}
      <a
        href="/admin/finance-ops"
        className="rounded-2xl border px-3 py-2 text-[0.78rem] font-bold underline-offset-4 hover:underline"
        style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
      >
        {t('financeOps.open_console')}
      </a>
      <p
        className="text-[0.7rem]"
        style={{ color: 'var(--muted)' }}
      >
        {t('financeOps.legacy_note')}
      </p>
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
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
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
        {
          const body = (await res.json()) as
            | FinancePayoutEvent[]
            | { legacy: true; events: FinancePayoutEvent[] }
          setEvents(Array.isArray(body) ? body : body.events)
        }
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
        {(
          [
            'accrued',
            'held',
            'released',
            'paid',
            'reversed',
            'adjustment',
          ] as const
        ).map((k) => (
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
        ))}
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
