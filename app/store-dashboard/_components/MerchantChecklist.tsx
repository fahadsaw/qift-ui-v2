'use client'

// Merchant onboarding checklist (PR 13). One calm card at the top
// of the dashboard answering "what's left before my store is fully
// set up?" with a concrete next action per row.
//
// DATA — all from endpoints that already exist (no new backend):
//   - getOwnerStore       → status, business fields, deliveryZones
//   - listStoreDocuments  → docs uploaded?
//   - listProducts        → products added? (includeUnavailable so a
//                           fully-drafted catalog still counts)
//
// Items + their truth sources:
//   1. review state    — store.status state machine
//   2. business profile— legalEntityName + contactPerson + contactPhone
//                        (collected in onboarding step 2; no edit
//                        surface exists yet, so this row is
//                        state-only — no dead-end CTA)
//   3. documents       — ≥1 StoreDocument row → /store-dashboard/documents
//   4. products        — ≥1 product → /store-dashboard/products
//   5. coverage        — deliveryZones non-empty →
//                        /store-dashboard/coverage. Empty zones fall
//                        back to the legacy single-city matcher, so
//                        we surface it as "default" (warn), not done.
//
// The card hides itself entirely once EVERYTHING is done and the
// store is approved — a completed checklist is noise on a working
// dashboard.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  getOwnerStore,
  listProducts,
  listStoreDocuments,
  type ApiStore,
  type OwnerStore,
} from '@/lib/storesApi'

type ItemState = 'done' | 'todo' | 'waiting' | 'warn'

type ChecklistData = {
  owner: OwnerStore | null
  docCount: number
  productCount: number
}

export function MerchantChecklist({ store }: { store: ApiStore }) {
  const { t } = useI18n()
  const { accessToken } = useAuth()
  const [data, setData] = useState<ChecklistData | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) return
      // Three reads in parallel; each tolerates failure individually
      // (a failed read renders that row as todo rather than hiding
      // the whole card).
      const [owner, docs, products] = await Promise.all([
        getOwnerStore(accessToken, store.id).catch(() => null),
        listStoreDocuments(accessToken, store.id).catch(() => []),
        listProducts(store.id, {
          includeUnavailable: true,
          token: accessToken,
        }).catch(() => []),
      ])
      if (cancelled) return
      setData({
        owner,
        docCount: Array.isArray(docs) ? docs.length : 0,
        productCount: Array.isArray(products) ? products.length : 0,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, store.id])

  if (!accessToken) return null
  if (data === null) {
    return <Skeleton className="h-24 w-full" rounded="2xl" />
  }

  const owner = data.owner
  const status = store.status ?? 'approved'
  const approved = status === 'approved'
  const reviewState: ItemState = approved
    ? 'done'
    : status === 'changes_requested' || status === 'rejected'
      ? 'warn'
      : 'waiting'

  const profileDone = Boolean(
    owner?.legalEntityName?.trim() &&
      owner?.contactPerson?.trim() &&
      owner?.contactPhone?.trim(),
  )
  const zones = Array.isArray(owner?.deliveryZones)
    ? (owner?.deliveryZones as unknown[])
    : []
  const coverageDone = zones.length > 0

  const items: {
    key: string
    state: ItemState
    label: string
    detail: string
    href?: string
    cta?: string
  }[] = [
    {
      key: 'review',
      state: reviewState,
      label: t('merchant.check_review'),
      detail: t(
        approved
          ? 'merchant.check_review_done'
          : reviewState === 'warn'
            ? 'merchant.check_review_action'
            : 'merchant.check_review_waiting',
      ),
      ...(reviewState === 'warn'
        ? {
            href: '/store-dashboard/documents',
            cta: t('merchant.check_docs_cta'),
          }
        : {}),
    },
    {
      key: 'profile',
      state: profileDone ? 'done' : 'todo',
      label: t('merchant.check_profile'),
      detail: t(
        profileDone
          ? 'merchant.check_profile_done'
          : 'merchant.check_profile_todo',
      ),
    },
    {
      key: 'docs',
      state: data.docCount > 0 ? 'done' : 'todo',
      label: t('merchant.check_docs'),
      detail:
        data.docCount > 0
          ? `${t('merchant.check_docs_done')} (${data.docCount})`
          : t('merchant.check_docs_todo'),
      href: '/store-dashboard/documents',
      cta: t('merchant.check_docs_cta'),
    },
    {
      key: 'products',
      state: data.productCount > 0 ? 'done' : 'todo',
      label: t('merchant.check_products'),
      detail:
        data.productCount > 0
          ? `${t('merchant.check_products_done')} (${data.productCount})`
          : t('merchant.check_products_todo'),
      href: `/store-dashboard/products?storeId=${store.id}`,
      cta: t('merchant.check_products_cta'),
    },
    {
      key: 'coverage',
      state: coverageDone ? 'done' : 'warn',
      label: t('merchant.check_coverage'),
      detail: t(
        coverageDone
          ? 'merchant.check_coverage_done'
          : 'merchant.check_coverage_todo',
      ),
      href: '/store-dashboard/coverage',
      cta: t('merchant.check_coverage_cta'),
    },
  ]

  const allDone = items.every((i) => i.state === 'done')
  // Fully set up + approved → the checklist has done its job;
  // disappear rather than decorate.
  if (allDone) return null

  const doneCount = items.filter((i) => i.state === 'done').length

  return (
    <div
      className="mb-4 rounded-2xl border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('merchant.checklist_title')}
        </h2>
        <span
          className="text-[0.68rem] tabular-nums"
          style={{ color: 'var(--muted)' }}
        >
          {doneCount}/{items.length}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5">
            <StateDot state={item.state} />
            <div className="min-w-0 flex-1">
              <p
                className="text-[0.8rem] font-semibold"
                style={{
                  color:
                    item.state === 'done' ? 'var(--muted)' : 'var(--ink)',
                }}
              >
                {item.label}
              </p>
              <p
                className="mt-0.5 text-[0.7rem] leading-relaxed"
                style={{ color: 'var(--muted)' }}
              >
                {item.detail}
              </p>
            </div>
            {item.href && item.state !== 'done' && (
              <Link
                href={item.href}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold"
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--primary) 35%, var(--border))',
                  background:
                    'color-mix(in srgb, var(--primary) 10%, var(--card-soft))',
                  color: 'var(--primary)',
                }}
              >
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StateDot({ state }: { state: ItemState }) {
  const color =
    state === 'done'
      ? 'var(--primary)'
      : state === 'warn'
        ? '#E89B3A'
        : state === 'waiting'
          ? '#7A8CC9'
          : 'var(--muted)'
  return (
    <span
      aria-hidden
      className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold"
      style={{
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
    >
      {state === 'done' ? '✓' : state === 'waiting' ? '…' : '!'}
    </span>
  )
}
