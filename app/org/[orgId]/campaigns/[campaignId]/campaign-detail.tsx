'use client'

// Campaign detail + draft flow (Console PR 5).
//
// Mirrors the CF PR 3 backend contract:
//   * Content (name/option/recipients) is editable ONLY in draft /
//     changes_requested — other states render read-only.
//   * ONE gift option (one-gift-for-all MVP): setting replaces.
//     The product is referenced by ID for the concierge pilot —
//     ops/admins copy it from the store page; a visual picker is
//     deliberately deferred until the pilot friction log asks.
//   * Recipients attach from the ACTIVE roster (checkbox picker);
//     cross-org/archived ids are skipped server-side.
//   * Submit requires ≥1 option and ≥1 recipient; the approver's
//     review note renders verbatim on changes_requested.
//   * After approval, the frozen approvalSnapshot is displayed AS
//     the gift — what was signed off, not the live product.
//
// Approval / dispatch / report actions are Console PR 6 — this page
// shows status and the review trail only.

import { useCallback, useEffect, useState } from 'react'
import Field from '@/components/Field'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import Link from 'next/link'
import {
  addCampaignRecipients,
  approveCampaign,
  canApproveCampaigns,
  canDraftCampaigns,
  cancelCampaign,
  dispatchCampaign,
  getCampaign,
  getDispatchStatus,
  listContacts,
  OrgApiError,
  removeCampaignRecipient,
  requestCampaignChanges,
  setGiftOption,
  submitCampaign,
  type CampaignDetail,
  type DispatchStatus,
  type OrgContact,
} from '@/lib/org'
import OrgShell from '../../org-shell'
import { CAMPAIGN_STATUS_TONE } from '../campaigns-list'

const EDITABLE = new Set(['draft', 'changes_requested'])

