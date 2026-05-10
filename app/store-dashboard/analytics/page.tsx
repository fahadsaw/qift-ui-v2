'use client'

// Merchant analytics — dedicated page.
//
// Pulled out of the main /store-dashboard view so the dashboard
// can stay focused on the operations queue (orders, alerts, quick
// links). The analytics tab in the merchant bottom nav lands here.
//
// PRIVACY: the endpoint returns counts + revenue only; no per-gift
// detail. Authoritative authorization is StoreGuard on the server.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  getStoreAnalytics,
  type StoreAnalytics,
} from '@/lib/storesApi'

export default function MerchantAnalyticsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [data, setData] = useState<StoreAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/analytics')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) return
      const a = await getStoreAnalytics(accessToken)
      if (!cancelled) {
        setData(a)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const fmtMoney = (n: number) =>
    `${Math.round(n).toLocaleString('ar-SA')} ر.س`

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('analytics.title_1')}
          gradient={t('analytics.title_2')}
          subtitle={t('analytics.subtitle')}
          size="sm"
        />

        <div className="mt-3">
          <Link
            href="/store-dashboard"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('analytics.back')}
          </Link>
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" rounded="2xl" />
            ))}
          </div>
        ) : !data ? (
          <Card className="mt-5">
            <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
              {t('analytics.empty')}
            </p>
          </Card>
        ) : (
          <>
            {/* Revenue panel — top group, most operationally
                relevant numbers. */}
            <SectionLabel>{t('analytics.revenue_section')}</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label={t('store.analytics_revenue_today')}
                value={fmtMoney(data.revenue.today)}
                emphasis
              />
              <Metric
                label={t('store.analytics_revenue_week')}
                value={fmtMoney(data.revenue.week)}
              />
              <Metric
                label={t('store.analytics_revenue_month')}
                value={fmtMoney(data.revenue.month)}
              />
              <Metric
                label={t('store.analytics_revenue_total')}
                value={fmtMoney(data.revenue.allTime)}
              />
            </div>

            {/* Volume + quality panel. */}
            <SectionLabel className="mt-6">
              {t('analytics.volume_section')}
            </SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label={t('store.analytics_total_orders')}
                value={data.totalOrders.toLocaleString('ar-SA')}
              />
              <Metric
                label={t('store.analytics_avg_order')}
                value={fmtMoney(data.avgOrderValue)}
              />
              <Metric
                label={t('store.analytics_success_rate')}
                value={
                  data.deliverySuccessRate === null
                    ? '—'
                    : `${data.deliverySuccessRate}%`
                }
              />
              <Metric
                label={t('store.analytics_pending')}
                value={(
                  (data.statusCounts.pending_address ?? 0) +
                  (data.statusCounts.address_confirmed ?? 0) +
                  (data.statusCounts.default_address_used ?? 0)
                ).toLocaleString('ar-SA')}
              />
            </div>

            {/* Per-status breakdown. Always rendered so the
                merchant can see "you have 0 cancellations" at a
                glance. */}
            <SectionLabel className="mt-6">
              {t('analytics.status_section')}
            </SectionLabel>
            <ul className="mt-2 flex flex-col gap-1">
              {(
                [
                  'pending_address',
                  'address_confirmed',
                  'default_address_used',
                  'preparing',
                  'shipped',
                  'delivered',
                  'cancelled',
                ] as const
              ).map((s) => (
                <li
                  key={s}
                  className="flex items-center justify-between rounded-xl border px-3 py-1.5 text-[0.72rem]"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--card-soft)',
                  }}
                >
                  <span style={{ color: 'var(--ink)' }}>
                    {t(`store.status_${s}`)}
                  </span>
                  <span
                    className="tabular-nums font-bold"
                    style={{ color: 'var(--primary)' }}
                  >
                    {(data.statusCounts[s] ?? 0).toLocaleString('ar-SA')}
                  </span>
                </li>
              ))}
            </ul>

            {/* Top products. Omitted when the merchant has no
                completed orders. */}
            {data.topProducts.length > 0 && (
              <>
                <SectionLabel className="mt-6">
                  {t('store.analytics_top_products')}
                </SectionLabel>
                <ul className="mt-2 flex flex-col gap-1">
                  {data.topProducts.map((p) => (
                    <li
                      key={p.productName}
                      className="flex items-center justify-between rounded-xl border px-3 py-1.5 text-[0.78rem]"
                      style={{
                        borderColor: 'var(--hairline)',
                        background: 'var(--card-soft)',
                      }}
                    >
                      <span
                        className="min-w-0 truncate font-semibold"
                        style={{ color: 'var(--ink)' }}
                      >
                        {p.productName}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ color: 'var(--muted)' }}
                      >
                        ×{p.count.toLocaleString('ar-SA')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </PageContainer>
  )
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={`text-[0.7rem] font-bold uppercase tracking-[0.2em] ${
        className ?? ''
      }`}
      style={{ color: 'var(--muted)' }}
    >
      {children}
    </h2>
  )
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-2.5 backdrop-blur-md"
      style={{
        borderColor: emphasis
          ? 'color-mix(in srgb, var(--primary) 35%, var(--border))'
          : 'var(--border)',
        background: emphasis
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, var(--card)) 0%, var(--card) 100%)'
          : 'var(--card)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div
        className="text-[0.6rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-base font-extrabold tabular-nums tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </div>
    </div>
  )
}
