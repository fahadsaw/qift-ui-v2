'use client'

// FINANCE OPS CONSOLE — PR 2: Treasury attestation & reconciliation
// workflow.
//
// Constitutional surfaces: SC §10.3 (attest → run → enumerated
// differences), Lane 2 PR 1/PR 3 Scope D (structured resolution:
// new_evidence | accepted_timing | superseded_by_matched — a
// free-text-only resolution is IMPOSSIBLE in this UI and refused by
// the server regardless; attester ≠ resolver maker–checker shown and
// server-enforced).
//
// LAW: no client-side money math — every figure renders as served;
// the server's typed refusal codes are surfaced verbatim (monospace)
// with a translated explanation. Never simulate success.

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
  getTreasuryReconciliation,
  investigateTreasuryReconciliation,
  listTreasuryAttestations,
  listTreasuryReconciliations,
  recordTreasuryAttestation,
  resolveTreasuryReconciliation,
  runTreasuryReconciliation,
  type TreasuryAttestationRow,
  type TreasuryReconciliationDetail,
  type TreasuryReconciliationRow,
} from '@/lib/financeOpsApi'
import { FinanceOpsTabs, InfoRow, Ref, RefusalNote, StatusChip } from '../_atoms'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'restricted' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      attestations: TreasuryAttestationRow[]
      runs: TreasuryReconciliationRow[]
    }

export default function ReconciliationPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/admin/finance-ops/reconciliation')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      const perms = await getMyOpsPermissions(accessToken)
      if (cancelled) return
      if (perms.kind !== 'ok') {
        return setView({ kind: perms.kind === 'restricted' ? 'restricted' : 'error' })
      }
      if (!perms.data.permissions.includes('finance.reconcile')) {
        return setView({ kind: 'restricted' })
      }
      const [atts, runs] = await Promise.all([
        listTreasuryAttestations(accessToken),
        listTreasuryReconciliations(accessToken),
      ])
      if (cancelled) return
      if (atts.kind !== 'ok' || runs.kind !== 'ok') {
        return setView({
          kind:
            atts.kind === 'restricted' || runs.kind === 'restricted'
              ? 'restricted'
              : 'error',
        })
      }
      setView({ kind: 'ready', attestations: atts.data, runs: runs.data })
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
          subtitle={t('financeOps.recon_subtitle')}
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
        <FinanceOpsTabs active="reconciliation" />

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
            <AttestationForm token={accessToken} onDone={reload} />
            <RunForm
              token={accessToken}
              attestations={view.attestations}
              onDone={reload}
            />
            <RunsList token={accessToken} runs={view.runs} onChanged={reload} />
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

function AttestationForm({
  token,
  onDone,
}: {
  token: string
  onDone: () => void
}) {
  const { t } = useI18n()
  const [balance, setBalance] = useState('')
  const [asOfDate, setAsOfDate] = useState('')
  const [source, setSource] = useState('manual_attestation')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Evidence is MANDATORY (no invented balance) — the button stays
  // disabled without it, mirroring the server law.
  const valid =
    balance.trim() !== '' &&
    Number.isFinite(Number(balance)) &&
    asOfDate.trim() !== '' &&
    evidenceRef.trim() !== ''

  return (
    <Card className="mt-4">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.attest_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.attest_hint')} —{' '}
        <span style={{ color: 'var(--ink)' }}>
          {t('financeOps.attest_account')}: <Ref value="safeguarding · SAR" />
        </span>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.attest_balance')}
          </span>
          <input
            dir="ltr"
            className={inputCls}
            style={inputStyle}
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.attest_cutoff')}
          </span>
          <input
            dir="ltr"
            className={inputCls}
            style={inputStyle}
            type="datetime-local"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.attest_source')}
          </span>
          <select
            className={inputCls}
            style={inputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="manual_attestation">
              {t('financeOps.source_manual')}
            </option>
            <option value="statement_import">
              {t('financeOps.source_import')}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.attest_evidence')}
          </span>
          <input
            dir="ltr"
            className={inputCls}
            style={inputStyle}
            placeholder="STMT-2026-07-24"
            value={evidenceRef}
            onChange={(e) => setEvidenceRef(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1">
        <span className={labelCls} style={labelStyle}>
          {t('financeOps.notes_optional')}
        </span>
        <input
          className={inputCls}
          style={inputStyle}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {refusal && <RefusalNote code={refusal} />}
      {done && (
        <p className="mt-2 text-[0.72rem]" style={{ color: '#2E8B57' }}>
          {t('financeOps.attest_done')} <Ref value={done} />
        </p>
      )}
      <button
        disabled={!valid || busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setRefusal(null)
            const res = await recordTreasuryAttestation(token, {
              balance: Number(balance),
              asOfDate: new Date(asOfDate).toISOString(),
              evidenceRef: evidenceRef.trim(),
              source,
              notes: notes.trim() || undefined,
            })
            setBusy(false)
            if (res.kind === 'ok') {
              setDone(res.data.id)
              onDone()
            } else if (res.kind === 'refused') {
              setRefusal(res.code)
            } else {
              setRefusal('request_failed')
            }
          })()
        }}
        className="mt-3 rounded-full border px-4 py-1.5 text-[0.72rem] font-bold disabled:opacity-40"
        style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
      >
        {busy ? t('financeOps.working') : t('financeOps.attest_submit')}
      </button>
    </Card>
  )
}

