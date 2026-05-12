// Gift-posts API helpers — V1 social layer.
//
// Mirrors apps/api/src/gift-posts/gift-posts.service.ts. The shape
// returned by the backend includes both the raw GiftPost row fields
// (postId, ownerUserId, direction, appreciationCount, publicSlug)
// and the privacy-masked view fields built by buildGiftPostView
// (productName, storeName, productHref, *Username, *Name, etc.).
//
// V1 scope (do not extend without an architecture change):
//   - publish / unpublish / setVisibility (private | public only)
//   - 👍 appreciation toggle
//   - public read by slug + by user (Gift Wall)
//   - owner list (full wall, all states)
//
// V1 explicitly NOT in scope:
//   - comments / replies
//   - feed pagination / ranking
//   - identity reveal UI (revealSender/revealRecipient stay false)

import { API_BASE } from './apiBase'

// The viewer-facing shape every endpoint returns. Identity fields are
// null when the reveal flag is off or the viewer is a third party —
// the frontend renders an anonymous label in that case.
export type BackendGiftPostView = {
  // From buildGiftPostView (privacy-masked):
  id: string
  productName: string
  storeName: string
  productId: string | null
  storeId: string | null
  // Product image URL from the linked Product row. Null when the
  // post is deactivated, the Product was deleted, or the gift had
  // no productId (legacy / sample-product gifts). Single source of
  // truth — the frontend never copies this binary.
  productImageUrl: string | null
  // Full ordered product gallery — the viewer's horizontal swipe
  // consumes this. Server-side `deriveGallery()` falls back to
  // `[productImageUrl]` when no explicit gallery exists, and to
  // `[]` for deactivated/deleted products.
  productImages: string[]
  productHref: string | null
  senderUsername: string | null
  senderName: string | null
  receiverUsername: string | null
  receiverName: string | null
  visibility: 'private' | 'followers' | 'public'
  publishedAt: string | null
  deactivatedAt: string | null
  // From the raw GiftPost row:
  postId: string
  ownerUserId: string
  direction: 'sent' | 'received' | 'self'
  appreciationCount: number
  publicSlug: string | null
  // Dedup count for the gift wall. Repeat gifts of the same product
  // collapse into one grid tile with `eventCount = N` driving the
  // ×N badge. 1 means a singleton (no badge rendered). Always
  // present — server defaults to 1 for non-collapsed rows.
  eventCount: number
}

// Raw post row returned by mutation endpoints (publish/unpublish/setVisibility).
// Doesn't carry the joined gift fields — those come on the list/getBySlug routes.
export type BackendGiftPostRow = {
  id: string
  giftId: string
  ownerUserId: string
  direction: string
  publishedAt: string | null
  visibility: 'private' | 'followers' | 'public'
  revealSender: boolean
  revealRecipient: boolean
  publicSlug: string | null
  appreciationCount: number
  deactivatedAt: string | null
  deactivatedReason: string | null
}

export type AppreciationToggleResult = {
  appreciated: boolean
  appreciationCount: number
}

export class GiftPostError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'GiftPostError'
  }
}

async function parseError(res: Response): Promise<GiftPostError> {
  const data = (await res.json().catch(() => null)) as {
    code?: string
    message?: string | string[]
  } | null
  const msg = Array.isArray(data?.message)
    ? data.message[0]
    : (data?.message ?? '')
  return new GiftPostError(res.status, data?.code ?? null, msg || 'Request failed')
}

