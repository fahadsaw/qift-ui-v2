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

export async function createStore(
  token: string,
  body: { name: string; city: string; category: string },
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

// Cuid v1 ids start with `c` and are 25 chars long. Used to decide
// whether a /stores/[id] route is hitting a real API store or a sample
// id like 'rosary'.
export function looksLikeCuid(id: string): boolean {
  return /^c[a-z0-9]{20,32}$/.test(id)
}
