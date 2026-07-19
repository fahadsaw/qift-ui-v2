'use client'

// Campaign report — the F7 funnel (Console PR 6).
//
// Renders exactly what the backend's org-plane report exposes and
// NOTHING more: recipients selected, links prepared, then the
// four-number funnel (issued / claimed / still pending / did not
// participate). The F7 model is stated to the org in plain words:
// declining, ignoring the link, or a roster mismatch are ONE
// undifferentiated number — Qift never tells the employer which.
// No per-person status exists on this plane, by design.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { getCampaignReport, type CampaignReport } from '@/lib/org'
import OrgShell from '../../../org-shell'
import { CAMPAIGN_STATUS_TONE } from '../../campaigns-list'

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div
      className="rounded-2xl p-4 text-center"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <p className="text-2xl font-extrabold" style={{ color: tone ?? 'var(--ink)' }}>
        {value}
      </p>
      <p className="mt-1 text-[0.7rem] leading-tight" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
    </div>
  )
}

export default function ReportView({
  orgId,
  campaignId,
}: {
  orgId: string
  campaignId: string
}) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [report, setReport] = useState<CampaignReport | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCampaignReport(token, orgId, campaignId)
      .then((r) => {
        if (cancelled) return
        setReport(r)
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
        if (state === 'missing' || !report) {
          return (
            <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
              {t('org.not_found')}
            </p>
          )
        }
        return (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                  {report.campaign.name}
                </p>
                <p
                  dir="ltr"
                  className="select-all font-mono text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {report.campaign.referenceNumber}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('org.report.title')}
                  {report.campaign.approvedAt
                    ? ` · ${new Date(report.campaign.approvedAt).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
              <span
                className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                style={{
                  color: CAMPAIGN_STATUS_TONE[report.campaign.status],
                  borderColor: 'var(--border)',
                }}
              >
                {t(`org.campaigns.status.${report.campaign.status}`)}
              </span>
            </div>

            {/* ── Pipeline ── */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label={t('org.report.recipients')} value={report.recipients} />
              <Stat label={t('org.report.dispatched')} value={report.dispatched} />
            </div>

            {/* ── The F7 funnel ── */}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('org.report.issued')} value={report.gifts.issued} />
              <Stat
                label={t('org.report.claimed')}
                value={report.gifts.claimed}
                tone="var(--success, #3dbf7f)"
              />
              <Stat label={t('org.report.pending')} value={report.gifts.pending} />
              <Stat
                label={t('org.report.dnp')}
                value={report.gifts.didNotParticipate}
                tone="var(--muted)"
              />
            </div>

            {/* The F7 model, stated to the org in plain words. */}
            <div
              className="mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                color: 'var(--text-soft)',
              }}
            >
              {t('org.report.f7_note')}
            </div>

            <div className="mt-5">
              <Link
                href={`/org/${orgId}/campaigns`}
                className="text-sm underline-offset-2 hover:underline"
                style={{ color: 'var(--muted)' }}
              >
                ‹ {t('org.report.back_to_campaigns')}
              </Link>
            </div>
          </>
        )
      }}
    </OrgShell>
  )
}
