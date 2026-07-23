'use client'

// FINANCE OPS CONSOLE — PR 3: Internal transfer workflow.
//
// Constitutional surfaces: SC §26 + Lane 2 PR 3 Scope C. A zero-net
// close leaves Qift's OWN money in the safeguarding account — an
// internal transfer due (safeguarding → operating). This page renders
// the server-derived pending dues (aging, required amount, the
// originating QS + its Settlement Statement) and records the ONLY
// lawful write: evidence of the physical bank movement (bank
// reference, value date, bank-confirmed amount, executor identity
// from the session, MASKED account identifiers). `failed` records an
// evidenced failed attempt and the due stays outstanding.
//
// This is never a merchant remittance — no merchant is owed anything
// here. LAW: no client-side money math; required amounts render the
// server's integers verbatim; refusal codes surface verbatim.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  formatMajor,
  formatMinor,
  getMyOpsPermissions,
  getSettlementStatement,
  listInternalTransfers,
  recordInternalTransfer,
  type InternalTransferRow,
  type PendingInternalTransfer,
  type SettlementStatementRecord,
} from '@/lib/financeOpsApi'
import { FinanceOpsTabs, InfoRow, Ref, RefusalNote, StatusChip } from '../_atoms'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'restricted' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      pending: PendingInternalTransfer[]
      transfers: InternalTransferRow[]
    }

// Server law mirrored for display only (treasury-snapshot.ts):
// pending dues at or beyond this age raise the server's aging alert.
const AGING_ALERT_DAYS = 3

export default function InternalTransfersPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/admin/finance-ops/transfers')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      const perms = await getMyOpsPermissions(accessToken)
      if (cancelled) return
      if (perms.kind !== 'ok') {
        return setView({
          kind: perms.kind === 'restricted' ? 'restricted' : 'error',
        })
      }
      if (!perms.data.permissions.includes('finance.reconcile')) {
        return setView({ kind: 'restricted' })
      }
      const res = await listInternalTransfers(accessToken)
      if (cancelled) return
      if (res.kind !== 'ok') {
        return setView({
          kind: res.kind === 'restricted' ? 'restricted' : 'error',
        })
      }
      setView({
        kind: 'ready',
        pending: res.data.pending,
        transfers: res.data.transfers,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, reloadKey])

  const reload = () => {
    setView({ kind: 'loading' })
    setReloadKey((k) => k + 1)
  }

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('financeOps.title_1')}
          gradient={t('financeOps.title_2')}
          subtitle={t('financeOps.transfers_subtitle')}
          size="sm"
        />
        <div className="mt-3">
          <Link
            href="/admin/finance-ops"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('financeOps.back_dashboard')}
          </Link>
        </div>
        <FinanceOpsTabs active="transfers" />

        {view.kind === 'loading' && (
          <Card className="mt-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        )}
        {view.kind === 'restricted' && (
          <Card className="mt-4">
            <p className="text-[0.8rem] font-bold" style={{ color: 'var(--ink)' }}>
              {t('financeOps.restricted_title')}
            </p>
            <p className="mt-1 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
              {t('financeOps.restricted_body')}
            </p>
          </Card>
        )}
        {view.kind === 'error' && (
          <Card className="mt-4">
            <p className="text-[0.8rem] font-bold" style={{ color: 'var(--ink)' }}>
              {t('financeOps.error_title')}
            </p>
            <button
              onClick={reload}
              className="mt-3 rounded-full border px-3 py-1 text-[0.7rem] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              {t('financeOps.retry')}
            </button>
          </Card>
        )}
        {view.kind === 'ready' && accessToken && (
          <>
            <PendingList token={accessToken} pending={view.pending} />
            <EvidenceForm
              token={accessToken}
              pending={view.pending}
              onDone={reload}
            />
            <TransfersList transfers={view.transfers} />
          </>
        )}
      </section>
    </PageContainer>
  )
}

const inputCls = 'w-full rounded-xl border px-3 py-2 text-[0.78rem]'
const inputStyle = {
  borderColor: 'var(--border)',
  background: 'var(--card)',
  color: 'var(--ink)',
} as const
const labelCls = 'text-[0.68rem] font-bold uppercase tracking-[0.14em]'
const labelStyle = { color: 'var(--muted)' } as const

