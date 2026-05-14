'use client'

import Link from 'next/link'
import { notFound, useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import GiftWallSection from '@/components/GiftWallSection'
import PageContainer from '@/components/PageContainer'
import PublicOccasionsPanel from '@/components/PublicOccasionsPanel'
import SocialListModal, { type SocialTab } from '@/components/SocialListModal'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import {
  fetchPublicProfile,
  fetchUserWishes,
  followUser,
  gradientForId,
  initialsFor,
  isApiNotFound,
  mockPublicProfile,
  mockWishes,
  unfollowUser,
  blockUser,
  reportUser,
  useSectionLoad,
  type PublicPreferences,
  type PublicProfile,
  type PublicWishItem,
  type SectionState,
} from '@/lib/social'
import { clearStoresLastDetailHref } from '@/lib/storesNav'
import PreferencesSection from '@/components/PreferencesSection'
import WishlistProductCard from '@/components/WishlistProductCard'

// Public profile at /u/[username]. Fetches real data from
// GET /users/@/:username when an access token is available; falls back to
// the lib/sampleData mocks when offline or the API is unreachable. A 404
// from the API is authoritative — we don't shadow it with the mock.
//
// Privacy is already enforced at the API layer: stats keys are absent for
// hidden visibility flags, and `profileVisibility === 'private'` ships the
// limited shape (no bio, no stats). The frontend gates rendering by field
// presence rather than re-checking show* booleans.
export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const decoded = useMemo(() => {
    try {
      return decodeURIComponent(username)
    } catch {
      return username
    }
  }, [username])

  const { accessToken } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [status, setStatus] = useState<
    'loading' | 'loaded' | 'not-found'
  >('loading')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setStatus('loading')

      // Real API path: requires a token. A 404 is authoritative; any other
      // failure falls through to the mock so dev still works without an
      // API up.
      if (accessToken) {
        try {
          const data = await fetchPublicProfile(decoded)
          if (!cancelled) {
            setProfile(data)
            setStatus('loaded')
          }
          return
        } catch (err) {
          if (isApiNotFound(err)) {
            if (!cancelled) setStatus('not-found')
            return
          }
          // Network / 5xx / parse error → fall through to mock fallback.
          console.error(
            '[u/[username]] API failed, falling back to mock',
            err,
          )
        }
      }

      // Offline / unauthenticated fallback. Mock returns null when the
      // username doesn't exist in sample data; we treat that as 404.
      const mock = mockPublicProfile(decoded)
      if (cancelled) return
      if (mock) {
        setProfile(mock)
        setStatus('loaded')
      } else {
        setStatus('not-found')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [decoded, accessToken])

  if (status === 'loading') return <ProfileSkeleton />
  if (status === 'not-found') notFound()
  if (!profile) return null

  // key on profile.id so the view remounts when navigating between
  // different users — local follow state re-initialises from the new
  // profile.isFollowing without an extra useEffect resync.
  return profile.profileVisibility === 'private' ? (
    <PrivateProfileView key={profile.id} profile={profile} />
  ) : (
    <PublicProfileView key={profile.id} profile={profile} />
  )
}

