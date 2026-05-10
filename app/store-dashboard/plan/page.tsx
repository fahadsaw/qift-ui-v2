'use client'

// Merchant plan page.
//
// Informational only — no self-serve upgrade flow today (admins
// assign plans via PATCH /admin/stores/:id/plan). The page exists
// so merchants can see what tier each of their stores is on and
// what's unlocked at each tier, without us having to ship a
// subscription/billing system before the rest of the platform is
// ready.
//
// PRIVACY: each store's plan is private to its owner + admins.
// We never show another merchant's plan.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  listMyStores,
  type ApiStore,
} from '@/lib/storesApi'
import {
  capabilitiesFor,
  MERCHANT_PLANS,
  type MerchantCapability,
  type MerchantPlan,
} from '@/lib/merchantPlans'

// Feature display order on the comparison table. Grouped by
// "core" → "growth" → "enterprise" so the upsell path reads top
// to bottom. Each row resolves the capability against each tier
// via capabilitiesFor() — single source of truth.
const FEATURE_ROWS: { capability: MerchantCapability; key: string }[] = [
  { capability: 'core_storefront', key: 'plan.feature_core_storefront' },
  { capability: 'api_integrations', key: 'plan.feature_api_integrations' },
  { capability: 'shipping_integrations', key: 'plan.feature_shipping_integrations' },
  { capability: 'priority_placement', key: 'plan.feature_priority_placement' },
  { capability: 'campaigns', key: 'plan.feature_campaigns' },
  { capability: 'automation', key: 'plan.feature_automation' },
  { capability: 'advanced_analytics', key: 'plan.feature_advanced_analytics' },
  { capability: 'branded_gifting', key: 'plan.feature_branded_gifting' },
  { capability: 'sla_support', key: 'plan.feature_sla_support' },
  { capability: 'split_payment', key: 'plan.feature_split_payment' },
]

export default function MerchantPlanPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [stores, setStores] = useState<ApiStore[] | null>(null)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/plan')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) return
      const list = await listMyStores(accessToken)
      if (!cancelled) setStores(list)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const capsByPlan = useMemo(
    () =>
      Object.fromEntries(
        MERCHANT_PLANS.map((p) => [p, capabilitiesFor(p)]),
      ) as Record<MerchantPlan, Set<MerchantCapability>>,
    [],
  )

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('plan.title_1')}
          gradient={t('plan.title_2')}
          subtitle={t('plan.subtitle')}
          size="sm"
        />

        <div className="mt-3">
          <Link
            href="/store-dashboard"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('plan.back')}
          </Link>
        </div>

        {/* Each owned store gets a one-line "you're on X" row. We
            don't aggregate — a merchant can have one Pro and one
            Starter store and we want them to see that explicitly. */}
        {stores === null ? (
          <Card className="mt-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-10 w-full" />
          </Card>
        ) : stores.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
              {t('plan.no_stores')}
            </p>
          </Card>
        ) : (
          <Card className="mt-4">
            <h2
              className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('plan.current_plans_label')}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {stores.map((s) => {
                const plan = (s.plan ?? 'starter') as MerchantPlan
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2 text-[0.78rem]"
                    style={{
                      borderColor: 'var(--hairline)',
                      background: 'var(--card-soft)',
                    }}
                  >
                    <span
                      className="min-w-0 truncate font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {s.name}
                    </span>
                    <PlanBadge plan={plan} />
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {/* Feature comparison grid. Three columns (starter / pro /
            enterprise) × FEATURE_ROWS. Read-only — there's no
            "upgrade" button. Copy at the bottom tells the
            merchant how upgrades happen today (contact). */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('plan.comparison_title')}
          </h2>
          <div
            className="rounded-3xl border backdrop-blur-md"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div
              className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-1 border-b px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
            >
              <span>{t('plan.col_feature')}</span>
              {MERCHANT_PLANS.map((p) => (
                <span key={p} className="text-center">
                  {t(`plan.tier_${p}`)}
                </span>
              ))}
            </div>
            <ul>
              {FEATURE_ROWS.map((row) => (
                <li
                  key={row.capability}
                  className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-1 border-b px-3 py-2 text-[0.78rem] last:border-b-0"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  <span
                    className="min-w-0"
                    style={{ color: 'var(--ink)' }}
                  >
                    {t(row.key)}
                  </span>
                  {MERCHANT_PLANS.map((p) => {
                    const has = capsByPlan[p].has(row.capability)
                    return (
                      <span
                        key={p}
                        className="text-center font-bold"
                        style={{
                          color: has ? '#3FA46A' : 'var(--muted)',
                        }}
                      >
                        {has ? '✓' : '—'}
                      </span>
                    )
                  })}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p
          className="mt-4 rounded-2xl border px-3 py-2 text-[0.7rem] leading-relaxed"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('plan.upgrade_note')}
        </p>
      </section>
    </PageContainer>
  )
}

function PlanBadge({ plan }: { plan: MerchantPlan }) {
  const { t } = useI18n()
  const palette =
    plan === 'enterprise'
      ? { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent)' }
      : plan === 'pro'
        ? {
            bg: 'color-mix(in srgb, var(--primary) 14%, transparent)',
            fg: 'var(--primary)',
          }
        : { bg: 'var(--ring)', fg: 'var(--text-soft)' }
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em]"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {t(`plan.tier_${plan}`)}
    </span>
  )
}
