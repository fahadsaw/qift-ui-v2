'use client'

// Org console dashboard (Console PR 3): the org profile card plus
// role-aware entry cards into the console areas. Counts and funnel
// summaries land with the campaigns/reports PRs — this page stays
// an orientation surface, not a data dump.

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import {
  canApproveCampaigns,
  canDraftCampaigns,
  canManageSeats,
  type MyOrg,
  type OrgRole,
} from '@/lib/org'
import OrgShell from './org-shell'

function EntryCard({
  href,
  title,
  body,
}: {
  href: string
  title: string
  body: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
    </Link>
  )
}

export default function OrgDashboard({ orgId }: { orgId: string }) {
  const { t } = useI18n()

  const renderBody = (org: MyOrg, role: OrgRole) => (
    <>
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {t('org.f_legal_name')}
        </p>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {org.legalName}
        </p>
        {org.crNumber && (
          <>
            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              {t('org.f_cr')}
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)', direction: 'ltr' }}>
              {org.crNumber}
            </p>
          </>
        )}
        <p className="mt-3 text-xs" style={{ color: 'var(--muted-2)' }}>
          {t('org.dash_privacy_note')}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {canManageSeats(role) && (
          <EntryCard
            href={`/org/${orgId}/members`}
            title={t('org.nav.members')}
            body={t('org.dash_members_body')}
          />
        )}
        {canDraftCampaigns(role) && (
          <EntryCard
            href={`/org/${orgId}/roster`}
            title={t('org.nav.roster')}
            body={t('org.dash_roster_body')}
          />
        )}
        <EntryCard
          href={`/org/${orgId}/campaigns`}
          title={t('org.nav.campaigns')}
          body={
            canApproveCampaigns(role)
              ? t('org.dash_campaigns_approver_body')
              : canDraftCampaigns(role)
                ? t('org.dash_campaigns_admin_body')
                : t('org.dash_campaigns_viewer_body')
          }
        />
      </div>
    </>
  )

  return (
    <OrgShell orgId={orgId} active="dashboard">
      {renderBody}
    </OrgShell>
  )
}