function PublicProfileView({ profile }: { profile: PublicProfile }) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()

  // Optimistic follow toggle. Initial state seeded from the API; on any
  // request failure we revert. The component re-mounts (via key=profile.id
  // in the parent) when navigating between users, so this initialiser
  // always sees the freshly-fetched isFollowing — no useEffect resync.
  // Real call sites: POST /follow/:id and DELETE /follow/:id
  // (qift-platform FollowsModule).
  const [following, setFollowing] = useState(profile.isFollowing)
  const [followBusy, setFollowBusy] = useState(false)
  // Session-local follower-count delta. The backend `profile.stats.
  // followers` is the value at page load; every toggle in this
  // session adjusts the delta so the displayed Stat updates
  // immediately. The next page-fetch (refresh, navigation away and
  // back) re-reads the authoritative count from the backend, so the
  // delta is naturally bounded to a single session.
  const [followerDelta, setFollowerDelta] = useState(0)
  // More-actions kebab + Report inline sheet. Inline rather than
  // modal so the page rhythm doesn't shift.
  const [actionsOpen, setActionsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const onToggleFollow = async () => {
    if (followBusy) return
    const next = !following
    setFollowing(next)
    // Optimistic count update — +1 on follow, −1 on unfollow.
    setFollowerDelta((d) => d + (next ? 1 : -1))
    setFollowBusy(true)
    try {
      if (next) {
        await followUser(profile.id)
      } else {
        await unfollowUser(profile.id)
      }
    } catch (err) {
      console.error('[u/[username]] follow toggle failed', err)
      // Revert optimistic update — both following + count.
      setFollowing(!next)
      setFollowerDelta((d) => d - (next ? 1 : -1))
    } finally {
      setFollowBusy(false)
    }
  }

  const [socialTab, setSocialTab] = useState<SocialTab | null>(null)

  // Three-tab gifting-identity layout. /profile has Gifts +
  // Wishlist; the public profile adds Preferences as a third tab
  // so the visitor can see (or learn they're not available) the
  // gift-context signals on demand — preferences no longer take
  // vertical space above the fold.
  //
  // The preferences tab ALWAYS exists, even if the owner has
  // shared nothing. Empty state inside the tab explains why
  // ("This user hasn't shared preferences yet") so visitors
  // understand it's a feature of Qift, not a UI bug.
  // Phase 6.4 — visible occasions are a first-class tab on every
  // public profile. The panel only renders rows the viewer is
  // allowed to see (privacy filter runs server-side in the
  // /users/:userId/occasions endpoint); year is stripped on
  // yearly rows so birth-year inference isn't a leak.
  type Tab = 'gifts' | 'wishlist' | 'occasions' | 'preferences'
  const [tab, setTab] = useState<Tab>('gifts')

  // Wishlist — real API. Pre-gates on profileVisibility because
  // private accounts hide wishes wholesale (matches the backend
  // gate). When the wishes endpoint is forbidden (followers-only
  // and the viewer isn't a follower), the section renders the
  // standard private-section tile.
  const wishes = useSectionLoad<PublicWishItem>({
    shouldFetch: profile.profileVisibility !== 'private',
    fetcher: () => fetchUserWishes(profile.id),
    fallback: () => mockWishes(profile.id),
    deps: [profile.id],
  })

  const initials = initialsFor(profile.fullName, profile.qiftUsername)
  const gradient = gradientForId(profile.id)
  const [a, b] = gradient.split(',')

  // Build the stat list dynamically — each entry is dropped when the
  // server omitted it (privacy). The grid resizes via inline
  // gridTemplateColumns so we don't need JIT-aware grid-cols-N strings.
  type StatItem = {
    key: 'followers' | 'following' | 'sent' | 'received'
    value: number
    labelKey: string
    onClick?: () => void
  }
  const items: StatItem[] = []
  if (profile.stats?.followers !== undefined) {
    items.push({
      key: 'followers',
      // Apply the session-local toggle delta so the count tracks the
      // viewer's follow/unfollow actions immediately. Floor at 0 in
      // case the backend's seed value was already off (cached page).
      value: Math.max(0, profile.stats.followers + followerDelta),
      labelKey: 'profile.followers',
      onClick: () => setSocialTab('followers'),
    })
  }
  if (profile.stats?.following !== undefined) {
    items.push({
      key: 'following',
      value: profile.stats.following,
      labelKey: 'profile.following',
      onClick: () => setSocialTab('following'),
    })
  }
  if (profile.stats?.giftsSent !== undefined) {
    items.push({
      key: 'sent',
      value: profile.stats.giftsSent,
      labelKey: 'profile.gifts_sent',
    })
  }
  if (profile.stats?.giftsReceived !== undefined) {
    items.push({
      key: 'received',
      value: profile.stats.giftsReceived,
      labelKey: 'profile.gifts_received',
    })
  }

  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="flex items-start justify-between gap-3">
          <Badge>{t('profile.public_badge')}</Badge>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t('nav.back')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 rtl:-scale-x-100"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3.5">
          <Avatar
            avatarUrl={profile.avatarUrl}
            initials={initials}
            gradientA={a}
            gradientB={b}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1
              className="text-[1.35rem] font-extrabold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {profile.fullName ?? profile.qiftUsername}
            </h1>
            <p
              className="mt-0.5 text-sm"
              style={{ color: 'var(--muted)' }}
              dir="ltr"
            >
              @{profile.qiftUsername}
            </p>
          </div>
        </div>

        {profile.bio && (
          <p
            className="mt-2.5 text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {profile.bio}
          </p>
        )}

        {/* Stats strip. Hairline-only — no shadow, no card background.
            Profile pages already nest visual hierarchy (header,
            sections); a heavy stats card stacked on top made the
            page read as "dashboard" rather than "person". Premium-
            calm direction: prefer hairlines for tertiary information
            structure. */}
        {items.length > 0 && (
          <div
            className="mt-4 grid"
            style={{
              gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
            }}
          >
            {items.map((s, i) => (
              <PublicStat
                key={s.key}
                value={s.value}
                labelKey={s.labelKey}
                divider={i > 0}
                onClick={s.onClick}
              />
            ))}
          </div>
        )}

        {/* Action row. The PRIMARY action on any other-user profile
            is Send Gift (gradient-filled) — that's Qift's purpose.
            The Follow button is SECONDARY and changes shape based
            on state:
              - Not following: a clean outlined "Follow" CTA (encourages
                the action).
              - Following: a quiet check-mark status pill ("Following")
                that does NOT toggle on tap. Unfollow lives in the "⋯"
                menu so accidental taps can't silently drop the
                relationship.
            This resolves the previous "تتابعه ↔ متابعة silent toggle"
            confusion where the same button surface meant two different
            things and accidentally unfollowed users on a misread. */}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/stores?to=${encodeURIComponent(profile.qiftUsername)}`}
            onClick={clearStoresLastDetailHref}
            className="flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('profile.social_send_gift')}
          </Link>
          {following ? (
            // Quiet "Following" status pill. Inert on tap — the only
            // way to unfollow is through the actions menu. The check
            // glyph + soft primary tint make the state obvious at a
            // glance without competing visually with Send Gift.
            <span
              role="status"
              aria-label={t('profile.following_state')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
              style={{
                background:
                  'color-mix(in srgb, var(--primary) 14%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('profile.following_state')}
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleFollow}
              disabled={followBusy}
              aria-busy={followBusy || undefined}
              className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-70"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            >
              {t('profile.follow')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            aria-label={t('profile.more_actions')}
            aria-expanded={actionsOpen}
            className="shrink-0 rounded-xl border px-3 py-2 text-xs transition-colors active:scale-[0.98]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: 'var(--text-soft)',
            }}
          >
            ⋯
          </button>
        </div>

        {actionsOpen && (
          <div
            className="qift-fade-in mt-2 flex flex-col overflow-hidden rounded-2xl border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
            }}
          >
            {/* Unfollow entry — only visible when currently following.
                Lives in the actions menu (not on the main action row)
                so an accidental tap can't silently drop the
                relationship. Clear "Unfollow" copy, light hairline
                separator beneath, no aggressive confirmation step
                (one tap to undo is the goal). */}
            {following && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    void onToggleFollow()
                  }}
                  className="px-4 py-3 text-start text-sm transition-colors hover:bg-[var(--card-soft)]"
                  style={{ color: 'var(--text)' }}
                >
                  {t('profile.unfollow')}
                </button>
                <div
                  aria-hidden
                  className="h-px"
                  style={{ background: 'var(--hairline)' }}
                />
              </>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(t('profile.block_confirm'))) return
                try {
                  await blockUser(profile.id)
                  toast.show(t('profile.block_done'))
                  setActionsOpen(false)
                  router.replace('/')
                } catch (err) {
                  console.error('[u/[username]] block failed', err)
                  toast.show(t('register.error_toast'), { tone: 'error' })
                }
              }}
              className="px-4 py-3 text-start text-sm transition-colors hover:bg-[var(--card-soft)]"
              style={{ color: '#D55B6E' }}
            >
              {t('profile.block_user')}
            </button>
            <div
              aria-hidden
              className="h-px"
              style={{ background: 'var(--hairline)' }}
            />
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false)
                setReportOpen(true)
              }}
              className="px-4 py-3 text-start text-sm transition-colors hover:bg-[var(--card-soft)]"
              style={{ color: 'var(--text)' }}
            >
              {t('profile.report_user')}
            </button>
          </div>
        )}

        {reportOpen && (
          <ReportPanel
            onCancel={() => setReportOpen(false)}
            onSubmit={async (reason, details) => {
              try {
                await reportUser({
                  reportedUserId: profile.id,
                  reason,
                  details: details || undefined,
                })
                toast.show(t('profile.report_done'))
                setReportOpen(false)
              } catch (err) {
                console.error('[u/[username]] report failed', err)
                toast.show(t('register.error_toast'), { tone: 'error' })
              }
            }}
          />
        )}

        {/* Three-tab gifting-identity layout. Preferences moved
            INTO the tab strip in this pass — previously rendered as
            an always-visible card above. Reasoning:
              - Preferences are useful but secondary; they shouldn't
                consume vertical space above the fold by default.
              - The tab makes them discoverable AND clearly Qift-
                native (visitors learn Qift has a preferences
                feature regardless of whether this owner shared).
              - When the owner has shared nothing, the tab still
                exists and renders a calm empty state — no
                "feature missing" perception.

            Gifts + Wishlist tabs unchanged (same chip style, same
            translation keys as /profile). */}
        <div
          role="tablist"
          className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto pb-1"
        >
          {(['gifts', 'wishlist', 'occasions', 'preferences'] as Tab[]).map((id) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className="shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all duration-300 active:scale-95"
                style={{
                  borderColor: active ? 'transparent' : 'var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: active ? '#fff' : 'var(--text-soft)',
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? 'var(--shadow-soft)' : undefined,
                }}
              >
                {t(`profile.tab_${id}`)}
              </button>
            )
          })}
        </div>

        <div key={tab} role="tabpanel" className="qift-fade-in mt-3">
          {tab === 'gifts' && (
            <GiftWallSection mode="public" targetUserId={profile.id} />
          )}
          {tab === 'wishlist' && (
            <PublicWishlistPanel
              state={wishes}
              recipientUsername={profile.qiftUsername}
            />
          )}
          {tab === 'occasions' && (
            // Phase 6.4 — calm "Upcoming moments" panel. The
            // PublicOccasionsPanel fetches /users/:id/occasions
            // (privacy-filtered server-side; year stripped on
            // yearly rows) and renders read-only cards. No CTAs,
            // no "send a gift now" pressure.
            <PublicOccasionsPanel
              userId={profile.id}
              emptyKey="occasions.public_empty"
            />
          )}
          {tab === 'preferences' && (
            // Preferences tab content. When the owner has shared
            // any field, the same self-anchoring PreferencesSection
            // card used elsewhere renders. When NOTHING is shared,
            // a calm empty-state tile explains why the tab is
            // populated for everyone but the card is contentless
            // here — so visitors understand it's the owner's
            // choice, not a missing feature.
            <PublicPreferencesPanel preferences={profile.preferences} />
          )}
        </div>
      </section>

      {socialTab && (
        <SocialListModal
          initialTab={socialTab}
          userId={profile.id}
          onClose={() => setSocialTab(null)}
        />
      )}
    </PageContainer>
  )
}

function PrivateProfileView({ profile }: { profile: PublicProfile }) {
  const { t } = useI18n()
  const router = useRouter()
  const initials = initialsFor(profile.fullName, profile.qiftUsername)
  const [a, b] = gradientForId(profile.id).split(',')

  // Follow / Unfollow is still available on private accounts (typically as
  // a "request to follow" — backend creates the row in `pending` status).
  const [following, setFollowing] = useState(profile.isFollowing)
  const [followBusy, setFollowBusy] = useState(false)

  const onToggleFollow = async () => {
    if (followBusy) return
    const next = !following
    setFollowing(next)
    setFollowBusy(true)
    try {
      if (next) await followUser(profile.id)
      else await unfollowUser(profile.id)
    } catch (err) {
      console.error('[u/[username]] follow toggle failed', err)
      setFollowing(!next)
    } finally {
      setFollowBusy(false)
    }
  }

  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="flex items-start justify-between gap-3">
          <Badge>{t('profile.public_badge')}</Badge>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t('nav.back')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 rtl:-scale-x-100"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3.5">
          <Avatar
            avatarUrl={profile.avatarUrl}
            initials={initials}
            gradientA={a}
            gradientB={b}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1
              className="text-[1.35rem] font-extrabold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {profile.fullName ?? profile.qiftUsername}
            </h1>
            <p
              className="mt-0.5 text-sm"
              style={{ color: 'var(--muted)' }}
              dir="ltr"
            >
              @{profile.qiftUsername}
            </p>
          </div>
        </div>

        <div
          className="mt-6 flex flex-col items-center gap-3 rounded-3xl border p-7 text-center backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-2xl border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--primary)',
            }}
          >
            <LockIcon className="h-5 w-5" />
          </span>
          <h2
            className="text-base font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {t('profile.private_account_title')}
          </h2>
          <p
            className="max-w-xs text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('profile.private_account_body')}
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Link
            href={`/stores?to=${encodeURIComponent(profile.qiftUsername)}`}
            onClick={clearStoresLastDetailHref}
            className="flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('profile.social_send_gift')}
          </Link>
          <button
            type="button"
            onClick={onToggleFollow}
            disabled={followBusy}
            aria-pressed={following}
            aria-busy={followBusy || undefined}
            className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-70"
            style={{
              borderColor: following ? 'transparent' : 'var(--border)',
              background: following
                ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                : 'var(--card)',
              color: following ? 'var(--ink)' : 'var(--text)',
            }}
          >
            {following ? t('profile.following_action') : t('profile.follow')}
          </button>
        </div>
      </section>
    </PageContainer>
  )
}

// Skeleton shown while the public profile is loading. Matches the layout
// of PublicProfileView so the swap is visually smooth.
function ProfileSkeleton() {
  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div
            className="qift-skeleton h-7 w-24"
            style={{ borderRadius: '999px' }}
          />
          <div className="qift-skeleton h-9 w-9 rounded-full" />
        </div>
        <div className="mt-3 flex items-center gap-3.5">
          <div className="qift-skeleton h-[4.5rem] w-[4.5rem] rounded-3xl" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="qift-skeleton h-5 w-2/3" />
            <div className="qift-skeleton h-3 w-1/3" />
          </div>
        </div>
        <div className="qift-skeleton mt-3 h-4 w-3/4" />
        <div className="qift-skeleton mt-3 h-14 w-full rounded-2xl" />
        <div className="mt-3 flex gap-2">
          <div className="qift-skeleton h-9 flex-1 rounded-xl" />
          <div className="qift-skeleton h-9 flex-1 rounded-xl" />
        </div>
      </section>
    </PageContainer>
  )
}

function Avatar({
  avatarUrl,
  initials,
  gradientA,
  gradientB,
  size,
}: {
  avatarUrl: string | null
  initials: string
  gradientA: string
  gradientB: string
  size: 'sm' | 'lg'
}) {
  const dim = size === 'lg' ? 'h-[4.5rem] w-[4.5rem]' : 'h-10 w-10'
  const radius = size === 'lg' ? 'rounded-3xl' : 'rounded-full'
  const text = size === 'lg' ? 'text-2xl' : 'text-sm'

  if (avatarUrl) {
    return (
      // Real photo when present. Gradient is kept as a background fallback
      // for slow / failed image loads.
      <span
        aria-hidden
        className={`relative flex shrink-0 overflow-hidden ${dim} ${radius}`}
        style={{
          background: `linear-gradient(135deg, ${gradientA} 0%, ${gradientB} 100%)`,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
    )
  }
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold text-white ${dim} ${radius} ${text}`}
      style={{
        background: `linear-gradient(135deg, ${gradientA} 0%, ${gradientB} 100%)`,
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {initials}
    </div>
  )
}

