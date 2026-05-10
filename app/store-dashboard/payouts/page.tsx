'use client'

// Merchant payouts. Mock breakdown today — settlement gateway
// integration is future work. Numbers are calculated from Order
// totals at request time, so the merchant can verify the math
// against their bank statement when real settlement lands.
//
// Privacy: this is the merchant's own data only (StoreGuard
// enforces ownership). No customer-facing surface.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { getStorePayouts, type StorePayouts } from '@/lib/storesApi'

export default function MerchantPayoutsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [data, setData] = useState<StorePayouts | null>(null)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/payouts')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) return
      const r = await getStorePayouts(accessToken)
      if (!cancelled) setData(r)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const fmt = (n: number) =>
    `${n.toLocaleString('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${data?.currency ?? 'ر.س'}`

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('payouts.title_1')}
          gradient={t('payouts.title_2')}
          subtitle={t('payouts.subtitle')}
          size="sm"
        />

        <div className="mt-3">
          <Link
            href="/store-dashboard"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('payouts.back')}
          </Link>
        </div>

        {/* Mock-data disclosure. The dashboard says "estimated"
            until real settlement is wired so the merchant doesn't
            mistake this for an authoritative payout statement. */}
        <p
          className="mt-3 rounded-2xl border px-3 py-2 text-[0.7rem] leading-relaxed"
          style={{
            borderColor:
              'color-mix(in srgb, #E89B3A 30%, var(--border))',
            background:
              'linear-gradient(135deg, rgba(232, 155, 58, 0.08) 0%, var(--card) 100%)',
            color: 'var(--text-soft)',
          }}
        >
          {t('payouts.disclaimer')}
        </p>

        {data === null ? (
          <Card className="mt-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-12 w-full" />
            <Skeleton className="mt-2 h-12 w-full" />
          </Card>
        ) : (
          <>
            {/* Summary block. Net payable is the headline number. */}
            <Card className="mt-4">
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('payouts.net_payable')}
                </span>
                <span
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: 'var(--primary)' }}
                >
                  {fmt(data.netPayable)}
                </span>
              </div>
              <dl className="mt-4 flex flex-col gap-2 text-[0.78rem]">
                <Row
                  label={t('payouts.gross_revenue')}
                  value={fmt(data.grossRevenue)}
                />
                <Row
                  label={`${t('payouts.platform_fees')} (${data.platformFeePercent}%)`}
                  value={`− ${fmt(data.platformFees)}`}
                />
                <Row
                  label={t('payouts.delivery_fees')}
                  value={`− ${fmt(data.deliveryFees)}`}
                />
                <hr style={{ borderColor: 'var(--hairline)' }} />
                <Row
                  label={t('payouts.pending')}
                  value={fmt(data.pending)}
                  bold
                />
                <Row label={t('payouts.paid')} value={fmt(data.paid)} />
              </dl>
            </Card>

            {/* Per-order breakdown — line items the merchant can
                reconcile against bank deposits later. */}
            {data.items.length > 0 && (
              <section className="mt-5">
                <h2
                  className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('payouts.line_items')}
                </h2>
                <ul className="flex flex-col gap-2">
                  {data.items.map((it) => (
                    <li
                      key={it.giftId}
                      className="rounded-2xl border px-3 py-2 text-[0.72rem]"
                      style={{
                        borderColor: 'var(--hairline)',
                        background: 'var(--card)',
                        boxShadow: 'var(--shadow-soft)',
                      }}
                    >
                      <div className="flex items-baseline justify-between">
                        <strong
                          className="min-w-0 truncate font-bold"
                          style={{ color: 'var(--ink)' }}
                        >
                          {it.productName}
                        </strong>
                        <span
                          className="shrink-0 tabular-nums"
                          style={{ color: 'var(--primary)' }}
                        >
                          {fmt(it.net)}
                        </span>
                      </div>
                      <div
                        className="mt-1 flex items-center justify-between"
                        style={{ color: 'var(--muted)' }}
                      >
                        <span>{t(`store.status_${it.status}`)}</span>
                        <span>
                          {t('payouts.gross_short')}: {fmt(it.gross)} ·{' '}
                          {t('payouts.fee_short')}: {fmt(it.platformFee)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>
    </PageContainer>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: 'var(--text-soft)' }}>{label}</dt>
      <dd
        className="tabular-nums"
        style={{
          color: 'var(--ink)',
          fontWeight: bold ? 800 : 600,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
