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

export type TreasuryAttestationRow = {
  id: string
  accountType: string
  currency: string
  balance: number
  asOfDate: string
  source: string
  evidenceRef: string
  notes: string | null
  recordedBy: string
  createdAt: string
}

export type TreasuryReconciliationDetail = TreasuryReconciliationRow & {
  investigatedBy: string | null
  investigationNotes: string | null
  resolvedBy: string | null
  resolutionKind: string | null
  resolutionNotes: string | null
  resolutionEvidenceRef: string | null
  resolutionMatchedRunId: string | null
  snapshot: {
    identity?: {
      accountType: string
      currency: string
      cutoffAt: string
      timezone: string
    }
    attestation?: {
      id: string
      balanceMinor: number
      asOfDate: string
      source: string
      evidenceRef: string
    } | null
    attestationEvidenceHash?: string | null
    legs?: Record<string, number | null>
    deltas?: Record<string, number | null>
    differences?: Array<{
      kind: string
      deltaMinor: number
      detail: string
      ledgerId?: string
      eventType?: string
    }>
    alerts?: TreasuryAlert[]
    pendingInternalTransfers?: PendingInternalTransfer[]
    nonCashClosures?: Array<Record<string, unknown>>
    cash?: { timing?: Array<Record<string, unknown>> }
  }
}

// Mutations: POST with typed refusal mapping — the server's stable
// error codes ARE the contract; the UI never invents outcomes.
export type MutationOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'restricted' }
  | { kind: 'refused'; code: string }
  | { kind: 'error' }

async function postJson<T>(
  token: string,
  path: string,
  body: unknown,
): Promise<MutationOutcome<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    })
    if (res.status === 401 || res.status === 403) return { kind: 'restricted' }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      if (payload?.message && res.status < 500) {
        return { kind: 'refused', code: String(payload.message) }
      }
      return { kind: 'error' }
    }
    return { kind: 'ok', data: (await res.json()) as T }
  } catch {
    return { kind: 'error' }
  }
}

export function listTreasuryAttestations(token: string) {
  return getJson<TreasuryAttestationRow[]>(
    token,
    '/admin/finance/treasury/attestations',
  )
}

export function recordTreasuryAttestation(
  token: string,
  input: {
    balance: number
    asOfDate: string
    evidenceRef: string
    source?: string
    notes?: string
  },
) {
  return postJson<TreasuryAttestationRow>(
    token,
    '/admin/finance/treasury/attestations',
    input,
  )
}

export function runTreasuryReconciliation(
  token: string,
  input: { asOfDate: string; attestationId?: string },
) {
  return postJson<TreasuryReconciliationRow>(
    token,
    '/admin/finance/treasury/reconciliations',
    input,
  )
}

export function getTreasuryReconciliation(token: string, id: string) {
  return getJson<TreasuryReconciliationDetail>(
    token,
    `/admin/finance/treasury/reconciliations/${encodeURIComponent(id)}`,
  )
}

export function investigateTreasuryReconciliation(
  token: string,
  id: string,
  input: { notes: string },
) {
  return postJson<TreasuryReconciliationRow>(
    token,
    `/admin/finance/treasury/reconciliations/${encodeURIComponent(id)}/investigate`,
    input,
  )
}

export function resolveTreasuryReconciliation(
  token: string,
  id: string,
  input: {
    notes: string
    resolutionKind: string
    evidenceRef?: string
    matchedReconciliationId?: string
  },
) {
  return postJson<TreasuryReconciliationRow>(
    token,
    `/admin/finance/treasury/reconciliations/${encodeURIComponent(id)}/resolve`,
    input,
  )
}

export function getMyOpsPermissions(token: string) {
  return getJson<{ roles: string[]; permissions: string[] }>(
    token,
    '/admin/me/ops-roles',
  )
}

// ── Internal transfers (Lane 2 PR 3 Scope C — evidence lifecycle) ──
// A §26 zero-net close leaves Qift's own money in the safeguarding
// account: an INTERNAL TRANSFER DUE. The server derives `pending`
// from ledger postings (never a fabricated status row); the ONLY
// write is evidence of the physical bank movement. This is Qift's own
// money — never a merchant remittance.

export type InternalTransferRow = {
  id: string
  settlementId: string
  settlementReference: string
  currency: string
  confirmedAmount: number | string
  bankReference: string
  valueDate: string
  accountFromMasked: string
  accountToMasked: string
  status: string
  recordedBy: string
  notes: string | null
  createdAt: string
}

export function listInternalTransfers(token: string) {
  return getJson<{
    transfers: InternalTransferRow[]
    pending: PendingInternalTransfer[]
  }>(token, '/admin/finance/treasury/internal-transfers')
}

// The Settlement Statement that originated a zero-net close (issued
// legal instrument; SC §26). Rendered read-only for linkage — the
// full settlement view ships in Console PR 4.
export type SettlementStatementRecord = {
  id: string
  settlementId: string
  settlementReference: string
  storeId: string
  statementVersion: string
  statementHash: string
  issuedAt: string
}

