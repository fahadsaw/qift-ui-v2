'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  fetchFollowers,
  fetchFollowing,
  gradientForId,
  initialsFor,
  mockFollowersList,
  mockFollowingList,
  mockSelfFollowersList,
  mockSelfFollowingList,
  type SocialList,
  type SocialUser,
} from '@/lib/social'
import { clearStoresLastDetailHref } from '@/lib/storesNav'

export type SocialTab = 'followers' | 'following'

// Followers / Following list modal. When `userId` is provided, the lists
// are scoped to that user (used by the public profile page). When omitted,
// the modal falls back to the viewer's own user id (used by /profile —
// the API has no /users/me/{followers,following} shorthand, so we resolve
// "self" client-side).
//
// Real API:
//   GET /users/:userId/followers   (qift-platform FollowsModule)
//   GET /users/:userId/following
//
// If we can't reach the API (no token, network failure, non-404 error)
// we fall back to the lib/sampleData mocks so dev still works offline.
// 404 is propagated as an empty list — the row of users for a deleted
// account is meaningfully empty.
export default function SocialListModal({
  initialTab,
  userId,
  onClose,
}: {
  initialTab: SocialTab
  userId?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const { accessToken, userId: viewerId } = useAuth()
  const [active, setActive] = useState<SocialTab>(initialTab)

  const targetUserId = userId ?? viewerId ?? null
  const isSelf = !userId // legacy /profile usage

  // `loading: true` covers the initial fetch (skeleton shown). On tab
  // change or refetch we deliberately do NOT flip back to true — old items
  // remain visible while the new ones load, so there's no skeleton flash
  // mid-session. (Also avoids the react-hooks/set-state-in-effect lint:
  // every state mutation lives inside the async load() callback.)
  const [users, setUsers] = useState<SocialUser[]>([])
  const [loading, setLoading] = useState(!!targetUserId)

  useEffect(() => {
    if (!targetUserId) return
    let cancelled = false

    const load = async () => {
      // Real API path requires a token. Anything that goes wrong (other
      // than the absence of a token, handled below) drops to the mock.
      if (accessToken) {
        try {
          const list: SocialList =
            active === 'followers'
              ? await fetchFollowers(targetUserId)
              : await fetchFollowing(targetUserId)
          if (cancelled) return
          setUsers(list.items)
          setLoading(false)
          return
        } catch (err) {
          console.error(
            '[SocialListModal] API failed, falling back to mock',
            err,
          )
        }
      }

      // Offline / unauthenticated fallback.
      const mock = isSelf
        ? active === 'followers'
          ? mockSelfFollowersList()
          : mockSelfFollowingList()
        : active === 'followers'
          ? mockFollowersList(targetUserId)
          : mockFollowingList(targetUserId)
      if (cancelled) return
      setUsers(mock.items)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [active, targetUserId, accessToken, isSelf])

  const titleKey =
    active === 'followers'
      ? 'profile.social_modal_followers_title'
      : 'profile.social_modal_following_title'

  const emptyKey =
    active === 'followers'
      ? 'profile.social_empty_followers'
      : 'profile.social_empty_following'

  return (
    <ModalShell onClose={onClose}>
      <div
        className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <h3
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t(titleKey)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('profile.close')}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        role="tablist"
        className="flex gap-1.5 border-b px-5 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        {(['followers', 'following'] as SocialTab[]).map((id) => {
          const isActive = id === active
          const labelKey =
            id === 'followers'
              ? 'profile.social_modal_followers_title'
              : 'profile.social_modal_following_title'
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(id)}
              className="rounded-full border px-4 py-1.5 text-xs transition-all duration-300 active:scale-95"
              style={{
                borderColor: isActive ? 'transparent' : 'var(--border)',
                background: isActive
                  ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                  : 'var(--card-soft)',
                color: isActive ? '#fff' : 'var(--text-soft)',
                fontWeight: isActive ? 600 : 500,
                boxShadow: isActive ? 'var(--shadow-soft)' : undefined,
              }}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>

      <div
        key={active}
        className="qift-fade-in max-h-[60vh] overflow-y-auto"
      >
        {loading ? (
          <ListSkeleton />
        ) : users.length === 0 ? (
          <SocialEmpty messageKey={emptyKey} />
        ) : (
          <ul className="flex flex-col gap-1 p-2.5">
            {users.map((u) => (
              <SocialRow key={u.id} user={u} onAfterAction={onClose} />
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}

// Empty state for the followers / following list. Single component
// since both tabs need the same layout — only the message string
// differs (passed via the translation key). Centerpiece bobs gently
// (qift-bob) to feel intentional rather than missing-data.
function SocialEmpty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div className="qift-fade-in flex flex-col items-center px-6 py-10 text-center">
      <span
        aria-hidden
        className="qift-bob flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </span>
      <p
        className="mt-3 text-sm leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t(messageKey)}
      </p>
    </div>
  )
}

function ListSkeleton() {
  // Three rows is enough to suggest "loading" without preempting the real
  // result height. Uses the existing .qift-skeleton shimmer so it matches
  // skeletons elsewhere in the app.
  return (
    <ul className="flex flex-col gap-1 p-2.5">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl p-2.5">
          <div className="qift-skeleton h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="qift-skeleton h-3.5 w-1/2" />
            <div className="qift-skeleton h-3 w-1/3" />
          </div>
          <div
            className="qift-skeleton h-7 w-20"
            style={{ borderRadius: '999px' }}
          />
        </li>
      ))}
    </ul>
  )
}

// Row layout: two sibling buttons (no nested interactive elements). The
// left flex region navigates to the user's public profile; the right
// "Send gift" button enters the gift funnel at /stores?to=<username> —
// you can't actually send a gift before picking a product, so the funnel
// must always start at store browsing. The `to` param threads through
// /stores → /stores/[id] → /send so the recipient stays prefilled.
// Both buttons close the modal first via onAfterAction so the route
// transition is clean.
function SocialRow({
  user,
  onAfterAction,
}: {
  user: SocialUser
  onAfterAction: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [a, b] = gradientForId(user.id).split(',')
  const initials = initialsFor(user.fullName, user.qiftUsername)

  const goProfile = () => {
    onAfterAction()
    router.push(`/u/${encodeURIComponent(user.qiftUsername)}`)
  }

  const goSend = () => {
    onAfterAction()
    // "Send gift" is a fresh funnel start: clear any saved detail-page
    // breadcrumb so /stores doesn't auto-restore a stale detail and
    // skip the list. The new `?to=<user>` is the canonical recipient.
    clearStoresLastDetailHref()
    router.push(`/stores?to=${encodeURIComponent(user.qiftUsername)}`)
  }

  return (
    <li className="flex items-center gap-2 rounded-2xl p-2.5 transition-colors hover:bg-[var(--card-soft)]">
      <button
        type="button"
        onClick={goProfile}
        className="flex flex-1 items-center gap-3 text-start active:scale-[0.99]"
        aria-label={`@${user.qiftUsername}`}
      >
        {user.avatarUrl ? (
          <span
            aria-hidden
            className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full"
            style={{
              background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
            }}
          >
            {initials}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {user.fullName ?? user.qiftUsername}
          </span>
          <span
            className="mt-0.5 block truncate text-xs"
            style={{ color: 'var(--muted)' }}
            dir="ltr"
          >
            @{user.qiftUsername}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={goSend}
        className="shrink-0 rounded-full px-3.5 py-1.5 text-[0.7rem] font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {t('profile.social_send_gift')}
      </button>
    </li>
  )
}

// Local modal shell — Escape close, click-outside, body-scroll-lock,
// dark-glass styling. Mirrors the inline ModalShell used elsewhere in
// the app (kept inline so this component is fully self-contained).
function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="qift-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-modal-in w-full max-w-sm overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