function RunForm({
  token,
  attestations,
  onDone,
}: {
  token: string
  attestations: TreasuryAttestationRow[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const [attestationId, setAttestationId] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const chosen = attestations.find((a) => a.id === attestationId) ?? null

  return (
    <Card className="mt-3">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.run_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.run_hint')}
      </p>
      <label className="mt-3 flex flex-col gap-1">
        <span className={labelCls} style={labelStyle}>
          {t('financeOps.run_attestation')}
        </span>
        <select
          className={inputCls}
          style={inputStyle}
          value={attestationId}
          onChange={(e) => setAttestationId(e.target.value)}
        >
          <option value="">{t('financeOps.run_pick')}</option>
          {attestations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.asOfDate} · {formatMajor(a.balance, a.currency)} ·{' '}
              {a.evidenceRef}
            </option>
          ))}
        </select>
      </label>
      {refusal && <RefusalNote code={refusal} />}
      <button
        disabled={!chosen || busy}
        onClick={() => {
          if (!chosen) return
          void (async () => {
            setBusy(true)
            setRefusal(null)
            const res = await runTreasuryReconciliation(token, {
              asOfDate: chosen.asOfDate,
              attestationId: chosen.id,
            })
            setBusy(false)
            if (res.kind === 'ok') onDone()
            else if (res.kind === 'refused') setRefusal(res.code)
            else setRefusal('request_failed')
          })()
        }}
        className="mt-3 rounded-full border px-4 py-1.5 text-[0.72rem] font-bold disabled:opacity-40"
        style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
      >
        {busy ? t('financeOps.working') : t('financeOps.run_submit')}
      </button>
    </Card>
  )
}

