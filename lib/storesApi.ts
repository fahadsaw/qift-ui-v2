// Frontend API helpers + types for the Stores / Products / Integrations
// modules. Keeping them in one place stops the various dashboard pages
// drifting on field names.

import { API_BASE } from './apiBase'

export type StoreCategoryCode =
  | 'flowers'
  | 'chocolate'
  | 'cake'
  | 'perishable'
  | 'perfume'
  | 'gifts'
  | 'other'

export type IntegrationType =
  | 'none'
  | 'api'
  | 'shopify'
  | 'woocommerce'
  | 'custom'

export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export type ApiStore = {
  id: string
  name: string
  city: string
  category: string
  ownerId: string
  integrationType: IntegrationType
  integrationStatus: IntegrationStatus
  createdAt: string
  // Onboarding-v2 — present on every response (the backend's
  // PUBLIC_STORE_SELECT now includes status). Pre-v2 rows
  // backfilled to "approved" so existing merchants keep working.
  status?: string
  // Merchant platform tier — starter | pro | enterprise. Default
  // 'starter'. Drives the capability map in lib/merchantPlans.ts.
  // Optional on the wire so old caches keep typechecking; the
  // capability helper treats undefined / unknown values as
  // 'starter'.
  plan?: string
  // Marketplace surfacing flag. True when admin-toggled into the
  // /stores Featured rail. Optional on the wire so older caches
  // still typecheck.
  featured?: boolean
  // Storefront theme (Phase 5). The server has already resolved
  // an ineligible stored slug down to 'classic' before the wire
  // ships — the dispatcher trusts this value as authoritative.
  // Optional on the wire so older caches keep typechecking.
  themeSlug?: 'classic' | 'gallery' | 'editorial'
  // Bounded per-store branding overrides — see
  // apps/api/src/stores/storefront-themes.ts for the allow-list.
  themeConfig?: {
    accentColor?: string
    bannerImageUrl?: string
    heroHeadline?: string
    heroSubhead?: string
    themeSpecific?: Record<string, unknown>
  } | null
  // Per-metric publicity flags. Unset keys = hidden. Same opt-in
  // pattern as User.preferencesVisibility (Phase 2). The
  // <MetricChip> primitive renders nothing for missing keys, so
  // a hidden metric never reaches a theme.
  metricsVisibility?: Record<string, boolean> | null
  // Public branding fields. Selected by the backend's
  // PUBLIC_STORE_SELECT, so every storefront response carries them.
  // Themes consume these through the storefront adapter — never
  // directly from ApiStore.
  logoUrl?: string | null
  coverImageUrl?: string | null
  websiteUrl?: string | null
  instagramHandle?: string | null
  tiktokHandle?: string | null
  snapchatHandle?: string | null
}

// Storefront-theme setter (Phase 5). Service-side validates
// ownership + plan capability + sanitizes themeConfig through
// the bounded allow-list. Unknown keys silently dropped.
export async function setStoreTheme(
  token: string,
  storeId: string,
  body: { themeSlug?: string; themeConfig?: unknown | null },
): Promise<ApiStore> {
  const res = await fetch(`${API_BASE}/stores/${storeId}/theme`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { message?: string | string[] }
      | null
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message
    throw new Error(msg || 'Could not update theme')
  }
  return (await res.json()) as ApiStore
}

