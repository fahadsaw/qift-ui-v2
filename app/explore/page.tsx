'use client'

import { useState } from 'react'
import Badge from '@/components/Badge'
import ExploreViewer from '@/components/ExploreViewer'
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
  // Index into the active feed, or null when the viewer is closed.
  // Holding an index — not the item itself — lets the ExploreViewer
  // walk forward / backward through the same array without the
  // parent re-deriving anything.
  const [openIndex, setOpenIndex] = useState<number | null>(null)

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
            {items.map((it, i) => (
              <Tile key={it.id} item={it} onOpen={() => setOpenIndex(i)} />
            ))}
          </ul>
        )}

        {/* Full-screen vertical viewer. Same swipe / keyboard grammar
            as PostsViewer on /profile — the user opens any tile and
            then swipes up/down through the feed without needing to
            close + re-tap. Replaces the previous centered modal. */}
        {openIndex !== null && items.length > 0 && (
          <ExploreViewer
            items={items}
            index={Math.min(openIndex, items.length - 1)}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(null)}
          />
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
        className="qift-press group relative block aspect-[4/5] w-full overflow-hidden rounded-xl text-start"
        style={{
          background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        }}
      >
        {/* Soft top-down highlight on every tile (not just hover) for
            depth — matches the inner sheen pattern the StoreCard
            poster uses, so the discovery surface and the storefront
            grid feel like they belong to the same family. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 60%)',
          }}
        />
        {/* Bottom vignette behind the caption — replaces the previous
            hover-only fade so the @username + caption are legible at
            rest, not just on pointer-hover (which doesn't exist on
            touch devices). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)',
          }}
        />
        {item.kind === 'video' && (
          <>
            {/* Center vignette so the play badge has contrast against
                any source frame, even bright ones. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.28) 100%)',
              }}
            />
            {/* Centered play badge. Same shape as the PostsGrid +
                PostsViewer affordance: glassy primary-gradient disc
                so "this is a video" reads identically at thumb size,
                grid size, and full-screen size. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow:
                    '0 6px 16px -6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="ms-[1px] h-4 w-4">
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              </span>
            </span>
          </>
        )}
        <span className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-[0.7rem] text-white">
          <span className="block truncate font-bold" dir="ltr">
            @{item.username}
          </span>
          <span className="block truncate opacity-90">{item.caption}</span>
        </span>
      </button>
    </li>
  )
}

// Identity-consistent empty state. Matches the dashed-border +
// gradient-disc + qift-bob language we're now using on the profile
// tabs (Empty in app/profile/page.tsx) so the discovery and profile
// surfaces feel like one app.
function Empty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="qift-fade-in mt-6 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed py-10 px-6 text-center"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="qift-bob flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {/* Compass glyph — discovery semantics. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <circle cx="12" cy="12" r="9" />
          <path d="M16 8l-2 6-6 2 2-6z" fill="currentColor" fillOpacity="0.18" />
        </svg>
      </span>
      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        {t(messageKey)}
      </p>
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
