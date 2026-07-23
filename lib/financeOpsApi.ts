// Finance Ops Console — typed client for the authorized treasury /
// settlement admin APIs (FINANCE OPS CONSOLE program, PR 1).
//
// LAW (founder mandate): the backend APIs are the ONLY source of
// truth. This module performs NO financial calculations — every
// figure renders exactly as the server computed it. The single
// helper below is UNIT PRESENTATION of a server-computed integer
// (minor units → display string at the currency's fixed exponent),
// never arithmetic over money.
//
// Constitutional surfaces consumed here: SC §10.3 three-way treasury
// reconciliation, §26 internal-transfer-due, Lane 2 PR 3 Scope D
// health/alerts. All endpoints are RBAC-guarded server-side
// (finance.reconcile); the UI additionally permission-gates for UX.

import { API_BASE } from './apiBase'

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

// ── Types mirroring the server responses (verbatim fields) ─────────

export type TreasuryAlert = {
  kind:
    | 'reconciliation_zero_violated'
    | 'mismatched_run'
    | 'unresolved_evidence'
    | 'internal_transfer_pending_aging'
  detail: string
}

export type PendingInternalTransfer = {
  settlementId: string
  settlementReference: string
  currency: string
  outstandingMinor: number
  closedAt: string | null
  ageDays: number
  failedAttempts: number
}

export type TreasuryHealth = {
  reconciliationZero: boolean
  latestRun: {
    id: string
    asOfDate: string
    status: string
    differenceCount: number
    snapshotHash: string
    alerts: TreasuryAlert[]
    deltas: Record<string, number | null> | null
  } | null
  mismatchedOpen: number
  investigatedOpen: number
  pendingInternalTransfers: PendingInternalTransfer[]
}

export type TreasuryReconciliationRow = {
  id: string
  accountType: string
  currency: string
  asOfDate: string
  attestationId: string | null
  status: string
  bankBalance: number | null
  ledgerCashBalance: number
  obligationsBalance: number
  bankVsCashDelta: number | null
  cashVsObligationsDelta: number
  differenceCount: number
  snapshotHash: string
  computedBy: string
  createdAt: string
  integrityOk?: boolean
}

// ── Fetchers (401/403 → 'restricted'; network/5xx → 'error') ───────

export type FetchOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'restricted' }
  | { kind: 'error' }

async function getJson<T>(
  token: string,
  path: string,
): Promise<FetchOutcome<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders(token),
    })
    if (res.status === 401 || res.status === 403) return { kind: 'restricted' }
    if (!res.ok) return { kind: 'error' }
    return { kind: 'ok', data: (await res.json()) as T }
  } catch {
    return { kind: 'error' }
  }
}

export function getTreasuryHealth(token: string) {
  return getJson<TreasuryHealth>(token, '/admin/finance/treasury/health')
}

export function listTreasuryReconciliations(token: string) {
  return getJson<TreasuryReconciliationRow[]>(
    token,
    '/admin/finance/treasury/reconciliations',
  )
}

export function getMyOpsPermissions(token: string) {
  return getJson<{ roles: string[]; permissions: string[] }>(
    token,
    '/admin/me/ops-roles',
  )
}

// ── Unit presentation (NOT financial math) ─────────────────────────
// The server computes every amount; minor-unit fields are integers in
// the currency's fixed exponent (all treasury currencies are 2-dp —
// 3-dp currencies refuse server-side, Lane 2 PR 3 Scope H). This
// helper only renders that integer at its fixed scale.
const MINOR_EXPONENT: Record<string, number> = { SAR: 2, AED: 2, QAR: 2 }

export function formatMinor(minor: number, currency: string): string {
  const exp = MINOR_EXPONENT[currency] ?? 2
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const s = String(abs).padStart(exp + 1, '0')
  const major = `${s.slice(0, -exp)}.${s.slice(-exp)}`
  return `${sign}${Number(major).toLocaleString('en-US', {
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  })} ${currency}`
}

export function formatMajor(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}
