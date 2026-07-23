'use client'

// FINANCE OPS CONSOLE — PR 1: shell + Treasury dashboard.
//
// Constitutional surfaces rendered here (READ-ONLY in this PR):
//   SC §10.3 — daily three-way treasury reconciliation (health,
//   latest run, reconciliation-zero metric);
//   SC §26 / Lane 2 PR 3 Scope C — pending internal transfers with
//   aging; Scope D — enumerated alerts + run identity (account,
//   currency, cutoffAt, timezone).
//
// LAW: the authorized backend APIs are the only source of truth —
// this page performs NO financial calculations (unit presentation of
// server integers only, see lib/financeOpsApi.ts). Authorization is
// server-side (finance.reconcile); the permission check here is UX.
// Canonical references and hashes always render monospace + LTR.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
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
  getTreasuryHealth,
  listTreasuryReconciliations,
  type TreasuryAlert,
  type TreasuryHealth,
  type TreasuryReconciliationRow,
} from '@/lib/financeOpsApi'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'restricted' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      health: TreasuryHealth
      latestRow: TreasuryReconciliationRow | null
    }

// Canonical references, hashes, bank refs: monospace, LTR, always.
export function Ref({ value }: { value: string }) {
  return (
    <span
      dir="ltr"
      className="font-mono text-[0.7rem] tabular-nums"
      style={{ color: 'var(--ink)' }}
    >
      {value}
    </span>
  )
}

const ALERT_LABEL_KEY: Record<TreasuryAlert['kind'], string> = {
  reconciliation_zero_violated: 'financeOps.alert_recon_zero',
  mismatched_run: 'financeOps.alert_mismatched',
  unresolved_evidence: 'financeOps.alert_unresolved',
  internal_transfer_pending_aging: 'financeOps.alert_transfer_aging',
}

export default function FinanceOpsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { accessToken, isAuthenticated } = useAuth()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/admin/finance-ops')
    }
  }, [isAuthenticated, router])

  const load = useCallback(async () => {
    if (!accessToken) return
    setView({ kind: 'loading' })
    const perms = await getMyOpsPermissions(accessToken)
    if (perms.kind === 'restricted') return setView({ kind: 'restricted' })
    if (perms.kind === 'error') return setView({ kind: 'error' })
    if (!perms.data.permissions.includes('finance.reconcile')) {
      return setView({ kind: 'restricted' })
    }
    const [health, runs] = await Promise.all([
      getTreasuryHealth(accessToken),
      listTreasuryReconciliations(accessToken),
    ])
    if (health.kind === 'restricted' || runs.kind === 'restricted') {
      return setView({ kind: 'restricted' })
    }
    if (health.kind === 'error' || runs.kind === 'error') {
      return setView({ kind: 'error' })
    }
    setView({
      kind: 'ready',
      health: health.data,
      latestRow: runs.data[0] ?? null,
    })
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageContainer size="md">
      <section className="pt-5">
        <PageHeading
          line1={t('financeOps.title_1')}
          gradient={t('financeOps.title_2')}
          subtitle={t('financeOps.subtitle')}
          size="sm"
        />
        <div className="mt-3 flex items-center justify-between">
          <Link
            href="/admin"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('financeOps.back')}
          </Link>
          {view.kind === 'ready' && (
            <button
              onClick={() => void load()}
              className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              {t('financeOps.refresh')}
            </button>
          )}
        </div>

        {/* Program tabs — PR 1 ships the dashboard; later PRs light
            the rest up. Honest placeholders, never fake screens. */}
        <nav className="mt-4 flex flex-wrap gap-2 text-[0.7rem] font-semibold">
          <span
            className="rounded-full border px-3 py-1"
            style={{
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
            }}
          >
            {t('financeOps.tab_dashboard')}
          </span>
          {(
            [
              'financeOps.tab_reconciliation',
              'financeOps.tab_transfers',
              'financeOps.tab_settlement',
            ] as const
          ).map((k) => (
            <span
              key={k}
              className="rounded-full border px-3 py-1 opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              title={t('financeOps.tab_coming')}
            >
              {t(k)} · {t('financeOps.tab_coming')}
            </span>
          ))}
        </nav>

        {view.kind === 'loading' && (
          <Card className="mt-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-12 w-full" />
            <Skeleton className="mt-2 h-12 w-full" />
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
            <p className="mt-1 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
              {t('financeOps.error_body')}
            </p>
            <button
              onClick={() => void load()}
              className="mt-3 rounded-full border px-3 py-1 text-[0.7rem] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              {t('financeOps.retry')}
            </button>
          </Card>
        )}

        {view.kind === 'ready' && (
          <Dashboard health={view.health} latestRow={view.latestRow} />
        )}
      </section>
    </PageContainer>
  )
}

