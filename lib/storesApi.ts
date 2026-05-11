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
}

function authHeaders(token: string | null) {
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
    imageUrl?: string | null
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
    imageUrl: string | null
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

