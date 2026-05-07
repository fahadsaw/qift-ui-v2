// Shared helpers for the Gift v3 tracking pipeline. Frontend mirror of
// apps/api/src/gifts/gift-status.ts — keep the order in sync.

import type { GiftStatus } from './sampleData'

// Display order, used by the timeline. We collapse address_confirmed and
// default_address_used into a single "address" slot because they're two
// paths through the same milestone; the row label tells the user which
// path was taken.
export type TimelineKey =
  | 'created'
  | 'address'
  | 'preparing'
  | 'shipped'
  | 'delivered'

export const TIMELINE_STEPS: TimelineKey[] = [
  'created',
  'address',
  'preparing',
  'shipped',
  'delivered',
]

// Numeric rank for "is X past Y on the pipeline". Higher = further along.
// Cancelled is off the pipeline entirely — we return -1 so any ranked
// comparison naturally treats it as "before everything", and the
// timeline renderer special-cases it via the dedicated red state.
export function statusRank(status: GiftStatus): number {
  switch (status) {
    case 'pending_address':
      return 0
    case 'address_confirmed':
    case 'default_address_used':
      return 1
    case 'preparing':
      return 2
    case 'shipped':
      return 3
    case 'delivered':
      return 4
    case 'cancelled':
      return -1
  }
}

const TIMELINE_RANK: Record<TimelineKey, number> = {
  created: 0,
  address: 1,
  preparing: 2,
  shipped: 3,
  delivered: 4,
}

// State of a timeline node relative to the current gift status.
export type TimelineState = 'completed' | 'current' | 'upcoming'

export function timelineStateFor(
  step: TimelineKey,
  status: GiftStatus,
): TimelineState {
  // Cancelled gifts have no positive-progress timeline. Every step
  // renders as `upcoming` so the page falls back to the dedicated
  // cancelled banner instead of misleading "completed" checkmarks.
  if (status === 'cancelled') return 'upcoming'
  const stepRank = TIMELINE_RANK[step]
  const current = statusRank(status)
  if (stepRank < current) return 'completed'
  if (stepRank === current) return 'current'
  return 'upcoming'
}

// Single source of truth for the badge color across pages.
//   pending_address      → primary
//   address_confirmed    → blue
//   default_address_used → blue (same milestone, different path)
//   preparing            → amber
//   shipped              → indigo
//   delivered            → green
//   cancelled            → red (matches the warning palette used
//                          elsewhere for destructive states)
export function colorForStatus(status: GiftStatus): string {
  switch (status) {
    case 'pending_address':
      return 'var(--primary)'
    case 'address_confirmed':
    case 'default_address_used':
      return '#3B82F6'
    case 'preparing':
      return '#E89B3A'
    case 'shipped':
      return '#6366F1'
    case 'delivered':
      return '#3FA46A'
    case 'cancelled':
      return '#D55B6E'
  }
}

// Audience-aware status copy. The same underlying status reads
// differently to the sender vs the receiver, e.g.:
//   - pending_address: sender waits, receiver acts.
//   - address_confirmed: sender's gift was accepted, receiver locked in.
//
// We map both sides through one helper so the /gifts list and
// /gifts/[id] pages can't drift apart on wording. The returned key
// resolves through the existing i18n table.
export function statusCopyKey(
  status: GiftStatus,
  direction: 'sent' | 'received',
): string {
  switch (status) {
    case 'pending_address':
      return direction === 'sent'
        ? 'gifts.status_sent_pending_address'
        : 'gifts.status_received_pending_address'
    case 'address_confirmed':
      return direction === 'sent'
        ? 'gifts.status_sent_address_confirmed'
        : 'gifts.status_received_address_confirmed'
    case 'default_address_used':
      return direction === 'sent'
        ? 'gifts.status_sent_default_address_used'
        : 'gifts.status_received_default_address_used'
    case 'preparing':
      return 'gifts.status_preparing'
    case 'shipped':
      return 'gifts.status_shipped'
    case 'delivered':
      return 'gifts.status_delivered'
    case 'cancelled':
      return 'gifts.status_cancelled'
  }
}
