'use client'

import { useEffect, useState } from 'react'
import GiftPostsGrid from '@/components/GiftPostsGrid'
import GiftPostViewer from '@/components/GiftPostViewer'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  fetchMyGiftPosts,
  fetchUserGiftPosts,
  type BackendGiftPostView,
} from '@/lib/giftPosts'

// Unified gifting-moments surface. Owners on /profile and visitors
// on /u/<username> get the same Instagram-style 3-column grid;
// tapping a tile opens the full-screen GiftPostViewer.
//
// This component replaces the previous "Gift Wall" stacked-card
// list. The terminology shift is intentional — see the profile
// simplification pass. The exported name stays as `GiftWallSection`
// for backwards compatibility with existing imports; the visual
// identity is what changed.
//
// Two modes:
//   - mode="mine"   : owner viewing /profile. Renders all states
//                      (published / unpublished / deactivated).
//   - mode="public" : visitor viewing /u/<username>. Renders only
//                      published + public + active.
//
// Privacy:
//   The viewer payloads come pre-masked from buildGiftPostView on
//   the server. This component never re-derives identity.
//
// V1 scope (do not extend without architecture change):
//   - No pagination — V1 grids fit in one fetch.
//   - No infinite scroll, no virtualization.
//   - No comments / captions on tiles.
export default function GiftWallSection({
  mode,
  targetUserId,
}: {
  mode: 'mine' | 'public'
  targetUserId?: string | null
}) {
  const { t } = useI18n()
  const { accessToken, userId } = useAuth()
  const [posts, setPosts] = useState<BackendGiftPostView[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!cancelled) setLoading(true)
      try {
        if (mode === 'mine') {
          if (!accessToken) {
            if (!cancelled) setPosts([])
            return
          }
          const rows = await fetchMyGiftPosts(accessToken)
          if (!cancelled) setPosts(rows)
        } else {
          if (!targetUserId) {
            if (!cancelled) setPosts([])
            return
          }
          const rows = await fetchUserGiftPosts({
            userId: targetUserId,
            accessToken,
          })
          if (!cancelled) setPosts(rows)
        }
      } catch {
        if (!cancelled) setPosts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, accessToken, targetUserId])

  if (loading) {
    // Loading skeleton — 6 calmer tiles using the same rounded-2xl
    // chrome the live grid uses. We avoid `animate-pulse` (too
    // generic) and route through `qift-skeleton` so the shimmer is
    // consistent with the rest of the app's loading aesthetic.
    return (
      <ul className="mt-3 grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="qift-skeleton aspect-square rounded-2xl" />
        ))}
      </ul>
    )
  }

  if (!posts || posts.length === 0) {
    return (
      <div
        className="qift-fade-in mt-3 overflow-hidden rounded-3xl border p-8 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          color: 'var(--text-soft)',
        }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--accent, var(--primary)) 14%, transparent) 100%)',
          }}
        >
          🎁
        </div>
        <div
          className="mt-4 text-sm font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {mode === 'mine'
            ? t('gift_posts.empty_mine_title')
            : t('gift_posts.empty_public_title')}
        </div>
        <p className="mx-auto mt-1.5 max-w-[22rem] text-xs leading-relaxed">
          {mode === 'mine'
            ? t('gift_posts.empty_mine_body')
            : t('gift_posts.empty_public_body')}
        </p>
      </div>
    )
  }

  return (
    <>
      <GiftPostsGrid posts={posts} onOpen={(i) => setViewerIndex(i)} />
      {viewerIndex !== null && (
        <GiftPostViewer
          posts={posts}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          viewerOwnerUserId={userId}
        />
      )}
    </>
  )
}