function Dashboard({
  health,
  latestRow,
}: {
  health: TreasuryHealth
  latestRow: TreasuryReconciliationRow | null
}) {
  const { t } = useI18n()
  const run = health.latestRun

  return (
    <>
      {/* Reconciliation-zero indicator — the Scope D health metric. */}
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <span
            className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('financeOps.recon_zero')}
          </span>
          <span
            className="rounded-full border px-3 py-1 text-[0.72rem] font-extrabold"
            style={
              health.reconciliationZero
                ? { borderColor: '#2E8B57', color: '#2E8B57' }
                : { borderColor: '#C0392B', color: '#C0392B' }
            }
          >
            {health.reconciliationZero
              ? t('financeOps.recon_zero_ok')
              : t('financeOps.recon_zero_violated')}
          </span>
        </div>
        <dl className="mt-3 flex flex-col gap-1 text-[0.74rem]">
          <InfoRow
            label={t('financeOps.mismatched_open')}
            value={String(health.mismatchedOpen)}
          />
          <InfoRow
            label={t('financeOps.investigated_open')}
            value={String(health.investigatedOpen)}
          />
        </dl>
      </Card>

      {/* Enumerated alerts — never free text, never hidden. */}
      {run && run.alerts.length > 0 && (
        <Card className="mt-3">
          <p
            className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: '#C0392B' }}
          >
            {t('financeOps.alerts')}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {run.alerts.map((a, i) => (
              <li
                key={`${a.kind}-${i}`}
                className="rounded-xl border px-3 py-2 text-[0.72rem]"
                style={{ borderColor: 'color-mix(in srgb, #C0392B 35%, var(--border))' }}
              >
                <strong style={{ color: 'var(--ink)' }}>
                  {t(ALERT_LABEL_KEY[a.kind] ?? 'financeOps.alerts')}
                </strong>
                <div className="mt-0.5" style={{ color: 'var(--text-soft)' }}>
                  <Ref value={a.detail} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Latest run + Scope D identity (account · currency · cutoff ·
          timezone) — figures verbatim from the server. */}
      <Card className="mt-3">
        <p
          className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('financeOps.latest_run')}
        </p>
        {!run || !latestRow ? (
          <p className="mt-2 text-[0.74rem]" style={{ color: 'var(--text-soft)' }}>
            {t('financeOps.no_runs')}
          </p>
        ) : (
          <dl className="mt-3 flex flex-col gap-1 text-[0.74rem]">
            <InfoRow
              label={t('financeOps.identity')}
              value={`${latestRow.accountType} · ${latestRow.currency} · UTC`}
            />
            <InfoRow
              label={t('financeOps.cutoff')}
              value={<Ref value={run.asOfDate} />}
            />
            <InfoRow
              label={t('financeOps.status')}
              value={
                <span
                  className="font-extrabold"
                  style={{
                    color: run.status === 'matched' ? '#2E8B57' : '#C0392B',
                  }}
                >
                  {t(`financeOps.status_${run.status}`)}
                </span>
              }
            />
            <InfoRow
              label={t('financeOps.differences')}
              value={String(run.differenceCount)}
            />
            <InfoRow
              label={t('financeOps.bank_balance')}
              value={
                latestRow.bankBalance === null
                  ? t('financeOps.no_attestation')
                  : formatMajor(latestRow.bankBalance, latestRow.currency)
              }
            />
            <InfoRow
              label={t('financeOps.ledger_cash')}
              value={formatMajor(latestRow.ledgerCashBalance, latestRow.currency)}
            />
            <InfoRow
              label={t('financeOps.obligations')}
              value={formatMajor(latestRow.obligationsBalance, latestRow.currency)}
            />
            <InfoRow
              label={t('financeOps.snapshot_hash')}
              value={<Ref value={run.snapshotHash} />}
            />
            {latestRow.integrityOk === false && (
              <InfoRow
                label={t('financeOps.integrity')}
                value={
                  <span className="font-extrabold" style={{ color: '#C0392B' }}>
                    {t('financeOps.integrity_violated')}
                  </span>
                }
              />
            )}
          </dl>
        )}
      </Card>

      {/* Pending internal transfers with aging (SC §26 dues). */}
      <Card className="mt-3">
        <p
          className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('financeOps.pending_transfers')}
        </p>
        {health.pendingInternalTransfers.length === 0 ? (
          <p className="mt-2 text-[0.74rem]" style={{ color: 'var(--text-soft)' }}>
            {t('financeOps.no_pending_transfers')}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {health.pendingInternalTransfers.map((p) => (
              <li
                key={p.settlementId}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-[0.72rem]"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <span>
                  <Ref value={p.settlementReference} />
                  <span
                    className="ms-2"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {t('financeOps.age_days')}: {p.ageDays}
                    {p.failedAttempts > 0
                      ? ` · ${t('financeOps.failed_attempts')}: ${p.failedAttempts}`
                      : ''}
                  </span>
                </span>
                <span className="font-bold tabular-nums" dir="ltr">
                  {formatMinor(p.outstandingMinor, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-soft)' }}>{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  )
}
