// Shared types for the merchant /store-dashboard surface.
// Scoped to /store-dashboard rather than `lib/` because nothing
// outside this route should be reaching into merchant-internal
// shapes.

import type { GiftStatus } from '@/lib/sampleData'

// BACKEND CONTRACT
// /store/orders MUST return rows in `pending_address` status too
// (with their address fields nulled out — the recipient hasn't
// chosen yet). Until the backend ships that, this type narrowing
// is a no-op (the array is just empty for that status) but the
// rendering path is ready.
export type DashboardStatus = Extract<
  GiftStatus,
  | 'pending_address'
  | 'address_confirmed'
  | 'default_address_used'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
>

export type StoreOrder = {
  giftId: string
  productName: string
  storeName: string
  receiverName: string
  // Single-line, courier-friendly Arabic-comma string built server-side.
  // Empty string for `pending_address` rows (the recipient hasn't picked
  // an address yet); the rendering path falls back to a "awaiting
  // address" hint in that case.
  address: string
  deliveryPhone: string | null
  // Raw address breakdown — used by the details modal so each field gets
  // its own labelled row. All nullable; older addresses may not have all
  // columns populated AND `pending_address` rows have them all null.
  region: string | null
  city: string | null
  district: string | null
  street: string | null
  buildingNumber: string | null
  status: DashboardStatus
  trackingNumber: string | null
  carrier: string | null
  createdAt: string
  confirmedAt?: string | null
  shippedAt?: string | null
  // Note: messageText / mediaUrl / mediaType are intentionally absent.
  // The backend doesn't ship them to the store; reading them client-side
  // would just be undefined.
}

export type ActionKind = 'prepare' | 'ship' | 'deliver'
export type ActionInFlight = { id: string; kind: ActionKind }