function RunsList({
  token,
  runs,
  onChanged,
}: {
  token: string
  runs: TreasuryReconciliationRow[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="mt-5">
      <h2
        className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('financeOps.runs_title')}
      </h2>
      {runs.length === 0 ? (
        <Card>
          <p className="text-[0.74rem]" style={{ color: 'var(--text-soft)' }}>
            {t('financeOps.no_runs')}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.id}>
              <Card>
                <button
                  className="flex w-full items-center justify-between gap-2 text-start"
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                >
                  <span className="flex flex-col gap-0.5">
                    <Ref value={r.asOfDate} />
                    <span
                      className="text-[0.68rem]"
                      style={{ color: 'var(--text-soft)' }}
                    >
                      {r.accountType} · {r.currency} ·{' '}
                      {t('financeOps.differences')}: {r.differenceCount}
                      {r.integrityOk === false
                        ? ` · ${t('financeOps.integrity_violated')}`
                        : ''}
                    </span>
                  </span>
                  <StatusChip status={r.status} />
                </button>
                {openId === r.id && (
                  <RunDetail token={token} id={r.id} onChanged={onChanged} />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RunDetail({
  token,
  id,
  onChanged,
}: {
  token: string
  id: string
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<TreasuryReconciliationDetail | null>(
    null,
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await getTreasuryReconciliation(token, id)
      if (cancelled) return
      if (res.kind === 'ok') setDetail(res.data)
      else setFailed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [token, id])

  if (failed) {
    return (
      <p className="mt-3 text-[0.72rem]" style={{ color: '#C0392B' }}>
        {t('financeOps.error_title')}
      </p>
    )
  }
  if (!detail) return <Skeleton className="mt-3 h-16 w-full" />

  const snap = detail.snapshot
  return (
    <div
      className="mt-3 border-t pt-3"
      style={{ borderColor: 'var(--hairline)' }}
    >
      <dl className="flex flex-col gap-1 text-[0.72rem]">
        {snap.identity && (
          <InfoRow
            label={t('financeOps.identity')}
            value={
              <Ref
                value={`${snap.identity.accountType} · ${snap.identity.currency} · ${snap.identity.timezone}`}
              />
            }
          />
        )}
        <InfoRow
          label={t('financeOps.bank_balance')}
          value={
            detail.bankBalance === null
              ? t('financeOps.no_attestation')
              : formatMajor(detail.bankBalance, detail.currency)
          }
        />
        <InfoRow
          label={t('financeOps.ledger_cash')}
          value={formatMajor(detail.ledgerCashBalance, detail.currency)}
        />
        <InfoRow
          label={t('financeOps.obligations')}
          value={formatMajor(detail.obligationsBalance, detail.currency)}
        />
        {snap.attestation && (
          <>
            <InfoRow
              label={t('financeOps.attest_evidence')}
              value={
                <Ref
                  value={`${snap.attestation.source}:${snap.attestation.evidenceRef}`}
                />
              }
            />
            {snap.attestationEvidenceHash && (
              <InfoRow
                label={t('financeOps.evidence_hash')}
                value={<Ref value={snap.attestationEvidenceHash} />}
              />
            )}
          </>
        )}
        <InfoRow
          label={t('financeOps.snapshot_hash')}
          value={<Ref value={detail.snapshotHash} />}
        />
      </dl>

      {(snap.differences?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className={labelCls} style={{ color: '#C0392B' }}>
            {t('financeOps.differences_title')}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {snap.differences!.map((d, i) => (
              <li
                key={i}
                className="rounded-xl border px-3 py-2 text-[0.7rem]"
                style={{
                  borderColor: 'color-mix(in srgb, #C0392B 35%, var(--border))',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>{d.kind}</strong> ·{' '}
                <span dir="ltr" className="font-mono">
                  {formatMinor(d.deltaMinor, detail.currency)}
                </span>
                <div className="mt-0.5" style={{ color: 'var(--text-soft)' }}>
                  <Ref value={d.detail} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.investigationNotes && (
        <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.investigated_by')} <Ref value={detail.investigatedBy ?? ''} /> —{' '}
          {detail.investigationNotes}
        </p>
      )}
      {detail.resolutionKind && (
        <p className="mt-1 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
          {t('financeOps.resolved_as')} <Ref value={detail.resolutionKind} />
          {detail.resolutionEvidenceRef && (
            <>
              {' '}
              · <Ref value={detail.resolutionEvidenceRef} />
            </>
          )}
        </p>
      )}

      {detail.status === 'mismatched' && (
        <InvestigateForm token={token} id={id} onChanged={onChanged} />
      )}
      {detail.status === 'investigated' && (
        <ResolveForm token={token} id={id} onChanged={onChanged} />
      )}
    </div>
  )
}

function InvestigateForm({
  token,
  id,
  onChanged,
}: {
  token: string
  id: string
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  return (
    <div className="mt-3">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.investigate_title')}
      </p>
      <textarea
        className={`${inputCls} mt-1`}
        style={inputStyle}
        rows={2}
        placeholder={t('financeOps.investigate_notes')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {refusal && <RefusalNote code={refusal} />}
      <button
        disabled={!notes.trim() || busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setRefusal(null)
            const res = await investigateTreasuryReconciliation(token, id, {
              notes: notes.trim(),
            })
            setBusy(false)
            if (res.kind === 'ok') onChanged()
            else if (res.kind === 'refused') setRefusal(res.code)
            else setRefusal('request_failed')
          })()
        }}
        className="mt-2 rounded-full border px-4 py-1.5 text-[0.72rem] font-bold disabled:opacity-40"
        style={{ borderColor: '#B8860B', color: '#B8860B' }}
      >
        {busy ? t('financeOps.working') : t('financeOps.investigate_submit')}
      </button>
    </div>
  )
}

function ResolveForm({
  token,
  id,
  onChanged,
}: {
  token: string
  id: string
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [kind, setKind] = useState('')
  const [notes, setNotes] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [matchedId, setMatchedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  // STRUCTURED BASIS LAW: a free-text-only resolution is IMPOSSIBLE —
  // the submit button cannot enable without a kind AND its required
  // structured field. The server refuses regardless (defense in
  // depth); the UI simply never offers the unlawful shape.
  const structuredOk =
    (kind === 'new_evidence' && evidenceRef.trim() !== '') ||
    (kind === 'accepted_timing' && evidenceRef.trim() !== '') ||
    (kind === 'superseded_by_matched' && matchedId.trim() !== '')
  const valid = notes.trim() !== '' && structuredOk

  return (
    <div className="mt-3">
      <p className={labelCls} style={labelStyle}>
        {t('financeOps.resolve_title')}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--text-soft)' }}>
        {t('financeOps.resolve_makercheck')}
      </p>
      <label className="mt-2 flex flex-col gap-1">
        <span className={labelCls} style={labelStyle}>
          {t('financeOps.resolve_kind')}
        </span>
        <select
          className={inputCls}
          style={inputStyle}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{t('financeOps.resolve_pick')}</option>
          <option value="new_evidence">{t('financeOps.kind_new_evidence')}</option>
          <option value="accepted_timing">
            {t('financeOps.kind_accepted_timing')}
          </option>
          <option value="superseded_by_matched">
            {t('financeOps.kind_superseded')}
          </option>
        </select>
      </label>
      {(kind === 'new_evidence' || kind === 'accepted_timing') && (
        <label className="mt-2 flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {kind === 'new_evidence'
              ? t('financeOps.resolve_evidence')
              : t('financeOps.resolve_timing_evidence')}
          </span>
          <input
            dir="ltr"
            className={inputCls}
            style={inputStyle}
            placeholder="BANK-ADVICE-0000"
            value={evidenceRef}
            onChange={(e) => setEvidenceRef(e.target.value)}
          />
        </label>
      )}
      {kind === 'superseded_by_matched' && (
        <label className="mt-2 flex flex-col gap-1">
          <span className={labelCls} style={labelStyle}>
            {t('financeOps.resolve_matched_id')}
          </span>
          <input
            dir="ltr"
            className={inputCls}
            style={inputStyle}
            value={matchedId}
            onChange={(e) => setMatchedId(e.target.value)}
          />
        </label>
      )}
      <label className="mt-2 flex flex-col gap-1">
        <span className={labelCls} style={labelStyle}>
          {t('financeOps.resolve_notes')}
        </span>
        <textarea
          className={inputCls}
          style={inputStyle}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {refusal && <RefusalNote code={refusal} />}
      <button
        disabled={!valid || busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setRefusal(null)
            const res = await resolveTreasuryReconciliation(token, id, {
              notes: notes.trim(),
              resolutionKind: kind,
              evidenceRef: evidenceRef.trim() || undefined,
              matchedReconciliationId: matchedId.trim() || undefined,
            })
            setBusy(false)
            if (res.kind === 'ok') onChanged()
            else if (res.kind === 'refused') setRefusal(res.code)
            else setRefusal('request_failed')
          })()
        }}
        className="mt-2 rounded-full border px-4 py-1.5 text-[0.72rem] font-bold disabled:opacity-40"
        style={{ borderColor: '#2E8B57', color: '#2E8B57' }}
      >
        {busy ? t('financeOps.working') : t('financeOps.resolve_submit')}
      </button>
    </div>
  )
}
