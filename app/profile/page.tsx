'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import MediaPicker, {
  type PickerErrorReason,
} from '@/components/MediaPicker'
import PageContainer from '@/components/PageContainer'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import SocialListModal, { type SocialTab } from '@/components/SocialListModal'
import { API_BASE } from '@/lib/apiBase'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { setAuth, useAuth, type AuthUser } from '@/lib/auth'
import {
  createWish,
  deleteWish,
  fetchMyWishes,
  updateWish,
  type OwnerWishItem,
} from '@/lib/social'
import {
  createPost,
  deletePost,
  fetchMyPosts,
  PostUploadError,
  type BackendPost,
} from '@/lib/posts'
import {
  MEDIA,
  PROFILE,
  PROFILE_GIFTS,
  type MediaTile,
  type ProfileGift,
} from '@/lib/sampleData'

type Tab = 'posts' | 'photos' | 'videos' | 'gifts' | 'wishlist'

type SocialChip = {
  id: string
  name: string
  handle: string
  verified: boolean
  d: string
}

const SOCIALS: SocialChip[] = [
  { id: 'snapchat', name: 'Snapchat', handle: 'noura.snap', verified: true, d: 'M12 3c3 0 5 2 5 5v3c1 1 3 1 3 2 0 1-2 1-3 2-1 2-2 4-5 4s-4-2-5-4c-1-1-3-1-3-2 0-1 2-1 3-2V8c0-3 2-5 5-5z' },
  { id: 'instagram', name: 'Instagram', handle: 'noura', verified: true, d: 'M16 11.4a4 4 0 11-8 0 4 4 0 018 0zM17.5 6.5h.01M3 8a5 5 0 015-5h8a5 5 0 015 5v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8z' },
  { id: 'tiktok', name: 'TikTok', handle: 'noura.t', verified: true, d: 'M14 4v9.5a3.5 3.5 0 11-3.5-3.5M14 4c.5 2 2 3.5 4.5 3.5' },
  { id: 'x', name: 'X', handle: 'noura', verified: false, d: 'M4 4l16 16M20 4L4 20' },
]

