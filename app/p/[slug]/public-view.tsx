'use client'

import Link from 'next/link'
import GiftPostCard from '@/components/GiftPostCard'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { BackendGiftPostView } from '@/lib/giftPosts'

// Client-side view for /p/<slug>. The page.tsx server component
// fetches + handles SEO metadata; this component handles the
// interactive 👍 toggle (only enabled for authenticated viewers
// who don't own the post — the GiftPostCard already enforces).
//
// Why a separate file? The metadata side runs on the server (no
// browser APIs); the 👍 button needs useAuth() + clipboard +
// optimistic state, all of which require the 'use client' tree.
// Splitting keeps the SEO render free of client-only hooks.
export default function GiftPostPublicView({
  post,
}: {
  post: BackendGiftPostView
}) {
  const { t } = useI18n()
  const { userId } = useAuth()
  const viewerIsOwner = userId !== null && userId === post.ownerUserId

  return (
    <section className="pt-5 qift-fade-in">
      <header>
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('gift_posts.share_eyebrow')}
        </p>
        <h1
          className="mt-2 text-2xl font-extrabold leading-tight"
          style={{ color: 'var(--text)' }}
        >
          {t('gift_posts.share_headline')}
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('gift_posts.share_subhead')}
        </p>
      </header>

      <GiftPostCard post={post} viewerIsOwner={viewerIsOwner} />

      <footer
        className="mt-6 rounded-3xl border p-4 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
          {t('gift_posts.share_join_hint')}
        </p>
        <Link
          href="/register"
          className="mt-3 inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold"
          style={{
            background: 'var(--primary)',
            color: '#fff',
            boxShadow: 'var(--shadow-cta)',
          }}
        >
          {t('gift_posts.share_join_cta')}
        </Link>
      </footer>
    </section>
  )
}
