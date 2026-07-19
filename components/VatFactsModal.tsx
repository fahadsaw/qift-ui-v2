'use client'

// Store VAT-facts maker–checker panel (Track B3 / PE-12).
//
// Financial Constitution Ch. 14.1: ops PROPOSES a facts change with
// written verification evidence; a DIFFERENT operator APPROVES.
// The backend enforces SoD server-side — this UI only mirrors it
// (the approve button disables for the proposer, with a hint).
// Changes affect FUTURE invoices only; issued documents never change.

import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

type VatFacts = {
  vatRegistered: boolean
  vatNumber: string | null
  pricesIncludeVat: boolean
  taxCountry: string
}

type VatFactsPayload = {
  store: VatFacts & { id: string; name: string }
  pending:
    | (VatFacts & {
        id: string
        evidenceNote: string
        proposedBy: string
        createdAt: string
      })
    | null
}

export default function VatFactsModal({
  storeId,
  accessToken,
  viewerUserId,
  onClose,
}: {
  storeId: string
  accessToken: string
  viewerUserId: string | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [data, setData] = useState<VatFactsPayload | null>(null)
  const [busy, setBusy] = useState(false)
  // Propose form draft.
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatNumber, setVatNumber] = useState('')
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true)
  const [evidenceNote, setEvidenceNote] = useState('')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const refresh = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/stores/${storeId}/vat-facts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      toast.show(t('admin.vat_load_failed'), { tone: 'error' })
      onClose()
      return
    }
    const payload = (await res.json()) as VatFactsPayload
    setData(payload)
    setVatRegistered(payload.store.vatRegistered)
    setVatNumber(payload.store.vatNumber ?? '')
    setPricesIncludeVat(payload.store.pricesIncludeVat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, storeId])

  useEffect(() => {
    // House pattern (store-dashboard): the fetch-then-setState refresh
    // is intentional on mount; the modal owns its lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const propose = async () => {
    setBusy(true)
    try {
      const res = await fetch(
        `${API_BASE}/admin/stores/${storeId}/vat-facts/proposals`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            vatRegistered,
            vatNumber: vatNumber.trim() || undefined,
            pricesIncludeVat,
            taxCountry: 'SA',
            evidenceNote: evidenceNote.trim(),
          }),
        },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        const code = body?.message ?? 'error'
        toast.show(
          t(`admin.vat_err_${code}`) !== `admin.vat_err_${code}`
            ? t(`admin.vat_err_${code}`)
            : t('admin.vat_propose_failed'),
          { tone: 'error' },
        )
        return
      }
      toast.show(t('admin.vat_proposed_ok'))
      setEvidenceNote('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const decide = async (proposalId: string, verb: 'approve' | 'reject') => {
    setBusy(true)
    try {
      const res = await fetch(
        `${API_BASE}/admin/stores/${storeId}/vat-facts/proposals/${proposalId}/${verb}`,
        { method: 'POST', headers },
      )
      if (!res.ok) {
        toast.show(
          res.status === 403
            ? t('admin.vat_sod_hint')
            : t('admin.vat_decide_failed'),
          { tone: 'error' },
        )
        return
      }
      toast.show(
        verb === 'approve'
          ? t('admin.vat_approved_ok')
          : t('admin.vat_rejected_ok'),
      )
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const factsRow = (facts: VatFacts) => (
    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.78rem]">
      <dt style={{ color: 'var(--muted)' }}>{t('admin.vat_registered')}</dt>
      <dd style={{ color: 'var(--ink)' }}>
        {facts.vatRegistered ? t('admin.vat_yes') : t('admin.vat_no')}
      </dd>
      <dt style={{ color: 'var(--muted)' }}>{t('admin.vat_number')}</dt>
      <dd dir="ltr" className="select-all font-mono" style={{ color: 'var(--ink)' }}>
        {facts.vatNumber ?? '—'}
      </dd>
      <dt style={{ color: 'var(--muted)' }}>{t('admin.vat_prices_include')}</dt>
      <dd style={{ color: 'var(--ink)' }}>
        {facts.pricesIncludeVat ? t('admin.vat_yes') : t('admin.vat_no')}
      </dd>
      <dt style={{ color: 'var(--muted)' }}>{t('admin.vat_country')}</dt>
      <dd dir="ltr" className="font-mono" style={{ color: 'var(--ink)' }}>
        {facts.taxCountry}
      </dd>
    </dl>
  )

  return (
    <div
      className="qift-fade-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-center"
      style={{
        background: 'color-mix(in srgb, var(--bg-base) 75%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="m-3 w-full max-w-md rounded-3xl border p-5 backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {t('admin.vat_title')}
          {data ? ` — ${data.store.name}` : ''}
        </p>
        <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--muted)' }}>
          {t('admin.vat_subtitle')}
        </p>

        {data && (
          <>
            {/* Current facts */}
            <div
              className="mt-4 rounded-2xl border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-soft)' }}
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {t('admin.vat_current')}
              </p>
              {factsRow(data.store)}
            </div>

            {/* Pending proposal (maker–checker) */}
            {data.pending ? (
              <div
                className="mt-3 rounded-2xl border p-3"
                style={{ borderColor: 'var(--primary)', background: 'var(--card-soft)' }}
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
                  {t('admin.vat_pending')}
                </p>
                {factsRow(data.pending)}
                <p className="mt-2 text-[0.72rem]" style={{ color: 'var(--text-soft)' }}>
                  {t('admin.vat_evidence')}: {data.pending.evidenceNote}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || data.pending.proposedBy === viewerUserId}
                    onClick={() => void decide(data.pending!.id, 'approve')}
                    className="rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ borderColor: 'var(--success, #3dbf7f)', color: 'var(--success, #3dbf7f)' }}
                  >
                    {t('admin.vat_approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(data.pending!.id, 'reject')}
                    className="rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold disabled:opacity-50"
                    style={{ borderColor: 'var(--danger, #e05252)', color: 'var(--danger, #e05252)' }}
                  >
                    {t('admin.vat_reject')}
                  </button>
                </div>
                {data.pending.proposedBy === viewerUserId && (
                  <p className="mt-2 text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                    {t('admin.vat_sod_hint')}
                  </p>
                )}
              </div>
            ) : (
              /* Propose form */
              <div
                className="mt-3 rounded-2xl border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {t('admin.vat_propose')}
                </p>
                <label className="mt-2 flex items-center gap-2 text-[0.78rem]" style={{ color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={vatRegistered}
                    onChange={(e) => setVatRegistered(e.target.checked)}
                  />
                  {t('admin.vat_registered')}
                </label>
                <input
                  dir="ltr"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder={t('admin.vat_number_ph')}
                  className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 font-mono text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                />
                <label className="mt-2 flex items-center gap-2 text-[0.78rem]" style={{ color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={pricesIncludeVat}
                    onChange={(e) => setPricesIncludeVat(e.target.checked)}
                  />
                  {t('admin.vat_prices_include')}
                </label>
                <textarea
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder={t('admin.vat_evidence_ph')}
                  rows={2}
                  className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  disabled={busy || evidenceNote.trim().length < 8}
                  onClick={() => void propose()}
                  className="mt-2 rounded-full border px-4 py-1.5 text-[0.72rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                >
                  {t('admin.vat_propose_cta')}
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border px-4 py-2 text-[0.75rem] font-semibold"
          style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
        >
          {t('admin.vat_close')}
        </button>
      </div>
    </div>
  )
}