function PublicStat({
  value,
  labelKey,
  divider,
  onClick,
}: {
  value: number
  labelKey: string
  divider?: boolean
  onClick?: () => void
}) {
  const { t } = useI18n()
  const dividerStyle = divider
    ? { borderInlineStart: '1px solid var(--hairline)' }
    : undefined
  const inner = (
    <>
      <span
        className="text-base font-extrabold"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
      <span
        className="mt-0.5 text-[0.65rem] font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {t(labelKey)}
      </span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center transition-colors hover:bg-[var(--card-soft)] active:scale-[0.98]"
        style={dividerStyle}
      >
        {inner}
      </button>
    )
  }
  return (
    <div
      className="flex flex-col items-center justify-center px-2 py-2.5 text-center"
      style={dividerStyle}
    >
      {inner}
    </div>
  )
}

// Preferences tab panel. Renders the same PreferencesSection card
// used everywhere else when the owner has shared anything, OR a
// calm empty-state tile when they haven't.
//
// Why both states exist (and the tab is always visible): if
// preferences only appeared when shared, visitors to profiles
// with nothing shared wouldn't know Qift has a preferences
// feature at all. By keeping the tab present and explaining the
// empty state, we communicate that preferences are a Qift
// feature the owner can opt into — without nudging the owner to
// share more (no "Ask them to share" CTA, no creator-economy
// pattern).
function PublicPreferencesPanel({
  preferences,
}: {
  preferences: PublicPreferences | undefined
}) {
  const { t } = useI18n()
  if (preferences) {
    return <PreferencesSection prefs={preferences} />
  }
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: 'var(--ring)',
          color: 'var(--text-soft)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a3 3 0 004.2 4.2" />
          <path d="M9.9 4.2A10 10 0 0122 12c-.6 1-1.4 2-2.4 3" />
          <path d="M6.6 6.6A10 10 0 002 12c1.4 2.4 4.3 7 10 7a10 10 0 005.4-1.6" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-bold leading-snug"
          style={{ color: 'var(--ink)' }}
        >
          {t('profile.preferences_empty_title')}
        </p>
        <p
          className="mt-1 text-[0.7rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('profile.preferences_empty_body')}
        </p>
      </div>
    </div>
  )
}

