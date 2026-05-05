'use client'

import Link from 'next/link'
import { useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useI18n } from '@/lib/i18n'
import { EXPLORE_FEED, type ExploreItem } from '@/lib/sampleData'

type Tab = 'public' | 'following'

export default function ExplorePage() {
  const { t } = useI18n()
  const ready = useSimulatedReady(450)
  const [tab, setTab] = useState<Tab>('public')
  const [active, setActive] = useState<ExploreItem | null>(null)

  const items: ExploreItem[] =
    tab === 'public' ? EXPLORE_FEED : EXPLORE_FEED.slice(0, 4)

  if (!ready) return <ExploreSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('explore.badge')}</Badge>}
          line1={t('explore.title_1')}
          gradient={t('explore.title_2')}
          subtitle={t('explore.subtitle')}
          size="sm"
        />

        <div
          className="mt-5 inline-flex w-full items-center rounded-2xl border p-1 backdrop-blur-md sm:w-auto"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          {(['public', 'following'] as Tab[]).map((id) => {
            const isActive = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex-1 rounded-xl px-5 py-2 text-sm transition-all"
                style={{
                  background: isActive ? 'var(--surface)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--text-soft)',
                  fontWeight: isActive ? 700 : 500,
                  boxShadow: isActive ? 'var(--shadow-soft)' : 'none',
                }}
              >
                {t(`explore.tab_${id}`)}
              </button>
            )
          })}
        </div>

        {tab === 'following' && items.length === 0 ? (
          <Empty messageKey="explore.empty_following" />
        ) : items.length === 0 ? (
          <Empty messageKey="explore.empty_public" />
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-1 qift-slide-up">
            {items.map((it) => (
              <Tile key={it.id} item={it} onOpen={() => setActive(it)} />
            ))}
          </ul>
        )}

        {active && (
          <DetailOverlay item={active} onClose={() => setActive(null)} />
        )}
      </section>
    </PageContainer>
  )
}

function Tile({ item, onOpen }: { item: ExploreItem; onOpen: () => void }) {
  const [a, b] = item.gradient.split(',')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group relative block aspect-[4/5] w-full overflow-hidden rounded-lg text-start transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.35) 100%)',
          }}
        />
        {item.kind === 'video' && (
          <span
            aria-hidden
            className="absolute top-1.5 end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
          </span>
        )}
        <span
          className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-[0.65rem] text-white"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)',
          }}
        >
          <span className="block truncate font-bold" dir="ltr">
            @{item.username}
          </span>
          <span className="block truncate opacity-90">{item.caption}</span>
        </span>
      </button>
    </li>
  )
}

function Empty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="mt-6 rounded-3xl border p-8 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t(messageKey)}
      </p>
    </div>
  )
}

function DetailOverlay({
  item,
  onClose,
}: {
  item: ExploreItem
  onClose: () => void
}) {
  const { t } = useI18n()
  const [a, b] = item.gradient.split(',')
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-modal-in w-full max-w-md overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="relative aspect-square w-full"
          style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
        >
          {item.kind === 'video' && (
            <span
              aria-hidden
              className="absolute top-3 end-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M6 4l14 8-14 8V4z" />
              </svg>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.back')}
            className="absolute top-3 start-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              }}
            >
              {item.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-bold"
                style={{ color: 'var(--ink)' }}
              >
                {item.name}
              </h3>
              <p
                className="truncate text-xs"
                style={{ color: 'var(--muted)' }}
                dir="ltr"
              >
                @{item.username}
              </p>
            </div>
            <Link
              href="/profile"
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('explore.view_profile')}
            </Link>
          </div>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {item.caption}
          </p>
        </div>
      </div>
    </div>
  )
}

function ExploreSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-24" rounded="full" />
        <Skeleton className="mt-4 h-9 w-1/2" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />

        <Skeleton className="mt-5 h-11 w-full" rounded="2xl" />

        <div className="mt-4 grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-[4/5]">
              <Skeleton className="h-full w-full" rounded="md" />
            </div>
          ))}
        </div>
      </section>
    </PageContainer>
  )
}