export default function ProfilePage() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const ready = useSimulatedReady(500)
  const { accessToken, userId, user, isAuthenticated } = useAuth()
  const [tab, setTab] = useState<Tab>('posts')
  const [mediaPreview, setMediaPreview] = useState<MediaTile | null>(null)
  const [addPostOpen, setAddPostOpen] = useState(false)
  // Post-preview modal for the real backend Post grid. Kept separate
  // from `mediaPreview` (which still drives the photos / videos
  // mock-data tabs) so the two viewers don't fight over the same
  // state shape.
  const [openPost, setOpenPost] = useState<BackendPost | null>(null)
  // Wish form modal state. `null` = closed; otherwise the discriminator
  // determines whether the modal opens in create or edit mode.
  type WishFormState =
    | { mode: 'create' }
    | { mode: 'edit'; wish: OwnerWishItem }
    | null
  const [wishForm, setWishForm] = useState<WishFormState>(null)
  // Wish currently pending deletion (null when no confirm dialog is open).
  const [deletingWish, setDeletingWish] = useState<OwnerWishItem | null>(null)
  // Owner's complete wishlist — public + private — fetched from
  // GET /wishes/me on mount. Mutations (create/update/delete) update this
  // state in place so the user sees the result without a refetch.
  const [wishes, setWishes] = useState<OwnerWishItem[]>([])
  const [wishesLoading, setWishesLoading] = useState(true)
  const [socialTab, setSocialTab] = useState<SocialTab | null>(null)

  // `null` while loading; `true` if the backend says we have no default
  // address (suspended); `false` otherwise. Drives the red banner below.
  const [isSuspended, setIsSuspended] = useState<boolean | null>(null)
  // Editable identity surfaced from /users/me. We don't put bio +
  // avatarUrl on the cached `AuthUser` because the auth snapshot is
  // intentionally minimal — these come straight off the latest
  // /users/me payload. Edit Profile updates them via PATCH +
  // re-fetch.
  const [profileBio, setProfileBio] = useState<string | null>(null)
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  // Real follower / following / gift counts from /users/me. Defaults
  // to null so the skeleton shows a placeholder zero only after the
  // first hydration; switching to 0 immediately would briefly flash
  // "0 followers" on accounts that have followers — bad first
  // impression.
  const [profileStats, setProfileStats] = useState<{
    followers: number
    following: number
    giftsSent: number
    giftsReceived: number
  } | null>(null)
  // Edit-profile modal toggle. The form lives in <EditProfileModal>
  // defined further down.
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  // Real profile posts from the backend. Populated by fetchMyPosts;
  // additions go through createPost (multipart → R2 → /posts) and
  // are prepended in place so the grid updates without a re-fetch.
  const [posts, setPosts] = useState<BackendPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  // Pull a fresh user from the backend when we have credentials. The cached
  // user from localStorage is shown immediately; this refreshes it AND
  // reads the new `stats` block (real follower/following/gift counts).
  // /users/me also returns hasDefaultAddress + isSuspended so we can render
  // the address-warning banner without a second round-trip.
  //
  // Wrapped in useCallback so the followers-list modal can call it on
  // close — that's how counts stay live after a follow/unfollow inside
  // the list (the modal mutates server state but doesn't know our
  // local stat shape).
  const refreshMe = useCallback(async () => {
    if (!accessToken || !userId) return
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const fresh = (await res.json()) as AuthUser & {
        passwordHash?: string
        hasDefaultAddress?: boolean
        isSuspended?: boolean
        bio?: string | null
        avatarUrl?: string | null
        stats?: {
          followers?: number
          following?: number
          giftsSent?: number
          giftsReceived?: number
        }
      }
      if (!fresh?.id) return
      setAuth({ accessToken, userId, user: fresh })
      if (typeof fresh.isSuspended === 'boolean') {
        setIsSuspended(fresh.isSuspended)
      }
      setProfileBio(fresh.bio ?? null)
      setProfileAvatar(fresh.avatarUrl ?? null)
      if (fresh.stats) {
        setProfileStats({
          followers: fresh.stats.followers ?? 0,
          following: fresh.stats.following ?? 0,
          giftsSent: fresh.stats.giftsSent ?? 0,
          giftsReceived: fresh.stats.giftsReceived ?? 0,
        })
      }
    } catch {
      // Silent — fall back to cached user.
    }
  }, [accessToken, userId])

  useEffect(() => {
    // Async wrapper keeps the setState calls inside refreshMe out of
    // the synchronous effect body — satisfies react-hooks/set-state-
    // in-effect without sacrificing the on-mount auto-refresh.
    void (async () => {
      await refreshMe()
    })()
  }, [refreshMe])

  // Redirect unauthenticated visitors after the auth snapshot resolves.
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login')
    }
  }, [ready, isAuthenticated, router])

  // Fetch the owner's full wishlist (public + private) once we have a
  // token. Failure logs and falls through to an empty list — keeps the
  // page usable; the user can always retry by re-opening the tab.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchMyWishes()
        if (!cancelled) setWishes(list.items)
      } catch (err) {
        console.error('[profile] fetchMyWishes failed', err)
      } finally {
        if (!cancelled) setWishesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Fetch the owner's posts. Same lazy / fail-soft pattern as wishlist.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchMyPosts(accessToken)
        if (!cancelled) setPosts(list)
      } catch (err) {
        console.error('[profile] fetchMyPosts failed', err)
      } finally {
        if (!cancelled) setPostsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Display values: prefer real user fields, fall back to placeholder where
  // the backend model has no equivalent (bio, stats).
  const displayName =
    user?.fullName?.trim() || user?.qiftUsername || PROFILE.name
  const displayUsername = user?.qiftUsername || PROFILE.username

  const initials = useMemo(
    () =>
      displayName
        .split(' ')
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join('') || '?',
    [displayName],
  )

  const showAddPost = tab === 'posts' || tab === 'photos' || tab === 'videos'

  if (!ready || !isAuthenticated) return <ProfileSkeleton />

  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="flex items-start justify-between gap-3">
          <Badge>{t('profile.badge')}</Badge>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `${SITE_ORIGIN}/u/${displayUsername}`,
                )
                toast.show(t('toast.profile_shared'))
              }}
              aria-label={t('profile.share')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            </button>
            <Link
              href="/settings"
              aria-label={t('profile.open_settings')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="12" cy="12" r="3" />
                <path d="M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 00-2.2 1.3l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-.9c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3.5">
          {/* Avatar + camera affordance. The camera button overlays
              the bottom-end corner; clicking it opens the existing
              Edit Profile modal where the user pastes an image URL.
              Native camera/gallery upload is deferred until object
              storage lands — see Edit Profile modal hint copy. */}
          <div className="relative shrink-0">
            <div
              aria-hidden
              className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-3xl text-2xl font-bold text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {profileAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileAvatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span aria-hidden>{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              aria-label={t('profile.edit_avatar')}
              className="absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow:
                  '0 6px 14px -6px rgba(123,92,245,0.55), 0 0 0 2px var(--bg-base)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-[1.35rem] font-extrabold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {displayName}
            </h1>
            <p
              className="mt-0.5 text-sm"
              style={{ color: 'var(--muted)' }}
              dir="ltr"
            >
              @{displayUsername}
            </p>
          </div>
        </div>

        {/* Bio under name — real value from /users/me. Hidden when
            empty so unset accounts don't show a stale placeholder. */}
        {profileBio && (
          <p
            className="mt-2.5 text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {profileBio}
          </p>
        )}

        {isSuspended && <SuspensionBanner />}

        {/* Compact stats row. Previous version was a heavy bordered
            card with vertical dividers between cells. The new
            treatment drops the border + shadow, uses smaller
            numbers + tighter padding, and gets dividers from a
            simple gap. Reads as a row of summary chips, not a
            secondary card competing with the action buttons below. */}
        {/* Real counts from /users/me. Falls through to 0 before the
            first hydration completes — the SimulatedReady skeleton
            already gates the page until isAuthenticated, so this
            window is short. */}
        <div className="mt-4 grid grid-cols-4 gap-1 px-1">
          <Stat
            value={profileStats?.followers ?? 0}
            labelKey="profile.followers"
            onClick={() => setSocialTab('followers')}
            compact
          />
          <Stat
            value={profileStats?.following ?? 0}
            labelKey="profile.following"
            onClick={() => setSocialTab('following')}
            compact
          />
          <Stat
            value={profileStats?.giftsSent ?? 0}
            labelKey="profile.gifts_sent"
            compact
          />
          <Stat
            value={profileStats?.giftsReceived ?? 0}
            labelKey="profile.gifts_received"
            compact
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditProfileOpen(true)}
            className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
            }}
          >
            {t('profile.edit_profile')}
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(
                `${SITE_ORIGIN}/u/${displayUsername}`,
              )
              toast.show(t('toast.profile_shared'))
            }}
            className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              borderColor: 'transparent',
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('profile.share')}
          </button>
        </div>

        <LinkedSocialRow />

        {/* Recent gifts intentionally removed from the main surface.
            The "Gifts" tab below renders the full list via <GiftsList>;
            keeping a teaser here was crowding mobile and duplicating
            content the tab already exposes. */}

        <div
          role="tablist"
          className="mt-4 -mx-1 flex gap-1.5 overflow-x-auto pb-1"
        >
          {(['posts', 'photos', 'videos', 'gifts', 'wishlist'] as Tab[]).map(
            (id) => {
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
            },
          )}
        </div>

        {showAddPost && (
          <button
            type="button"
            onClick={() => setAddPostOpen(true)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{
              borderColor: 'transparent',
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              color: '#fff',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('profile.add_post')}
          </button>
        )}

        <div key={tab} role="tabpanel" className="qift-fade-in mt-3">
          {tab === 'posts' && (
            <PostsGrid
              posts={posts}
              loading={postsLoading}
              onOpen={(p) => setOpenPost(p)}
              onAdd={() => setAddPostOpen(true)}
            />
          )}
          {tab === 'photos' && (
            <MediaGrid kind="photo" variant="clean" onOpen={setMediaPreview} />
          )}
          {tab === 'videos' && (
            <VideoCards onOpen={setMediaPreview} username={displayUsername} />
          )}
          {tab === 'gifts' && <GiftsList />}
          {tab === 'wishlist' && (
            <WishlistList
              wishes={wishes}
              loading={wishesLoading}
              onAdd={() => setWishForm({ mode: 'create' })}
              onEdit={(wish) => setWishForm({ mode: 'edit', wish })}
              onDelete={(wish) => setDeletingWish(wish)}
            />
          )}
        </div>
      </section>

      {mediaPreview && (
        <MediaModal
          item={mediaPreview}
          onClose={() => setMediaPreview(null)}
          authorName={displayName}
          authorUsername={displayUsername}
        />
      )}
      {addPostOpen && (
        <AddPostModal
          onClose={() => setAddPostOpen(false)}
          onCreated={(p) => {
            // Prepend new post so the Posts tab updates instantly.
            // Backend has already persisted it; this is just a UX
            // optimisation over a re-fetch.
            setPosts((prev) => [p, ...prev])
            setAddPostOpen(false)
            toast.show(t('toast.post_published'))
            // Switch to the Posts tab so the user sees their new
            // post if they were looking at a different tab.
            setTab('posts')
          }}
        />
      )}
      {openPost && (
        <PostPreviewModal
          post={openPost}
          authorName={displayName}
          authorUsername={displayUsername}
          canDelete
          onClose={() => setOpenPost(null)}
          onDeleted={(id) => {
            setPosts((prev) => prev.filter((p) => p.id !== id))
            setOpenPost(null)
            toast.show(t('toast.post_deleted'))
          }}
        />
      )}
      {wishForm && (
        <WishFormModal
          mode={wishForm.mode}
          wish={wishForm.mode === 'edit' ? wishForm.wish : undefined}
          onClose={() => setWishForm(null)}
          onCreated={(wish) => {
            // Backend POST /wishes is idempotent on (userId, title, store):
            // re-creating an identical wish returns the existing row.
            // If we already have it in state, replace in place (preserves
            // the row's current position) rather than prepending a
            // duplicate. Otherwise prepend as a new wish.
            setWishes((prev) => {
              const idx = prev.findIndex((w) => w.id === wish.id)
              if (idx >= 0) {
                const next = prev.slice()
                next[idx] = wish
                return next
              }
              return [wish, ...prev]
            })
            setWishForm(null)
            toast.show(t('wishlist.added_toast'))
          }}
          onUpdated={(wish) => {
            setWishes((prev) =>
              prev.map((w) => (w.id === wish.id ? wish : w)),
            )
            setWishForm(null)
            toast.show(t('wishlist.updated_toast'))
          }}
        />
      )}
      {deletingWish && (
        <WishDeleteConfirm
          wish={deletingWish}
          onCancel={() => setDeletingWish(null)}
          onDeleted={(id) => {
            setWishes((prev) => prev.filter((w) => w.id !== id))
            setDeletingWish(null)
            toast.show(t('wishlist.deleted_toast'))
          }}
        />
      )}
      {socialTab && (
        <SocialListModal
          initialTab={socialTab}
          onClose={() => {
            setSocialTab(null)
            // Refresh /users/me so follower/following counts reflect
            // any follow / unfollow performed inside the list.
            void refreshMe()
          }}
        />
      )}
      {editProfileOpen && (
        <EditProfileModal
          initial={{
            fullName: user?.fullName ?? '',
            bio: profileBio ?? '',
            avatarUrl: profileAvatar ?? '',
          }}
          onClose={() => setEditProfileOpen(false)}
          onSaved={(saved) => {
            // Update local state immediately so the page reflects the
            // new identity without a re-fetch. /users/me on next mount
            // will re-hydrate from the authoritative source.
            setProfileBio(saved.bio ?? null)
            setProfileAvatar(saved.avatarUrl ?? null)
            if (accessToken && userId) {
              setAuth({
                accessToken,
                userId,
                user: {
                  ...(user as AuthUser),
                  fullName: saved.fullName ?? null,
                },
              })
            }
            setEditProfileOpen(false)
            toast.show(t('toast.changes_saved'))
          }}
        />
      )}
    </PageContainer>
  )
}

