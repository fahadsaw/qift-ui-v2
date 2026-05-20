'use client'

import { useEffect, useState } from 'react'

// Social-graph API client. Wraps the four backend endpoints exposed by
// qift-platform's FollowsModule + the public profile endpoint:
//
//   GET    /users/@/:username         → fetchPublicProfile
//   GET    /users/:userId/followers   → fetchFollowers
//   GET    /users/:userId/following   → fetchFollowing
//   POST   /follow/:userId            → followUser
//   DELETE /follow/:userId            → unfollowUser
//
// All endpoints require an Authorization header. The helper reads the
// access token from the existing auth store (lib/auth.ts → getAuth()) and
// throws `not_authenticated` when no token is present.
//
// Mock fallback (mockPublicProfile, mockFollowersList, mockFollowingList)
// is exported separately so call sites can decide whether to fall back —
// fallback is used ONLY when we can't reach the API at all (no token, or
// network/server error). A 404 is treated as authoritative "not found"
// and is NOT shadowed by the mock.

import { getAuth, useAuth } from './auth'
import {
  FOLLOWERS,
  FOLLOWING,
  USERS,
  getFollowersOf as mockGetFollowersOf,
  getFollowingOf as mockGetFollowingOf,
  getUserByUsername as mockGetUserByUsername,
  getUserStats as mockGetUserStats,
  getUserWishes as mockGetUserWishes,
  type SampleUser,
} from './sampleData'

import { API_BASE } from './apiBase'

// --- Response types (mirror the backend shapes) ---------------------------

export type SocialUser = {
  id: string
  fullName: string | null
  qiftUsername: string
  avatarUrl: string | null
}

export type SocialList = {
  items: SocialUser[]
  total: number
}

// `stats` is omitted entirely for private profiles. For public profiles each
// stat key is only present when the corresponding `show*` flag on the
// target user is true — the frontend gates rendering by field presence.
// Owner-shared preferences for the public profile section. Only the
// fields the owner opted to share are present on the wire. Each
// string field follows the same storage convention as /preferences
// (single-select = bare value; multi-select = comma-separated).
export type PublicPreferences = {
  clothingSize?: string
  shoeSize?: string
  ringSize?: string
  fragrance?: string
  colors?: string
  categories?: string
  brands?: string
  allergies?: string
  acceptsSurpriseGifts?: boolean
  // Free-form note from the owner. Plain text only — no markdown
  // rendering, no auto-linking. Cap 280 chars (server-enforced).
  giftNote?: string
}

export type PublicProfile = {
  id: string
  fullName: string | null
  qiftUsername: string
  bio?: string | null
  avatarUrl: string | null
  profileVisibility: 'public' | 'private'
  stats?: {
    followers?: number
    following?: number
    giftsSent?: number
    giftsReceived?: number
  }
  // Opted-in preferences. Absent when the owner has shared nothing.
  preferences?: PublicPreferences
  isFollowing: boolean
  isFollowedBy: boolean
}

// Public-list shape returned by /users/:userId/wishes. Field
// surface is intentionally narrow — see the backend service for
// the privacy reasoning.
//
// The /users/:userId/gifts/{received,sent} endpoints + their
// PublicGiftItem/List types + mock fallbacks were retired in the
// gifting-identity cleanup pass. Public profiles now expose gift
// MOMENTS via the unified GiftWallSection (GiftPost grid) instead
// of the old received/sent list rows. The relationship history
// surface lives on /received + /gifts (owner-only).
export type PublicWishItem = {
  id: string
  title: string
  store: string | null
  createdAt: string
  // Product-linked snapshot fields. Populated when the wish was
  // hearted from a real Product row; null on legacy free-text
  // wishes. The public profile uses these to render the same rich
  // card surface as the owner's wishlist (single source of truth
  // for product media — see `project_product_media_single_source`).
  productId: string | null
  storeId: string | null
  productName: string | null
  storeName: string | null
  imageUrl: string | null
  price: number | null
  currency: string | null
  deactivatedAt: string | null
}

export type PublicWishList = {
  items: PublicWishItem[]
  total: number
}

// --- Internals ------------------------------------------------------------

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken } = getAuth()
  if (!accessToken) {
    throw new ApiError('not_authenticated', 401)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    throw new ApiError(`request_failed_${res.status}`, res.status)
  }
  return res
}

export function isApiNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

export function isApiForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403
}

// --- Real API calls -------------------------------------------------------

export async function fetchPublicProfile(
  username: string,
): Promise<PublicProfile> {
  const res = await authedFetch(
    `/users/@/${encodeURIComponent(username)}`,
  )
  return (await res.json()) as PublicProfile
}

export async function fetchFollowers(
  userId: string,
): Promise<SocialList> {
  const res = await authedFetch(
    `/users/${encodeURIComponent(userId)}/followers`,
  )
  return (await res.json()) as SocialList
}

