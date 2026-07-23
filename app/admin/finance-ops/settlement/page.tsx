'use client'

// FINANCE OPS CONSOLE — PR 4: Settlement operations view.
//
// Constitutional surfaces: SETTLE-1 receipts, SETTLE-2 preview →
// approval → execution (SC §31–§33 two-power separation:
// finance.settlement_approve vs finance.settlement_execute), SC §26
// zero-net statement-only close, RULE 4 statements (canonical JSON +
// hash), §34 versioned replay.
//
// GATE LAW (founder mandate): whether production money actions run is
// decided ONLY by the backend gate (QIFT_FINANCIAL_GATES_ATTESTED,
// checked server-side). This page submits and renders the server's
// verdict verbatim — `financial_gates_not_attested` renders as the
// refusal it is. The UI NEVER simulates gate success.
//
// LAW: no client-side money math — every figure (gross, net, §4
// lines) renders exactly as frozen/served. Simulations are labeled
// SIMULATION and carry no QS. Refusal codes surface verbatim.

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
  approveSettlementExecution,
  assembleSettlement,
  closeSettlementZeroNet,
  executeSettlement,
  formatMajor,
  getMyOpsPermissions,
  getSettlementStatementFull,
  listSettlementBatches,
  listSettlementReceipts,
  previewSettlementExecution,
  recordSettlementReceipt,
  replaySettlement,
  simulateSettlement,
  type InvoiceReceiptsSummary,
  type SettlementBatchRow,
  type SettlementCalculationSnapshot,
  type SettlementExecutionPreview,
  type SettlementReplayResult,
  type SettlementSimulation,
  type SettlementStatementFull,
} from '@/lib/financeOpsApi'
import {
  FinanceOpsTabs,
  InfoRow,
  Ref,
  RefusalNote,
  StatusChip,
  type Refusal,
} from '../_atoms'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'restricted' }
  | { kind: 'error' }
  | { kind: 'ready'; permissions: string[]; batches: SettlementBatchRow[] }

export default function SettlementOpsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/admin/finance-ops/settlement')
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
      if (!perms.data.permissions.includes('finance.receipts')) {
        return setView({ kind: 'restricted' })
      }
      const batches = await listSettlementBatches(accessToken)
      if (cancelled) return
      if (batches.kind !== 'ok') {
        return setView({
          kind: batches.kind === 'restricted' ? 'restricted' : 'error',
        })
      }
      setView({
        kind: 'ready',
        permissions: perms.data.permissions,
        batches: batches.data,
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
          subtitle={t('financeOps.settle_subtitle')}
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
        <FinanceOpsTabs active="settlement" />

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
              {t('financeOps.settle_restricted_body')}
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
            <PowersCard permissions={view.permissions} />
            <ReceiptsCard token={accessToken} />
            {view.permissions.includes('finance.settlement_approve') && (
              <SimulateCard token={accessToken} onAssembled={reload} />
            )}
            <BatchesList
              token={accessToken}
              batches={view.batches}
              permissions={view.permissions}
              onChanged={reload}
            />
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
const btnCls =
  'rounded-full border px-3 py-1 text-[0.7rem] font-extrabold disabled:opacity-40'
const primaryBtnStyle = {
  borderColor: 'var(--primary)',
  color: 'var(--primary)',
} as const
const softBtnStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text-soft)',
} as const

// ── §31/§33 two-power visibility: what THIS session can do ─────────
function PowersCard({ permissions }: { permissions: string[] }) {
  const { t } = useI18n()
  const powers: Array<{ perm: string; labelKey: string }> = [
    { perm: 'finance.receipts', labelKey: 'financeOps.power_receipts' },
    {
      perm: 'finance.settlement_approve',
      labelKey: 'financeOps.power_approve',
    },
    {
      perm: 'finance.settlement_execute',
      labelKey: 'financeOps.power_execute',
    },
  ]
  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.powers_title')}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {powers.map((p) => {
          const has = permissions.includes(p.perm)
          return (
            <span
              key={p.perm}
              className="rounded-full border px-3 py-1 text-[0.68rem] font-bold"
              style={
                has
                  ? { borderColor: '#2E8B57', color: '#2E8B57' }
                  : {
                      borderColor: 'var(--border)',
                      color: 'var(--muted)',
                    }
              }
            >
              {t(p.labelKey)} {has ? '✓' : '—'}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
        {t('financeOps.powers_note')}
      </p>
    </Card>
  )
}