// POST /gift-posts/publish — sender (V1) shares a gift. Returns the
// raw post row so the caller can stash the publicSlug + visibility
// locally. Defaults to visibility='public' server-side.
export async function publishGiftPost(args: {
  accessToken: string
  giftId: string
  visibility?: 'private' | 'public'
}): Promise<BackendGiftPostRow> {
  const res = await fetch(`${API_BASE}/gift-posts/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      giftId: args.giftId,
      visibility: args.visibility,
    }),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as BackendGiftPostRow
}

// POST /gift-posts/:id/unpublish — owner pulls back to private.
// publicSlug is preserved so a future re-publish reuses the same URL.
export async function unpublishGiftPost(args: {
  accessToken: string
  postId: string
}): Promise<BackendGiftPostRow> {
  const res = await fetch(
    `${API_BASE}/gift-posts/${args.postId}/unpublish`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  )
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as BackendGiftPostRow
}

// POST /gift-posts/:id/visibility — toggle private/public.
export async function setGiftPostVisibility(args: {
  accessToken: string
  postId: string
  visibility: 'private' | 'public'
}): Promise<BackendGiftPostRow> {
  const res = await fetch(
    `${API_BASE}/gift-posts/${args.postId}/visibility`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ visibility: args.visibility }),
    },
  )
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as BackendGiftPostRow
}

// POST /gift-posts/:id/appreciate — 👍 toggle. Returns post-toggle
// state so the frontend can optimistically flip the button.
export async function toggleAppreciation(args: {
  accessToken: string
  postId: string
}): Promise<AppreciationToggleResult> {
  const res = await fetch(
    `${API_BASE}/gift-posts/${args.postId}/appreciate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  )
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as AppreciationToggleResult
}

// GET /gift-posts/:id/appreciation — membership probe for the
// filled-vs-outline button state on initial render.
export async function checkAppreciation(args: {
  accessToken: string
  postId: string
}): Promise<{ appreciated: boolean }> {
  const res = await fetch(
    `${API_BASE}/gift-posts/${args.postId}/appreciation`,
    {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  )
  if (!res.ok) return { appreciated: false }
  return (await res.json()) as { appreciated: boolean }
}

// GET /gift-posts/by-gift/:giftId — caller-owned lookup for the
// gift-detail publish card. Returns null when no post exists yet
// (first-time publish path), or when the post is owned by the
// OTHER party (V1 doesn't show "other side already shared this").
export async function fetchMyGiftPostByGift(args: {
  accessToken: string
  giftId: string
}): Promise<BackendGiftPostRow | null> {
  const res = await fetch(`${API_BASE}/gift-posts/by-gift/${args.giftId}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as
    | BackendGiftPostRow
    | null
  return data ?? null
}

// GET /gift-posts/mine — owner's full wall (all states).
export async function fetchMyGiftPosts(
  accessToken: string,
): Promise<BackendGiftPostView[]> {
  const res = await fetch(`${API_BASE}/gift-posts/mine`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  return (await res.json()) as BackendGiftPostView[]
}

// GET /gift-posts/by-user/:userId — public Gift Wall. Anonymous
// viewers are supported on the backend (OptionalJwtAuthGuard); we
// pass the access token when we have it so the owner-viewer
// distinction is correct.
export async function fetchUserGiftPosts(args: {
  userId: string
  accessToken?: string | null
}): Promise<BackendGiftPostView[]> {
  const headers: Record<string, string> = {}
  if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`
  const res = await fetch(`${API_BASE}/gift-posts/by-user/${args.userId}`, {
    headers,
  })
  if (!res.ok) return []
  return (await res.json()) as BackendGiftPostView[]
}

// GET /gift-posts/by-slug/:slug — /p/<slug> public route. The
// backend collapses 'private' / 'deactivated' / 'unknown' into a
// single 404 so we don't leak which case it is.
export async function fetchGiftPostBySlug(args: {
  slug: string
  accessToken?: string | null
}): Promise<BackendGiftPostView | null> {
  const headers: Record<string, string> = {}
  if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`
  const res = await fetch(`${API_BASE}/gift-posts/by-slug/${args.slug}`, {
    headers,
  })
  if (!res.ok) return null
  return (await res.json()) as BackendGiftPostView
}

// Build the canonical share URL for a slug. The /p/<slug> route is
// the share-friendly version; the API URL is for AJAX calls.
//
// Origin resolution lives in lib/siteOrigin.ts so server + client
// agree on the canonical host (important for OG metadata).
export function giftPostShareUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/p/${slug}`
}