// Per-metric publicity setter (Phase 5). Same opt-in basis as
// the user-side preferences visibility. Pass `null` to clear all
// flags (column reverts to NULL → all hidden).
export async function setStoreMetricsVisibility(
  token: string,
  storeId: string,
  metricsVisibility: Record<string, boolean> | null,
): Promise<ApiStore> {
  const res = await fetch(`${API_BASE}/stores/${storeId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ metricsVisibility }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { message?: string | string[] }
      | null
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message
    throw new Error(msg || 'Could not update visibility')
  }
  return (await res.json()) as ApiStore
}

export type ApiProduct = {
  id: string
  storeId: string
  name: string
  price: number
  imageUrl: string | null
  category: string
  isFastDelivery: boolean
  sourceType: 'manual' | 'api'
  externalProductId: string | null
  stockStatus: 'in_stock' | 'out_of_stock'
  isAvailable: boolean
  lastSyncedAt: string | null
  createdAt: string
  // Phase 5 storefront gallery — ordered product media. The first
  // row (displayOrder = 0) mirrors `imageUrl` for legacy callers.
  // Optional on the wire so a stale frontend build keeps working
  // against either an older API or older cached responses.
  //
  // Phase 2.5a (backend) — `imageMeta` is the per-image sparse
  // metadata blob (intended for width/height/mime/alt). Present
  // on the wire but typically `null` during closed beta until
  // the storefront gallery render (Phase 2.5c) populates it.
  images?: { url: string; displayOrder: number; imageMeta?: unknown }[]
  // Phase 2.5a (backend) — optional product video. Surfaced on
  // every product read so a future storefront renderer can opt
  // in; closed beta keeps playback hidden behind a feature flag
  // on the frontend. `videoType` discriminates the player.
  videoUrl?: string | null
  videoType?: 'mp4' | 'webm' | 'mov' | null
  // Phase 5 metrics-on-the-wire. Sparse dict — only the keys the
  // merchant explicitly opted into via Store.metricsVisibility
  // reach this field. Hidden keys are NEVER present (the backend
  // projection drops them before the wire). Themes consume these
  // through <MetricChip>, which guards on undefined values so a
  // missing key renders nothing.
  //
  // V1 ships three gifting-emotional signals — see
  // METRICS_VISIBILITY_KEYS in the backend for the philosophy
  // behind the trimmed set. Optional on the wire so older API
  // responses keep typechecking.
  metrics?: {
    wishlistSaves?: number
    giftedCount?: number
    trendingIndicator?: boolean
  }
}

// Exported so sibling client helpers (lib/productMedia.ts, etc.)
// reuse the exact same bearer-prefix convention; without this the
// helpers would have to re-derive it and risk silent divergence
// if the auth scheme ever changes.
export function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

// --- Stores ---

export async function listStores(): Promise<ApiStore[]> {
  const res = await fetch(`${API_BASE}/stores`, { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()) as ApiStore[]
}

export async function listMyStores(token: string | null): Promise<ApiStore[]> {
  if (!token) return []
  const res = await fetch(`${API_BASE}/stores/me`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return []
  return (await res.json()) as ApiStore[]
}

export async function getStore(id: string): Promise<ApiStore | null> {
  const res = await fetch(`${API_BASE}/stores/${id}`)
  if (!res.ok) return null
  return (await res.json()) as ApiStore
}

// Onboarding-v2 fields. All optional — sent in addition to the
// required name/city/category triple. Mirrors the backend's
// CreateStoreInput in apps/api/src/stores/stores.service.ts.
export type CreateStoreInputV2 = {
  name: string
  city: string
  category: string
  // Business identity
  legalEntityName?: string
  countryOfRegistration?: string
  commercialRegistrationNumber?: string
  vatNumber?: string
  // Contact PoC
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  // Branding & social
  logoUrl?: string
  coverImageUrl?: string
  websiteUrl?: string
  instagramHandle?: string
  tiktokHandle?: string
  snapchatHandle?: string
  // Coverage zones — array of { city, districts?, note? }.
  deliveryZones?: { city: string; districts?: string[]; note?: string }[]
}

export async function createStore(
  token: string,
  body: CreateStoreInputV2,
): Promise<ApiStore> {
  const res = await fetch(`${API_BASE}/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'create_store_failed')
  }
  return (await res.json()) as ApiStore
}

// Owner-side detail with the rich projection (status, rejectionReason,
// zones, contact info). Used by the merchant pending-approval screen
// + the multi-step onboarding form's resume mode.
export type OwnerStore = ApiStore & {
  status: string
  plan: string
  legalEntityName: string | null
  countryOfRegistration: string | null
  commercialRegistrationNumber: string | null
  vatNumber: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  websiteUrl: string | null
  instagramHandle: string | null
  tiktokHandle: string | null
  snapchatHandle: string | null
  deliveryZones: { city: string; districts?: string[]; note?: string }[] | null
  rejectionReason: string | null
  submittedAt: string | null
  reviewedAt: string | null
}