export async function fetchFollowing(
  userId: string,
): Promise<SocialList> {
  const res = await authedFetch(
    `/users/${encodeURIComponent(userId)}/following`,
  )
  return (await res.json()) as SocialList
}

export async function followUser(
  userId: string,
): Promise<{ ok: true; status: 'pending' | 'accepted' }> {
  const res = await authedFetch(`/follow/${encodeURIComponent(userId)}`, {
    method: 'POST',
  })
  return (await res.json()) as { ok: true; status: 'pending' | 'accepted' }
}

export async function unfollowUser(
  userId: string,
): Promise<{ ok: true }> {
  const res = await authedFetch(`/follow/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  return (await res.json()) as { ok: true }
}

// Block / unblock the target user. Side effect: any follow rows in
// either direction are dropped server-side, so the caller doesn't
// need a separate unfollow call.
export async function blockUser(userId: string): Promise<{ ok: true }> {
  const res = await authedFetch(`/blocks/${encodeURIComponent(userId)}`, {
    method: 'POST',
  })
  return (await res.json()) as { ok: true }
}

export async function unblockUser(
  userId: string,
): Promise<{ ok: true; removed: number }> {
  const res = await authedFetch(`/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  return (await res.json()) as { ok: true; removed: number }
}

// File a report against another user. Reason must be one of the
// allow-listed strings on the backend (see ReportsService.REASONS):
// spam | harassment | impersonation | inappropriate_content | other.
// Details is optional free text capped at 1000 chars server-side.
export async function reportUser(payload: {
  reportedUserId: string
  reason: string
  details?: string
}): Promise<{ id: string; status: string; createdAt: string }> {
  const res = await authedFetch(`/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await res.json()) as {
    id: string
    status: string
    createdAt: string
  }
}

export async function fetchUserWishes(
  userId: string,
): Promise<PublicWishList> {
  const res = await authedFetch(
    `/users/${encodeURIComponent(userId)}/wishes`,
  )
  return (await res.json()) as PublicWishList
}

// Owner-side wish (includes visibility, since the owner can see private
// wishes too — public-profile responses omit it).
//
// Product-linked fields (`productId`, `storeId`, `productName`,
// `storeName`, `imageUrl`, `price`, `currency`) are populated when
// the user hearted a real merchant product. Legacy free-text rows
// have these null and the surface falls back to rendering `title`
// + `store` as a plain string row.
export type OwnerWishItem = {
  id: string
  title: string
  store: string | null
  // Product link + snapshot.
  productId: string | null
  storeId: string | null
  productName: string | null
  storeName: string | null
  imageUrl: string | null
  price: number | null
  currency: string | null
  visibility: 'public' | 'private'
  // Deactivation state. Wishlist UI dims the card + disables
  // gifting CTAs when this is non-null.
  deactivatedAt: string | null
  deactivatedReason: string | null
  createdAt: string
}

export type OwnerWishList = {
  items: OwnerWishItem[]
  total: number
}

// GET /wishes/me — full wishlist for the JWT subject (public + private).
// Newest first. Mirrors the backend WishesService.listMine ordering.
export async function fetchMyWishes(): Promise<OwnerWishList> {
  const res = await authedFetch('/wishes/me')
  return (await res.json()) as OwnerWishList
}

// POST /wishes — creates or upserts a wish.
//
// Two paths:
//   A. Product-linked heart (preferred): pass `productId` + snapshot
//      fields. Backend resolves Product + Store, snapshots
//      productName/storeName/imageUrl/price, upserts on
//      (userId, productId). Re-hearting the same product is a no-op
//      for row identity; just refreshes the snapshot.
//   B. Legacy free-text wish: pass `title` (+ optional `store`)
//      only. Same idempotency-by-(title, store) as before.
//
// Caller chooses by which fields are present.
export async function createWish(payload: {
  // Product-linked path:
  productId?: string
  storeId?: string
  productName?: string
  storeName?: string
  imageUrl?: string | null
  price?: number
  currency?: string
  // Legacy path:
  title?: string
  store?: string | null
  // Shared:
  visibility?: 'public' | 'private'
}): Promise<OwnerWishItem> {
  const body: Record<string, unknown> = {
    visibility: payload.visibility ?? 'public',
  }
  if (payload.productId) {
    body.productId = payload.productId
    if (payload.storeId) body.storeId = payload.storeId
    if (payload.productName) body.productName = payload.productName
    if (payload.storeName) body.storeName = payload.storeName
    if (payload.imageUrl) body.imageUrl = payload.imageUrl
    if (typeof payload.price === 'number') body.price = payload.price
    if (payload.currency) body.currency = payload.currency
  } else if (payload.title) {
    body.title = payload.title
    if (payload.store !== undefined) body.store = payload.store ?? undefined
  } else {
    throw new Error('createWish requires productId or title')
  }
  const res = await authedFetch('/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as OwnerWishItem
}

// DELETE /wishes/by-product/:productId — symmetric unheart path.
// Lets the ❤️ button toggle without round-tripping for the wish
// id first. Idempotent: returns ok when the product wasn't
// wishlisted (the optimistic local state stays consistent).
export async function deleteWishByProduct(
  productId: string,
): Promise<{ ok: true }> {
  const res = await authedFetch(
    `/wishes/by-product/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
  )
  return (await res.json()) as { ok: true }
}

// GET /wishes/check?productId=… — quick "is product X in viewer's
// wishlist?" query. Used by the heart-button state on every
// product-rendering surface so the filled-vs-outline state is
// authoritative (rather than derived from a stale snapshot of
// /wishes/me).
export async function checkWishMembership(
  productId: string,
): Promise<{ inWishlist: boolean; wishId?: string }> {
  const res = await authedFetch(
    `/wishes/check?productId=${encodeURIComponent(productId)}`,
  )
  return (await res.json()) as { inWishlist: boolean; wishId?: string }
}

// PATCH /wishes/:id — partial update. Only fields in `payload` are sent;
// missing keys leave server-side state unchanged. `store: null` clears
// the store; `store: undefined` (i.e. omit the key) leaves it as-is.
export async function updateWish(
  id: string,
  payload: {
    title?: string
    store?: string | null
    visibility?: 'public' | 'private'
  },
): Promise<OwnerWishItem> {
  // Build the body explicitly so callers can pass `store: null` (clear)
  // distinctly from omitting `store` entirely (leave unchanged). Without
  // this, a caller that does `{ store: undefined }` would still get the
  // key in the JSON, but with our explicit construction it doesn't.
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = payload.title
  if (payload.store !== undefined) body.store = payload.store
  if (payload.visibility !== undefined) body.visibility = payload.visibility

  const res = await authedFetch(`/wishes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as OwnerWishItem
}

// DELETE /wishes/:id — owner-only. 404 from the server is propagated as
// `not_found` (caller can map to "the wish is already gone, remove from
// local state anyway").
export async function deleteWish(id: string): Promise<{ ok: true }> {
  const res = await authedFetch(`/wishes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return (await res.json()) as { ok: true }
}

// --- Mock fallback --------------------------------------------------------
//
// Used by call sites only when the real API is unreachable (no token / non-
// 404 error). All mock functions read from lib/sampleData.ts so the dev
// experience without a running backend stays close to the real one.

export function mockPublicProfile(
  username: string,
): PublicProfile | null {
  const u = mockGetUserByUsername(username)
  if (!u) return null
  if (u.profileVisibility === 'private') {
    return {
      id: u.id,
      fullName: u.fullName,
      qiftUsername: u.qiftUsername,
      avatarUrl: null,
      profileVisibility: 'private',
      isFollowing: false,
      isFollowedBy: false,
    }
  }
  const s = mockGetUserStats(u.id)
  const stats: PublicProfile['stats'] = {}
  if (u.showFollowers) stats.followers = s.followers
  if (u.showFollowing) stats.following = s.following
  if (u.showGiftsSent) stats.giftsSent = s.giftsSent
  if (u.showGiftsReceived) stats.giftsReceived = s.giftsReceived
  return {
    id: u.id,
    fullName: u.fullName,
    qiftUsername: u.qiftUsername,
    bio: u.bio ?? null,
    avatarUrl: null,
    profileVisibility: 'public',
    stats,
    isFollowing: false,
    isFollowedBy: false,
  }
}

function toSocialUser(u: SampleUser): SocialUser {
  return {
    id: u.id,
    fullName: u.fullName,
    qiftUsername: u.qiftUsername,
    avatarUrl: null,
  }
}

export function mockFollowersList(userId: string): SocialList {
  const items = mockGetFollowersOf(userId).map(toSocialUser)
  return { items, total: items.length }
}

export function mockFollowingList(userId: string): SocialList {
  const items = mockGetFollowingOf(userId).map(toSocialUser)
  return { items, total: items.length }
}

// Mock variant for the viewer's own followers / following — uses the
// hand-curated FOLLOWERS / FOLLOWING arrays from sampleData (so the UI
// preserves its previous mock behavior on /profile when offline).
function resolveIds(ids: string[]): SocialUser[] {
  return ids
    .map((id) => USERS.find((u) => u.id === id))
    .filter((u): u is SampleUser => !!u)
    .map(toSocialUser)
}

export function mockSelfFollowersList(): SocialList {
  const items = resolveIds(FOLLOWERS)
  return { items, total: items.length }
}

export function mockSelfFollowingList(): SocialList {
  const items = resolveIds(FOLLOWING)
  return { items, total: items.length }
}

// --- Mock fallback for the public wishes endpoint ---------------------
// The mockReceivedGifts / mockSentGifts fallbacks were retired with
// the public-profile received/sent gift list rows (gifting-identity
// cleanup pass). The wishes fallback below remains because the
// public profile's Wishlist tab still uses it for offline / API-
// unreachable rendering.

export function mockWishes(userId: string): PublicWishList {
  const items = mockGetUserWishes(userId)
    .filter((w) => w.visibility === 'public')
    .map((w) => ({
      id: w.id,
      title: w.title,
      store: w.store ?? null,
      // Mock data has no createdAt; "now" is a reasonable placeholder
      // for the offline path.
      createdAt: new Date().toISOString(),
      // Mock wishes don't carry product FKs — the public profile
      // renders the legacy compact row for these. Real product-
      // linked rows come through the live API path.
      productId: null,
      storeId: null,
      productName: null,
      storeName: null,
      imageUrl: null,
      price: null,
      currency: null,
      deactivatedAt: null,
    }))
  return { items, total: items.length }
}

// --- Section loader hook ---------------------------------------------
//
// Shared state machine for the three list endpoints on /u/[username]:
//   loading  → before the first fetch resolves
//   loaded   → success (real fetcher result; or fallback when given)
//   forbidden → API returned 403 (or shouldFetch=false up front)
//
// `shouldFetch=false` short-circuits to `forbidden` without a network
// round-trip — used when the public profile already told us the section
// is private (e.g. profile.stats.giftsReceived omitted ⇒ no fetch).
//
// `fallback` is OPTIONAL. When omitted, a network / 5xx / unauth failure
// resolves to `loaded` with an empty items array — the section renders
// its empty state honestly rather than fabricating mock items. The
// fallback parameter is retained for callers that still want a designed
// preview in disconnected dev (none currently use it in the live tree).

export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; items: T[] }
  | { status: 'forbidden' }

export function useSectionLoad<T>({
  shouldFetch,
  fetcher,
  fallback,
  deps,
}: {
  shouldFetch: boolean
  fetcher: () => Promise<{ items: T[] }>
  fallback?: () => { items: T[] }
  deps: ReadonlyArray<unknown>
}): SectionState<T> {
  const { accessToken } = useAuth()
  // Initial state respects shouldFetch so private sections never flicker
  // through a 'loading' frame.
  const [state, setState] = useState<SectionState<T>>(() =>
    shouldFetch ? { status: 'loading' } : { status: 'forbidden' },
  )

  useEffect(() => {
    if (!shouldFetch) return
    let cancelled = false

    const load = async () => {
      if (accessToken) {
        try {
          const data = await fetcher()
          if (cancelled) return
          setState({ status: 'loaded', items: data.items })
          return
        } catch (err) {
          if (isApiForbidden(err)) {
            if (!cancelled) setState({ status: 'forbidden' })
            return
          }
          console.error('[useSectionLoad] API failed', err)
        }
      }

      // Fallback path — used either when there's no auth token, or
      // when the fetcher failed for a non-forbidden reason. If the
      // caller did NOT supply a fallback, resolve to an empty list so
      // we never fabricate mock items for a real user.
      const data = fallback ? fallback() : { items: [] as T[] }
      if (cancelled) return
      setState({ status: 'loaded', items: data.items })
    }

    void load()
    return () => {
      cancelled = true
    }
    // fetcher / fallback are inline lambdas at call sites; their identity
    // changes on every render, so we list explicit deps from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, shouldFetch, ...deps])

  return state
}

// --- Avatar gradient ------------------------------------------------------
//
// The backend doesn't return a gradient with each user (real users have
// `avatarUrl` instead). For the avatar fallback (initials over a gradient),
// we derive a stable two-color string from the user id so the same user
// always gets the same colors. Same hash family used in lib/sampleData
// helpers — independent here so that swapping the social-graph data source
// doesn't ripple back into sampleData.

const GRADIENT_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#7B5CF5', '#F472B6'],
  ['#6366F1', '#22D3EE'],
  ['#F472B6', '#FBBF24'],
  ['#9478FF', '#34D399'],
  ['#F8A5D0', '#C89BFF'],
  ['#60A5FA', '#A78BFA'],
  ['#22D3EE', '#6366F1'],
  ['#FBBF24', '#F472B6'],
  ['#34D399', '#60A5FA'],
  ['#C89BFF', '#F8A5D0'],
]

export function gradientForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  const [a, b] = GRADIENT_PALETTE[Math.abs(h) % GRADIENT_PALETTE.length]
  return `${a},${b}`
}

export function initialsFor(fullName: string | null, qiftUsername: string): string {
  const source = (fullName?.trim() || qiftUsername).trim()
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}
