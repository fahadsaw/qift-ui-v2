'use client'

// /occasions — owner-facing occasion management surface.
//
// Intentionally calm: a soft heading, an inline "add" CTA, three
// tabs (upcoming / all / past), and a vertical list of OccasionCard
// rows. No counters, no streaks, no engagement chrome. The aim is
// emotional continuity — remembering the people who matter, on
// time — not productivity.
//
// Visibility enforcement, recurrence math, and privacy stay
// server-side. This page consumes the owner-side PublicOccasion
// shape (full year + visibility) via lib/occasions.ts and re-uses
// the same centralised endpoints every other surface will share.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import OccasionCard from '@/components/OccasionCard'
import OccasionEditModal from '@/components/OccasionEditModal'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  deleteOccasion,
  fetchMyOccasions,
  type PublicOccasion,
} from '@/lib/occasions'

type Tab = 'upcoming' | 'all' | 'past'

// Pre-compute the bucketing used by the tab filter. Past = no
// resolvable next-occurrence (a one-off whose date has passed
// AND was logged retroactively). Upcoming = nextOccurrenceAt is
// non-null AND within the next 60 days. All = everything not soft-
// deleted (the backend already filters deactivatedAt).
function bucketFor(o: PublicOccasion): 'upcoming' | 'future' | 'past' {
  if (!o.nextOccurrenceAt) return 'past'
  const nextMs = Date.parse(o.nextOccurrenceAt)
  if (!Number.isFinite(nextMs)) return 'past'
  const horizon = Date.now() + 60 * 24 * 60 * 60 * 1000
  return nextMs <= horizon ? 'upcoming' : 'future'
}

export default function OccasionsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const { isAuthenticated } = useAuth()
  const [items, setItems] = useState<PublicOccasion[] | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PublicOccasion | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      return
    }
    try {
      const data = await fetchMyOccasions()
      setItems(data)
    } catch {
      setItems([])
    }
  }, [isAuthenticated])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Derived view. Sort each tab by next-occurrence ascending so
  // the most-imminent occasion is always on top of upcoming, and
  // the most-recent past row leads the past tab.
  const visible = useMemo(() => {
    if (!items) return null
    const sorted = [...items].sort((a, b) => {
      const aMs = a.nextOccurrenceAt
        ? Date.parse(a.nextOccurrenceAt)
        : Number.POSITIVE_INFINITY
      const bMs = b.nextOccurrenceAt
        ? Date.parse(b.nextOccurrenceAt)
        : Number.POSITIVE_INFINITY
      return aMs - bMs
    })
    if (tab === 'all') return sorted
    if (tab === 'upcoming') {
      return sorted.filter((o) => {
        const b = bucketFor(o)
        return b === 'upcoming' || b === 'future'
      })
    }
    // past
    return sorted.filter((o) => bucketFor(o) === 'past').reverse()
  }, [items, tab])

  const onEdit = (o: PublicOccasion) => {
    setEditing(o)
    setModalOpen(true)
  }

  const onDelete = async (o: PublicOccasion) => {
    if (!window.confirm(t('occasions.delete_confirm'))) return
    // Optimistic remove. Roll back on failure.
    setItems((list) => (list ? list.filter((x) => x.id !== o.id) : list))
    try {
      await deleteOccasion(o.id)
      toast.show(t('occasions.deleted_toast'))
    } catch {
      await refresh()
      toast.show(t('occasions.save_failed'), { tone: 'error' })
    }
  }

  // Counts for the tab labels. Computed against the *full* item
  // list so switching tabs doesn't collapse the counter.
  const counts = useMemo(() => {
    if (!items) return { upcoming: 0, all: 0, past: 0 }
    let upcoming = 0
    let past = 0
    for (const o of items) {
      const b = bucketFor(o)
      if (b === 'past') past += 1
      else upcoming += 1
    }
    return { upcoming, all: items.length, past }
  }, [items])

  return (
    <PageContainer size="md">
      <section className="qift-fade-in pt-5">
        <PageHeading
          badge={<Badge>{t('occasions.badge')}</Badge>}
          line1={t('occasions.title_1')}
          gradient={t('occasions.title_2')}
          subtitle={t('occasions.subtitle')}
          size="sm"
        />

        {!isAuthenticated ? (
          <div
            className="mt-8 rounded-3xl border p-6 text-center"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
            }}
          >
            <p
              className="text-[0.85rem]"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('occasions.empty_body')}
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block rounded-full px-4 py-2 text-[0.8rem] font-semibold text-white"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              }}
            >
              {t('nav.login')}
            </Link>
          </div>
        ) : (
          <>
            {/* Add CTA + tab bar */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <div
                className="inline-flex rounded-2xl border p-1"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--card-soft)',
                }}
                role="tablist"
              >
                {(
                  [
                    { id: 'upcoming', count: counts.upcoming },
                    { id: 'all', count: counts.all },
                    { id: 'past', count: counts.past },
                  ] as const
                ).map((tabDef) => {
                  const active = tab === tabDef.id
                  return (
                    <button
                      key={tabDef.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(tabDef.id)}
                      className="rounded-xl px-3 py-1.5 text-[0.72rem] font-medium transition-colors"
                      style={{
                        background: active ? 'var(--card)' : 'transparent',
                        color: active ? 'var(--ink)' : 'var(--text-soft)',
                        boxShadow: active ? 'var(--shadow-card)' : 'none',
                      }}
                    >
                      {t(`occasions.tab_${tabDef.id}`)}
                      {items && tabDef.count > 0 && (
                        <span
                          className="ms-1.5 text-[0.62rem]"
                          style={{
                            color: active
                              ? 'var(--muted-2)'
                              : 'var(--muted-2)',
                          }}
                        >
                          {tabDef.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setModalOpen(true)
                }}
                className="rounded-full px-4 py-2 text-[0.78rem] font-semibold text-white"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow: 'var(--shadow-cta)',
                }}
              >
                {t('occasions.add_cta')}
              </button>
            </div>

            {/* List */}
            <div className="mt-5 space-y-3">
              {items === null ? (
                <>
                  <Skeleton className="h-24 w-full rounded-3xl" />
                  <Skeleton className="h-24 w-full rounded-3xl" />
                  <Skeleton className="h-24 w-full rounded-3xl" />
                </>
              ) : visible && visible.length > 0 ? (
                visible.map((o) => (
                  <OccasionCard
                    key={o.id}
                    occasion={o}
                    onEdit={onEdit}
                    onDelete={(occ) => void onDelete(occ)}
                  />
                ))
              ) : (
                <div
                  className="rounded-3xl border p-8 text-center"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                  }}
                >
                  <p
                    className="text-[0.9rem] font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {t('occasions.empty_title')}
                  </p>
                  <p
                    className="mt-1 text-[0.78rem]"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {t('occasions.empty_body')}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {modalOpen && (
        <OccasionEditModal
          occasion={editing}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            void refresh()
          }}
        />
      )}
    </PageContainer>
  )
}