// ── Pending dues (server-derived; never a fabricated status row) ───
function PendingList({
  token,
  pending,
}: {
  token: string
  pending: PendingInternalTransfer[]
}) {
  const { t } = useI18n()
  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.tr_pending_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.tr_pending_hint')}
      </p>
      {pending.length === 0 && (
        <p className="mt-3 text-[0.74rem] font-semibold" style={{ color: 'var(--ink)' }}>
          {t('financeOps.tr_pending_none')}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {pending.map((p) => (
          <PendingRow key={p.settlementId} token={token} row={p} />
        ))}
      </div>
    </Card>
  )
}

function PendingRow({
  token,
  row,
}: {
  token: string
  row: PendingInternalTransfer
}) {
  const { t } = useI18n()
  const [statement, setStatement] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: SettlementStatementRecord }
    | { kind: 'unavailable' }
  >({ kind: 'idle' })
  const aging = row.ageDays >= AGING_ALERT_DAYS

  const loadStatement = () => {
    setStatement({ kind: 'loading' })
    void (async () => {
      const res = await getSettlementStatement(token, row.settlementId)
      setStatement(
        res.kind === 'ok'
          ? { kind: 'ok', data: res.data }
          : { kind: 'unavailable' },
      )
    })()
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: aging ? '#C0392B' : 'var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Ref value={row.settlementReference} />
        <span className="text-[0.74rem] font-extrabold" style={{ color: 'var(--ink)' }}>
          {t('financeOps.tr_required')}:{' '}
          <span dir="ltr" className="font-mono tabular-nums">
            {formatMinor(row.outstandingMinor, row.currency)}
          </span>
        </span>
      </div>
      <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
        <InfoRow
          label={t('financeOps.tr_closed_at')}
          value={row.closedAt ? <Ref value={row.closedAt} /> : '—'}
        />
        <InfoRow
          label={t('financeOps.tr_age')}
          value={
            <span
              className="font-bold"
              style={{ color: aging ? '#C0392B' : 'var(--ink)' }}
            >
              {row.ageDays} {t('financeOps.tr_age_days')}
              {aging ? ` · ${t('financeOps.tr_age_alert')}` : ''}
            </span>
          }
        />
        {row.failedAttempts > 0 && (
          <InfoRow
            label={t('financeOps.tr_failed_attempts')}
            value={
              <span className="font-bold" style={{ color: '#C0392B' }}>
                {row.failedAttempts}
              </span>
            }
          />
        )}
      </dl>
      <div className="mt-2">
        {statement.kind === 'idle' && (
          <button
            onClick={loadStatement}
            className="rounded-full border px-3 py-1 text-[0.68rem] font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            {t('financeOps.tr_view_statement')}
          </button>
        )}
        {statement.kind === 'loading' && <Skeleton className="h-4 w-1/2" />}
        {statement.kind === 'unavailable' && (
          <p className="text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
            {t('financeOps.tr_statement_unavailable')}
          </p>
        )}
        {statement.kind === 'ok' && (
          <dl className="flex flex-col gap-1 text-[0.72rem]">
            <InfoRow
              label={t('financeOps.tr_statement_ref')}
              value={
                <Ref
                  value={`${statement.data.settlementReference} · ${statement.data.statementVersion} · ${statement.data.issuedAt}`}
                />
              }
            />
            <InfoRow
              label={t('financeOps.tr_statement_hash')}
              value={<Ref value={statement.data.statementHash} />}
            />
          </dl>
        )}
      </div>
    </div>
  )
}