// Edit-profile modal — display name, bio, and avatar.
//
// Avatar UX has three real input paths:
//   1. "Choose photo"  — opens the OS gallery picker (<input type=file
//      accept="image/*">). Standard mobile + desktop affordance.
//   2. "Take photo"    — opens the camera on mobile via the
//      `capture="environment"` attribute. Falls back to the gallery
//      on desktop (browser-native behavior, no special handling).
//   3. URL field       — paste a public image URL (kept as an optional
//      fallback for users who already host their photo somewhere).
//
// Picked files upload to the API as multipart/form-data
// (POST /media/avatar). The backend stores them in Cloudflare R2 and
// returns the persistent public URL, which it has already written to
// User.avatarUrl. The modal then PATCHes display name + bio in a
// second request. We deliberately split the calls so the avatar
// upload (the slow, can-fail-mid-network step) doesn't take name/bio
// edits down with it.
function EditProfileModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: { fullName: string; bio: string; avatarUrl: string }
  onClose: () => void
  onSaved: (saved: {
    fullName: string | null
    bio: string | null
    avatarUrl: string | null
  }) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [fullName, setFullName] = useState(initial.fullName)
  const [bio, setBio] = useState(initial.bio)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  // The picked image file, awaiting upload-on-save. We hold the File
  // (not just a data URL) so the multipart POST has the original
  // bytes + filename + mime; the data URL is just for the preview.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The unified picker drives both "Take photo" and "Choose from
  // gallery" through one action sheet. The two ad-hoc inline buttons
  // + hidden file inputs the modal used to manage are gone — the
  // MediaPicker component owns that surface now.
  const [pickerOpen, setPickerOpen] = useState(false)

  // What the preview tile renders. Local file wins so the user sees
  // the photo they just picked even if there's also a URL pasted.
  const previewSrc = localPreview ?? (avatarUrl.trim() ? avatarUrl : null)
  const hasAvatar = Boolean(previewSrc) || Boolean(pendingFile)

  const onPickedFile = (f: File) => {
    // The picker has already validated mime + size against the 8 MB
    // ceiling we pass in below, so we just stage the file and
    // generate a data-URL preview. (Object URLs would be cheaper but
    // FileReader is what the existing flow used; keep it so the
    // change is locally minimal.)
    setPendingFile(f)
    // The URL field is now stale relative to the chosen file — clear
    // it so the upload path is the unambiguous source of truth.
    setAvatarUrl('')
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setLocalPreview(reader.result)
    }
    reader.onerror = () => {
      toast.show(t('profile.edit_avatar_read_error'), { tone: 'error' })
    }
    reader.readAsDataURL(f)
  }

  const onPickerError = (reason: PickerErrorReason) => {
    const key =
      reason === 'too-large-photo'
        ? 'profile.edit_avatar_too_large'
        : reason === 'empty'
          ? 'media.error_empty'
          : 'profile.edit_avatar_invalid'
    toast.show(t(key), { tone: 'error' })
  }

  const onRemoveAvatar = () => {
    setPendingFile(null)
    setLocalPreview(null)
    setAvatarUrl('')
  }

  const onSave = async () => {
    if (!accessToken || submitting) return
    setSubmitting(true)
    try {
      // Step 1 — if the user picked a file, upload it first. The
      // backend writes to R2 AND updates User.avatarUrl in the same
      // round-trip, so we just need its returned URL for `onSaved`.
      let resolvedAvatarUrl: string | null = avatarUrl.trim() || null
      if (pendingFile) {
        const form = new FormData()
        form.append('file', pendingFile, pendingFile.name)
        const upRes = await fetch(`${API_BASE}/media/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        })
        if (!upRes.ok) {
          // 503 = R2 not configured; surface the most common
          // operator failure clearly so the user isn't left guessing.
          if (upRes.status === 503) {
            toast.show(t('profile.edit_avatar_storage_unavailable'), {
              tone: 'error',
            })
          } else {
            toast.show(t('profile.edit_avatar_upload_failed'), {
              tone: 'error',
            })
          }
          return
        }
        const upData = (await upRes.json()) as { avatarUrl: string }
        resolvedAvatarUrl = upData.avatarUrl
      }

      // Step 2 — patch name + bio. Avatar field is included only when
      // we did NOT just upload (the upload endpoint already wrote it).
      // Sending it again would be a no-op for the new URL, but a
      // mismatch if a race re-uploaded between the two calls.
      const patchBody: Record<string, string | null> = {
        fullName: fullName.trim() || null,
        bio: bio.trim() || null,
      }
      if (!pendingFile) {
        patchBody.avatarUrl = resolvedAvatarUrl
      }
      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) {
        toast.show(t('register.error_toast'), { tone: 'error' })
        return
      }
      const data = (await res.json()) as {
        fullName: string | null
        bio: string | null
        avatarUrl: string | null
      }
      // Reset upload state on success so a subsequent re-open of the
      // modal doesn't try to re-upload the same file.
      setPendingFile(null)
      setLocalPreview(null)
      onSaved({
        fullName: data.fullName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      })
    } catch (err) {
      console.error('[profile] save failed', err)
      toast.show(t('register.error_toast'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

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
        className="qift-modal-in flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('profile.edit_profile')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profile.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full"
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
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {/* Avatar block: preview tile + Choose / Take photo / Remove
              buttons. The two file inputs are hidden but kept mounted
              so the buttons can `.click()` them programmatically. */}
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl text-2xl font-bold text-white"
              style={{
                background: hasAvatar
                  ? 'var(--surface-2)'
                  : 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-7 w-7 opacity-90"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0116 0" />
                </svg>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {/* Single picker entry. Tap → MediaPicker action sheet
                    → user picks Take Photo or Choose from Gallery →
                    file is staged for upload-on-save. Replaces the
                    two ad-hoc inline buttons + four hidden file
                    inputs the modal used to render. */}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.7rem] font-semibold text-white transition-colors qift-press"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  {hasAvatar
                    ? t('profile.edit_avatar_change')
                    : t('profile.edit_avatar_choose')}
                </button>
                {hasAvatar && (
                  <button
                    type="button"
                    onClick={onRemoveAvatar}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold transition-colors qift-press"
                    style={{
                      background: 'transparent',
                      color: 'var(--muted)',
                    }}
                  >
                    {t('profile.edit_avatar_remove')}
                  </button>
                )}
              </div>
              <p
                className="text-[0.65rem] leading-relaxed"
                style={{ color: 'var(--muted)' }}
              >
                {t('profile.edit_avatar_help')}
              </p>
            </div>
          </div>

          <MediaPicker
            open={pickerOpen}
            mode="image"
            onClose={() => setPickerOpen(false)}
            onPicked={onPickedFile}
            onError={onPickerError}
            photoMaxBytes={8 * 1024 * 1024}
          />

          {/* Pending-upload chip. Renders when a file is staged — it
              tells the user the photo will upload on Save, and lets
              them know nothing has hit R2 yet. Replaces the older
              "local preview only" warning since uploads now actually
              persist. */}
          {pendingFile && (
            <p
              className="rounded-2xl px-3 py-2 text-[0.7rem] leading-relaxed"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-soft)',
              }}
            >
              {t('profile.edit_avatar_pending')}
            </p>
          )}

          <label className="block">
            <span
              className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('profile.edit_display_name')}
            </span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label className="block">
            <span
              className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('profile.edit_bio')}
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 280))}
              rows={3}
              placeholder={t('profile.edit_bio_placeholder')}
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
            <p
              className="mt-1 text-[0.65rem]"
              style={{ color: 'var(--muted-2)' }}
            >
              {bio.length} / 280
            </p>
          </label>
          <label className="block">
            <span
              className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('profile.edit_avatar_url')}
            </span>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value)
                // Pasting a URL takes precedence over a chosen file —
                // drop the pending file + preview so saving uses the
                // pasted URL unambiguously.
                if (e.target.value.trim()) {
                  setLocalPreview(null)
                  setPendingFile(null)
                }
              }}
              placeholder="https://…"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
            <p
              className="mt-1.5 text-[0.7rem] leading-relaxed"
              style={{ color: 'var(--muted)' }}
            >
              {t('profile.edit_avatar_hint')}
            </p>
          </label>
        </div>
        <div
          className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
            onClick={() => void onSave()}
            disabled={submitting}
            aria-busy={submitting || undefined}
            className="rounded-full px-4 py-2 text-xs font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {submitting ? '…' : t('social.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function MediaGrid({
  kind,
  variant = 'grid',
  onOpen,
}: {
  kind: MediaTile['kind']
  variant?: 'grid' | 'clean'
  onOpen: (item: MediaTile) => void
}) {
  const { t } = useI18n()
  const items = MEDIA.filter((m) => m.kind === kind)
  if (items.length === 0) {
    return <Empty messageKey={`profile.empty_${kind}s`} />
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {items.map((m) => {
        const [a, b] = m.from.split(',')
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onOpen(m)}
              className="relative block aspect-square w-full overflow-hidden rounded-xl text-start transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
              style={{
                background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
              }}
            >
              {variant === 'grid' && m.kind === 'video' && (
                <span
                  aria-hidden
                  className="absolute top-1.5 end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                    <path d="M6 4l14 8-14 8V4z" />
                  </svg>
                </span>
              )}
              {variant === 'grid' && (
                <span
                  className="absolute inset-x-0 bottom-0 p-1.5 text-[0.65rem] font-medium text-white"
                  style={{
                    background:
                      'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 100%)',
                  }}
                >
                  {m.caption}
                </span>
              )}
              <span className="sr-only">{t(`profile.tab_${kind}s`)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function VideoCards({
  onOpen,
  username,
}: {
  onOpen: (item: MediaTile) => void
  username: string
}) {
  const { t } = useI18n()
  const items = MEDIA.filter((m) => m.kind === 'video')
  if (items.length === 0) {
    return <Empty messageKey="profile.empty_videos" />
  }
  return (
    <ul className="grid grid-cols-2 gap-2">
      {items.map((m) => {
        const [a, b] = m.from.split(',')
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onOpen(m)}
              className="group block w-full overflow-hidden rounded-2xl border text-start backdrop-blur-md transition-transform duration-300 hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                className="relative aspect-video w-full"
                style={{
                  background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M6 4l14 8-14 8V4z" />
                    </svg>
                  </span>
                </span>
              </div>
              <div className="p-2.5">
                <p
                  className="truncate text-xs font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {m.caption}
                </p>
                <p
                  className="mt-0.5 text-[0.65rem]"
                  style={{ color: 'var(--muted)' }}
                  dir="ltr"
                >
                  @{username}
                </p>
              </div>
              <span className="sr-only">{t('profile.tab_videos')}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function GiftsList() {
  const { t } = useI18n()
  if (PROFILE_GIFTS.length === 0) {
    return <Empty messageKey="profile.empty_gifts" />
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {PROFILE_GIFTS.map((g) => (
        <GiftRow key={g.id} g={g} compact={false} />
      ))}
      <span className="sr-only">{t('profile.tab_gifts')}</span>
    </ul>
  )
}

function GiftRow({ g, compact }: { g: ProfileGift; compact: boolean }) {
  const { t } = useI18n()
  const [a, b] = g.from.split(',')
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border p-3 backdrop-blur-md transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-xl text-white ${
          compact ? 'h-10 w-10' : 'h-12 w-12'
        }`}
        style={{
          background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={compact ? 'h-4 w-4' : 'h-5 w-5'}
        >
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-sm font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {g.title}
        </h3>
        <p
          className="truncate text-xs"
          style={{ color: 'var(--muted)' }}
        >
          {g.direction === 'sent'
            ? t('profile.gift_sent_to')
            : t('profile.gift_received_from')}{' '}
          <span dir="ltr">@{g.other}</span>
          <span className="mx-1.5 opacity-50">·</span>
          {g.date}
        </p>
      </div>
    </li>
  )
}

function WishlistList({
  wishes,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  wishes: OwnerWishItem[]
  loading: boolean
  onAdd: () => void
  onEdit: (wish: OwnerWishItem) => void
  onDelete: (wish: OwnerWishItem) => void
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-2.5">
      {/* Add-wish CTA — always visible (also useful in the empty + loading
          states; the loading skeleton sits below it without competing). */}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
        style={{
          borderColor: 'transparent',
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          color: '#fff',
          boxShadow: 'var(--shadow-soft)',
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
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t('wishlist.add')}
      </button>

      {loading ? (
        <WishlistRowsSkeleton rows={2} />
      ) : wishes.length === 0 ? (
        <Empty messageKey="profile.empty_wishlist" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {wishes.map((w) => (
            <li
              key={w.id}
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
                  {w.title}
                </h3>
                {/* Meta row — store (if any) + visibility pill. Combining
                    them frees the right edge for the action buttons
                    without crowding the title. */}
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  {w.store && (
                    <span
                      className="truncate"
                      style={{ color: 'var(--muted)' }}
                    >
                      {w.store}
                    </span>
                  )}
                  {w.store && (
                    <span
                      aria-hidden
                      className="opacity-50"
                      style={{ color: 'var(--muted)' }}
                    >
                      ·
                    </span>
                  )}
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--card-soft)',
                      color: 'var(--text-soft)',
                    }}
                  >
                    {t(`wishlist.${w.visibility}`)}
                  </span>
                </div>
              </div>
              {/* Action buttons — edit + delete. Two siblings, no nested
                  interactives. Delete uses a danger-tinted hover state. */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(w)}
                  aria-label={t('wishlist.edit')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--card-soft)] active:scale-95"
                  style={{ color: 'var(--text-soft)' }}
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
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(w)}
                  aria-label={t('wishlist.remove')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-95"
                  style={{ color: 'var(--text-soft)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'rgba(220, 90, 110, 0.10)'
                    e.currentTarget.style.color = '#D55B6E'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-soft)'
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
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/wishlist"
        className="mt-1 inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-xs font-medium"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        {t('profile.wishlist_link')}
      </Link>
    </div>
  )
}

function WishlistRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="qift-skeleton h-10 w-10 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="qift-skeleton h-4 w-2/3" />
            <div className="qift-skeleton h-3 w-1/3" />
          </div>
          <div
            className="qift-skeleton h-5 w-12"
            style={{ borderRadius: '999px' }}
          />
        </li>
      ))}
    </ul>
  )
}

function Empty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-3xl border p-7 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t(messageKey)}
      </p>
    </div>
  )
}