// Wishlist tab panel. Renders the four section states (loading,
// loaded, empty, forbidden) directly inside the tab panel — the
// tab itself is the section affordance, so there's no surrounding
// titled section shell.
//
// Visual hierarchy mirrors /profile's WishlistList: product-linked
// wishes in a 2-column compact grid; legacy free-text wishes in a
// single-column list beneath. Read-only — the public profile never
// renders an "Add wish" CTA (that's an owner-only control on
// /profile + /wishlist).
function PublicWishlistPanel({
  state,
  recipientUsername,
}: {
  state: SectionState<PublicWishItem>
  // Passed through to the rich card so the "Send as gift" CTA can
  // route to /send pre-filled with the profile owner's username.
  recipientUsername: string
}) {
  return (
    <>
      {state.status === 'forbidden' ? (
        <PrivateSectionTile />
      ) : state.status === 'loading' ? (
        <SectionRowsSkeleton rows={2} />
      ) : state.items.length === 0 ? (
        <SectionEmpty messageKey="profile.empty_wishlist" />
      ) : (
        (() => {
          const linked = state.items.filter((w) => w.productId)
          const legacy = state.items.filter((w) => !w.productId)
          return (
            <div className="flex flex-col gap-4">
              {linked.length > 0 && (
                <ul className="grid grid-cols-2 gap-3">
                  {linked.map((w) => (
                    <WishlistProductCard
                      key={w.id}
                      mode="public"
                      density="compact"
                      recipientUsername={recipientUsername}
                      wish={{
                        id: w.id,
                        productName: w.productName ?? w.title,
                        storeName: w.storeName ?? w.store ?? null,
                        imageUrl: w.imageUrl,
                        productId: w.productId,
                        storeId: w.storeId,
                        price: w.price,
                        currency: w.currency,
                        deactivatedAt: w.deactivatedAt,
                      }}
                    />
                  ))}
                </ul>
              )}
              {legacy.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {legacy.map((w) => (
                    <WishRow key={w.id} wish={w} />
                  ))}
                </ul>
              )}
            </div>
          )
        })()
      )}
    </>
  )
}

