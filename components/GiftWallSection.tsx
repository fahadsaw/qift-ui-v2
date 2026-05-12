'use client'

import { useEffect, useState } from 'react'
import GiftPostCard from '@/components/GiftPostCard'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  fetchMyGiftPosts,
  fetchUserGiftPosts,
  type BackendGiftPostView,
} from '@/lib/giftPosts'

// Gift Wall — the user's published gift posts, rendered as a stack
// of cards.
//
// Two modes:
//   - mode="mine"   : owner viewing /profile. Renders all states
//                      (published / unpublished / deactivated) so the
//                      owner sees what's live and what isn't. Pulls
//                      from GET /gift-posts/mine.
//   - mode="public" : someone viewing /u/<username>. Renders only
//                      published + public + active posts. Pulls from
//                      GET /gift-posts/by-user/:userId. Supports
//                      anonymous viewers (no JWT required).
//
// Empty + loading states are first-class — the empty state copy
// differs per mode (owner sees "no posts yet, share your first
// gift", public viewer sees "this user hasn't shared any gifts yet").
//
// V1 scope (do not extend):
//   - No pagination — V1 walls fit in one fetch. The list endpoint
//     does NOT cap rows; that's a follow-up concern.
//   - No feed-style infinite scroll, no virtualization.
//   - No comments rendered alongside the cards.
export default function GiftWallSection({
  mode,
  targetUserId,
}: {
  mode: 'mine' | 'public'
  // Required in 'public' mode — the backend user id of the wall owner.
  // Pass null and the component renders nothing (prevents an
  // accidental "list everyone's posts" misconfig from leaking).
  targetUserId?: string | null
}) {
  const { t } = useI18n()
  const { accessToken } = useAuth()
  const [posts, setPosts] = useState<BackendGiftPostView[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Reset the loading flag inside the async tick — eslint's
      // react-hooks/set-state-in-effect rule treats the synchronous
      // form as a cascading-render risk, and this pattern matches
      // the convention used elsewhere in the codebase.
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
    return (
      <div className="mt-4 space-y-3">
        <div className="h-24 animate-pulse rounded-3xl bg-gray-200/40" />
        <div className="h-24 animate-pulse rounded-3xl bg-gray-200/40" />
      </div>
    )
  }

  if (!posts || posts.length === 0) {
    return (
      <div
        className="mt-4 rounded-3xl border p-6 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          color: 'var(--text-soft)',
        }}
      >
        <div className="text-2xl" aria-hidden>
          🎁
        </div>
        <div
          className="mt-2 text-sm font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {mode === 'mine'
            ? t('gift_posts.empty_mine_title')
            : t('gift_posts.empty_public_title')}
        </div>
        <p className="mt-1 text-xs leading-relaxed">
          {mode === 'mine'
            ? t('gift_posts.empty_mine_body')
            : t('gift_posts.empty_public_body')}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2">
      {posts.map((post) => (
        <GiftPostCard
          key={post.postId}
          post={post}
          viewerIsOwner={mode === 'mine'}
          linkToSlug
        />
      ))}
    </div>
  )
}