export async function getOwnerStore(
  token: string,
  storeId: string,
): Promise<OwnerStore | null> {
  const res = await fetch(`${API_BASE}/stores/${storeId}/owner`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as OwnerStore
}

export async function patchStore(
  token: string,
  storeId: string,
  body: Partial<CreateStoreInputV2>,
): Promise<OwnerStore> {
  const res = await fetch(`${API_BASE}/stores/${storeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('patch_store_failed')
  return (await res.json()) as OwnerStore
}

export async function submitStoreForReview(
  token: string,
  storeId: string,
): Promise<OwnerStore> {
  const res = await fetch(`${API_BASE}/stores/${storeId}/submit`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'submit_store_failed')
  }
  return (await res.json()) as OwnerStore
}

// Documents
export type StoreDocument = {
  id: string
  type:
    | 'commercial_registration'
    | 'vat_certificate'
    | 'business_license'
    | 'owner_id'
    | 'other'
  fileUrl: string
  fileName: string | null
  contentType: string | null
  uploadedAt: string
}

export async function listStoreDocuments(
  token: string,
  storeId: string,
): Promise<StoreDocument[]> {
  const url = new URL(`${API_BASE}/media/store-document`)
  url.searchParams.set('storeId', storeId)
  const res = await fetch(url.toString(), { headers: authHeaders(token) })
  if (!res.ok) return []
  return (await res.json()) as StoreDocument[]
}

export async function uploadStoreDocument(
  token: string,
  args: {
    storeId: string
    type: StoreDocument['type']
    file: File
  },
): Promise<StoreDocument> {
  const form = new FormData()
  form.append('file', args.file)
  form.append('storeId', args.storeId)
  form.append('type', args.type)
  if (args.file.name) form.append('fileName', args.file.name)
  const res = await fetch(`${API_BASE}/media/store-document`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'upload_doc_failed')
  }
  return (await res.json()) as StoreDocument
}

export async function deleteStoreDocument(
  token: string,
  docId: string,
): Promise<void> {
  await fetch(`${API_BASE}/media/store-document/${docId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

// Admin review
export async function adminReviewStore(
  token: string,
  storeId: string,
  action: 'approve' | 'reject' | 'request_changes',
  reason?: string,
): Promise<OwnerStore> {
  const res = await fetch(`${API_BASE}/admin/stores/${storeId}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ action, reason: reason ?? null }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'review_failed')
  }
  return (await res.json()) as OwnerStore
}

export async function adminGetStoreDetail(
  token: string,
  storeId: string,
): Promise<OwnerStore | null> {
  const res = await fetch(`${API_BASE}/admin/stores/${storeId}/detail`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as OwnerStore
}

export async function adminListStoreDocuments(
  token: string,
  storeId: string,
): Promise<StoreDocument[]> {
  const res = await fetch(
    `${API_BASE}/admin/stores/${storeId}/documents`,
    { headers: authHeaders(token) },
  )
  if (!res.ok) return []
  return (await res.json()) as StoreDocument[]
}

// ── Seed verification + on-demand seed ────────────────────────────
// Backend admin endpoints. Used by the diagnostics panel to verify
// production state after a merchant-onboarding-v2 deploy.

export type SeededStoreInfo = {
  id: string
  name: string
  // 'approved' = publicly visible; pending/changes_requested/rejected
  // are filtered out of /stores. Null on legacy rows that pre-date
  // onboarding-v2.
  status: string | null
}

export type MerchantSeedProbe = {
  username: string
  userExists: boolean
  role: string | null
  phoneMasked: string | null
  ownedStoreCount: number
  productCount: number
  stores: SeededStoreInfo[]
}

export type SeedStatus = {
  migrationApplied: boolean
  missingColumns: string[]
  merchants: MerchantSeedProbe[]
}

export async function adminGetSeedStatus(
  token: string,
): Promise<SeedStatus | null> {
  const res = await fetch(`${API_BASE}/admin/debug/seed-status`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as SeedStatus
}

export async function adminSeedMerchants(
  token: string,
): Promise<{
  seeded: string[]
  storeIds: string[]
  productCount: number
} | null> {
  const res = await fetch(`${API_BASE}/admin/debug/seed-merchants`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as {
    seeded: string[]
    storeIds: string[]
    productCount: number
  }
}

// ── Merchant analytics, payouts, shipments ───────────────────
// Backed by GET /store/analytics, GET /store/payouts,
// GET/POST /store/orders/:id/shipment*. The merchant role +
// store ownership are enforced server-side by JwtAuthGuard +
// StoreGuard; the frontend just routes on auth state.

export type StoreAnalytics = {
  totalOrders: number
  statusCounts: Record<string, number>
  revenue: { today: number; week: number; month: number; allTime: number }
  avgOrderValue: number
  deliverySuccessRate: number | null
  topProducts: { productName: string; count: number }[]
}

export async function getStoreAnalytics(
  token: string,
): Promise<StoreAnalytics | null> {
  const res = await fetch(`${API_BASE}/store/analytics`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as StoreAnalytics
}

export type StorePayouts = {
  currency: string
  grossRevenue: number
  platformFees: number
  deliveryFees: number
  netPayable: number
  paid: number
  pending: number
  platformFeePercent: number
  items: {
    giftId: string
    productName: string
    status: string
    gross: number
    platformFee: number
    deliveryFee: number
    net: number
    currency: string
    createdAt: string
  }[]
}

export async function getStorePayouts(
  token: string,
): Promise<StorePayouts | null> {
  const res = await fetch(`${API_BASE}/store/payouts`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return (await res.json()) as StorePayouts
}

export type ShippingProvider = {
  code: string
  nameAr: string
  nameEn: string
  trackingUrlTemplate: string | null
}

export async function listShippingProviders(
  token: string,
): Promise<ShippingProvider[]> {
  const res = await fetch(`${API_BASE}/store/shipping-providers`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return []
  return (await res.json()) as ShippingProvider[]
}

export type ShipmentEvent = {
  id: string
  status: string
  note: string | null
  occurredAt: string
}

export type StoreShipment = {
  id: string
  giftId: string
  provider: string
  trackingNumber: string | null
  trackingUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
  events: ShipmentEvent[]
}

export type StoreShipmentResponse = {
  shipment: StoreShipment | null
  legacyTrackingNumber: string | null
  legacyCarrier: string | null
}

export async function getOrderShipment(
  token: string,
  giftId: string,
): Promise<StoreShipmentResponse | null> {
  const res = await fetch(
    `${API_BASE}/store/orders/${encodeURIComponent(giftId)}/shipment`,
    { headers: authHeaders(token) },
  )
  if (!res.ok) return null
  return (await res.json()) as StoreShipmentResponse
}

export async function upsertOrderShipment(
  token: string,
  giftId: string,
  body: { provider: string; trackingNumber?: string },
): Promise<StoreShipment | null> {
  const res = await fetch(
    `${API_BASE}/store/orders/${encodeURIComponent(giftId)}/shipment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) return null
  return (await res.json()) as StoreShipment
}

export async function appendShipmentEvent(
  token: string,
  giftId: string,
  body: { status: string; note?: string; occurredAt?: string },
): Promise<StoreShipmentResponse | null> {
  const res = await fetch(
    `${API_BASE}/store/orders/${encodeURIComponent(giftId)}/shipment/event`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) return null
  return (await res.json()) as StoreShipmentResponse
}

// --- Products ---

export async function listProducts(
  storeId: string,
  opts: { includeUnavailable?: boolean; token?: string | null } = {},
): Promise<ApiProduct[]> {
  if (!storeId) return []
  const url = new URL(`${API_BASE}/products`)
  url.searchParams.set('storeId', storeId)
  if (opts.includeUnavailable) url.searchParams.set('includeUnavailable', 'true')
  const res = await fetch(url.toString(), {
    headers: authHeaders(opts.token ?? null),
    cache: 'no-store',
  })
  if (!res.ok) return []
  return (await res.json()) as ApiProduct[]
}

export async function createProduct(
  token: string,
  body: {
    storeId: string
    name: string
    price: number
    category: string
    // Legacy single-image field. Kept for backward compat — the
    // Phase 2.5a backend denormalises Product.imageUrl from
    // imageUrls[0] when imageUrls is provided. A caller that
    // sends ONLY imageUrl behaves exactly as before; a caller
    // that sends imageUrls wins.
    imageUrl?: string | null
    // Phase 2.5b — ordered product image gallery, primary first.
    // Capped at 8 entries by the backend. Each URL is typically
    // produced by uploadProductImage() (lib/productMedia.ts).
    imageUrls?: string[]
    // Phase 2.5b — optional product video. Backend accepts the
    // write today; storefront playback ships behind
    // NEXT_PUBLIC_PRODUCT_VIDEO_ENABLED. Both fields must be
    // provided together or both omitted.
    videoUrl?: string | null
    videoType?: 'mp4' | 'webm' | 'mov' | null
    isFastDelivery?: boolean
    stockStatus?: 'in_stock' | 'out_of_stock'
  },
): Promise<ApiProduct> {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'create_product_failed')
  }
  return (await res.json()) as ApiProduct
}

export async function updateProduct(
  token: string,
  id: string,
  body: Partial<{
    name: string
    price: number
    category: string
    // Legacy single-image field. Same rules as createProduct —
    // see comment there.
    imageUrl: string | null
    // Phase 2.5b — full gallery replacement. Empty array clears
    // the gallery + the denormalised imageUrl. Undefined leaves
    // both untouched (PATCH semantics).
    imageUrls: string[]
    videoUrl: string | null
    videoType: 'mp4' | 'webm' | 'mov' | null
    isFastDelivery: boolean
    stockStatus: 'in_stock' | 'out_of_stock'
    isAvailable: boolean
  }>,
): Promise<ApiProduct> {
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('update_product_failed')
  return (await res.json()) as ApiProduct
}

export async function deleteProduct(
  token: string,
  id: string,
): Promise<{ ok: true }> {
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('delete_product_failed')
  return { ok: true }
}

// --- Integrations ---

export async function connectIntegration(
  token: string,
  body: { storeId: string; integrationType: IntegrationType },
): Promise<{
  id: string
  integrationType: IntegrationType
  integrationStatus: IntegrationStatus
  webhookSecret?: string
}> {
  const res = await fetch(`${API_BASE}/store-integrations/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('connect_failed')
  return await res.json()
}

export async function syncProducts(
  token: string,
  storeId: string,
): Promise<{ ok: boolean; syncedCount: number }> {
  const res = await fetch(`${API_BASE}/store-integrations/sync-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ storeId }),
  })
  if (!res.ok) throw new Error('sync_failed')
  return await res.json()
}

