'use client'

import Link from 'next/link'
import GiftPostCard from '@/components/GiftPostCard'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useRoleGate } from '@/lib/useRoleGate'
import type { BackendGiftPostView } from '@/lib/giftPosts'

// Phase-1 operational-UI cleanup: /p/[slug] is the public share
// surface. Merchants + admins URL-pasting in get bounced to their
// dashboards. Anonymous viewers stay (the hook no-ops pre-auth,
// preserving the public share behaviour the SEO render relies on).
const ALLOWED_ROLES = ['user'] as const

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
  useRoleGate(ALLOWED_ROLES)
  const { t } = useI18n()
  const { userId, isAuthenticated } = useAuth()
  const viewerIsOwner = userId !== null && userId === post.ownerUserId

  return (
    <section className="pt-6 pb-10 qift-fade-in">
      {/* Premium hero — small eyebrow, big calm headline, soft
          subhead. No buttons up here: the GiftPostCard below is
          the focal point. */}
      <header className="text-center">
        <span
          className="inline-flex rounded-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.2em]"
          style={{
            color: 'var(--primary)',
            background:
              'color-mix(in srgb, var(--primary) 10%, transparent)',
          }}
        >
          {t('gift_posts.share_eyebrow')}
        </span>
        <h1
          className="mt-4 text-2xl font-extrabold leading-tight sm:text-3xl"
          style={{ color: 'var(--text)' }}
        >
          {t('gift_posts.share_headline')}
        </h1>
        <p
          className="mx-auto mt-2 max-w-sm text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('gift_posts.share_subhead')}
        </p>
      </header>

      <div className="mt-5">
        <GiftPostCard post={post} viewerIsOwner={viewerIsOwner} />
      </div>

      {/* Footer — only render the "join Qift" hint when the viewer
          isn't signed in. Signed-in viewers don't need a register
          CTA; the card itself is the entire experience for them. */}
      {!isAuthenticated && (
        <footer
          className="mt-6 overflow-hidden rounded-3xl border backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="px-5 py-6 text-center">
            <div
              aria-hidden
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
              style={{
                background:
                  'color-mix(in srgb, var(--primary) 12%, transparent)',
              }}
            >
              ✨
            </div>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('gift_posts.share_join_hint')}
            </p>
            <Link
              href="/register"
              className="qift-press mt-4 inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                boxShadow: 'var(--shadow-cta)',
              }}
            >
              {t('gift_posts.share_join_cta')}
              <span aria-hidden className="ms-2">
                →
              </span>
            </Link>
          </div>
        </footer>
      )}
    </section>
  )
}
