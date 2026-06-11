'use client'

// /org — the Corporate Business Console hub (Console PR 2).
//
// Lists every org where the viewer holds an active seat, with a
// status banner per the review lifecycle, a create-draft form, and
// submit-for-review from draft / changes_requested. Detail pages
// (members, roster, campaigns, reports) hang off /org/[orgId] in
// the next console PRs.
//
// Role-aware: the role chip comes from the seat (myRole); action
// affordances follow the same helpers the detail pages will use.
// The backend remains the authorization boundary — hiding a button
// here is UX, not security.

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  createOrg,
  myOrgs,
  submitOrg,
  OrgApiError,
  type MyOrg,
  type OrgStatus,
} from '@/lib/org'

const STATUS_TONE: Record<OrgStatus, string> = {
  draft: 'var(--muted)',
  submitted: 'var(--primary)',
  approved: 'var(--success, #3dbf7f)',
  rejected: 'var(--danger)',
  changes_requested: 'var(--warning, #d9a13b)',
  suspended: 'var(--danger)',
}

export default function OrgHubPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth?.accessToken ?? null

  const [orgs, setOrgs] = useState<MyOrg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Create form
  const [legalName, setLegalName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [displayNameAr, setDisplayNameAr] = useState('')
  const [crNumber, setCrNumber] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    try {
      setOrgs(await myOrgs(token))
      setError(null)
    } catch (e) {
      setError(e instanceof OrgApiError ? e.message : 'load_failed')
    }
  }, [token])

  useEffect(() => {
    // False positive: load() is async — every setState inside it
    // happens after an await, never synchronously in the effect
    // body. Same posture as settings/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await createOrg(token, {
        legalName: legalName.trim(),
        displayName: displayName.trim(),
        displayNameAr: displayNameAr.trim() || undefined,
        crNumber: crNumber.trim() || undefined,
      })
      setShowCreate(false)
      setLegalName('')
      setDisplayName('')
      setDisplayNameAr('')
      setCrNumber('')
      await load()
    } catch (e) {
      setError(
        e instanceof OrgApiError && e.code
          ? t(`org.err.${e.code}`) === `org.err.${e.code}`
            ? t('org.err.generic')
            : t(`org.err.${e.code}`)
          : t('org.err.generic'),
      )
    } finally {
      setBusy(false)
    }
  }

  const onSubmitOrg = async (orgId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await submitOrg(token, orgId)
      await load()
    } catch (e) {
      setError(
        e instanceof OrgApiError && e.code === 'org_cr_required'
          ? t('org.err.org_cr_required')
          : t('org.err.generic'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!auth?.accessToken) {
    return (
      <PageContainer>
        <div className="mx-auto mt-12 max-w-md text-center">
          <PageHeading
            line1={t('org.hub_title_1')}
            gradient={t('org.hub_title_2')}
            subtitle={t('org.login_required')}
            size="sm"
          />
          <div className="mt-6">
            <PrimaryButton href="/login">{t('nav.login')}</PrimaryButton>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-2xl pb-16 pt-4">
        <PageHeading
          badge={<Badge>{t('org.badge')}</Badge>}
          line1={t('org.hub_title_1')}
          gradient={t('org.hub_title_2')}
          subtitle={t('org.hub_intro')}
          size="md"
        />

        {error && (
          <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {/* ── Org cards ── */}
        <div className="mt-6 flex flex-col gap-4">
          {orgs === null && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {t('org.loading')}
            </p>
          )}
          {orgs?.length === 0 && !showCreate && (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                {t('org.empty')}
              </p>
            </div>
          )}
          {orgs?.map((org) => (
            <div
              key={org.id}
              className="rounded-2xl p-5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                    {org.displayNameAr || org.displayName}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    {org.legalName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold"
                    style={{
                      color: STATUS_TONE[org.status],
                      borderColor: 'var(--border)',
                    }}
                  >
                    {t(`org.status.${org.status}`)}
                  </span>
                  <span className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                    {t(`org.role.${org.myRole}`)}
                  </span>
                </div>
              </div>

              {org.status === 'rejected' && org.rejectionReason && (
                <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
                  {t('org.rejection_reason')}: {org.rejectionReason}
                </p>
              )}
              {org.status === 'changes_requested' && org.rejectionReason && (
                <p className="mt-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                  {t('org.changes_note')}: {org.rejectionReason}
                </p>
              )}
              {org.status === 'submitted' && (
                <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('org.submitted_note')}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {org.status === 'approved' && (
                  <Link
                    href={`/org/${org.id}`}
                    className="text-sm font-semibold underline-offset-2 hover:underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    {t('org.open_console')} ←
                  </Link>
                )}
                {(org.status === 'draft' || org.status === 'changes_requested') &&
                  (org.myRole === 'owner' || org.myRole === 'admin') && (
                    <SecondaryButton onClick={() => void onSubmitOrg(org.id)}>
                      {t('org.submit_for_review')}
                    </SecondaryButton>
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Create draft ── */}
        <div className="mt-8">
          {!showCreate ? (
            <SecondaryButton onClick={() => setShowCreate(true)}>
              {t('org.create_cta')}
            </SecondaryButton>
          ) : (
            <form
              onSubmit={(e) => void onCreate(e)}
              className="flex flex-col gap-4 rounded-2xl p-5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('org.create_title')}
              </p>
              <Field
                label={t('org.f_legal_name')}
                requiredMark
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                helper={t('org.f_legal_name_help')}
              />
              <Field
                label={t('org.f_display_name')}
                requiredMark
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <Field
                label={t('org.f_display_name_ar')}
                optional={t('org.optional')}
                value={displayNameAr}
                onChange={(e) => setDisplayNameAr(e.target.value)}
              />
              <Field
                label={t('org.f_cr')}
                optional={t('org.optional')}
                value={crNumber}
                onChange={(e) => setCrNumber(e.target.value)}
                helper={t('org.f_cr_help')}
                dirOverride="ltr"
                inputMode="numeric"
              />
              <PrimaryButton
                type="submit"
                disabled={busy || legalName.trim().length < 3 || displayName.trim().length < 2}
                loading={busy}
              >
                {t('org.create_submit')}
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
      </div>
    </PageContainer>
  )
}
