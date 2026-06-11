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
import {
  addCampaignRecipients,
  canDraftCampaigns,
  getCampaign,
  listContacts,
  OrgApiError,
  removeCampaignRecipient,
  setGiftOption,
  submitCampaign,
  type CampaignDetail,
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
          </>
        )
      }}
    </OrgShell>
  )
}