// Compact social row. Previous design was a bordered card with a
// label, four 32px chips, and a primary-gradient CTA — too much
// visual weight directly under the share/edit buttons. The new
// treatment is a single inline row: chips on one side, plain
// "Manage" link on the other, no card chrome. Reads like metadata,
// not a competing surface.
function LinkedSocialRow() {
  const { t } = useI18n()
  return (
    <div className="mt-3 flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-1.5">
        {SOCIALS.map((p) => (
          <Link
            key={p.id}
            href="/social-accounts"
            aria-label={p.name}
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 active:scale-95"
            style={{
              background: 'var(--surface-2)',
            }}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              style={{ color: 'var(--primary)' }}
            >
              <path d={p.d} />
            </svg>
            {p.verified && (
              <span
                aria-label={t('social.verified')}
                aria-hidden
                className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full ring-2"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  ['--tw-ring-color' as string]: 'var(--bg-base)',
                }}
              />
            )}
          </Link>
        ))}
      </div>
      <Link
        href="/social-accounts"
        className="shrink-0 text-[0.7rem] font-semibold tracking-tight transition-colors"
        style={{ color: 'var(--primary)' }}
      >
        {t('profile.link_social_cta')}
      </Link>
    </div>
  )
}

function Stat({
  value,
  labelKey,
  divider,
  onClick,
  compact,
}: {
  value: number
  labelKey: string
  divider?: boolean
  onClick?: () => void
  // `compact` drops the cell-border treatment, smaller text, more
  // breathing room. Used on the profile page where the stats sit
  // directly under the avatar and shouldn't compete visually with
  // the primary action buttons below.
  compact?: boolean
}) {
  const { t } = useI18n()
  const dividerStyle =
    divider && !compact
      ? { borderInlineStart: '1px solid var(--hairline)' }
      : undefined
  const inner = (
    <>
      <span
        className={
          compact
            ? 'text-[1.05rem] font-extrabold'
            : 'text-base font-extrabold'
        }
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
      <span
        className={
          compact
            ? 'mt-0.5 text-[0.6rem] font-medium tracking-wide'
            : 'mt-0.5 text-[0.65rem] font-medium tracking-wide'
        }
        style={{ color: 'var(--muted)' }}
      >
        {t(labelKey)}
      </span>
    </>
  )
  const cellClass = compact
    ? 'flex flex-col items-center justify-center rounded-xl py-2 text-center transition-colors'
    : 'flex flex-col items-center justify-center px-2 py-3 text-center transition-colors'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cellClass} hover:bg-[var(--card-soft)] active:scale-[0.98]`}
        style={dividerStyle}
      >
        {inner}
      </button>
    )
  }
  return (
    <div
      className="flex flex-col items-center justify-center px-2 py-3 text-center"
      style={dividerStyle}
    >
      {inner}
    </div>
  )
}

// ---------- Modals ----------

function ModalShell({
  children,
  onClose,
  size = 'md',
}: {
  children: React.ReactNode
  onClose: () => void
  size?: 'sm' | 'md'
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

  const max = size === 'sm' ? 'max-w-sm' : 'max-w-md'

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md qift-fade-in"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`qift-modal-in w-full ${max} overflow-hidden rounded-3xl border backdrop-blur-xl`}
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

function MediaModal({
  item,
  onClose,
  authorName,
  authorUsername,
}: {
  item: MediaTile
  onClose: () => void
  authorName: string
  authorUsername: string
}) {
  const { t } = useI18n()
  const [a, b] = item.from.split(',')
  return (
    <ModalShell onClose={onClose}>
      <div
        className="relative aspect-square w-full"
        style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
      >
        {item.kind === 'video' && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M6 4l14 8-14 8V4z" />
              </svg>
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('profile.close')}
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
            {authorName
              .split(' ')
              .filter(Boolean)
              .map((p) => p[0])
              .slice(0, 2)
              .join('') || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-sm font-bold"
              style={{ color: 'var(--ink)' }}
            >
              {authorName}
            </h3>
            <p
              className="truncate text-xs"
              style={{ color: 'var(--muted)' }}
              dir="ltr"
            >
              @{authorUsername}
            </p>
          </div>
        </div>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {item.caption}
        </p>
        <Link
          href="/stores"
          onClick={onClose}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M20 12v9H4v-9" />
            <path d="M2 7h20v5H2z" />
            <path d="M12 22V7" />
          </svg>
          {t('profile.send_gift')}
        </Link>
      </div>
    </ModalShell>
  )
}

// Real post-creation modal. Wires four input paths into one upload:
//   1. "Choose photo"      — gallery photo (input accept="image/*")
//   2. "Take photo"        — camera capture (input capture="environment")
//   3. "Choose video"      — gallery video (input accept="video/*")
//   4. "Record video"      — camera capture for video (input capture)
// Plus an optional caption (max 500 chars).
//
// On Publish: posts the file + caption as multipart/form-data to
// POST /posts (which writes to R2 and creates the row). The created
// post is handed to onCreated for an in-place prepend; we never
// re-fetch the list.
//
// 8 MB ceiling for photos / 50 MB for videos enforced client-side
// so we don't bother uploading what the backend would reject. The
// server re-validates either way.
function AddPostModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (post: BackendPost) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [caption, setCaption] = useState('')
  const [captionFocused, setCaptionFocused] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  // Single picker entry replaces the four ad-hoc buttons + four
  // hidden file inputs the modal used to manage. The picker handles
  // mime + size validation against the caps we pass in below; on
  // success we just stage the file and let the existing publish
  // flow handle upload.
  const [pickerOpen, setPickerOpen] = useState(false)

  const isVideo = file?.type.startsWith('video/') ?? false
  const canPublish = !!file && !publishing

  // FileReader → object URL for an in-memory preview. Object URLs
  // outperform data URLs for video (no base64 round-trip), so we use
  // them for both kinds. The cleanup effect revokes when the file
  // changes or the modal unmounts.
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onPickedFile = (f: File) => {
    setFile(f)
  }

  const onPickerError = (reason: PickerErrorReason) => {
    const key =
      reason === 'too-large-photo'
        ? 'profile.post_photo_too_large'
        : reason === 'too-large-video'
          ? 'profile.post_video_too_large'
          : reason === 'empty'
            ? 'media.error_empty'
            : 'profile.post_media_invalid'
    toast.show(t(key), { tone: 'error' })
  }

  const onPublish = async () => {
    if (!accessToken || !file || publishing) return
    setPublishing(true)
    try {
      const post = await createPost({
        accessToken,
        file,
        caption: caption.trim(),
      })
      onCreated(post)
    } catch (err) {
      if (err instanceof PostUploadError && err.status === 503) {
        toast.show(t('profile.edit_avatar_storage_unavailable'), { tone: 'error' })
      } else {
        toast.show(t('profile.post_upload_failed'), { tone: 'error' })
      }
      console.error('[profile] createPost failed', err)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <ModalShell onClose={onClose} size="sm">
      <div
        className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <h3
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('profile.add_post_title')}
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void onPublish()
        }}
        className="flex flex-col gap-3.5 p-5"
      >
        <div>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.2em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('profile.post_media_label')}
          </label>

          {/* Preview tile. Renders an <img> for photos and a <video>
              with controls for videos so the user can scrub a quick
              QC pass before publishing. */}
          <div
            className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl"
            style={{
              background: previewUrl
                ? '#000'
                : 'var(--surface-2)',
              border: previewUrl ? 'none' : '2px dashed var(--border-strong)',
            }}
          >
            {previewUrl ? (
              isVideo ? (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 text-center" style={{ color: 'var(--muted)' }}>
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: 'var(--card)',
                    color: 'var(--primary)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="11" r="2" />
                    <path d="M21 17l-5-5-7 7" />
                  </svg>
                </span>
                <span className="text-xs leading-relaxed">
                  {t('profile.post_media_hint')}
                </span>
              </span>
            )}
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t('profile.edit_avatar_remove')}
                className="absolute top-2 end-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Single picker entry. The four-source action sheet
              (Take photo / Choose photo / Record video / Choose
              video) lives inside MediaPicker, so the post composer
              no longer carries four buttons + four hidden file
              inputs. Photos cap at 8 MB, videos at 50 MB; the
              picker enforces both before we ever stage the file. */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-colors qift-press"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {file
                ? t('profile.post_replace_media')
                : t('profile.post_attach_media')}
            </button>
          </div>

          <MediaPicker
            open={pickerOpen}
            mode="image-and-video"
            onClose={() => setPickerOpen(false)}
            onPicked={onPickedFile}
            onError={onPickerError}
            photoMaxBytes={8 * 1024 * 1024}
            videoMaxBytes={50 * 1024 * 1024}
          />
        </div>

        <div>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.2em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('profile.post_caption_label')}
          </label>
          <div
            className="overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
            style={{
              borderColor: captionFocused
                ? 'var(--input-border-focus)'
                : 'var(--border)',
              background: 'var(--card)',
              boxShadow: captionFocused
                ? 'var(--input-shadow-focus)'
                : 'var(--input-shadow)',
            }}
          >
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 500))}
              onFocus={() => setCaptionFocused(true)}
              onBlur={() => setCaptionFocused(false)}
              placeholder={t('profile.post_caption_placeholder')}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm font-medium focus:outline-none placeholder:text-[var(--placeholder)]"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <p className="mt-1 text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
            {caption.length} / 500
          </p>
        </div>

        <button
          type="submit"
          disabled={!canPublish}
          aria-busy={publishing || undefined}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: canPublish ? 'var(--shadow-soft)' : 'none',
          }}
        >
          {publishing ? (
            <span className="qift-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              {t('profile.post_publish')}
            </>
          )}
        </button>
      </form>
    </ModalShell>
  )
}

// Posts grid backed by real backend data. Empty state surfaces a
// big CTA so the "no posts yet" state actively invites the user to
// create one — that's a first-impression surface, not a dead end.
function PostsGrid({
  posts,
  loading,
  onOpen,
  onAdd,
}: {
  posts: BackendPost[]
  loading: boolean
  onOpen: (post: BackendPost) => void
  onAdd: () => void
}) {
  const { t } = useI18n()
  if (loading) {
    return (
      <ul className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="aspect-square w-full" rounded="xl" />
          </li>
        ))}
      </ul>
    )
  }
  if (posts.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed py-10 px-6 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
        }}
      >
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="11" r="2" />
            <path d="M21 17l-5-5-7 7" />
          </svg>
        </span>
        <p
          className="text-sm font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {t('profile.empty_posts')}
        </p>
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('profile.empty_posts_body')}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('profile.add_post')}
        </button>
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {posts.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="relative block aspect-square w-full overflow-hidden rounded-xl bg-black text-start transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
          >
            {p.mediaType === 'video' ? (
              <>
                {/* Video thumbs: reuse the source itself with
                    `preload=metadata` + `muted` so the browser paints
                    the first frame without downloading the whole file.
                    `playsInline` keeps it from going fullscreen on iOS. */}
                <video
                  src={p.mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span
                  aria-hidden
                  className="absolute top-1.5 end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                    <path d="M6 4l14 8-14 8V4z" />
                  </svg>
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.mediaUrl}
                alt={p.caption ?? ''}
                className="h-full w-full object-cover"
              />
            )}
            {p.caption && (
              <span
                className="absolute inset-x-0 bottom-0 truncate p-1.5 text-[0.65rem] font-medium text-white"
                style={{
                  background:
                    'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)',
                }}
              >
                {p.caption}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

// Full-screen post preview. Used for both photo and video — the
// renderer branches on mediaType. Owner gets a delete affordance;
// the backend already 404s for non-owners but we hide the button so
// the UI is honest about who can act.
function PostPreviewModal({
  post,
  authorName,
  authorUsername,
  canDelete,
  onClose,
  onDeleted,
}: {
  post: BackendPost
  authorName: string
  authorUsername: string
  canDelete: boolean
  onClose: () => void
  onDeleted: (postId: string) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const onDelete = async () => {
    if (!accessToken || deleting) return
    if (!confirm(t('profile.post_delete_confirm'))) return
    setDeleting(true)
    try {
      await deletePost({ accessToken, postId: post.id })
      onDeleted(post.id)
    } catch (err) {
      console.error('[profile] deletePost failed', err)
      toast.show(t('profile.post_delete_failed'), { tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }
  return (
    <ModalShell onClose={onClose}>
      <div className="relative w-full bg-black">
        {post.mediaType === 'video' ? (
          <video
            src={post.mediaUrl}
            controls
            playsInline
            className="aspect-square w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.mediaUrl}
            alt={post.caption ?? ''}
            className="aspect-square w-full object-cover"
          />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('profile.close')}
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
            {authorName
              .split(' ')
              .filter(Boolean)
              .map((p) => p[0])
              .slice(0, 2)
              .join('') || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-sm font-bold"
              style={{ color: 'var(--ink)' }}
            >
              {authorName}
            </h3>
            <p
              className="truncate text-xs"
              style={{ color: 'var(--muted)' }}
              dir="ltr"
            >
              @{authorUsername}
            </p>
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              aria-busy={deleting || undefined}
              className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: '#D55B6E',
              }}
            >
              {deleting ? '…' : t('profile.post_delete')}
            </button>
          )}
        </div>
        {post.caption && (
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {post.caption}
          </p>
        )}
      </div>
    </ModalShell>
  )
}

// Wish form modal — handles both create and edit. Title, store, and
// visibility fields are shared; only the header label, the CTA label,
// and the submit handler vary by mode.
//
//   create: POSTs /wishes via createWish; calls onCreated with the new row.
//   edit:   PATCHes /wishes/:id via updateWish; calls onUpdated with the
//           updated row. `wish` (the row being edited) is required in
//           edit mode for both prefill and the id used in the request.
function WishFormModal({
  mode,
  wish,
  onClose,
  onCreated,
  onUpdated,
}: {
  mode: 'create' | 'edit'
  wish?: OwnerWishItem
  onClose: () => void
  onCreated?: (wish: OwnerWishItem) => void
  onUpdated?: (wish: OwnerWishItem) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [title, setTitle] = useState(wish?.title ?? '')
  const [store, setStore] = useState(wish?.store ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(
    wish?.visibility ?? 'public',
  )
  const [titleFocused, setTitleFocused] = useState(false)
  const [storeFocused, setStoreFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0 && !submitting

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      if (mode === 'edit' && wish) {
        const updated = await updateWish(wish.id, {
          title: title.trim(),
          store: store.trim() || null,
          visibility,
        })
        onUpdated?.(updated)
      } else {
        const created = await createWish({
          title: title.trim(),
          store: store.trim() || null,
          visibility,
        })
        onCreated?.(created)
      }
    } catch (err) {
      console.error(`[profile] ${mode}Wish failed`, err)
      toast.show(
        t(
          mode === 'edit'
            ? 'wishlist.update_failed_toast'
            : 'wishlist.add_failed_toast',
        ),
        { tone: 'error' },
      )
    } finally {
      setSubmitting(false)
    }
  }

  const headerKey = mode === 'edit' ? 'wishlist.edit_title' : 'wishlist.add'
  const ctaKey = mode === 'edit' ? 'common.save' : 'common.add'

  return (
    <ModalShell onClose={onClose} size="sm">
      <div
        className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <h3
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t(headerKey)}
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

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5 p-5">
        {/* Title — required */}
        <div>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.2em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('wishlist.title_label')}
          </label>
          <div
            className="overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
            style={{
              borderColor: titleFocused
                ? 'var(--input-border-focus)'
                : 'var(--border)',
              background: 'var(--card)',
              boxShadow: titleFocused
                ? 'var(--input-shadow-focus)'
                : 'var(--input-shadow)',
            }}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              placeholder={t('wishlist.add_placeholder')}
              maxLength={120}
              className="w-full bg-transparent px-4 py-3 text-sm font-medium focus:outline-none placeholder:text-[var(--placeholder)]"
              style={{ color: 'var(--text)' }}
              required
            />
          </div>
        </div>

        {/* Store — optional */}
        <div>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.2em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('wishlist.store_label')}
          </label>
          <div
            className="overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
            style={{
              borderColor: storeFocused
                ? 'var(--input-border-focus)'
                : 'var(--border)',
              background: 'var(--card)',
              boxShadow: storeFocused
                ? 'var(--input-shadow-focus)'
                : 'var(--input-shadow)',
            }}
          >
            <input
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              onFocus={() => setStoreFocused(true)}
              onBlur={() => setStoreFocused(false)}
              placeholder={t('wishlist.store_placeholder')}
              maxLength={80}
              className="w-full bg-transparent px-4 py-3 text-sm font-medium focus:outline-none placeholder:text-[var(--placeholder)]"
              style={{ color: 'var(--text)' }}
            />
          </div>
        </div>

        {/* Visibility — pill toggle, mirrors the page's tab strip style */}
        <div>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.2em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('wishlist.visibility')}
          </label>
          <div role="radiogroup" className="flex gap-1.5">
            {(['public', 'private'] as const).map((v) => {
              const active = visibility === v
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setVisibility(v)}
                  className="rounded-full border px-4 py-1.5 text-xs transition-all duration-300 active:scale-95"
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
                  {t(`wishlist.${v}`)}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={submitting || undefined}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: canSubmit ? 'var(--shadow-soft)' : 'none',
          }}
        >
          {submitting ? (
            <span className="qift-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <>
              {mode === 'create' && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
              {t(ctaKey)}
            </>
          )}
        </button>
      </form>
    </ModalShell>
  )
}

// Delete-confirmation dialog. Two-button shell (cancel + confirm) inside
// the standard ModalShell. The confirm button uses a danger-tinted
// gradient to make the destructive action visually distinct from regular
// primary CTAs.
function WishDeleteConfirm({
  wish,
  onCancel,
  onDeleted,
}: {
  wish: OwnerWishItem
  onCancel: () => void
  onDeleted: (id: string) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const onConfirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await deleteWish(wish.id)
      onDeleted(wish.id)
    } catch (err) {
      console.error('[profile] deleteWish failed', err)
      // 404 from the backend → the wish is already gone (or wasn't ours).
      // Treat as success so the row disappears either way.
      const message =
        err instanceof Error ? err.message : String(err ?? '')
      if (message === 'request_failed_404') {
        onDeleted(wish.id)
      } else {
        toast.show(t('wishlist.delete_failed_toast'), { tone: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell onClose={onCancel} size="sm">
      <div className="flex flex-col gap-3 p-5">
        <h3
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {t('wishlist.delete_confirm_title')}
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('wishlist.delete_confirm_body')}
        </p>
        {/* Show a preview of the wish being deleted so the user can
            confirm they're targeting the right one. */}
        <div
          className="mt-1 rounded-2xl border p-3"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          <p
            className="truncate text-sm font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {wish.title}
          </p>
          {wish.store && (
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {wish.store}
            </p>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            style={{
              background:
                'linear-gradient(135deg, #D55B6E 0%, #B83A50 100%)',
              boxShadow:
                '0 14px 32px -14px rgba(213, 91, 110, 0.55)',
            }}
          >
            {busy ? (
              <span className="qift-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              t('wishlist.remove')
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// Red address-required banner. Rendered when the backend reports that the
// viewer has no default address — accounts in this state can't receive
// gifts, so we surface it loudly and link to the address management screen.
function SuspensionBanner() {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-3 rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: 'rgba(213, 91, 110, 0.45)',
        background: 'rgba(213, 91, 110, 0.08)',
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: '#D55B6E' }}
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
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-bold"
          style={{ color: '#B83A50' }}
        >
          {t('profile.suspended_title')}
        </p>
        <p
          className="mt-1 text-xs leading-relaxed"
          style={{ color: '#B83A50' }}
        >
          {t('profile.suspended_body')}
        </p>
        <Link
          href="/settings"
          className="mt-2 inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-[0.7rem] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #D55B6E 0%, #B83A50 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {t('profile.suspended_cta')}
        </Link>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-7 w-28" rounded="full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" rounded="full" />
            <Skeleton className="h-9 w-9" rounded="full" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3.5">
          <Skeleton className="h-[4.5rem] w-[4.5rem]" rounded="3xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>

        <Skeleton className="mt-3 h-4 w-3/4" />
        <Skeleton className="mt-1.5 h-4 w-2/4" />

        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" rounded="2xl" />
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <Skeleton className="h-9 flex-1" rounded="lg" />
          <Skeleton className="h-9 flex-1" rounded="lg" />
        </div>

        <Skeleton className="mt-3 h-16 w-full" rounded="2xl" />

        <div className="mt-4 -mx-1 flex gap-1.5 overflow-hidden pb-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-20" rounded="full" />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square">
              <Skeleton className="h-full w-full" rounded="md" />
            </div>
          ))}
        </div>
      </section>
    </PageContainer>
  )
}
