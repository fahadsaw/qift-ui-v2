'use client'

// Buyer order history (Track A.5 PR 7) — the purchase record, keyed by
// the canonical QP reference the buyer quotes to support. Each row
// links through to the gift's tracking page when a gift exists.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { fetchMyOrders, type OrderSummary } from '@/lib/orders'

const STATUS_TONE: Record<string, string> = {
  paid: 'var(--success, #3dbf7f)',
  pending: 'var(--muted)',
  processing: 'var(--warning, #d9a13b)',
  failed: 'var(--danger, #e05252)',
}

export default function OrdersPage() {
  const { t } = useI18n()
  const { accessToken, isAuthenticated } = useAuth()
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    fetchMyOrders(accessToken)
      .then((rows) => {
        if (!cancelled) setOrders(rows)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('orders.badge')}</Badge>}
          line1={t('orders.title_1')}
          gradient={t('orders.title_2')}
          subtitle={t('orders.subtitle')}
          size="sm"
        />

        {!isAuthenticated ? (
          <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>
            {t('orders.login_required')}
          </p>
        ) : error ? (
          <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>
            {t('orders.load_failed')}
          </p>
        ) : orders === null ? (
          <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>
            {t('orders.loading')}
          </p>
        ) : orders.length === 0 ? (
          <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>
            {t('orders.empty')}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {orders.map((o) => {
              const inner = (
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p
                      dir="ltr"
                      className="select-all font-mono text-sm font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {o.orderNumber}
                    </p>
                    <span
                      className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                      style={{
                        color: STATUS_TONE[o.status] ?? 'var(--muted)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      {t(`orders.status.${o.status}`)}
                    </span>
                  </div>
                  <p
                    className="mt-1.5 truncate text-sm"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {o.productName} — {o.storeName}
                  </p>
                  <div
                    className="mt-1 flex items-center justify-between text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    <span>
                      {new Date(o.createdAt).toLocaleDateString()} · @
                      {o.receiverUsername}
                    </span>
                    <span dir="ltr">
                      {o.totalAmount} {o.currency}
                    </span>
                  </div>
                </div>
              )
              return o.giftId ? (
                <Link
                  key={o.id}
                  href={`/gifts/${o.giftId}`}
                  className="block transition-transform hover:-translate-y-0.5"
                >
                  {inner}
                </Link>
              ) : (
                <div key={o.id}>{inner}</div>
              )
            })}
          </div>
        )}
      </section>
    </PageContainer>
  )
}
