'use client'

// Operational KPI strip rendered at the top of the merchant
// dashboard. Reads counts from the live orders array — no extra
// fetch — so the strip refreshes in lockstep with the orders
// queue.
//
// The five tiles map to:
//   - pendingRecipient: paid orders awaiting receiver address
//                       (visible-but-inert on the merchant side)
//   - queued:          address resolved, not yet preparing
//   - preparing:       merchant accepted, ship pending
//   - shipped:         in courier hands
//   - delivered (7d):  delivered in the last 7 days from mount

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { StoreOrder } from '../_types'

export function OpsSummary({ orders }: { orders: StoreOrder[] }) {
  // We deliberately don't read `Date.now()` during render directly —
  // react-hooks/purity flags non-idempotent reads even for read-only
  // arithmetic. A useState lazy initializer fires exactly once on
  // mount, gives us a stable cutoff for the 7-day delivered window,
  // and re-renders don't re-evaluate it.
  const [sevenDaysAgo] = useState(
    () => Date.now() - 7 * 24 * 60 * 60 * 1000,
  )
  let pendingRecipient = 0
  let queued = 0
  let preparing = 0
  let shipped = 0
  let delivered = 0
  for (const o of orders) {
    if (o.status === 'pending_address') {
      pendingRecipient += 1
    } else if (
      o.status === 'address_confirmed' ||
      o.status === 'default_address_used'
    ) {
      queued += 1
    } else if (o.status === 'preparing') {
      preparing += 1
    } else if (o.status === 'shipped') {
      shipped += 1
    } else if (o.status === 'delivered') {
      const d = o.shippedAt ? new Date(o.shippedAt).getTime() : 0
      if (d >= sevenDaysAgo) delivered += 1
    }
  }
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <KpiTile
        labelKey="store.kpi_pending_recipient"
        value={pendingRecipient}
        accent="info"
        emphasised={pendingRecipient > 0}
      />
      <KpiTile
        labelKey="store.kpi_queued"
        value={queued}
        accent="warn"
        emphasised={queued > 0}
      />
      <KpiTile labelKey="store.kpi_preparing" value={preparing} accent="info" />
      <KpiTile labelKey="store.kpi_shipped" value={shipped} accent="info" />
      <KpiTile
        labelKey="store.kpi_delivered_7d"
        value={delivered}
        accent="ok"
      />
    </div>
  )
}

function KpiTile({
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
        className="mt-2 text-[1.65rem] font-extrabold leading-none tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  )
}
