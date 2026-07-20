'use client'

// Campaign billing view (Track B4 / PE-15).
//
// Constitutional obligations rendered here:
// * Financial Constitution Ch. 4.3 — the summary is a computed
//   read-model; absent legs are ENUMERATED ("not yet issued"), the
//   grand total renders null-honest, and NOTHING is computed
//   client-side (15.4: every number arrives from the server).
// * Reference Constitution Ch. 2/7/14.1 — QB leads the page; the QC
//   invoice number and the merchant's number + provenance are shown
//   monospace/LTR/select-all (Ch. 3.5); no synthetic placeholders.
// * Principle 10 honesty — configured:false / null party fields render
//   as "pending legal configuration", never a fabricated legal name.
// * Employer-blindness — nothing per-recipient exists on this plane;
//   only counts ride the invoices.

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  getCampaignBillingSummary,
  type CampaignBillingSummary,
} from '@/lib/org'
import OrgShell from '../../../org-shell'

function Reference({ value, hint }: { value: string; hint?: string }) {
  return (
    <span
      dir="ltr"
      className="select-all font-mono text-[0.78rem] font-semibold"
      style={{ color: 'var(--ink)' }}
      title={hint}
    >
      {value}
    </span>
  )
}

function MoneyRow({
  label,
  amount,
  currency,
  strong,
}: {
  label: string
  amount: number
  currency: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[0.8rem]">
      <span style={{ color: strong ? 'var(--ink)' : 'var(--muted)' }}>
        {label}
      </span>
      <span
        dir="ltr"
        className={strong ? 'font-bold' : ''}
        style={{ color: 'var(--ink)' }}
      >
        {amount} {currency}
      </span>
    </div>
  )
}

export default function BillingView({
  orgId,
  campaignId,
}: {
  orgId: string
  campaignId: string
}) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [summary, setSummary] = useState<CampaignBillingSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    'loading',
  )

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCampaignBillingSummary(token, orgId, campaignId)
      .then((s) => {
        if (cancelled) return
        setSummary(s)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('missing')
      })
    return () => {
      cancelled = true
    }
  }, [token, orgId, campaignId])

  return (
    <OrgShell orgId={orgId} active="campaigns">
      {() => {
        if (state === 'loading') {
          return (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {t('org.loading')}
            </p>
          )
        }
        if (state === 'missing' || !summary) {
          return (
            <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
              {t('org.not_found')}
            </p>
          )
        }
        const panel = {
          background: 'var(--card)',
          border: '1px solid var(--border)',
        }
        return (
          <>
            {/* ── Header: the QB purchase reference leads ── */}
            <div className="rounded-2xl p-5" style={panel}>
              <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {t('org.billing.title')}
              </p>
              <p
                dir="ltr"
                className="mt-0.5 select-all font-mono text-[0.75rem]"
                style={{ color: 'var(--muted)' }}
                title={t('org.reference_hint')}
              >
                {summary.campaignReference}
              </p>
              <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--muted)' }}>
                {t('org.billing.model_note')}
              </p>
            </div>

            {/* ── Merchant goods invoice (the merchant's legal doc) ── */}
            <div className="mt-3 rounded-2xl p-5" style={panel}>
              <p
                className="text-[0.7rem] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                {t('org.billing.merchant_leg')}
              </p>
              {summary.merchantInvoice ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.78rem]" style={{ color: 'var(--muted)' }}>
                      {t('org.billing.invoice_number')}
                    </span>
                    {summary.merchantInvoice.merchantInvoiceNumber ? (
                      <Reference
                        value={summary.merchantInvoice.merchantInvoiceNumber}
                      />
                    ) : (
                      <span
                        className="text-[0.72rem]"
                        style={{ color: 'var(--muted)' }}
                      >
                        {t('org.billing.merchant_number_pending')}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                    {t('org.billing.source')}:{' '}
                    {t(
                      `org.billing.source_${summary.merchantInvoice.invoiceNumberSource.toLowerCase()}`,
                    )}
                    {summary.merchantInvoice.storeName
                      ? ` · ${summary.merchantInvoice.storeName}`
                      : ''}
                  </p>
                  <MoneyRow
                    label={t('org.billing.goods_subtotal')}
                    amount={summary.merchantInvoice.goodsSubtotalAmount}
                    currency={summary.currency}
                  />
                  <MoneyRow
                    label={t('org.billing.vat')}
                    amount={summary.merchantInvoice.vatAmount}
                    currency={summary.currency}
                  />
                  <MoneyRow
                    label={t('org.billing.total')}
                    amount={summary.merchantInvoice.totalAmount}
                    currency={summary.currency}
                    strong
                  />
                </div>
              ) : (
                <p className="mt-2 text-[0.78rem]" style={{ color: 'var(--muted)' }}>
                  {t('org.billing.not_issued')}
                </p>
              )}
            </div>

            {/* ── Qift service invoice (Qift's legal doc, QC series) ── */}
            <div className="mt-3 rounded-2xl p-5" style={panel}>
              <p
                className="text-[0.7rem] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                {t('org.billing.qift_leg')}
              </p>
              {summary.qiftInvoice ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.78rem]" style={{ color: 'var(--muted)' }}>
                      {t('org.billing.invoice_number')}
                    </span>
                    <Reference value={summary.qiftInvoice.invoiceNumber} />
                  </div>
                  <MoneyRow
                    label={t('org.billing.service_fee')}
                    amount={summary.qiftInvoice.serviceFeeAmount}
                    currency={summary.currency}
                  />
                  <MoneyRow
                    label={t('org.billing.vat')}
                    amount={summary.qiftInvoice.vatAmount}
                    currency={summary.currency}
                  />
                  <MoneyRow
                    label={t('org.billing.total')}
                    amount={summary.qiftInvoice.totalAmount}
                    currency={summary.currency}
                    strong
                  />
                </div>
              ) : (
                <p className="mt-2 text-[0.78rem]" style={{ color: 'var(--muted)' }}>
                  {t('org.billing.not_issued')}
                </p>
              )}
            </div>

            {/* ── Grand total: null-honest, never computed here ── */}
            <div className="mt-3 rounded-2xl p-5" style={panel}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {t('org.billing.grand_total')}
                </span>
                {summary.grandTotalAmount !== null ? (
                  <span
                    dir="ltr"
                    className="text-sm font-extrabold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {summary.grandTotalAmount} {summary.currency}
                  </span>
                ) : (
                  <span className="text-[0.72rem]" style={{ color: 'var(--muted)' }}>
                    {t('org.billing.grand_total_pending')}
                  </span>
                )}
              </div>
              {!summary.complete && summary.missing.length > 0 && (
                <p className="mt-1.5 text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                  {t('org.billing.missing')}:{' '}
                  {summary.missing
                    .map((m) => t(`org.billing.leg_${m}`))
                    .join('، ')}
                </p>
              )}
            </div>
          </>
        )
      }}
    </OrgShell>
  )
}
