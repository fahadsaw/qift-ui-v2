'use client'

// OrgShell — the shared chrome for every /org/[orgId] console page
// (Console PR 3). Loads the org + the viewer's seat role once and
// renders the role-aware tab nav; pages receive (org, role) through
// a render prop.
//
// Role-aware nav is UX, not security: the backend's OrgRoleGuard is
// the boundary. A non-member gets a 404 from /org/mine resolution
// here (the org simply isn't in their list) — same anti-enumeration
// posture as the API.

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import PageContainer from '@/components/PageContainer'
import PrimaryButton from '@/components/PrimaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  canDraftCampaigns,
  canManageSeats,
  myOrgs,
  type MyOrg,
  type OrgRole,
} from '@/lib/org'

export type OrgTab = 'dashboard' | 'members' | 'roster' | 'campaigns'

export default function OrgShell({
  orgId,
  active,
  children,
}: {
  orgId: string
  active: OrgTab
  children: (org: MyOrg, role: OrgRole) => ReactNode
}) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [org, setOrg] = useState<MyOrg | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    myOrgs(token)
      .then((orgs) => {
        if (cancelled) return
        const found = orgs.find((o) => o.id === orgId) ?? null
        setOrg(found)
        setState(found ? 'ready' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setState('missing')
      })
    return () => {
      cancelled = true
    }
  }, [token, orgId])

  if (!auth.accessToken) {
    return (
      <PageContainer>
        <div className="mx-auto mt-12 max-w-md text-center">
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('org.login_required')}
          </p>
          <div className="mt-4">
            <PrimaryButton href="/login">{t('nav.login')}</PrimaryButton>
          </div>
        </div>
      </PageContainer>
    )
  }

  if (state === 'loading') {
    return (
      <PageContainer>
        <p className="mt-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
          {t('org.loading')}
        </p>
      </PageContainer>
    )
  }

  if (state === 'missing' || !org) {
    // No seat OR no such org — indistinguishable by design.
    return (
      <PageContainer>
        <div className="mx-auto mt-12 max-w-md text-center">
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('org.not_found')}
          </p>
          <div className="mt-4">
            <PrimaryButton href="/org">{t('org.back_to_hub')}</PrimaryButton>
          </div>
        </div>
      </PageContainer>
    )
  }

  const role = org.myRole
  const tabs: { id: OrgTab; href: string; label: string; show: boolean }[] = [
    { id: 'dashboard', href: `/org/${orgId}`, label: t('org.nav.dashboard'), show: true },
    {
      id: 'members',
      href: `/org/${orgId}/members`,
      label: t('org.nav.members'),
      show: canManageSeats(role),
    },
    {
      id: 'roster',
      href: `/org/${orgId}/roster`,
      label: t('org.nav.roster'),
      show: canDraftCampaigns(role),
    },
    {
      id: 'campaigns',
      href: `/org/${orgId}/campaigns`,
      label: t('org.nav.campaigns'),
      show: true,
    },
  ]

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-2xl pb-16 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href="/org"
              className="text-xs underline-offset-2 hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              ‹ {t('org.back_to_hub')}
            </Link>
            <h1 className="mt-1 text-xl font-extrabold" style={{ color: 'var(--ink)' }}>
              {org.displayNameAr || org.displayName}
            </h1>
          </div>
          <span
            className="mt-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
            style={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            {t(`org.role.${role}`)}
          </span>
        </div>

        <nav
          className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border p-1"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          {tabs
            .filter((tab) => tab.show)
            .map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                className="flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-medium transition-colors"
                style={
                  tab.id === active
                    ? {
                        background:
                          'color-mix(in srgb, var(--primary) 14%, transparent)',
                        color: 'var(--ink)',
                      }
                    : { color: 'var(--text-soft)' }
                }
              >
                {tab.label}
              </Link>
            ))}
        </nav>

        <div className="mt-6">{children(org, role)}</div>
      </div>
    </PageContainer>
  )
}