function WishRow({ wish }: { wish: PublicWishItem }) {
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border p-3 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--primary)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-sm font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {wish.title}
        </h3>
        {wish.store && (
          <p
            className="truncate text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {wish.store}
          </p>
        )}
      </div>
    </li>
  )
}

function SectionRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="qift-skeleton h-12 w-12 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="qift-skeleton h-4 w-2/3" />
            <div className="qift-skeleton h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function PrivateSectionTile() {
  const { t } = useI18n()
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-4 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--primary)',
        }}
      >
        <LockIcon className="h-4 w-4" />
      </span>
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('profile.private_section')}
      </p>
    </div>
  )
}

function SectionEmpty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border p-5 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
        {t(messageKey)}
      </p>
    </div>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </svg>
  )
}

// Inline report sheet. Reasons must match the backend allow-list in
// ReportsService — keep them in sync. Details are optional, capped at
// 1000 chars server-side; we cap at 500 here for UX.
const REPORT_REASONS = [
  'spam',
  'harassment',
  'impersonation',
  'inappropriate_content',
  'other',
] as const

function ReportPanel({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (reason: string, details: string) => void | Promise<void>
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState<string>('spam')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div
      role="region"
      aria-labelledby="report-panel-title"
      className="qift-fade-in mt-2 rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <h3
        id="report-panel-title"
        className="text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('profile.report_title')}
      </h3>
      <p
        className="mt-1 text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('profile.report_body')}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        {REPORT_REASONS.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs"
            style={{
              borderColor: reason === r ? 'var(--primary)' : 'var(--border)',
              background:
                reason === r ? 'var(--ring)' : 'var(--card)',
              color: 'var(--text)',
            }}
          >
            <input
              type="radio"
              name="report-reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="sr-only"
            />
            <span
              aria-hidden
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full border"
              style={{
                borderColor:
                  reason === r ? 'var(--primary)' : 'var(--border-strong)',
                background:
                  reason === r ? 'var(--primary)' : 'transparent',
              }}
            >
              {reason === r && (
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </span>
            {t(`profile.report_reason_${r}`)}
          </label>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value.slice(0, 500))}
        placeholder={t('profile.report_details_placeholder')}
        rows={3}
        className="mt-3 w-full rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('social.cancel')}
        </button>
        <button
          type="button"
          onClick={async () => {
            setSubmitting(true)
            try {
              await onSubmit(reason, details.trim())
            } finally {
              setSubmitting(false)
            }
          }}
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {submitting ? '…' : t('profile.report_submit')}
        </button>
      </div>
    </div>
  )
}