export default function CampaignDetailView({
  orgId,
  campaignId,
}: {
  orgId: string
  campaignId: string
}) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'missing'>(
    'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [productId, setProductId] = useState('')
  const [roster, setRoster] = useState<OrgContact[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // Console PR 6 — approval flow + dispatch controls.
  const [changesNote, setChangesNote] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    'approve' | 'dispatch' | 'cancel' | null
  >(null)
  const [dispatch, setDispatch] = useState<DispatchStatus | null>(null)

  const errText = useCallback(
    (e: unknown) => {
      const code = e instanceof OrgApiError ? (e.code ?? 'generic') : 'generic'
      const key = `org.campaigns.err.${code}`
      const translated = t(key)
      return translated === key ? t('org.err.generic') : translated
    },
    [t],
  )

  const load = useCallback(async () => {
    if (!token) return
    try {
      const c = await getCampaign(token, orgId, campaignId)
      setCampaign(c)
      setState('ready')
      setError(null)
    } catch (e) {
      if (e instanceof OrgApiError && e.status === 403) setState('forbidden')
      else setState('missing')
    }
  }, [token, orgId, campaignId])

  useEffect(() => {
    // False positive: load() is async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // Dispatch queue counts once the campaign is in/through dispatch.
  useEffect(() => {
    if (
      !token ||
      !campaign ||
      (campaign.status !== 'dispatching' && campaign.status !== 'completed')
    )
      return
    let cancelled = false
    getDispatchStatus(token, orgId, campaignId)
      .then((d) => {
        if (!cancelled) setDispatch(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token, orgId, campaignId, campaign])

  // Roster picker data, loaded lazily once editable.
  useEffect(() => {
    if (!token || !campaign || !EDITABLE.has(campaign.status)) return
    let cancelled = false
    listContacts(token, orgId, { status: 'active' })
      .then((res) => {
        if (!cancelled) setRoster(res.items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token, orgId, campaign])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (state === 'forbidden') {
    return (
      <OrgShell orgId={orgId} active="campaigns">
        {() => (
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('org.campaigns.detail_forbidden')}
          </p>
        )}
      </OrgShell>
    )
  }
  if (state === 'missing') {
    return (
      <OrgShell orgId={orgId} active="campaigns">
        {() => (
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('org.not_found')}
          </p>
        )}
      </OrgShell>
    )
  }

  return (
    <OrgShell orgId={orgId} active="campaigns">
      {(_org, role) => {
        if (!campaign) {
          return (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {t('org.loading')}
            </p>
          )
        }
        const editable = EDITABLE.has(campaign.status) && canDraftCampaigns(role)
        const option = campaign.options[0] ?? null
        const snapshot = option?.approvalSnapshot ?? null
        const recipientIds = new Set(campaign.recipients.map((r) => r.contactId))
        const panel = {
          background: 'var(--card)',
          border: '1px solid var(--border)',
        } as const

        return (
          <>
            {/* ── Header ── */}
            <div className="rounded-2xl p-5" style={panel}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                  {campaign.name}
                </p>
                <span
                  className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                  style={{
                    color: CAMPAIGN_STATUS_TONE[campaign.status],
                    borderColor: 'var(--border)',
                  }}
                >
                  {t(`org.campaigns.status.${campaign.status}`)}
                </span>
              </div>
              {campaign.occasion && (
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {campaign.occasion}
                </p>
              )}
              {campaign.message && (
                <blockquote
                  className="mt-3 rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {campaign.message}
                </blockquote>
              )}
              {campaign.status === 'changes_requested' && campaign.reviewNote && (
                <p className="mt-3 text-sm" style={{ color: 'var(--warning, #d9a13b)' }}>
                  {t('org.campaigns.review_note')}: {campaign.reviewNote}
                </p>
              )}
              {campaign.status === 'pending_approval' && (
                <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('org.campaigns.pending_note')}
                </p>
              )}
            </div>

            {/* ── Gift option ── */}
            <div className="mt-4 rounded-2xl p-5" style={panel}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('org.campaigns.gift_title')}
              </p>
              {snapshot ? (
                <div className="mt-2">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {snapshot.productName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {snapshot.storeName}
                    {typeof snapshot.price === 'number' ? ` · ${snapshot.price} ﷼` : ''}
                  </p>
                  <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--muted-2)' }}>
                    {t('org.campaigns.snapshot_note')}
                  </p>
                </div>
              ) : option ? (
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }} dir="ltr">
                  {t('org.campaigns.gift_set')}: {option.productId}
                </p>
              ) : (
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('org.campaigns.gift_unset')}
                </p>
              )}
              {editable && (
                <div className="mt-3 flex flex-col gap-2">
                  <Field
                    label={t('org.campaigns.f_product')}
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    dirOverride="ltr"
                    helper={t('org.campaigns.f_product_help')}
                  />
                  <SecondaryButton
                    onClick={() => {
                      if (productId.trim())
                        void run(() =>
                          setGiftOption(token, orgId, campaignId, productId.trim()),
                        )
                    }}
                  >
                    {option
                      ? t('org.campaigns.gift_replace')
                      : t('org.campaigns.gift_save')}
                  </SecondaryButton>
                </div>
              )}
            </div>

            {/* ── Recipients ── */}
            <div className="mt-4 rounded-2xl p-5" style={panel}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('org.campaigns.recipients_title')} ({campaign.recipients.length})
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {campaign.recipients.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                      {r.contact?.fullName ?? t('org.members.purged')}
                      {r.contact?.department ? (
                        <span style={{ color: 'var(--muted-2)' }}>
                          {' '}
                          · {r.contact.department}
                        </span>
                      ) : null}
                    </p>
                    {editable && (
                      <button
                        type="button"
                        onClick={() =>
                          void run(() =>
                            removeCampaignRecipient(token, orgId, campaignId, r.id),
                          )
                        }
                        className="text-xs underline-offset-2 hover:underline"
                        style={{ color: 'var(--muted)' }}
                      >
                        {t('org.campaigns.remove')}
                      </button>
                    )}
                  </div>
                ))}
                {campaign.recipients.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('org.campaigns.no_recipients')}
                  </p>
                )}
              </div>

              {editable && roster && (
                <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    {t('org.campaigns.add_from_roster')}
                  </p>
                  <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {roster
                      .filter((c) => !recipientIds.has(c.id))
                      .map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                          style={{ color: 'var(--text-soft)' }}
                        >
                          <input
                            type="checkbox"
                            checked={picked.has(c.id)}
                            onChange={(e) => {
                              const next = new Set(picked)
                              if (e.target.checked) next.add(c.id)
                              else next.delete(c.id)
                              setPicked(next)
                            }}
                          />
                          {c.fullName}
                        </label>
                      ))}
                    {roster.filter((c) => !recipientIds.has(c.id)).length === 0 && (
                      <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
                        {t('org.campaigns.roster_exhausted')}
                      </p>
                    )}
                  </div>
                  {picked.size > 0 && (
                    <div className="mt-3">
                      <SecondaryButton
                        onClick={() =>
                          void run(async () => {
                            await addCampaignRecipients(token, orgId, campaignId, [
                              ...picked,
                            ])
                            setPicked(new Set())
                          })
                        }
                      >
                        {t('org.campaigns.add_selected')} ({picked.size})
                      </SecondaryButton>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            {/* ── Submit for approval ── */}
            {editable && (
              <div className="mt-5">
                <PrimaryButton
                  onClick={() => void run(() => submitCampaign(token, orgId, campaignId))}
                  disabled={busy || !option || campaign.recipients.length === 0}
                  loading={busy}
                >
                  {t('org.campaigns.submit_cta')}
                </PrimaryButton>
                <p className="mt-2 text-xs" style={{ color: 'var(--muted-2)' }}>
                  {t('org.campaigns.submit_note')}
                </p>
              </div>
            )}

            {/* ── Approval flow (PR 6) — the checker's console ──
                Walkthrough finding: the SoD rule is person-level, not
                role-level — an owner who CREATED the campaign holds
                the approver capability but the backend will (rightly)
                403 them. Don't render a doomed button: the creator
                sees the pending note instead, like any maker. */}
            {campaign.status === 'pending_approval' &&
              canApproveCampaigns(role) &&
              campaign.createdBy !== auth.userId && (
              <div className="mt-5 rounded-2xl p-5" style={panel}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t('org.approval.title')}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('org.approval.intro')}
                </p>
                {confirmAction === 'approve' ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                      {t('org.approval.approve_confirm_body')}
                    </p>
                    <PrimaryButton
                      onClick={() =>
                        void run(async () => {
                          await approveCampaign(token, orgId, campaignId)
                          setConfirmAction(null)
                        })
                      }
                      disabled={busy}
                      loading={busy}
                    >
                      {t('org.approval.approve_confirm_cta')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        if (!busy) setConfirmAction(null)
                      }}
                    >
                      {t('org.cancel')}
                    </SecondaryButton>
                  </div>
                ) : !showChanges ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <PrimaryButton
                      onClick={() => setConfirmAction('approve')}
                      disabled={busy}
                    >
                      {t('org.approval.approve_cta')}
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setShowChanges(true)}>
                      {t('org.approval.changes_cta')}
                    </SecondaryButton>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <Field
                      label={t('org.approval.f_note')}
                      requiredMark
                      value={changesNote}
                      onChange={(e) => setChangesNote(e.target.value)}
                      multiline
                      rows={3}
                      helper={t('org.approval.f_note_help')}
                    />
                    <PrimaryButton
                      onClick={() =>
                        void run(async () => {
                          await requestCampaignChanges(
                            token,
                            orgId,
                            campaignId,
                            changesNote.trim(),
                          )
                          setChangesNote('')
                          setShowChanges(false)
                        })
                      }
                      disabled={busy || !changesNote.trim()}
                      loading={busy}
                    >
                      {t('org.approval.changes_submit')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        if (!busy) setShowChanges(false)
                      }}
                    >
                      {t('org.cancel')}
                    </SecondaryButton>
                  </div>
                )}
              </div>
            )}

            {/* ── Dispatch controls (PR 6) ── */}
            {campaign.status === 'approved' && canDraftCampaigns(role) && (
              <div className="mt-5 rounded-2xl p-5" style={panel}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t('org.dispatch.title')}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {t('org.dispatch.intro')}
                </p>
                {confirmAction === 'dispatch' ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                      {t('org.dispatch.confirm_body')}
                    </p>
                    <PrimaryButton
                      onClick={() =>
                        void run(async () => {
                          await dispatchCampaign(token, orgId, campaignId)
                          setConfirmAction(null)
                        })
                      }
                      disabled={busy}
                      loading={busy}
                    >
                      {t('org.dispatch.confirm_cta')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        if (!busy) setConfirmAction(null)
                      }}
                    >
                      {t('org.cancel')}
                    </SecondaryButton>
                  </div>
                ) : (
                  <div className="mt-3">
                    <PrimaryButton
                      onClick={() => setConfirmAction('dispatch')}
                      disabled={busy}
                    >
                      {t('org.dispatch.cta')}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            )}

            {/* ── Dispatch progress + report link ── */}
            {(campaign.status === 'dispatching' || campaign.status === 'completed') && (
              <div className="mt-5 rounded-2xl p-5" style={panel}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t('org.dispatch.progress_title')}
                </p>
                {dispatch ? (
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-soft)' }}>
                    {Object.entries(dispatch.jobs)
                      .map(([k, v]) => `${t(`org.dispatch.job.${k}`)}: ${v}`)
                      .join(' · ') || t('org.loading')}
                  </p>
                ) : (
                  <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                    {t('org.loading')}
                  </p>
                )}
                <div className="mt-3">
                  <Link
                    href={`/org/${orgId}/campaigns/${campaignId}/report`}
                    className="text-sm font-semibold underline-offset-2 hover:underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    {t('org.report.open')} ←
                  </Link>
                </div>
              </div>
            )}

            {/* ── Cancel (pre-dispatch states only) ── */}
            {canDraftCampaigns(role) &&
              ['draft', 'pending_approval', 'changes_requested', 'approved'].includes(
                campaign.status,
              ) && (
                <div className="mt-4 text-center">
                  {confirmAction === 'cancel' ? (
                    <span className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            await cancelCampaign(token, orgId, campaignId)
                            setConfirmAction(null)
                          })
                        }
                        disabled={busy}
                        className="text-xs font-semibold underline-offset-2 hover:underline"
                        style={{ color: 'var(--danger)' }}
                      >
                        {t('org.campaigns.cancel_confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {t('org.cancel')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction('cancel')}
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t('org.campaigns.cancel_campaign')}
                    </button>
                  )}
                </div>
              )}
          </>
        )
      }}
    </OrgShell>
  )
}