// ── Evidence form (the ONLY write; server refuses everything else) ─
function EvidenceForm({
  token,
  pending,
  onDone,
}: {
  token: string
  pending: PendingInternalTransfer[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const { user, userId } = useAuth()
  const [settlementId, setSettlementId] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [valueDate, setValueDate] = useState('')
  const [confirmedAmount, setConfirmedAmount] = useState('')
  const [accountFrom, setAccountFrom] = useState('')
  const [accountTo, setAccountTo] = useState('')
  const [status, setStatus] = useState<'completed' | 'failed'>('completed')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const chosen = pending.find((p) => p.settlementId === settlementId) ?? null
  const executor = user?.qiftUsername ?? userId ?? ''

  // Every evidence field is MANDATORY — the button stays disabled
  // without full bank evidence, mirroring the server law.
  const valid =
    !!chosen &&
    bankReference.trim() !== '' &&
    valueDate.trim() !== '' &&
    confirmedAmount.trim() !== '' &&
    Number.isFinite(Number(confirmedAmount)) &&
    accountFrom.trim() !== '' &&
    accountTo.trim() !== ''

  const submit = () => {
    if (!valid || !chosen || busy) return
    setBusy(true)
    setRefusal(null)
    setDone(null)
    void (async () => {
      const res = await recordInternalTransfer(token, {
        settlementId: chosen.settlementId,
        bankReference: bankReference.trim(),
        valueDate,
        confirmedAmount: Number(confirmedAmount),
        accountFromMasked: accountFrom.trim(),
        accountToMasked: accountTo.trim(),
        status,
        notes: notes.trim() || undefined,
      })
      setBusy(false)
      if (res.kind === 'ok') {
        setDone(res.data.id)
        onDone()
        return
      }
      if (res.kind === 'refused') return setRefusal(res.code)
      setRefusal(res.kind === 'restricted' ? 'restricted' : 'request_failed')
    })()
  }

  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.tr_form_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.tr_form_hint')}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.tr_pick_settlement')}
          </span>
          <select
            value={settlementId}
            onChange={(e) => setSettlementId(e.target.value)}
            className={inputCls}
            style={inputStyle}
          >
            <option value="">{t('financeOps.tr_pick_placeholder')}</option>
            {pending.map((p) => (
              <option key={p.settlementId} value={p.settlementId}>
                {p.settlementReference} ·{' '}
                {formatMinor(p.outstandingMinor, p.currency)}
              </option>
            ))}
          </select>
        </label>
        {chosen && (
          <p className="text-[0.72rem]" style={{ color: 'var(--ink)' }}>
            {t('financeOps.tr_required')}:{' '}
            <span dir="ltr" className="font-mono font-bold tabular-nums">
              {formatMinor(chosen.outstandingMinor, chosen.currency)}
            </span>{' '}
            — {t('financeOps.tr_required_note')}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_bank_ref')}
            </span>
            <input
              dir="ltr"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              placeholder="BANK-TRF-…"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_value_date')}
            </span>
            <input
              dir="ltr"
              type="date"
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_confirmed_amount')}
            </span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={confirmedAmount}
              onChange={(e) => setConfirmedAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_status')}
            </span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value === 'failed' ? 'failed' : 'completed')
              }
              className={inputCls}
              style={inputStyle}
            >
              <option value="completed">
                {t('financeOps.tr_status_completed')}
              </option>
              <option value="failed">{t('financeOps.tr_status_failed')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_account_from')}
            </span>
            <input
              dir="ltr"
              value={accountFrom}
              onChange={(e) => setAccountFrom(e.target.value)}
              placeholder="SA****1234"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_account_to')}
            </span>
            <input
              dir="ltr"
              value={accountTo}
              onChange={(e) => setAccountTo(e.target.value)}
              placeholder="SA****5678"
              className={inputCls}
              style={inputStyle}
            />
          </label>
        </div>
        <p className="text-[0.68rem]" style={{ color: 'var(--muted)' }}>
          {t('financeOps.tr_masked_hint')}
        </p>
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.tr_notes')}
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </label>
        <p className="text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.tr_executor')}:{' '}
          <Ref value={executor || '—'} /> — {t('financeOps.tr_executor_note')}
        </p>
        <div>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="rounded-full border px-4 py-1.5 text-[0.72rem] font-extrabold disabled:opacity-40"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
          >
            {busy ? '…' : t('financeOps.tr_submit')}
          </button>
        </div>
        {refusal && <RefusalNote code={refusal} />}
        {done && (
          <p className="text-[0.72rem] font-bold" style={{ color: '#2E8B57' }}>
            {t('financeOps.tr_recorded')} <Ref value={done} />
          </p>
        )}
      </div>
    </Card>
  )
}

// ── Evidence history (completed + failed; verbatim server rows) ────
function TransfersList({ transfers }: { transfers: InternalTransferRow[] }) {
  const { t } = useI18n()
  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.tr_list_title')}
      </p>
      {transfers.length === 0 && (
        <p className="mt-3 text-[0.74rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.tr_list_empty')}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {transfers.map((tr) => (
          <div
            key={tr.id}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Ref value={tr.settlementReference} />
              <StatusChip status={tr.status} />
            </div>
            <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
              <InfoRow
                label={t('financeOps.tr_confirmed_amount')}
                value={
                  <span dir="ltr" className="font-mono font-bold tabular-nums">
                    {formatMajor(Number(tr.confirmedAmount), tr.currency)}
                  </span>
                }
              />
              <InfoRow
                label={t('financeOps.tr_bank_ref')}
                value={<Ref value={tr.bankReference} />}
              />
              <InfoRow
                label={t('financeOps.tr_value_date')}
                value={<Ref value={tr.valueDate} />}
              />
              <InfoRow
                label={t('financeOps.tr_accounts')}
                value={
                  <Ref value={`${tr.accountFromMasked} → ${tr.accountToMasked}`} />
                }
              />
              <InfoRow
                label={t('financeOps.tr_recorded_by')}
                value={<Ref value={tr.recordedBy} />}
              />
              {tr.notes && (
                <InfoRow label={t('financeOps.tr_notes')} value={tr.notes} />
              )}
              <InfoRow
                label={t('financeOps.tr_recorded_at')}
                value={<Ref value={tr.createdAt} />}
              />
            </dl>
          </div>
        ))}
      </div>
    </Card>
  )
}
