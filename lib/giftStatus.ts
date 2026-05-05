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
  }
}
