'use client'

// Corporate ops section (pre-pilot screens): the org review queue +
// per-org campaign oversight. Until now these lived behind curl —
// this is the screen the concierge pilot runs from.
//
// Three jobs on one tab:
//   1. Review the org queue (approve / reject / request changes).
//   2. Open an approved org's campaigns and read the FULL-
//      granularity ops report (incl. mismatch + pendingExpired —
//      granularity the org plane deliberately never sees).
//   3. Export claim links for a dispatched campaign. EXPORT ROTATES
//      TOKENS (export = the distribution event), so the button is a
//      two-step confirm and says so.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  exportClaimLinks,
  getAdminCampaignReport,
  listAdminOrgCampaigns,
  listAdminOrgs,
  reviewOrg,
  OrgAdminApiError,
  type AdminCampaignReport,
  type AdminOrg,
  type AdminOrgCampaign,
  type ClaimLinkExport,
} from '@/lib/orgAdmin'

const QUEUE_FILTERS = ['submitted', 'approved', 'all'] as const

export function CorporateSection({ accessToken }: { accessToken: string | null }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]>('submitted')
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null)
  const [openOrg, setOpenOrg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  // Campaign oversight state, per open org.
  const [campaigns, setCampaigns] = useState<AdminOrgCampaign[] | null>(null)
  const [report, setReport] = useState<AdminCampaignReport | null>(null)
  const [confirmExport, setConfirmExport] = useState<string | null>(null)
  const [exported, setExported] = useState<ClaimLinkExport | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    try {
      setOrgs(
        await listAdminOrgs(accessToken, filter === 'all' ? undefined : filter),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof OrgAdminApiError ? e.message : 'load_failed')
    }
  }, [accessToken, filter])

  useEffect(() => {
    // False positive: async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof OrgAdminApiError ? e.message : 'request_failed')
    } finally {
      setBusy(false)
    }
  }

  const openOrgRow = async (org: AdminOrg) => {
    const next = openOrg === org.id ? null : org.id
    setOpenOrg(next)
    setReason('')
    setCampaigns(null)
    setReport(null)
    setExported(null)
    setConfirmExport(null)
    if (next && org.status === 'approved' && accessToken) {
      try {
        setCampaigns(await listAdminOrgCampaigns(accessToken, org.id))
      } catch {
        setCampaigns([])
      }
    }
  }

  const chip = (active: boolean) =>
    ({
      borderColor: active
        ? 'color-mix(in srgb, var(--primary) 60%, transparent)'
        : 'var(--border)',
      background: active
        ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
        : 'var(--card)',
      color: active ? 'var(--ink)' : 'var(--text-soft)',
    }) as const

  const panel = { background: 'var(--card)', border: '1px solid var(--border)' } as const

  return (
    <div className="flex flex-col gap-4">
      {/* ── Queue filter ── */}
      <div className="flex gap-2">
        {QUEUE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={chip(filter === f)}
          >
            {t(`admin.corp_filter_${f}`)}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {t('admin.corp_error')}: {error}
        </p>
      )}

      {orgs === null && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('admin.corp_loading')}
        </p>
      )}
      {orgs?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('admin.corp_empty')}
        </p>
      )}

      {orgs?.map((org) => (
        <div key={org.id} className="rounded-2xl p-4" style={panel}>
          <button
            type="button"
            onClick={() => void openOrgRow(org)}
            className="flex w-full items-center justify-between gap-3 text-start"
          >
            <span>
              <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                {org.displayNameAr || org.displayName}
              </span>
              <span className="block text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                {org.legalName}
                {org.crNumber ? ` · CR ${org.crNumber}` : ''} · {org.riskTier}
              </span>
            </span>
            <span
              className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
              style={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
            >
              {t(`org.status.${org.status}`)}
            </span>
          </button>

          {openOrg === org.id && (
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              {/* ── Review actions (submitted only) ── */}
              {org.status === 'submitted' && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder={t('admin.corp_reason_ph')}
                    className="w-full rounded-xl border p-3 text-sm"
                    style={{
                      borderColor: 'var(--border-strong)',
                      background: 'var(--surface-2)',
                      color: 'var(--ink)',
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => reviewOrg(accessToken, org.id, 'approve'))
                      }
                      className="rounded-xl border px-3 py-2 text-xs font-semibold"
                      style={{ color: 'var(--success, #3dbf7f)', borderColor: 'var(--border)' }}
                    >
                      {t('admin.corp_approve')}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run(() =>
                          reviewOrg(accessToken, org.id, 'request_changes', reason.trim()),
                        )
                      }
                      className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      style={{ color: 'var(--warning, #d9a13b)', borderColor: 'var(--border)' }}
                    >
                      {t('admin.corp_request_changes')}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run(() => reviewOrg(accessToken, org.id, 'reject', reason.trim()))
                      }
                      className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
                    >
                      {t('admin.corp_reject')}
                    </button>
                  </div>
                  <p className="text-[0.7rem]" style={{ color: 'var(--muted-2)' }}>
                    {t('admin.corp_reason_note')}
                  </p>
                </div>
              )}

              {/* ── Campaign oversight (approved orgs) ── */}
              {org.status === 'approved' && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    {t('admin.corp_campaigns')}
                  </p>
                  {campaigns === null && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {t('admin.corp_loading')}
                    </p>
                  )}
                  {campaigns?.length === 0 && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {t('admin.corp_no_campaigns')}
                    </p>
                  )}
                  {campaigns?.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {c.name}
                          <span className="ms-2 text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                            {t(`org.campaigns.status.${c.status}`)} · {c._count.recipients}
                          </span>
                        </p>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void run(async () =>
                                setReport(
                                  await getAdminCampaignReport(accessToken, org.id, c.id),
                                ),
                              )
                            }
                            className="text-xs underline-offset-2 hover:underline"
                            style={{ color: 'var(--primary)' }}
                          >
                            {t('admin.corp_report')}
                          </button>
                          {confirmExport === c.id ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  setExported(
                                    await exportClaimLinks(accessToken, org.id, c.id),
                                  )
                                  setConfirmExport(null)
                                })
                              }
                              className="text-xs font-semibold underline-offset-2 hover:underline"
                              style={{ color: 'var(--danger)' }}
                            >
                              {t('admin.corp_export_confirm')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmExport(c.id)}
                              className="text-xs underline-offset-2 hover:underline"
                              style={{ color: 'var(--muted)' }}
                            >
                              {t('admin.corp_export')}
                            </button>
                          )}
                        </span>
                      </div>
                      {confirmExport === c.id && (
                        <p className="mt-2 text-[0.7rem]" style={{ color: 'var(--danger)' }}>
                          {t('admin.corp_export_warning')}
                        </p>
                      )}
                      {report?.campaign.id === c.id && (
                        <div className="mt-2 text-xs" style={{ color: 'var(--text-soft)' }}>
                          <p>
                            {t('admin.corp_report_jobs')}:{' '}
                            {Object.entries(report.jobs)
                              .map(([k, v]) => `${k} ${v}`)
                              .join(' · ') || '0'}
                          </p>
                          <p>
                            {t('admin.corp_report_claims')}:{' '}
                            {Object.entries(report.claims)
                              .map(([k, v]) => `${k} ${v}`)
                              .join(' · ') || '0'}
                            {report.pendingExpired > 0 &&
                              ` · pendingExpired ${report.pendingExpired}`}
                          </p>
                        </div>
                      )}
                      {exported?.campaign.id === c.id && (
                        <div className="mt-2 flex flex-col gap-1">
                          <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                            {t('admin.corp_exported')}: {exported.exported} ·{' '}
                            {t('admin.corp_export_skipped')}:{' '}
                            {exported.skippedFinalized + exported.skippedUnreachable}
                          </p>
                          {exported.links.map((l) => (
                            <div
                              key={l.claimUrl}
                              className="flex items-center justify-between gap-2 text-xs"
                              style={{ color: 'var(--text-soft)' }}
                            >
                              <span className="truncate">
                                {l.contactName} · {l.channel}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void navigator.clipboard.writeText(l.claimUrl)
                                }
                                className="whitespace-nowrap underline-offset-2 hover:underline"
                                style={{ color: 'var(--primary)' }}
                              >
                                {t('admin.corp_copy_link')}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Rejection reason trail for non-submitted, non-approved */}
              {org.rejectionReason && org.status !== 'approved' && (
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('admin.corp_last_reason')}: {org.rejectionReason}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
