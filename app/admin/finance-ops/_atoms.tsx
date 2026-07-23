'use client'

// Finance Ops Console — shared presentational atoms (PR 2).
// No financial math anywhere; refs/hashes always monospace + LTR.

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

export function Ref({ value }: { value: string }) {
  return (
    <span
      dir="ltr"
      className="font-mono text-[0.7rem] tabular-nums break-all"
      style={{ color: 'var(--ink)' }}
    >
      {value}
    </span>
  )
}

export function InfoRow({
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

export function StatusChip({ status }: { status: string }) {
  const { t } = useI18n()
  const good = status === 'matched' || status === 'resolved'
  const warn = status === 'pending' || status === 'investigated'
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[0.68rem] font-extrabold"
      style={
        good
          ? { borderColor: '#2E8B57', color: '#2E8B57' }
          : warn
            ? { borderColor: '#B8860B', color: '#B8860B' }
            : { borderColor: '#C0392B', color: '#C0392B' }
      }
    >
      {t(`financeOps.status_${status}`)}
    </span>
  )
}

// Tab nav for the console. PR 2 lights up reconciliation; the rest
// stay honest placeholders until their PR ships.
export function FinanceOpsTabs({
  active,
}: {
  active: 'dashboard' | 'reconciliation' | 'transfers' | 'settlement'
}) {
  const { t } = useI18n()
  const tabs: Array<{
    id: 'dashboard' | 'reconciliation' | 'transfers' | 'settlement'
    labelKey: string
    href: string | null
  }> = [
    { id: 'dashboard', labelKey: 'financeOps.tab_dashboard', href: '/admin/finance-ops' },
    {
      id: 'reconciliation',
      labelKey: 'financeOps.tab_reconciliation',
      href: '/admin/finance-ops/reconciliation',
    },
    { id: 'transfers', labelKey: 'financeOps.tab_transfers', href: null },
    { id: 'settlement', labelKey: 'financeOps.tab_settlement', href: null },
  ]
  return (
    <nav className="mt-4 flex flex-wrap gap-2 text-[0.7rem] font-semibold">
      {tabs.map((tab) =>
        tab.id === active ? (
          <span
            key={tab.id}
            className="rounded-full border px-3 py-1"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
          >
            {t(tab.labelKey)}
          </span>
        ) : tab.href ? (
          <Link
            key={tab.id}
            href={tab.href}
            className="rounded-full border px-3 py-1 hover:underline"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            {t(tab.labelKey)}
          </Link>
        ) : (
          <span
            key={tab.id}
            className="rounded-full border px-3 py-1 opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            title={t('financeOps.tab_coming')}
          >
            {t(tab.labelKey)} · {t('financeOps.tab_coming')}
          </span>
        ),
      )}
    </nav>
  )
}

// Server refusal codes → human messages. The code itself stays
// visible (monospace) — operators file it verbatim.
export function RefusalNote({ code }: { code: string }) {
  const { t } = useI18n()
  const KNOWN: Record<string, string> = {
    treasury_resolution_kind_required: 'financeOps.err_kind_required',
    treasury_resolution_evidence_required: 'financeOps.err_evidence_required',
    treasury_resolution_matched_required: 'financeOps.err_matched_required',
    treasury_resolution_matched_not_matched: 'financeOps.err_matched_not_matched',
    treasury_resolution_matched_not_later: 'financeOps.err_matched_not_later',
    treasury_resolution_matched_wrong_scope: 'financeOps.err_matched_wrong_scope',
    treasury_attester_cannot_resolve: 'financeOps.err_attester_resolver',
    treasury_reconciliation_not_investigable: 'financeOps.err_not_investigable',
    treasury_reconciliation_not_resolvable: 'financeOps.err_not_resolvable',
    treasury_attestation_date_mismatch: 'financeOps.err_attestation_date',
    treasury_evidence_required: 'financeOps.err_attestation_evidence',
    treasury_notes_required: 'financeOps.err_notes_required',
  }
  const base = code.split(':')[0]
  const key = KNOWN[base]
  return (
    <p
      className="mt-2 rounded-xl border px-3 py-2 text-[0.72rem]"
      style={{
        borderColor: 'color-mix(in srgb, #C0392B 40%, var(--border))',
        color: 'var(--ink)',
      }}
    >
      {key ? t(key) : t('financeOps.err_generic')}{' '}
      <Ref value={code} />
    </p>
  )
}