export function getSettlementStatement(token: string, settlementId: string) {
  return getJson<SettlementStatementRecord>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(settlementId)}/statement`,
  )
}

export function recordInternalTransfer(
  token: string,
  input: {
    settlementId: string
    bankReference: string
    valueDate: string
    confirmedAmount: number
    accountFromMasked: string
    accountToMasked: string
    status?: 'completed' | 'failed'
    notes?: string
  },
) {
  return postJson<InternalTransferRow>(
    token,
    '/admin/finance/treasury/internal-transfers',
    input,
  )
}

// ── Settlement operations (Console PR 4) ───────────────────────────
// SETTLE-1/2 + SC §26/§31-34 surfaces. LAW: the backend gate
// (QIFT_FINANCIAL_GATES_ATTESTED, checked server-side) is the ONLY
// authority on whether production money actions run — the UI submits
// and renders the server's verdict verbatim; it NEVER simulates gate
// success (financial_gates_not_attested renders as the refusal it is).

export type SettlementReceiptRow = {
  id: string
  invoiceType: string
  invoiceId: string
  amount: number | string
  currency: string
  bankReference: string
  receivedAt: string
  rail: string | null
  recordedBy: string
  createdAt: string
}

// Server-computed invoice receipt position — every figure verbatim
// (totalAmount is the EFFECTIVE total with credits netted, computed
// server-side; the UI never derives balances).
export type InvoiceReceiptsSummary = {
  invoiceType: string
  invoiceId: string
  invoiceNumber: string | null
  status: string
  totalAmount: number
  creditedAmount: number
  amountReceived: number
  balance: number
  receipts: SettlementReceiptRow[]
}

export function listSettlementReceipts(
  token: string,
  invoiceType: string,
  invoiceId: string,
) {
  const q = new URLSearchParams({ invoiceType, invoiceId })
  return getJson<InvoiceReceiptsSummary>(
    token,
    `/admin/finance/receipts?${q}`,
  )
}

export function recordSettlementReceipt(
  token: string,
  input: {
    invoiceType: string
    invoiceId: string
    amount: number
    bankReference: string
    receivedAt: string
  },
) {
  return postJson<{ receipt: SettlementReceiptRow }>(
    token,
    '/admin/finance/receipts',
    input,
  )
}

// The §4 calculation snapshot — rendered VERBATIM, never recomputed.
export type SettlementCalculationSnapshot = {
  currency: string
  lines: Record<string, number>
  netAmount: number
  itemCount: number
}

export type SettlementBatchRow = {
  id: string
  settlementReference: string
  storeId: string
  currency: string
  status: string
  windowType: string
  grossAmount: number | string
  netAmount: number | string
  composition: Array<Record<string, unknown>>
  calculationSnapshot: SettlementCalculationSnapshot
  supersededById: string | null
  failureEvidence: string | null
  closureType: string | null
  closedAt: string | null
  createdAt: string
}

export function listSettlementBatches(token: string) {
  return getJson<SettlementBatchRow[]>(
    token,
    '/admin/finance/settlement/batches',
  )
}

export type SettlementSimulation = {
  simulation: true
  snapshotAt: string
  storeId: string
  currency: string
  itemCount: number
  calculation: SettlementCalculationSnapshot | null
  recoveryAllocation?: Array<Record<string, unknown>>
}

export function simulateSettlement(token: string, storeId: string) {
  return postJson<SettlementSimulation>(
    token,
    '/admin/finance/settlement/simulate',
    { storeId },
  )
}

export function assembleSettlement(token: string, storeId: string) {
  return postJson<SettlementBatchRow>(
    token,
    '/admin/finance/settlement/assemble',
    { storeId },
  )
}

export type SettlementExecutionPreview = {
  preview: true
  settlementId: string
  settlementReference: string
  storeId: string
  currency: string
  netAmount: number
  itemCount: number
  calculationHash: string
  replayVerified: boolean
  asOf: string
}

export function previewSettlementExecution(token: string, batchId: string) {
  return postJson<SettlementExecutionPreview>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/preview`,
    {},
  )
}

export function approveSettlementExecution(
  token: string,
  batchId: string,
  input: { calculationHash: string; note?: string },
) {
  return postJson<{
    approvalId?: string
    requirement?: { level: number; policyVersion: string }
    approvals?: number
  }>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/approve`,
    input,
  )
}

export function executeSettlement(
  token: string,
  batchId: string,
  input: {
    previewHash: string
    bankTransferReference: string
    executedAt: string
  },
) {
  return postJson<Record<string, unknown>>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/execute`,
    input,
  )
}

export function closeSettlementZeroNet(
  token: string,
  batchId: string,
  input: { previewHash: string },
) {
  return postJson<Record<string, unknown>>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/close-zero-net`,
    input,
  )
}

export type SettlementStatementFull = SettlementStatementRecord & {
  canonicalJson: string
  payload: Record<string, unknown>
  signatures: Array<{
    id: string
    signerRole?: string
    signedBy?: string
    signedAt?: string
  }>
}

export function getSettlementStatementFull(token: string, batchId: string) {
  return getJson<SettlementStatementFull>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/statement`,
  )
}

export type SettlementReplayResult = {
  settlementReference: string
  replayEngineVersion: string
  calculationReplayVerified: boolean
  statementIntegrityVerified: boolean
  statementIdentical: boolean
  storedStatementHash: string
  regeneratedStatementHash: string
}

export function replaySettlement(token: string, batchId: string) {
  return getJson<SettlementReplayResult>(
    token,
    `/admin/finance/settlement/${encodeURIComponent(batchId)}/replay`,
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
