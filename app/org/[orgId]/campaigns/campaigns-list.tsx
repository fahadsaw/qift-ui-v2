'use client'

// Campaign list + create draft (Console PR 5).
//
// The list mirrors the backend's every-seat projection: status,
// counts, dates — never recipient names. Viewer/approver seats see
// the list read-only; admin/owner get the create form. Detail and
// the draft flow live at /campaigns/[campaignId].

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Field from '@/components/Field'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  canDraftCampaigns,
  createCampaign,
  listCampaigns,
  OrgApiError,
  type CampaignListItem,
  type CampaignStatus,
} from '@/lib/org'
import OrgShell from '../org-shell'

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = {
  draft: 'var(--muted)',
  pending_approval: 'var(--primary)',
  approved: 'var(--success, #3dbf7f)',
  changes_requested: 'var(--warning, #d9a13b)',
  dispatching: 'var(--primary)',
  completed: 'var(--success, #3dbf7f)',
  cancelled: 'var(--danger)',
}

export default function CampaignsList({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [occasion, setOccasion] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    try {
      setCampaigns(await listCampaigns(token, orgId))
      setError(null)
    } catch {
      setError(t('org.err.generic'))
    }
  }, [token, orgId, t])

  useEffect(() => {
    // False positive: load() is async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || name.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      await createCampaign(token, orgId, {
        name: name.trim(),
        occasion: occasion.trim() || undefined,
        message: message.trim() || undefined,
      })
      setName('')
      setOccasion('')
      setMessage('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setError(
        err instanceof OrgApiError && err.code === 'org_not_approved'
          ? t('org.campaigns.err.org_not_approved')
          : t('org.err.generic'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <OrgShell orgId={orgId} active="campaigns">
      {(_org, role) => (
        <>
          {error && (
            <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {campaigns === null && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('org.loading')}
              </p>
            )}
            {campaigns?.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {canDraftCampaigns(role)
                  ? t('org.campaigns.empty_admin')
                  : t('org.campaigns.empty')}
              </p>
            )}
            {campaigns?.map((c) => (
              <Link
                key={c.id}
                href={`/org/${orgId}/campaigns/${c.id}`}
                className="block rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {c.name}
                  </p>
                  <span
                    className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                    style={{
                      color: CAMPAIGN_STATUS_TONE[c.status],
                      borderColor: 'var(--border)',
                    }}
                  >
                    {t(`org.campaigns.status.${c.status}`)}
                  </span>
                </div>
                <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                  {c._count.recipients} {t('org.campaigns.recipients_label')}
                  {c.occasion ? ` · ${c.occasion}` : ''}
                  {' · '}
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>

          {canDraftCampaigns(role) && (
            <div className="mt-6">
              {!showCreate ? (
                <SecondaryButton onClick={() => setShowCreate(true)}>
                  {t('org.campaigns.create_cta')}
                </SecondaryButton>
              ) : (
                <form
                  onSubmit={(e) => void onCreate(e)}
                  className="flex flex-col gap-4 rounded-2xl p-5"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {t('org.campaigns.create_title')}
                  </p>
                  <Field
                    label={t('org.campaigns.f_name')}
                    requiredMark
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    helper={t('org.campaigns.f_name_help')}
                  />
                  <Field
                    label={t('org.campaigns.f_occasion')}
                    optional={t('org.optional')}
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                  />
                  <Field
                    label={t('org.campaigns.f_message')}
                    optional={t('org.optional')}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    multiline
                    rows={3}
                    helper={t('org.campaigns.f_message_help')}
                  />
                  <PrimaryButton
                    type="submit"
                    disabled={busy || name.trim().length < 3}
                    loading={busy}
                  >
                    {t('org.campaigns.create_submit')}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => {
                      if (!busy) setShowCreate(false)
                    }}
                  >
                    {t('org.cancel')}
                  </SecondaryButton>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </OrgShell>
  )
}
