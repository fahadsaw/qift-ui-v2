// Buyer order history client (Track A.5 PR 7).
//
// The buyer's purchase record keyed by the canonical QP reference.
// Owner-scoped server-side (JWT); this module is a thin typed fetch.

import { API_BASE } from './apiBase'

export type OrderSummary = {
  id: string
  // Canonical personal-order reference (QP-XXXX-XXXX).
  orderNumber: string
  status: 'pending' | 'processing' | 'paid' | 'failed' | string
  productName: string
  storeName: string
  receiverUsername: string
  totalAmount: number
  currency: string
  createdAt: string
  giftId: string | null
  gift: { status: string; fulfillmentNumber: string } | null
}

export async function fetchMyOrders(
  accessToken: string,
): Promise<OrderSummary[]> {
  const res = await fetch(`${API_BASE}/orders`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`orders_fetch_failed_${res.status}`)
  return (await res.json()) as OrderSummary[]
}