// ── SETTLE-1 receipts: lookup + evidence-backed recording ──────────
function ReceiptsCard({ token }: { token: string }) {
  const { t } = useI18n()
  const [invoiceType, setInvoiceType] = useState('merchant_invoice')
  const [invoiceId, setInvoiceId] = useState('')
  const [summary, setSummary] = useState<InvoiceReceiptsSummary | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupErr, setLookupErr] = useState(false)

  const [recAmount, setRecAmount] = useState('')
  const [recBankRef, setRecBankRef] = useState('')
  const [recReceivedAt, setRecReceivedAt] = useState('')
  const [recBusy, setRecBusy] = useState(false)
  const [recRefusal, setRecRefusal] = useState<Refusal | null>(null)
  const [recDone, setRecDone] = useState<string | null>(null)

  const lookup = () => {
    if (!invoiceId.trim() || lookupBusy) return
    setLookupBusy(true)
    setLookupErr(false)
    void (async () => {
      const res = await listSettlementReceipts(
        token,
        invoiceType,
        invoiceId.trim(),
      )
      setLookupBusy(false)
      if (res.kind !== 'ok') {
        setSummary(null)
        return setLookupErr(true)
      }
      setSummary(res.data)
    })()
  }

  const recValid =
    invoiceId.trim() !== '' &&
    recAmount.trim() !== '' &&
    Number.isFinite(Number(recAmount)) &&
    recBankRef.trim() !== '' &&
    recReceivedAt.trim() !== ''

  const record = () => {
    if (!recValid || recBusy) return
    setRecBusy(true)
    setRecRefusal(null)
    setRecDone(null)
    void (async () => {
      const res = await recordSettlementReceipt(token, {
        invoiceType,
        invoiceId: invoiceId.trim(),
        amount: Number(recAmount),
        bankReference: recBankRef.trim(),
        receivedAt: recReceivedAt,
      })
      setRecBusy(false)
      if (res.kind === 'ok') {
        setRecDone(res.data.receipt?.id ?? 'ok')
        lookup()
        return
      }
      if (res.kind === 'refused') return setRecRefusal({ code: res.code, reason: res.reason })
      setRecRefusal({ code: res.kind === 'restricted' ? 'restricted' : 'request_failed' })
    })()
  }

  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.receipts_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.receipts_hint')}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.receipts_invoice_type')}
          </span>
          <select
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value)}
            className={inputCls}
            style={inputStyle}
          >
            <option value="merchant_invoice">
              {t('financeOps.receipts_type_merchant')}
            </option>
            <option value="corporate_invoice">
              {t('financeOps.receipts_type_corporate')}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.receipts_invoice_id')}
          </span>
          <input
            dir="ltr"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </label>
      </div>
      <div className="mt-3">
        <button
          onClick={lookup}
          disabled={!invoiceId.trim() || lookupBusy}
          className={btnCls}
          style={softBtnStyle}
        >
          {lookupBusy ? '…' : t('financeOps.receipts_lookup')}
        </button>
      </div>
      {lookupErr && (
        <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.receipts_lookup_failed')}
        </p>
      )}
      {summary !== null && (
        <div className="mt-3 flex flex-col gap-2">
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <dl className="flex flex-col gap-1 text-[0.72rem]">
              <InfoRow
                label={t('financeOps.receipts_invoice_number')}
                value={<Ref value={summary.invoiceNumber ?? '—'} />}
              />
              <InfoRow
                label={t('financeOps.receipts_status')}
                value={<Ref value={summary.status} />}
              />
              <InfoRow
                label={t('financeOps.receipts_effective_total')}
                value={
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatMajor(summary.totalAmount, 'SAR')}
                  </span>
                }
              />
              <InfoRow
                label={t('financeOps.receipts_received_total')}
                value={
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatMajor(summary.amountReceived, 'SAR')}
                  </span>
                }
              />
              <InfoRow
                label={t('financeOps.receipts_balance')}
                value={
                  <span dir="ltr" className="font-mono font-bold tabular-nums">
                    {formatMajor(summary.balance, 'SAR')}
                  </span>
                }
              />
            </dl>
          </div>
          {summary.receipts.length === 0 && (
            <p className="text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
              {t('financeOps.receipts_none')}
            </p>
          )}
          {summary.receipts.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <dl className="flex flex-col gap-1 text-[0.72rem]">
                <InfoRow
                  label={t('financeOps.receipts_amount')}
                  value={
                    <span dir="ltr" className="font-mono font-bold tabular-nums">
                      {formatMajor(Number(r.amount), r.currency ?? 'SAR')}
                    </span>
                  }
                />
                <InfoRow
                  label={t('financeOps.tr_bank_ref')}
                  value={<Ref value={r.bankReference} />}
                />
                <InfoRow
                  label={t('financeOps.receipts_received_at')}
                  value={<Ref value={r.receivedAt} />}
                />
              </dl>
            </div>
          ))}
        </div>
      )}

      <div
        className="mt-4 rounded-xl border p-3"
        style={{ borderColor: 'var(--hairline, var(--border))' }}
      >
        <p className={labelCls} style={labelStyle}>
          {t('financeOps.receipts_record_title')}
        </p>
        <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
          {t('financeOps.receipts_record_hint')}
        </p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.receipts_amount')}
            </span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.tr_bank_ref')}
            </span>
            <input
              dir="ltr"
              value={recBankRef}
              onChange={(e) => setRecBankRef(e.target.value)}
              placeholder="TT-…"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={labelStyle}>
              {t('financeOps.receipts_received_at')}
            </span>
            <input
              dir="ltr"
              type="date"
              value={recReceivedAt}
              onChange={(e) => setRecReceivedAt(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
        </div>
        <div className="mt-3">
          <button
            onClick={record}
            disabled={!recValid || recBusy}
            className={btnCls}
            style={primaryBtnStyle}
          >
            {recBusy ? '…' : t('financeOps.receipts_record_submit')}
          </button>
        </div>
        {recRefusal && <RefusalNote code={recRefusal.code} reason={recRefusal.reason} />}
        {recDone && (
          <p className="mt-2 text-[0.72rem] font-bold" style={{ color: '#2E8B57' }}>
            {t('financeOps.receipts_recorded')} <Ref value={recDone} />
          </p>
        )}
      </div>
    </Card>
  )
}

// ── §30 simulation (side-effect-free; labeled; NO QS) + assembly ───
function SimulateCard({
  token,
  onAssembled,
}: {
  token: string
  onAssembled: () => void
}) {
  const { t } = useI18n()
  const [storeId, setStoreId] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [sim, setSim] = useState<SettlementSimulation | null>(null)
  const [asmBusy, setAsmBusy] = useState(false)
  const [asmRefusal, setAsmRefusal] = useState<Refusal | null>(null)

  const run = () => {
    if (!storeId.trim() || busy) return
    setBusy(true)
    setRefusal(null)
    setSim(null)
    void (async () => {
      const res = await simulateSettlement(token, storeId.trim())
      setBusy(false)
      if (res.kind === 'ok') return setSim(res.data)
      setRefusal(
        res.kind === 'refused'
          ? { code: res.code, reason: res.reason }
          : { code: 'request_failed' },
      )
    })()
  }

  const assemble = () => {
    if (!storeId.trim() || asmBusy) return
    setAsmBusy(true)
    setAsmRefusal(null)
    void (async () => {
      const res = await assembleSettlement(token, storeId.trim())
      setAsmBusy(false)
      if (res.kind === 'ok') return onAssembled()
      setAsmRefusal(
        res.kind === 'refused'
          ? { code: res.code, reason: res.reason }
          : { code: 'request_failed' },
      )
    })()
  }

  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.sim_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.sim_hint')}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.sim_store')}
          </span>
          <input
            dir="ltr"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </label>
        <button
          onClick={run}
          disabled={!storeId.trim() || busy}
          className={btnCls}
          style={softBtnStyle}
        >
          {busy ? '…' : t('financeOps.sim_run')}
        </button>
        <button
          onClick={assemble}
          disabled={!storeId.trim() || asmBusy}
          className={btnCls}
          style={primaryBtnStyle}
        >
          {asmBusy ? '…' : t('financeOps.sim_assemble')}
        </button>
      </div>
      {refusal && <RefusalNote code={refusal.code} reason={refusal.reason} />}
      {asmRefusal && <RefusalNote code={asmRefusal.code} reason={asmRefusal.reason} />}
      {sim && (
        <div
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: '#B8860B' }}
        >
          <p className="text-[0.7rem] font-extrabold" style={{ color: '#B8860B' }}>
            {t('financeOps.sim_label')}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
            <InfoRow
              label={t('financeOps.sim_snapshot_at')}
              value={<Ref value={sim.snapshotAt} />}
            />
            <InfoRow
              label={t('financeOps.batch_item_count')}
              value={<span className="font-bold">{sim.itemCount}</span>}
            />
          </dl>
          {sim.calculation ? (
            <CalculationLines calc={sim.calculation} />
          ) : (
            <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
              {t('financeOps.sim_nothing_eligible')}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// §4 lines verbatim — every figure is the frozen/served value.
function CalculationLines({ calc }: { calc: SettlementCalculationSnapshot }) {
  const { t } = useI18n()
  return (
    <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
      {Object.entries(calc.lines).map(([k, v]) => (
        <InfoRow
          key={k}
          label={k}
          value={
            <span dir="ltr" className="font-mono tabular-nums">
              {formatMajor(v, calc.currency)}
            </span>
          }
        />
      ))}
      <InfoRow
        label={t('financeOps.batch_net')}
        value={
          <span dir="ltr" className="font-mono font-extrabold tabular-nums">
            {formatMajor(calc.netAmount, calc.currency)}
          </span>
        }
      />
    </dl>
  )
}

// ── Batches: list + detail + preview→approve→execute/close ─────────
function BatchesList({
  token,
  batches,
  permissions,
  onChanged,
}: {
  token: string
  batches: SettlementBatchRow[]
  permissions: string[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.batches_title')}
      </p>
      {batches.length === 0 && (
        <p className="mt-3 text-[0.74rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.batches_empty')}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {batches.map((b) => (
          <div
            key={b.id}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              onClick={() => setOpenId(openId === b.id ? null : b.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 text-start"
            >
              <span className="flex flex-col gap-0.5">
                <Ref value={b.settlementReference} />
                <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                  {b.storeId} · {b.windowType}
                  {b.closureType ? ` · ${b.closureType}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span dir="ltr" className="font-mono text-[0.72rem] font-bold tabular-nums">
                  {formatMajor(Number(b.netAmount), b.currency)}
                </span>
                <StatusChip status={b.status} />
              </span>
            </button>
            {openId === b.id && (
              <BatchDetail
                token={token}
                batch={b}
                permissions={permissions}
                onChanged={onChanged}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function BatchDetail({
  token,
  batch,
  permissions,
  onChanged,
}: {
  token: string
  batch: SettlementBatchRow
  permissions: string[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const canApprove = permissions.includes('finance.settlement_approve')
  const canExecute = permissions.includes('finance.settlement_execute')

  const [preview, setPreview] = useState<SettlementExecutionPreview | null>(null)
  const [previewRefusal, setPreviewRefusal] = useState<Refusal | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [approveMsg, setApproveMsg] = useState<string | null>(null)
  const [approveRefusal, setApproveRefusal] = useState<Refusal | null>(null)
  const [bankRef, setBankRef] = useState('')
  const [executedAt, setExecutedAt] = useState('')
  const [execRefusal, setExecRefusal] = useState<Refusal | null>(null)
  const [closeRefusal, setCloseRefusal] = useState<Refusal | null>(null)
  const [statement, setStatement] = useState<SettlementStatementFull | null>(null)
  const [statementRefusal, setStatementRefusal] = useState<Refusal | null>(null)
  const [showCanonical, setShowCanonical] = useState(false)
  const [replay, setReplay] = useState<SettlementReplayResult | null>(null)
  const [replayRefusal, setReplayRefusal] = useState<Refusal | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const act = (
    name: string,
    fn: () => Promise<{ kind: string; code?: string; reason?: string }>,
    setRefusal: (r: Refusal | null) => void,
    after?: () => void,
  ) => {
    if (busy) return
    setBusy(name)
    setRefusal(null)
    void (async () => {
      const res = await fn()
      setBusy(null)
      if (res.kind === 'ok') {
        after?.()
        return
      }
      setRefusal(
        res.kind === 'refused'
          ? { code: res.code ?? 'request_failed', reason: res.reason }
          : { code: res.kind === 'restricted' ? 'restricted' : 'request_failed' },
      )
    })()
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <dl className="flex flex-col gap-1 text-[0.72rem]">
        <InfoRow
          label={t('financeOps.batch_gross')}
          value={
            <span dir="ltr" className="font-mono tabular-nums">
              {formatMajor(Number(batch.grossAmount), batch.currency)}
            </span>
          }
        />
        <InfoRow
          label={t('financeOps.batch_net')}
          value={
            <span dir="ltr" className="font-mono font-extrabold tabular-nums">
              {formatMajor(Number(batch.netAmount), batch.currency)}
            </span>
          }
        />
        <InfoRow
          label={t('financeOps.batch_created')}
          value={<Ref value={batch.createdAt} />}
        />
        {batch.closedAt && (
          <InfoRow
            label={t('financeOps.tr_closed_at')}
            value={<Ref value={batch.closedAt} />}
          />
        )}
        {batch.failureEvidence && (
          <InfoRow
            label={t('financeOps.batch_failure')}
            value={<Ref value={batch.failureEvidence} />}
          />
        )}
      </dl>

      <p className={`mt-3 ${labelCls}`} style={labelStyle}>
        {t('financeOps.batch_composition')}
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {batch.composition.map((c, i) => (
          <p key={i} className="text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
            <Ref
              value={`${String(c.occurrenceType ?? '')} · ${String(
                c.occurrenceId ?? '',
              )}${
                c.references && typeof c.references === 'object'
                  ? ' · ' + Object.values(c.references as Record<string, unknown>).filter(Boolean).map(String).join(' · ')
                  : ''
              }`}
            />{' '}
            <span dir="ltr" className="font-mono tabular-nums">
              {formatMajor(Number(c.amount ?? 0), batch.currency)}
            </span>
          </p>
        ))}
      </div>

      <p className={`mt-3 ${labelCls}`} style={labelStyle}>
        {t('financeOps.batch_calculation')}
      </p>
      <CalculationLines calc={batch.calculationSnapshot} />

      {batch.status === 'ready' && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <p className={labelCls} style={labelStyle}>
            {t('financeOps.exec_workflow_title')}
          </p>
          <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
            {t('financeOps.exec_workflow_hint')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() =>
                act(
                  'preview',
                  async () => {
                    const res = await previewSettlementExecution(token, batch.id)
                    if (res.kind === 'ok') setPreview(res.data)
                    return res
                  },
                  setPreviewRefusal,
                )
              }
              disabled={!canApprove || !!busy}
              className={btnCls}
              style={softBtnStyle}
            >
              {busy === 'preview' ? '…' : t('financeOps.exec_preview')}
            </button>
          </div>
          {previewRefusal && <RefusalNote code={previewRefusal.code} reason={previewRefusal.reason} />}
          {preview && (
            <div className="mt-2 flex flex-col gap-1 text-[0.72rem]">
              <InfoRow
                label={t('financeOps.exec_calc_hash')}
                value={<Ref value={preview.calculationHash} />}
              />
              <InfoRow
                label={t('financeOps.exec_replay_verified')}
                value={
                  <span
                    className="font-bold"
                    style={{ color: preview.replayVerified ? '#2E8B57' : '#C0392B' }}
                  >
                    {preview.replayVerified
                      ? t('financeOps.yes')
                      : t('financeOps.no')}
                  </span>
                }
              />
              <InfoRow
                label={t('financeOps.batch_net')}
                value={
                  <span dir="ltr" className="font-mono font-extrabold tabular-nums">
                    {formatMajor(preview.netAmount, preview.currency)}
                  </span>
                }
              />
            </div>
          )}

          {preview && canApprove && (
            <div className="mt-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls} style={labelStyle}>
                  {t('financeOps.exec_approve_note')}
                </span>
                <input
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </label>
              <button
                onClick={() =>
                  act(
                    'approve',
                    async () => {
                      const res = await approveSettlementExecution(token, batch.id, {
                        calculationHash: preview.calculationHash,
                        note: approveNote.trim() || undefined,
                      })
                      if (res.kind === 'ok') {
                        setApproveMsg(
                          `${t('financeOps.exec_approved')} L${
                            res.data.requirement?.level ?? '?'
                          }`,
                        )
                      }
                      return res
                    },
                    setApproveRefusal,
                  )
                }
                disabled={!!busy}
                className={`mt-2 ${btnCls}`}
                style={primaryBtnStyle}
              >
                {busy === 'approve' ? '…' : t('financeOps.exec_approve')}
              </button>
              {approveRefusal && <RefusalNote code={approveRefusal.code} reason={approveRefusal.reason} />}
              {approveMsg && (
                <p className="mt-2 text-[0.72rem] font-bold" style={{ color: '#2E8B57' }}>
                  {approveMsg}
                </p>
              )}
            </div>
          )}

          {preview && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <p className={labelCls} style={labelStyle}>
                {t('financeOps.exec_money_title')}
              </p>
              <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                {t('financeOps.exec_gate_note')}
              </p>
              {Number(batch.netAmount) === 0 ? (
                <>
                  <button
                    onClick={() =>
                      act(
                        'close',
                        () =>
                          closeSettlementZeroNet(token, batch.id, {
                            previewHash: preview.calculationHash,
                          }),
                        setCloseRefusal,
                        onChanged,
                      )
                    }
                    disabled={!canExecute || !!busy}
                    className={`mt-2 ${btnCls}`}
                    style={primaryBtnStyle}
                  >
                    {busy === 'close' ? '…' : t('financeOps.exec_close_zero')}
                  </button>
                  {!canExecute && (
                    <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                      {t('financeOps.exec_needs_execute_perm')}
                    </p>
                  )}
                  {closeRefusal && <RefusalNote code={closeRefusal.code} reason={closeRefusal.reason} />}
                </>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className={labelCls} style={labelStyle}>
                        {t('financeOps.tr_bank_ref')}
                      </span>
                      <input
                        dir="ltr"
                        value={bankRef}
                        onChange={(e) => setBankRef(e.target.value)}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelCls} style={labelStyle}>
                        {t('financeOps.exec_executed_at')}
                      </span>
                      <input
                        dir="ltr"
                        type="date"
                        value={executedAt}
                        onChange={(e) => setExecutedAt(e.target.value)}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </label>
                  </div>
                  <button
                    onClick={() =>
                      act(
                        'execute',
                        () =>
                          executeSettlement(token, batch.id, {
                            previewHash: preview.calculationHash,
                            bankTransferReference: bankRef.trim(),
                            executedAt,
                          }),
                        setExecRefusal,
                        onChanged,
                      )
                    }
                    disabled={
                      !canExecute || !bankRef.trim() || !executedAt || !!busy
                    }
                    className={`mt-2 ${btnCls}`}
                    style={primaryBtnStyle}
                  >
                    {busy === 'execute' ? '…' : t('financeOps.exec_execute')}
                  </button>
                  {!canExecute && (
                    <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                      {t('financeOps.exec_needs_execute_perm')}
                    </p>
                  )}
                  {execRefusal && <RefusalNote code={execRefusal.code} reason={execRefusal.reason} />}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {batch.status === 'settled' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() =>
              act(
                'statement',
                async () => {
                  const res = await getSettlementStatementFull(token, batch.id)
                  if (res.kind === 'ok') setStatement(res.data)
                  return res.kind === 'ok'
                    ? { kind: 'ok' }
                    : { kind: 'refused', code: 'statement_not_issued' }
                },
                setStatementRefusal,
              )
            }
            disabled={!!busy}
            className={btnCls}
            style={softBtnStyle}
          >
            {busy === 'statement' ? '…' : t('financeOps.stmt_view')}
          </button>
          <button
            onClick={() =>
              act(
                'replay',
                async () => {
                  const res = await replaySettlement(token, batch.id)
                  if (res.kind === 'ok') setReplay(res.data)
                  return res.kind === 'ok'
                    ? { kind: 'ok' }
                    : { kind: 'refused', code: 'statement_not_issued' }
                },
                setReplayRefusal,
              )
            }
            disabled={!!busy}
            className={btnCls}
            style={softBtnStyle}
          >
            {busy === 'replay' ? '…' : t('financeOps.replay_run')}
          </button>
        </div>
      )}
      {statementRefusal && <RefusalNote code={statementRefusal.code} reason={statementRefusal.reason} />}
      {replayRefusal && <RefusalNote code={replayRefusal.code} reason={replayRefusal.reason} />}

      {statement && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <p className={labelCls} style={labelStyle}>
            {t('financeOps.stmt_title')}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
            <InfoRow
              label={t('financeOps.stmt_version')}
              value={<Ref value={statement.statementVersion} />}
            />
            <InfoRow
              label={t('financeOps.stmt_issued')}
              value={<Ref value={statement.issuedAt} />}
            />
            <InfoRow
              label={t('financeOps.tr_statement_hash')}
              value={<Ref value={statement.statementHash} />}
            />
            <InfoRow
              label={t('financeOps.stmt_signatures')}
              value={<span className="font-bold">{statement.signatures.length}</span>}
            />
          </dl>
          <button
            onClick={() => setShowCanonical((s) => !s)}
            className={`mt-2 ${btnCls}`}
            style={softBtnStyle}
          >
            {showCanonical
              ? t('financeOps.stmt_hide_canonical')
              : t('financeOps.stmt_show_canonical')}
          </button>
          {showCanonical && (
            <pre
              dir="ltr"
              className="mt-2 max-h-72 overflow-auto rounded-lg border p-2 font-mono text-[0.62rem] leading-relaxed"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              {statement.canonicalJson}
            </pre>
          )}
        </div>
      )}

      {replay && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <p className={labelCls} style={labelStyle}>
            {t('financeOps.replay_title')}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-[0.72rem]">
            <InfoRow
              label={t('financeOps.replay_engine')}
              value={<Ref value={replay.replayEngineVersion} />}
            />
            {(
              [
                ['calculationReplayVerified', 'financeOps.replay_calc'],
                ['statementIntegrityVerified', 'financeOps.replay_integrity'],
                ['statementIdentical', 'financeOps.replay_identical'],
              ] as const
            ).map(([key, labelKey]) => (
              <InfoRow
                key={key}
                label={t(labelKey)}
                value={
                  <span
                    className="font-bold"
                    style={{ color: replay[key] ? '#2E8B57' : '#C0392B' }}
                  >
                    {replay[key] ? t('financeOps.yes') : t('financeOps.no')}
                  </span>
                }
              />
            ))}
            <InfoRow
              label={t('financeOps.replay_stored_hash')}
              value={<Ref value={replay.storedStatementHash} />}
            />
            <InfoRow
              label={t('financeOps.replay_regen_hash')}
              value={<Ref value={replay.regeneratedStatementHash} />}
            />
          </dl>
        </div>
      )}
    </div>
  )
}
